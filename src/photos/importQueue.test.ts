// @vitest-environment node
// Node, not jsdom: jsdom Blobs do not survive fake-indexeddb's structured clone.
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { createProject, updateProject } from '../db/write'
import { isBusy } from '../sw/busy'
import { dismissImport, getImportStatus, startImport, storageIsShort, subscribeImport, type ImportDeps } from './importQueue'

// T-0007: the import runs on the app's database with the photo work faked: each test "file"
// carries its date in its name, and a file named "kapot…" fails to decode.

function photo(name: string, size = 10): File {
  return new File([new Uint8Array(size)], name, { type: 'image/jpeg', lastModified: Date.UTC(2026, 10, 1, 12) })
}

const fakeDeps: ImportDeps = {
  dateTaken: async (file) => {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(file.name)
    return match
      ? { takenAt: `${match[1]}T10:00:00`, source: 'exif' }
      : { takenAt: '2026-11-01T13:00:00', source: 'lastModified' }
  },
  makeCopy: async (file) => {
    if ((file as File).name.startsWith('kapot')) throw new Error('decode failed')
    return new Blob(['copy'], { type: 'image/webp' })
  },
  makeThumbnail: async () => new Blob(['thumb'], { type: 'image/webp' }),
  imageSize: async () => ({ width: 2560, height: 1920 }),
  estimate: async () => ({ usage: 0, quota: 10 * 1024 * 1024 * 1024 }),
}

afterEach(async () => {
  await Promise.all([db.projects.clear(), db.entries.clear(), db.photos.clear(), db.outbox.clear()])
})

describe('startImport', () => {
  it('groups photos into one entry per day, reuses an existing day, and sets the cover', async () => {
    const project = await createProject({ title: 'Vogelhuisje' })
    const seen: Array<[number, number]> = []
    const unsubscribe = subscribeImport(() => {
      const s = getImportStatus(project.id)
      if (s) seen.push([s.done, s.total])
    })

    const done = startImport(project.id, [photo('2026-09-01-a.jpg'), photo('2026-09-03.jpg'), photo('2026-09-01-b.jpg')], fakeDeps)
    expect(isBusy()).toBe(true)
    await done
    unsubscribe()
    expect(isBusy()).toBe(false)

    const entries = await db.entries.where('projectId').equals(project.id).sortBy('date')
    expect(entries.map((e) => e.date)).toEqual(['2026-09-01', '2026-09-03'])
    const photos = await db.photos.where('projectId').equals(project.id).toArray()
    expect(photos.filter((p) => p.entryId === entries[0]!.id)).toHaveLength(2)
    expect(photos.filter((p) => p.entryId === entries[1]!.id)).toHaveLength(1)
    expect(photos.every((p) => p.original instanceof Blob && p.uploads.original === 'pending')).toBe(true)

    // The first photo imported becomes the cover: its outbox row comes first.
    const cover = (await db.projects.get(project.id))!.coverPhotoId
    const firstQueued = (await db.outbox.toArray()).find((o) => o.table === 'photos')
    expect(cover).toBe(firstQueued?.recordId)

    expect(seen.at(-1)).toEqual([3, 3])
    expect(getImportStatus(project.id)).toMatchObject({ total: 3, done: 3, added: 3, failed: [], running: false })

    // A second import into an existing day adds to that entry and keeps the cover.
    await startImport(project.id, [photo('2026-09-03-b.jpg')], fakeDeps)
    expect(await db.entries.where('projectId').equals(project.id).count()).toBe(2)
    expect((await db.projects.get(project.id))!.coverPhotoId).toBe(cover)
    dismissImport(project.id)
    expect(getImportStatus(project.id)).toBeUndefined()
  })

  it('reports a failed photo without losing the others, and flags photos dated by the file', async () => {
    const project = await createProject({ title: 'Kast' })
    await startImport(project.id, [photo('2026-09-01.jpg'), photo('kapot.jpg'), photo('IMG_0001.jpg')], fakeDeps)

    const status = getImportStatus(project.id)!
    expect(status).toMatchObject({ total: 3, done: 3, added: 2, running: false })
    expect(status.failed).toEqual([{ name: 'kapot.jpg', reason: 'kon niet worden gelezen' }])
    expect(status.fromFileDate).toEqual(['IMG_0001.jpg'])
    expect(await db.photos.where('projectId').equals(project.id).count()).toBe(2)
    const dates = (await db.entries.where('projectId').equals(project.id).sortBy('date')).map((e) => e.date)
    expect(dates).toEqual(['2026-09-01', '2026-11-01'])
  })

  it('keeps an existing cover', async () => {
    const project = await createProject({ title: 'Bank' })
    await startImport(project.id, [photo('2026-09-01.jpg')], fakeDeps)
    const cover = (await db.projects.get(project.id))!.coverPhotoId!
    dismissImport(project.id)
    await updateProject(project.id, { coverPhotoId: cover })
    await startImport(project.id, [photo('2026-09-02.jpg')], fakeDeps)
    expect((await db.projects.get(project.id))!.coverPhotoId).toBe(cover)
  })

  it('lists dropped non-photos at once, before failed photos (T-0031)', async () => {
    const project = await createProject({ title: 'Tafel' })
    const notes = { name: 'notes.txt', reason: 'is geen foto' }
    await startImport(project.id, [photo('kapot.jpg'), photo('2026-09-01.jpg')], fakeDeps, [notes])
    const status = getImportStatus(project.id)!
    expect(status).toMatchObject({ total: 2, done: 2, added: 1, running: false })
    expect(status.notAdded).toEqual([notes])
    expect(status.failed).toEqual([{ name: 'kapot.jpg', reason: 'kon niet worden gelezen' }])
  })

  it('goes straight to the summary when only non-photos were dropped', async () => {
    const project = await createProject({ title: 'Stoel' })
    const done = startImport(project.id, [], fakeDeps, [{ name: 'plan.pdf', reason: 'is geen foto' }])
    expect(getImportStatus(project.id)).toMatchObject({ total: 0, done: 0, added: 0, running: false })
    expect(isBusy()).toBe(false)
    await done
    expect(getImportStatus(project.id)!.notAdded).toEqual([{ name: 'plan.pdf', reason: 'is geen foto' }])
  })

  it('joins a running import: one summary with both drops', async () => {
    const project = await createProject({ title: 'Kist' })
    const first = startImport(project.id, [photo('2026-09-01.jpg')], fakeDeps, [{ name: 'a.txt', reason: 'is geen foto' }])
    const second = startImport(project.id, [], fakeDeps, [{ name: 'b.txt', reason: 'is geen foto' }])
    expect(getImportStatus(project.id)).toMatchObject({ total: 1, running: true })
    await Promise.all([first, second])
    const status = getImportStatus(project.id)!
    expect(status).toMatchObject({ total: 1, done: 1, added: 1, running: false })
    expect(status.notAdded.map((f) => f.name)).toEqual(['a.txt', 'b.txt'])
  })

  it('warns when storage is short', async () => {
    const project = await createProject({ title: 'Schuur' })
    await startImport(project.id, [photo('2026-09-01.jpg')], { ...fakeDeps, estimate: async () => ({ usage: 90, quota: 100 }) })
    expect(getImportStatus(project.id)!.lowStorage).toBe(true)
  })
})

describe('storageIsShort', () => {
  const mb = 1024 * 1024
  it('compares free space with the originals plus a copy each', () => {
    const files = [photo('a', 4 * mb), photo('b', 4 * mb)]
    expect(storageIsShort(files, { usage: 0, quota: 20 * mb })).toBe(false)
    expect(storageIsShort(files, { usage: 11 * mb, quota: 20 * mb })).toBe(true)
  })
  it('does not warn without an estimate', () => {
    expect(storageIsShort([photo('a')], undefined)).toBe(false)
    expect(storageIsShort([photo('a')], {})).toBe(false)
  })
})
