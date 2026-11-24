// @vitest-environment node
// Node, not jsdom: jsdom Blobs do not survive fake-indexeddb's structured clone.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { createProject, updateProject } from '../db/write'
import { isBusy } from '../sw/busy'
import { zipSync } from 'fflate'
import { dismissImport, getImportStatus, startImport, startZipImport, storageIsShort, subscribeImport, type ImportDeps } from './importQueue'
import type { ReadZipOptions, ZipItem } from './unzip'
import { noise, zipFile } from './zipFixture'

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
  makeCard: async (copy) => ((copy as Blob).size > 0 ? new Blob(['card'], { type: 'image/webp' }) : null),
  imageSize: async () => ({ width: 2560, height: 1920 }),
  estimate: async () => ({ usage: 0, quota: 10 * 1024 * 1024 * 1024 }),
  loadUnzip: () => import('./unzip'),
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

describe('card images at import (T-0040, D-0041)', () => {
  it('stores the card image next to the thumbnail, locally only', async () => {
    const project = await createProject({ title: 'Kaart' })
    await startImport(project.id, [photo('2026-09-01.jpg')], fakeDeps)
    const [stored] = await db.photos.where('projectId').equals(project.id).toArray()
    expect(stored!.card).toBeInstanceOf(Blob)
    expect(stored!.cardWidth).toBe(640)
    dismissImport(project.id)
  })

  it('records a copy too small for a card image, so it is not tried again', async () => {
    const project = await createProject({ title: 'Klein' })
    await startImport(project.id, [photo('2026-09-01.jpg')], { ...fakeDeps, makeCard: async () => null })
    const [stored] = await db.photos.where('projectId').equals(project.id).toArray()
    expect(stored!.card).toBeUndefined()
    expect(stored!.cardWidth).toBe(0)
    dismissImport(project.id)
  })

  it('still adds the photo when the card image fails; the background job tries again later', async () => {
    const project = await createProject({ title: 'Kapot' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await startImport(project.id, [photo('2026-09-01.jpg')], {
      ...fakeDeps,
      makeCard: async () => {
        throw new Error('no encoder')
      },
    })
    const [stored] = await db.photos.where('projectId').equals(project.id).toArray()
    expect(stored).toBeDefined()
    expect(stored!.card).toBeUndefined()
    expect(stored!.cardWidth).toBeUndefined()
    expect(getImportStatus(project.id)).toMatchObject({ added: 1, failed: [] })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
    dismissImport(project.id)
  })
})

describe('startZipImport (T-0032)', () => {
  const lines = (projectId: string) => {
    const s = getImportStatus(projectId)!
    return [...s.notAdded, ...s.failed].map((f) => `${f.name}: ${f.reason}`)
  }

  it('imports the images of a zip into their days, named "<pad> uit <zip>" in the summary', async () => {
    const project = await createProject({ title: 'Kast' })
    const zip = zipFile(
      zipSync({
        '2026-09-01-a.jpg': noise(100, 1),
        'vakantie/2026-09-03.jpg': noise(100, 2),
        'IMG_1.jpg': noise(100, 3),
        'readme.txt': noise(10, 4),
        '__MACOSX/._IMG_1.jpg': noise(10, 5),
        'vakantie/kapot.jpg': noise(100, 6),
      }),
    )
    await startZipImport(project.id, [zip], fakeDeps)

    const status = getImportStatus(project.id)!
    expect(status).toMatchObject({ total: 4, done: 4, added: 3, running: false, zips: [] })
    expect(lines(project.id)).toEqual(['vakantie/kapot.jpg uit fotos.zip: kon niet worden gelezen'])
    expect(status.fromFileDate).toEqual(['IMG_1.jpg uit fotos.zip'])
    const dates = (await db.entries.where('projectId').equals(project.id).sortBy('date')).map((e) => e.date)
    expect(dates).toEqual(['2026-09-01', '2026-09-03', '2026-11-01'])
    // The original is the bytes as they were zipped (D-0015), in a File without a folder in its name.
    const originals = (await db.photos.where('projectId').equals(project.id).toArray()).map((p) => p.original as Blob)
    expect(originals.map((o) => (o as File).name).sort()).toEqual(['2026-09-01-a.jpg', '2026-09-03.jpg', 'IMG_1.jpg'])
    const first = originals.find((o) => (o as File).name === '2026-09-01-a.jpg')!
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(noise(100, 1))
    expect(first.type).toBe('image/jpeg')
  })

  it('lists a damaged zip: "kapot.zip: kon niet worden uitgepakt"', async () => {
    const project = await createProject({ title: 'Tafel' })
    await startZipImport(project.id, [zipFile(new TextEncoder().encode('geen zip'), 'kapot.zip')], fakeDeps)
    expect(getImportStatus(project.id)).toMatchObject({ total: 0, added: 0, running: false })
    expect(lines(project.id)).toEqual(['kapot.zip: kon niet worden uitgepakt'])
  })

  it('lists a zip without images: "leeg.zip: bevat geen foto\'s"', async () => {
    const project = await createProject({ title: 'Stoel' })
    const zip = zipFile(zipSync({ 'notes.txt': noise(10), 'inner.zip': zipSync({ 'a.jpg': noise(10) }) }), 'leeg.zip')
    await startZipImport(project.id, [zip], fakeDeps)
    expect(lines(project.id)).toEqual(["leeg.zip: bevat geen foto's"])
  })

  it('lists an image over the limit and still adds the other images of the zip', async () => {
    const project = await createProject({ title: 'Bank' })
    const zip = zipFile(
      zipSync({ '2026-09-01.jpg': noise(500, 1), 'vakantie/groot.jpg': noise(5000, 2), '2026-09-02.jpg': noise(500, 3) }),
    )
    await startZipImport(project.id, [zip], fakeDeps, 1000)
    expect(getImportStatus(project.id)).toMatchObject({ total: 2, done: 2, added: 2, running: false })
    expect(lines(project.id)).toEqual(['vakantie/groot.jpg uit fotos.zip: is groter dan 40 MB'])
  })

  it('orders the list: loose non-photos, then zip lines as found, then failed imports', async () => {
    const project = await createProject({ title: 'Kist' })
    const fotos = zipFile(
      zipSync({ 'IMG_1.jpg': noise(100, 1), 'vakantie/2026-09-02.jpg': noise(100, 2), 'vakantie/IMG_9.heic': noise(5000, 3) }),
    )
    const leeg = zipFile(zipSync({ 'readme.txt': noise(10) }), 'leeg.zip')
    const kapot = zipFile(noise(100, 9), 'kapot.zip')
    const loose = startImport(project.id, [photo('kapot.jpg'), photo('2026-09-01.jpg')], fakeDeps, [{ name: 'notes.txt', reason: 'is geen foto' }])
    await Promise.all([loose, startZipImport(project.id, [fotos, leeg, kapot], fakeDeps, 1000)])

    const status = getImportStatus(project.id)!
    expect(status).toMatchObject({ added: 3, running: false })
    expect(lines(project.id)).toEqual([
      'notes.txt: is geen foto',
      'vakantie/IMG_9.heic uit fotos.zip: is groter dan 40 MB',
      "leeg.zip: bevat geen foto's",
      'kapot.zip: kon niet worden uitgepakt',
      'kapot.jpg: kon niet worden gelezen',
    ])
    expect(status.fromFileDate).toEqual(['IMG_1.jpg uit fotos.zip'])
  })

  it('stays running until every zip is read to its end, even with every image so far imported', async () => {
    const project = await createProject({ title: 'Schuur' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const zip = zipFile(new Uint8Array(1000))
    const deps: ImportDeps = {
      ...fakeDeps,
      loadUnzip: async () => ({
        readZip: async function* (_zip: File, options?: ReadZipOptions): AsyncGenerator<ZipItem> {
          options?.onProgress?.(400, 1000)
          yield { kind: 'image', path: '2026-09-01.jpg', file: photo('2026-09-01.jpg') }
          options?.onProgress?.(600, 1000)
          await gate
          options?.onProgress?.(1000, 1000)
        },
      }),
    }
    const done = startZipImport(project.id, [zip], deps)
    expect(getImportStatus(project.id)).toMatchObject({ total: 0, running: true, zips: ['fotos.zip'], zipPercent: 0 })
    expect(isBusy()).toBe(true)

    await expect.poll(() => getImportStatus(project.id)!.done).toBe(1)
    await expect.poll(() => getImportStatus(project.id)!.zipPercent).toBe(60)
    expect(getImportStatus(project.id)).toMatchObject({ total: 1, done: 1, running: true, zips: ['fotos.zip'] })
    dismissImport(project.id) // can't dismiss a running import
    expect(getImportStatus(project.id)).toBeDefined()
    expect(isBusy()).toBe(true)

    release()
    await done
    expect(getImportStatus(project.id)).toMatchObject({ total: 1, done: 1, added: 1, running: false, zips: [], zipPercent: 0 })
    expect(isBusy()).toBe(false)
  })

  it('reads zips one after another and shows the one being read, with whole percents', async () => {
    const project = await createProject({ title: 'Hok' })
    const a = zipFile(zipSync({ '2026-09-01.jpg': noise(200_000, 1) }, { level: 0 }), 'a.zip')
    const b = zipFile(zipSync({ '2026-09-02.jpg': noise(100, 2) }), 'b.zip')
    const seen: string[] = []
    const unsubscribe = subscribeImport(() => {
      const s = getImportStatus(project.id)
      if (s?.zips[0]) seen.push(`${s.zips[0]} ${s.zipPercent}`)
    })
    await startZipImport(project.id, [a, b], fakeDeps)
    unsubscribe()
    const names = [...new Set(seen.map((l) => l.split(' ')[0]))]
    expect(names).toEqual(['a.zip', 'b.zip'])
    for (const line of seen) expect(line).toMatch(/^[ab]\.zip (\d|[1-9]\d|100)$/)
    expect(seen).toContain('a.zip 100')
    expect(getImportStatus(project.id)).toMatchObject({ added: 2, running: false })
  })

  it('lists a zip as "kan nu niet worden uitgepakt" when the unzip code cannot load; loose photos are added', async () => {
    const project = await createProject({ title: 'Rek' })
    const deps: ImportDeps = { ...fakeDeps, loadUnzip: () => Promise.reject(new TypeError('Failed to fetch')) }
    await Promise.all([
      startImport(project.id, [photo('2026-09-01.jpg')], deps),
      startZipImport(project.id, [zipFile(zipSync({ 'a.jpg': noise(10) }))], deps),
    ])
    expect(getImportStatus(project.id)).toMatchObject({ added: 1, running: false })
    expect(lines(project.id)).toEqual(['fotos.zip: kan nu niet worden uitgepakt; probeer het later opnieuw'])
  })

  it('warns about low storage by the size of the zip', async () => {
    const project = await createProject({ title: 'Zolder' })
    const zip = zipFile(zipSync({ 'readme.txt': noise(10) }))
    await startZipImport(project.id, [zip], { ...fakeDeps, estimate: async () => ({ usage: 90, quota: 100 }) })
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
