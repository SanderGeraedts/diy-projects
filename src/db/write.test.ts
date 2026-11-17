// @vitest-environment node
// Node, not jsdom: jsdom Blobs do not survive fake-indexeddb's structured clone.
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { openDb, SCHEMA_V1, type DiyDb } from './db'
import {
  addEntry,
  addPhotos,
  clearLocalData,
  countUnsynced,
  createProject,
  deletePhoto,
  markPhotoFileUploaded,
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
    expect(db.verno).toBe(2)
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
  it('empties records, photos and the outbox', async () => {
    const d = freshDb()
    const { entry } = await projectWithEntry(d)
    await addPhotos(entry.id, [newPhoto()], d)
    expect(await countUnsynced(d)).toBe(3)
    await clearLocalData(d)
    expect(await d.projects.count()).toBe(0)
    expect(await d.entries.count()).toBe(0)
    expect(await d.photos.count()).toBe(0)
    expect(await countUnsynced(d)).toBe(0)
  })
})
