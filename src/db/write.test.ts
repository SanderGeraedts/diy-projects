// @vitest-environment node
// Node, not jsdom: jsdom Blobs do not survive fake-indexeddb's structured clone.
import Dexie from 'dexie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb, SCHEMA_V1, SCHEMA_V2, SCHEMA_V3, SCHEMA_V4, upgradeToV2, upgradeToV4, type DiyDb } from './db'
import {
  addEntry,
  addPhotos,
  clearLocalData,
  countUnsynced,
  createProject,
  deleteEntry,
  deletePhoto,
  deleteProject,
  forgetPurged,
  markPhotoFileUploaded,
  purgeScope,
  removePurged,
  restoreEntry,
  restoreProject,
  updateEntry,
  updateProject,
  ValidationError,
  type NewPhoto,
} from './write'

let db: DiyDb | undefined
let counter = 0

function freshDb(): DiyDb {
  db = openDb(`write-test-${++counter}`)
  return db
}

afterEach(async () => {
  vi.useRealTimers()
  await db?.delete()
  db = undefined
})

function newPhoto(n = 1): NewPhoto {
  return {
    original: new Blob([`original-${n}`], { type: 'image/jpeg' }),
    copy: new Blob([`copy-${n}`], { type: 'image/webp' }),
    thumbnail: new Blob([`thumb-${n}`], { type: 'image/webp' }),
    takenAt: '2026-11-17T10:00:00.000Z',
    width: 2560,
    height: 1920,
  }
}

async function projectWithEntry(d: DiyDb) {
  const project = await createProject({ title: 'Shed' }, d)
  const entry = await addEntry({ projectId: project.id, date: '2026-11-17', note: 'Start' }, d)
  return { project, entry }
}

describe('schema v1 → v2', () => {
  it('keeps every v1 record and adds the v2 fields', async () => {
    const name = `upgrade-test-${++counter}`
    const v1 = new Dexie(name)
    v1.version(1).stores(SCHEMA_V1)
    const blob = new Blob(['copy'], { type: 'image/webp' })
    await v1.table('projects').add({
      id: 'p1', title: 'Old', description: '', status: 'idea', tags: ['wood'],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    })
    await v1.table('entries').add({
      id: 'e1', projectId: 'p1', date: '2026-01-01', note: 'n',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    })
    await v1.table('photos').bulkAdd([
      { id: 'f1', projectId: 'p1', entryId: 'e1', takenAt: '2026-01-01T09:00:00.000Z', blob, width: 1, height: 1, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'f2', projectId: 'p1', entryId: 'e1', takenAt: '2026-01-01T10:00:00.000Z', blob, width: 1, height: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    ])
    v1.close()

    db = openDb(name)
    await db.open()
    expect(db.verno).toBe(5)
    expect(await db.projects.count()).toBe(1)
    expect(await db.entries.count()).toBe(1)
    expect(await db.photos.count()).toBe(2)
    const p = await db.projects.get('p1')
    expect(p).toMatchObject({ title: 'Old', tags: ['wood'], updatedAt: '2026-01-02T00:00:00.000Z', deletedAt: null })
    expect((await db.entries.get('e1'))?.deletedAt).toBeNull()
    const f = await db.photos.get('f1')
    expect(f).toMatchObject({ updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, original: null })
    expect(f?.blob).toBeInstanceOf(Blob)
    expect(f?.thumbnail).toBeInstanceOf(Blob)
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('schema v2 → v3 (T-0016)', () => {
  it('keeps records and the outbox, and adds an empty sync state', async () => {
    const name = `upgrade-test-${++counter}`
    const v2 = new Dexie(name)
    v2.version(1).stores(SCHEMA_V1)
    v2.version(2).stores(SCHEMA_V2).upgrade(upgradeToV2)
    await v2.table('projects').add({
      id: 'p1', title: 'Old', description: '', status: 'idea', tags: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', deletedAt: null,
    })
    await v2.table('outbox').add({ table: 'projects', recordId: 'p1', op: 'put', queuedAt: '2026-01-02T00:00:00.000Z' })
    v2.close()

    db = openDb(name)
    await db.open()
    expect(db.verno).toBe(5)
    expect(await db.projects.get('p1')).toMatchObject({ title: 'Old' })
    expect(await db.outbox.toArray()).toMatchObject([{ id: 1, table: 'projects', recordId: 'p1', op: 'put' }])
    expect(await db.syncState.count()).toBe(0)
  })
})

describe('schema v3 → v4 (T-0026)', () => {
  it('makes every existing project public (D-0025), keeping records and the outbox, adding no rows', async () => {
    const name = `upgrade-test-${++counter}`
    const v3 = new Dexie(name)
    v3.version(1).stores(SCHEMA_V1)
    v3.version(2).stores(SCHEMA_V2).upgrade(upgradeToV2)
    v3.version(3).stores(SCHEMA_V3)
    const base = { description: '', status: 'idea', tags: [], createdAt: '2026-01-01T00:00:00.000Z' }
    await v3.table('projects').bulkAdd([
      { ...base, id: 'p1', title: 'Alive', updatedAt: '2026-01-02T00:00:00.000Z', deletedAt: null },
      { ...base, id: 'p2', title: 'Deleted', updatedAt: '2026-01-03T00:00:00.000Z', deletedAt: '2026-01-03T00:00:00.000Z' },
    ])
    await v3.table('outbox').add({ table: 'projects', recordId: 'p1', op: 'put', queuedAt: '2026-01-02T00:00:00.000Z' })
    await v3.table('syncState').put({ key: 'cursor:projects', value: '2026-01-02 00:00:00.000Z' })
    v3.close()

    db = openDb(name)
    await db.open()
    expect(db.verno).toBe(5)
    expect(await db.projects.get('p1')).toMatchObject({ title: 'Alive', public: true, updatedAt: '2026-01-02T00:00:00.000Z' })
    expect(await db.projects.get('p2')).toMatchObject({ title: 'Deleted', public: true, deletedAt: '2026-01-03T00:00:00.000Z' })
    expect(await db.outbox.toArray()).toMatchObject([{ id: 1, table: 'projects', recordId: 'p1', op: 'put' }])
    expect(await db.syncState.get('cursor:projects')).toMatchObject({ value: '2026-01-02 00:00:00.000Z' })
  })
})

describe('schema v4 → v5 (T-0027)', () => {
  it('gives every project a slug from its title by creation, keeping records and the outbox, adding no rows', async () => {
    const name = `upgrade-test-${++counter}`
    const v4 = new Dexie(name)
    v4.version(1).stores(SCHEMA_V1)
    v4.version(2).stores(SCHEMA_V2).upgrade(upgradeToV2)
    v4.version(3).stores(SCHEMA_V3)
    v4.version(4).stores(SCHEMA_V4).upgrade(upgradeToV4)
    const base = { description: '', status: 'idea', tags: [], public: true, deletedAt: null }
    const at = (day: number) => `2026-01-0${day}T00:00:00.000Z`
    await v4.table('projects').bulkAdd([
      { ...base, id: 'p3', title: 'Kast', createdAt: at(3), updatedAt: at(3) },
      { ...base, id: 'p1', title: 'Kast', createdAt: at(1), updatedAt: at(1) },
      { ...base, id: 'p2', title: 'Kast für Sanne', createdAt: at(2), updatedAt: at(2), deletedAt: at(4) },
      { ...base, id: 'p4', title: 'new', createdAt: at(4), updatedAt: at(4) },
    ])
    await v4.table('outbox').add({ table: 'projects', recordId: 'p1', op: 'put', queuedAt: at(1) })
    v4.close()

    db = openDb(name)
    await db.open()
    expect(db.verno).toBe(5)
    const slugs = Object.fromEntries((await db.projects.toArray()).map((p) => [p.id, [p.slug, p.oldSlugs]]))
    expect(slugs).toEqual({
      p1: ['kast', []],
      p2: ['kast-fur-sanne', []], // tombstoned projects keep their address (D-0029)
      p3: ['kast-2', []],
      p4: ['project', []], // reserved
    })
    expect(await db.projects.get('p1')).toMatchObject({ title: 'Kast', updatedAt: at(1) })
    expect(await db.outbox.toArray()).toMatchObject([{ id: 1, table: 'projects', recordId: 'p1', op: 'put' }])
    expect(await db.projects.where('slug').equals('kast-2').primaryKeys()).toEqual(['p3'])
  })
})

describe('public switch (T-0026, D-0025)', () => {
  it('starts on for a new project unless switched off', async () => {
    const d = freshDb()
    expect((await createProject({ title: 'Shed' }, d)).public).toBe(true)
    expect((await createProject({ title: 'Private', public: false }, d)).public).toBe(false)
  })

  it('switches off and on like any other field, with an outbox row each time', async () => {
    const d = freshDb()
    const project = await createProject({ title: 'Shed' }, d)
    expect((await updateProject(project.id, { public: false }, d)).public).toBe(false)
    expect((await d.projects.get(project.id))?.public).toBe(false)
    expect((await updateProject(project.id, { public: true }, d)).public).toBe(true)
    expect(await d.outbox.count()).toBe(3)
  })

  it('refuses anything but true or false', async () => {
    const d = freshDb()
    const project = await createProject({ title: 'Shed' }, d)
    await expect(updateProject(project.id, { public: 'yes' as unknown as boolean }, d)).rejects.toThrow(ValidationError)
    await expect(createProject({ title: 'X', public: 1 as unknown as boolean }, d)).rejects.toThrow(ValidationError)
  })
})

describe('write API', () => {
  it('adds exactly one outbox row per write', async () => {
    const d = freshDb()
    const project = await createProject({ title: 'Shed', tags: ['wood'] }, d)
    expect(await d.outbox.count()).toBe(1)
    await updateProject(project.id, { status: 'in progress' }, d)
    expect(await d.outbox.count()).toBe(2)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, d)
    expect(await d.outbox.count()).toBe(3)
    await updateEntry(entry.id, { note: 'Done' }, d)
    expect(await d.outbox.count()).toBe(4)
    const [photo] = await addPhotos(entry.id, [newPhoto()], d)
    expect(await d.outbox.count()).toBe(5)
    await deletePhoto(photo!.id, d)
    expect(await d.outbox.count()).toBe(6)

    const rows = await d.outbox.orderBy('id').toArray()
    expect(rows.map((r) => [r.table, r.op])).toEqual([
      ['projects', 'put'], ['projects', 'put'], ['entries', 'put'], ['entries', 'put'],
      ['photos', 'put'], ['photos', 'delete'],
    ])
    expect(rows[0]!.recordId).toBe(project.id)
    expect(await countUnsynced(d)).toBe(6)
  })

  it('adds one row per photo when adding several', async () => {
    const d = freshDb()
    const { entry, project } = await projectWithEntry(d)
    const before = await d.outbox.count()
    const photos = await addPhotos(entry.id, [newPhoto(1), newPhoto(2), newPhoto(3)], d)
    expect(await d.outbox.count()).toBe(before + 3)
    expect(photos.every((p) => p.projectId === project.id)).toBe(true)
  })

  it('stamps updatedAt on every edit', async () => {
    const d = freshDb()
    const project = await createProject({ title: 'Shed' }, d)
    await new Promise((r) => setTimeout(r, 5))
    const updated = await updateProject(project.id, { title: 'Big shed' }, d)
    expect(updated.updatedAt > project.updatedAt).toBe(true)
    expect((await d.projects.get(project.id))?.title).toBe('Big shed')
  })

  it('leaves neither record nor outbox row when the write throws', async () => {
    const d = freshDb()
    d.outbox.hook('creating', () => {
      throw new Error('disk full')
    })
    await expect(createProject({ title: 'Shed' }, d)).rejects.toThrow()
    expect(await d.projects.count()).toBe(0)
    expect(await d.outbox.count()).toBe(0)
  })

  it('rolls back an edit when queueing it fails', async () => {
    const d = freshDb()
    const project = await createProject({ title: 'Shed' }, d)
    d.outbox.hook('creating', () => {
      throw new Error('disk full')
    })
    await expect(updateProject(project.id, { title: 'Changed' }, d)).rejects.toThrow()
    expect((await d.projects.get(project.id))?.title).toBe('Shed')
    expect(await d.outbox.count()).toBe(1)
  })

  it('rolls back all photos when one fails', async () => {
    const d = freshDb()
    const { entry } = await projectWithEntry(d)
    const before = await d.outbox.count()
    let n = 0
    d.outbox.hook('creating', () => {
      if (++n === 2) throw new Error('disk full')
    })
    await expect(addPhotos(entry.id, [newPhoto(1), newPhoto(2)], d)).rejects.toThrow()
    expect(await d.photos.count()).toBe(0)
    expect(await d.outbox.count()).toBe(before)
  })

  it('rejects invalid input without writing', async () => {
    const d = freshDb()
    await expect(createProject({ title: '  ' }, d)).rejects.toBeInstanceOf(ValidationError)
    await expect(createProject({ title: 'x', status: 'nope' as never }, d)).rejects.toBeInstanceOf(ValidationError)
    await expect(addEntry({ projectId: 'missing', date: '2026-11-17' }, d)).rejects.toBeInstanceOf(ValidationError)
    const { project } = await projectWithEntry(d)
    await expect(addEntry({ projectId: project.id, date: '17-11-2026' }, d)).rejects.toBeInstanceOf(ValidationError)
    await expect(addPhotos('missing', [newPhoto()], d)).rejects.toBeInstanceOf(ValidationError)
    await expect(updateProject(project.id, { coverPhotoId: 'missing' }, d)).rejects.toBeInstanceOf(ValidationError)
    expect(await d.outbox.count()).toBe(2)
  })
})

describe('photos', () => {
  it('deletePhoto tombstones, queues a delete, and keeps the blobs', async () => {
    const d = freshDb()
    const { entry } = await projectWithEntry(d)
    const [photo] = await addPhotos(entry.id, [newPhoto()], d)
    await deletePhoto(photo!.id, d)
    const stored = await d.photos.get(photo!.id)
    expect(stored?.deletedAt).not.toBeNull()
    expect(stored?.updatedAt).toBe(stored?.deletedAt)
    expect(stored?.blob).toBeInstanceOf(Blob)
    expect(stored?.thumbnail).toBeInstanceOf(Blob)
    expect(stored?.original).toBeInstanceOf(Blob)
    const last = await d.outbox.orderBy('id').last()
    expect(last).toMatchObject({ table: 'photos', recordId: photo!.id, op: 'delete' })
    await expect(deletePhoto(photo!.id, d)).rejects.toBeInstanceOf(ValidationError)
  })

  it('keeps the original until all three files are uploaded', async () => {
    const d = freshDb()
    const { entry } = await projectWithEntry(d)
    const [photo] = await addPhotos(entry.id, [newPhoto()], d)
    const id = photo!.id
    expect((await d.photos.get(id))?.uploads).toEqual({ original: 'pending', copy: 'pending', thumbnail: 'pending' })

    await markPhotoFileUploaded(id, 'copy', d)
    await markPhotoFileUploaded(id, 'thumbnail', d)
    expect((await d.photos.get(id))?.original).toBeInstanceOf(Blob)

    const outboxBefore = await d.outbox.count()
    await markPhotoFileUploaded(id, 'original', d)
    const stored = await d.photos.get(id)
    expect(stored?.original).toBeNull()
    expect(stored?.blob).toBeInstanceOf(Blob)
    expect(stored?.updatedAt).toBe(photo!.updatedAt)
    expect(await d.outbox.count()).toBe(outboxBefore)
  })

  it('keeps the original when it is uploaded before the copy', async () => {
    const d = freshDb()
    const { entry } = await projectWithEntry(d)
    const [photo] = await addPhotos(entry.id, [newPhoto()], d)
    await markPhotoFileUploaded(photo!.id, 'original', d)
    expect((await d.photos.get(photo!.id))?.original).toBeInstanceOf(Blob)
  })
})

describe('clearLocalData (T-0015)', () => {
  it('empties records, photos, the outbox and the sync state', async () => {
    const d = freshDb()
    const { entry } = await projectWithEntry(d)
    await addPhotos(entry.id, [newPhoto()], d)
    await d.syncState.put({ key: 'cursor:projects', value: '2026-11-17 10:00:00.000Z' })
    expect(await countUnsynced(d)).toBe(3)
    await clearLocalData(d)
    expect(await d.syncState.count()).toBe(0)
    expect(await d.projects.count()).toBe(0)
    expect(await d.entries.count()).toBe(0)
    expect(await d.photos.count()).toBe(0)
    expect(await countUnsynced(d)).toBe(0)
  })
})

describe('deletes cascade (T-0010, D-0014)', () => {
  /** Two projects; the first has two entries with photos, the second one entry with a photo. */
  async function twoProjects(d: DiyDb) {
    const shed = await createProject({ title: 'Shed' }, d)
    const day1 = await addEntry({ projectId: shed.id, date: '2026-11-16', note: 'Base' }, d)
    const day2 = await addEntry({ projectId: shed.id, date: '2026-11-17', note: 'Roof' }, d)
    const day1Photos = await addPhotos(day1.id, [newPhoto(1), newPhoto(2)], d)
    const day2Photos = await addPhotos(day2.id, [newPhoto(3), newPhoto(4), newPhoto(5)], d)
    const bench = await createProject({ title: 'Bench' }, d)
    const benchDay = await addEntry({ projectId: bench.id, date: '2026-11-17' }, d)
    const benchPhotos = await addPhotos(benchDay.id, [newPhoto(6)], d)
    return { shed, day1, day2, day1Photos, day2Photos, bench, benchDay, benchPhotos }
  }

  async function tombstoned(d: DiyDb) {
    const ids = (rows: { id: string; deletedAt: string | null }[]) =>
      rows
        .filter((r) => r.deletedAt !== null)
        .map((r) => r.id)
        .sort()
    return {
      projects: ids(await d.projects.toArray()),
      entries: ids(await d.entries.toArray()),
      photos: ids(await d.photos.toArray()),
    }
  }

  async function rowsAfter(d: DiyDb, before: number) {
    return (await d.outbox.orderBy('id').toArray()).slice(before).map((r) => [r.table, r.recordId, r.op])
  }

  it('deleteEntry tombstones exactly the entry and its photos, one outbox row each', async () => {
    const d = freshDb()
    const s = await twoProjects(d)
    const before = await d.outbox.count()
    await deleteEntry(s.day2.id, d)

    expect(await tombstoned(d)).toEqual({
      projects: [],
      entries: [s.day2.id],
      photos: s.day2Photos.map((p) => p.id).sort(),
    })
    const rows = await rowsAfter(d, before)
    expect(rows).toHaveLength(1 + 3)
    expect(rows).toEqual(
      expect.arrayContaining([
        ['entries', s.day2.id, 'delete'],
        ...s.day2Photos.map((p) => ['photos', p.id, 'delete']),
      ]),
    )
    const entry = await d.entries.get(s.day2.id)
    expect(entry?.updatedAt).toBe(entry?.deletedAt)
    // Nothing is removed (D-0014): records and blobs stay until the bin (T-0022).
    expect(await d.entries.count()).toBe(3)
    expect((await d.photos.get(s.day2Photos[0]!.id))?.blob).toBeInstanceOf(Blob)
    await expect(deleteEntry(s.day2.id, d)).rejects.toBeInstanceOf(ValidationError)
  })

  it('deleteProject tombstones the project, its entries and their photos, one outbox row each', async () => {
    const d = freshDb()
    const s = await twoProjects(d)
    const before = await d.outbox.count()
    await deleteProject(s.shed.id, d)

    const photoIds = [...s.day1Photos, ...s.day2Photos].map((p) => p.id)
    expect(await tombstoned(d)).toEqual({
      projects: [s.shed.id],
      entries: [s.day1.id, s.day2.id].sort(),
      photos: [...photoIds].sort(),
    })
    const rows = await rowsAfter(d, before)
    expect(rows).toHaveLength(1 + 2 + 5)
    expect(rows).toEqual(
      expect.arrayContaining([
        ['projects', s.shed.id, 'delete'],
        ['entries', s.day1.id, 'delete'],
        ['entries', s.day2.id, 'delete'],
        ...photoIds.map((id) => ['photos', id, 'delete']),
      ]),
    )
    expect(await d.projects.count()).toBe(2)
    expect(await d.photos.count()).toBe(6)
    await expect(deleteProject(s.shed.id, d)).rejects.toBeInstanceOf(ValidationError)
  })

  it('keeps earlier tombstones as they were and queues no second delete for them', async () => {
    const d = freshDb()
    const s = await twoProjects(d)
    await deleteEntry(s.day1.id, d)
    const earlier = (await d.entries.get(s.day1.id))!.deletedAt
    const before = await d.outbox.count()
    await new Promise((r) => setTimeout(r, 5))
    await deleteProject(s.shed.id, d)
    expect((await d.entries.get(s.day1.id))!.deletedAt).toBe(earlier)
    expect(await rowsAfter(d, before)).toHaveLength(1 + 1 + 3)
  })

  it('a failure halfway through deleteProject leaves nothing tombstoned and nothing queued', async () => {
    const d = freshDb()
    const s = await twoProjects(d)
    const before = await d.outbox.count()
    let n = 0
    d.outbox.hook('creating', () => {
      if (++n === 4) throw new Error('disk full')
    })
    await expect(deleteProject(s.shed.id, d)).rejects.toThrow('disk full')
    expect(n).toBe(4)
    expect(await tombstoned(d)).toEqual({ projects: [], entries: [], photos: [] })
    expect(await d.outbox.count()).toBe(before)
  })

  it('a failure halfway through deleteEntry leaves nothing tombstoned and nothing queued', async () => {
    const d = freshDb()
    const s = await twoProjects(d)
    const before = await d.outbox.count()
    let n = 0
    d.outbox.hook('creating', () => {
      if (++n === 2) throw new Error('disk full')
    })
    await expect(deleteEntry(s.day2.id, d)).rejects.toThrow('disk full')
    expect(await tombstoned(d)).toEqual({ projects: [], entries: [], photos: [] })
    expect(await d.outbox.count()).toBe(before)
  })

  it('updateProject clears the cover with null or undefined; leaving the key out keeps it', async () => {
    const d = freshDb()
    const s = await twoProjects(d)
    const cover = s.day1Photos[0]!.id
    await updateProject(s.shed.id, { coverPhotoId: cover }, d)
    expect((await d.projects.get(s.shed.id))?.coverPhotoId).toBe(cover)
    await updateProject(s.shed.id, { coverPhotoId: null }, d)
    expect((await d.projects.get(s.shed.id))?.coverPhotoId).toBeUndefined()
    await updateProject(s.shed.id, { coverPhotoId: cover }, d)
    await updateProject(s.shed.id, { coverPhotoId: undefined }, d)
    expect((await d.projects.get(s.shed.id))?.coverPhotoId).toBeUndefined()
    await updateProject(s.shed.id, { coverPhotoId: cover }, d)
    await updateProject(s.shed.id, { title: 'Big shed' }, d)
    expect((await d.projects.get(s.shed.id))?.coverPhotoId).toBe(cover)
  })

  it('deleting the cover photo clears the cover, with one project row', async () => {
    const d = freshDb()
    const s = await twoProjects(d)
    await updateProject(s.shed.id, { coverPhotoId: s.day1Photos[0]!.id }, d)
    let before = await d.outbox.count()
    await deletePhoto(s.day1Photos[1]!.id, d)
    expect((await d.projects.get(s.shed.id))?.coverPhotoId).toBe(s.day1Photos[0]!.id)
    expect(await rowsAfter(d, before)).toEqual([['photos', s.day1Photos[1]!.id, 'delete']])

    before = await d.outbox.count()
    await deletePhoto(s.day1Photos[0]!.id, d)
    expect((await d.projects.get(s.shed.id))?.coverPhotoId).toBeUndefined()
    expect(await rowsAfter(d, before)).toEqual([
      ['photos', s.day1Photos[0]!.id, 'delete'],
      ['projects', s.shed.id, 'put'],
    ])
  })

  it('deleting the entry that holds the cover clears the cover', async () => {
    const d = freshDb()
    const s = await twoProjects(d)
    await updateProject(s.shed.id, { coverPhotoId: s.day2Photos[1]!.id }, d)
    const before = await d.outbox.count()
    await deleteEntry(s.day2.id, d)
    const shed = await d.projects.get(s.shed.id)
    expect(shed?.coverPhotoId).toBeUndefined()
    expect(shed?.deletedAt).toBeNull()
    const rows = await rowsAfter(d, before)
    expect(rows).toHaveLength(1 + 3 + 1)
    expect(rows.at(-1)).toEqual(['projects', s.shed.id, 'put'])
  })
})

describe('the bin (T-0022, D-0014)', () => {
  /** Pins the clock, so each delete has its own time. Only Date is faked. */
  function at(iso: string) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
  }

  /**
   * Shed: day1 (2 photos), day2 (3 photos), and day3 deleted on its own first (1 photo); one of
   * day2's photos also deleted on its own first. Bench: one entry, one photo, untouched.
   */
  async function binned(d: DiyDb) {
    at('2026-11-17T09:00:00.000Z')
    const shed = await createProject({ title: 'Shed' }, d)
    const day1 = await addEntry({ projectId: shed.id, date: '2026-11-16', note: 'Base' }, d)
    const day2 = await addEntry({ projectId: shed.id, date: '2026-11-17', note: 'Roof' }, d)
    const day3 = await addEntry({ projectId: shed.id, date: '2026-11-18', note: 'Door' }, d)
    const day1Photos = await addPhotos(day1.id, [newPhoto(1), newPhoto(2)], d)
    const day2Photos = await addPhotos(day2.id, [newPhoto(3), newPhoto(4), newPhoto(5)], d)
    const day3Photos = await addPhotos(day3.id, [newPhoto(6)], d)
    const bench = await createProject({ title: 'Bench' }, d)
    const benchDay = await addEntry({ projectId: bench.id, date: '2026-11-17' }, d)
    const benchPhotos = await addPhotos(benchDay.id, [newPhoto(7)], d)
    at('2026-11-17T10:00:00.000Z')
    await deletePhoto(day2Photos[0]!.id, d)
    at('2026-11-17T11:00:00.000Z')
    await deleteEntry(day3.id, d)
    return { shed, day1, day2, day3, day1Photos, day2Photos, day3Photos, bench, benchDay, benchPhotos }
  }

  const liveIds = (rows: { id: string; deletedAt: string | null }[]) =>
    rows
      .filter((r) => r.deletedAt === null)
      .map((r) => r.id)
      .sort()
  const live = async (d: DiyDb) => ({
    projects: liveIds(await d.projects.toArray()),
    entries: liveIds(await d.entries.toArray()),
    photos: liveIds(await d.photos.toArray()),
  })
  const rowsAfter = async (d: DiyDb, before: number) =>
    (await d.outbox.orderBy('id').toArray()).slice(before).map((r) => [r.table, r.recordId, r.op])

  it('restoreProject brings back exactly what its delete took, one put row each', async () => {
    const d = freshDb()
    const s = await binned(d)
    const before = await live(d)
    at('2026-11-17T12:00:00.000Z')
    await deleteProject(s.shed.id, d)
    const queued = await d.outbox.count()

    at('2026-11-17T13:00:00.000Z')
    expect(await restoreProject(s.shed.id, d)).toBe(4)

    // As before the project's delete: day3 and the photo deleted on their own stay in the bin.
    expect(await live(d)).toEqual(before)
    expect((await d.entries.get(s.day3.id))?.deletedAt).toBe('2026-11-17T11:00:00.000Z')
    expect((await d.photos.get(s.day2Photos[0]!.id))?.deletedAt).toBe('2026-11-17T10:00:00.000Z')
    expect(await d.projects.get(s.shed.id)).toMatchObject({ deletedAt: null, updatedAt: '2026-11-17T13:00:00.000Z' })
    const rows = await rowsAfter(d, queued)
    expect(rows).toHaveLength(2 + 4 + 1)
    expect(rows.every(([, , op]) => op === 'put')).toBe(true)
    expect(rows.at(-1)).toEqual(['projects', s.shed.id, 'put'])
    // The blobs were never dropped, so the photos show again.
    expect((await d.photos.get(s.day1Photos[0]!.id))?.blob).toBeInstanceOf(Blob)
  })

  it('restoreEntry brings back the entry and the photos its delete took', async () => {
    const d = freshDb()
    const s = await binned(d)
    const queued = await d.outbox.count()
    at('2026-11-17T13:00:00.000Z')
    expect(await restoreEntry(s.day3.id, d)).toBe(1)
    expect((await d.entries.get(s.day3.id))?.deletedAt).toBeNull()
    expect((await d.photos.get(s.day3Photos[0]!.id))?.deletedAt).toBeNull()
    expect(await rowsAfter(d, queued)).toEqual([
      ['photos', s.day3Photos[0]!.id, 'put'],
      ['entries', s.day3.id, 'put'],
    ])
  })

  it('refuses to restore what is not in the bin, or an entry whose project is deleted', async () => {
    const d = freshDb()
    const s = await binned(d)
    await expect(restoreProject(s.bench.id, d)).rejects.toThrow(ValidationError)
    await expect(restoreEntry(s.day1.id, d)).rejects.toThrow(ValidationError)
    await expect(restoreProject('nope', d)).rejects.toThrow(ValidationError)
    at('2026-11-17T12:00:00.000Z')
    await deleteProject(s.shed.id, d)
    const queued = await d.outbox.count()
    await expect(restoreEntry(s.day3.id, d)).rejects.toThrow('Restore the project first.')
    expect(await d.outbox.count()).toBe(queued)
  })

  it('a failure halfway through a restore leaves everything in the bin and nothing queued', async () => {
    const d = freshDb()
    const s = await binned(d)
    at('2026-11-17T12:00:00.000Z')
    await deleteProject(s.shed.id, d)
    const queued = await d.outbox.count()
    const deleted = await live(d)
    let calls = 0
    d.outbox.hook('creating', () => {
      if (++calls === 3) throw new Error('disk full')
    })
    await expect(restoreProject(s.shed.id, d)).rejects.toThrow('disk full')
    expect(await live(d)).toEqual(deleted)
    expect(await d.outbox.count()).toBe(queued)
  })

  it('purgeScope is everything in the project or entry, also what was deleted on its own', async () => {
    const d = freshDb()
    const s = await binned(d)
    const scope = await purgeScope('project', s.shed.id, d)
    expect(scope.projects).toEqual([s.shed.id])
    expect(scope.entries.sort()).toEqual([s.day1.id, s.day2.id, s.day3.id].sort())
    expect(scope.photos.sort()).toEqual([...s.day1Photos, ...s.day2Photos, ...s.day3Photos].map((p) => p.id).sort())
    expect(await purgeScope('entry', s.day3.id, d)).toEqual({
      projects: [],
      entries: [s.day3.id],
      photos: [s.day3Photos[0]!.id],
    })
  })

  it('removePurged drops a binned project, all it holds and their outbox rows; the rest stays', async () => {
    const d = freshDb()
    const s = await binned(d)
    at('2026-11-17T12:00:00.000Z')
    await deleteProject(s.shed.id, d)
    await removePurged('project', s.shed.id, d)
    expect(await d.projects.toCollection().primaryKeys()).toEqual([s.bench.id])
    expect(await d.entries.toCollection().primaryKeys()).toEqual([s.benchDay.id])
    expect(await d.photos.toCollection().primaryKeys()).toEqual([s.benchPhotos[0]!.id])
    const ids = new Set([s.bench.id, s.benchDay.id, s.benchPhotos[0]!.id])
    expect((await d.outbox.toArray()).every((r) => ids.has(r.recordId))).toBe(true)
  })

  it('removePurged refuses a live item and leaves a missing one alone', async () => {
    const d = freshDb()
    const s = await binned(d)
    await expect(removePurged('project', s.bench.id, d)).rejects.toThrow(ValidationError)
    await expect(removePurged('entry', s.day1.id, d)).rejects.toThrow(ValidationError)
    await removePurged('entry', 'gone-already', d)
    await removePurged('entry', s.day3.id, d)
    expect(await d.entries.get(s.day3.id)).toBeUndefined()
    expect(await d.photos.get(s.day3Photos[0]!.id)).toBeUndefined()
    expect(await d.projects.get(s.shed.id)).toMatchObject({ deletedAt: null })
  })

  it('forgetPurged drops one record and only its outbox rows', async () => {
    const d = freshDb()
    const s = await binned(d)
    const photoId = s.day1Photos[0]!.id
    expect(await d.outbox.where('[table+recordId]').equals(['photos', photoId]).count()).toBe(1)
    const others = (await d.outbox.count()) - 1
    await forgetPurged('photos', photoId, d)
    expect(await d.photos.get(photoId)).toBeUndefined()
    expect(await d.outbox.count()).toBe(others)
    expect(await d.photos.get(s.day1Photos[1]!.id)).toBeDefined()
  })
})
