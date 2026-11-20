// @vitest-environment node
// Node, not jsdom: jsdom Blobs do not survive fake-indexeddb's structured clone.
// T-0016: the sync engine against a fake PocketBase (./testing.ts). The same scenarios run
// against a real one in sync.pocketbase.test.ts (CI).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb, type DiyDb } from '../db/db'
import {
  addEntry,
  addPhotos,
  clearLocalData,
  countUnsynced,
  createProject,
  deleteEntry,
  deletePhoto,
  deleteProject,
  removePurged,
  restoreProject,
  updateEntry,
  updateProject,
  type NewPhoto,
} from '../db/write'
import { isBusy } from '../sw/busy'
import { createSyncEngine, type SyncEngine } from './engine'
import { purgeOnNas } from './purge'
import { FakePocketBase, fakeAuth, responseError } from './testing'

let n = 0
const dbs: DiyDb[] = []
const engines: SyncEngine[] = []

afterEach(async () => {
  vi.useRealTimers()
  for (const engine of engines.splice(0)) engine.stop()
  for (const d of dbs.splice(0)) await d.delete()
})

/** One device: its own database, client and engine, against `server`. */
function device(server: FakePocketBase, userId = 'u1') {
  const db = openDb(`sync-engine-test-${++n}`)
  dbs.push(db)
  const client = server.client(userId)
  const auth = fakeAuth(client)
  const engine = createSyncEngine({
    db,
    client,
    auth,
    fetchFile: server.fetchFile,
    retryBaseMs: 1_000_000,
    retryMaxMs: 1_000_000,
  })
  engines.push(engine)
  return { db, client, auth, engine, sync: () => engine.syncNow() }
}

/** Pins the clock, so `updatedAt` says which edit came last. Only Date is faked. */
function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

function photo(i = 1): NewPhoto {
  return {
    original: new Blob([`original-${i}`]),
    copy: new Blob([`copy-${i}`]),
    thumbnail: new Blob([`thumb-${i}`]),
    takenAt: '2026-11-16T09:00:00.000Z',
    width: 4,
    height: 3,
  }
}

describe('push', () => {
  it('sends the outbox in order under the local ids, and empties it once confirmed', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const project = await createProject({ title: 'Schuurdeur', tags: ['hout'] }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17', note: 'Geschuurd' }, phone.db)
    await updateProject(project.id, { status: 'in progress' }, phone.db)
    expect(await countUnsynced(phone.db)).toBe(3)

    await phone.sync()

    expect(await countUnsynced(phone.db)).toBe(0)
    expect(server.get('projects', project.id)).toMatchObject({
      owner: 'u1',
      title: 'Schuurdeur',
      status: 'in progress',
      tags: ['hout'],
      deletedAt: '',
      updatedAt: (await phone.db.projects.get(project.id))!.updatedAt,
    })
    expect(server.get('entries', entry.id)).toMatchObject({ projectId: project.id, note: 'Geschuurd' })
    // The project went up before its entry, and its two rows as one push.
    const writes = server.requests.filter((r) => r.op !== 'getList')
    expect(writes.map((r) => `${r.op} ${r.collection}`)).toEqual([
      'update projects',
      'create projects',
      'update entries',
      'create entries',
    ])
    expect(phone.engine.getStatus()).toMatchObject({ lastError: null, pushed: 3, running: false })
    expect(phone.engine.getStatus().lastSuccessAt).not.toBeNull()
    expect(phone.auth.refreshes).toBe(1)
  })

  it('sends photo records before their files, and tombstones as records only', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const project = await createProject({ title: 'Bank' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    const [a, b] = await addPhotos(entry.id, [photo(1), photo(2)], phone.db)
    await phone.sync()
    expect(server.get('photos', a!.id)).toMatchObject({ entryId: entry.id, projectId: project.id, width: 4, deletedAt: '' })
    const ops = server.requests.filter((r) => r.collection === 'photos' && r.op !== 'getList').map((r) => r.op)
    expect(ops.indexOf('create')).toBeLessThan(ops.indexOf('upload'))

    server.requests.length = 0
    await deletePhoto(b!.id, phone.db)
    await phone.sync()
    expect(server.get('photos', b!.id)?.deletedAt).toBe((await phone.db.photos.get(b!.id))!.deletedAt)
    expect(server.requests.filter((r) => r.op === 'upload')).toEqual([])
    expect(await countUnsynced(phone.db)).toBe(0)
  })

  it('keeps every row on a failure halfway, and resumes without losing or duplicating anything', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const p1 = await createProject({ title: 'Een' }, phone.db)
    const p2 = await createProject({ title: 'Twee' }, phone.db)
    const p3 = await createProject({ title: 'Drie' }, phone.db)
    server.interceptor = (op, _c, id) => (op === 'create' && id === p2.id ? responseError(0) : undefined)

    await phone.sync()

    expect(server.all('projects').map((p) => p.title)).toEqual(['Een'])
    expect((await phone.db.outbox.toArray()).map((r) => r.recordId)).toEqual([p2.id, p3.id])
    const failed = phone.engine.getStatus()
    expect(failed).toMatchObject({ lastError: 'Geen verbinding met de server.', pushed: 1 })
    expect(failed.nextRetryAt).not.toBeNull()
    expect(phone.auth.refreshes).toBe(0)

    server.interceptor = null
    await phone.sync()
    expect(await countUnsynced(phone.db)).toBe(0)
    expect(server.all('projects').map((p) => p.id).sort()).toEqual([p1.id, p2.id, p3.id].sort())
    expect(phone.engine.getStatus()).toMatchObject({ lastError: null, nextRetryAt: null })
  })

  it('resumes when the NAS saved a record but the answer was lost', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const project = await createProject({ title: 'Een' }, phone.db)
    // The create reaches the NAS, the answer doesn't.
    server.interceptor = (op) => {
      if (op !== 'create') return
      server.interceptor = null
      server.put('projects', { id: project.id, owner: 'u1', title: 'Een', updatedAt: project.updatedAt })
      return responseError(0)
    }
    await phone.sync()
    expect(await countUnsynced(phone.db)).toBe(1)

    await phone.sync()
    expect(await countUnsynced(phone.db)).toBe(0)
    expect(server.all('projects')).toHaveLength(1)
  })

  it('keeps a change made while its push was on the way', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const project = await createProject({ title: 'Een' }, phone.db)
    let edited = false
    server.interceptor = (op) => {
      if (op === 'getList' || edited) return
      edited = true
      void updateProject(project.id, { title: 'Een, later' }, phone.db)
    }
    await phone.sync()
    await vi.waitFor(async () => expect((await phone.db.projects.get(project.id))?.title).toBe('Een, later'))
    // The push in flight carried the old title; the edit's own row was not removed with it.
    await phone.sync()
    expect(server.get('projects', project.id)?.title).toBe('Een, later')
    expect(await countUnsynced(phone.db)).toBe(0)
  })

  it('keeps the row when the NAS refuses a record, and stops at it', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const p1 = await createProject({ title: 'Een' }, phone.db)
    await createProject({ title: 'Twee' }, phone.db)
    server.interceptor = (op, _c, id) => (op === 'create' && id === p1.id ? responseError(400) : undefined)
    await phone.sync()
    expect(server.all('projects')).toHaveLength(0)
    expect(await countUnsynced(phone.db)).toBe(2)
    expect(phone.engine.getStatus().lastError).toBe('De server weigerde een wijziging (400).')
  })
})

describe('sign-in', () => {
  it('pauses on a 401: marks the sign-in expired, keeps the outbox, no retry', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    await createProject({ title: 'Een' }, phone.db)
    phone.client.signedIn = false
    await phone.sync()
    expect(phone.auth.state()).toBe('expired')
    expect(await countUnsynced(phone.db)).toBe(1)
    expect(phone.engine.getStatus()).toMatchObject({
      needsSignIn: true,
      lastError: 'Opnieuw inloggen om te synchroniseren',
      nextRetryAt: null,
    })

    const requests = server.requests.length
    await phone.sync()
    expect(server.requests.length).toBe(requests) // no request while expired

    phone.auth.set('signed-in')
    await phone.sync()
    expect(await countUnsynced(phone.db)).toBe(0)
    expect(phone.engine.getStatus().needsSignIn).toBe(false)
  })

  it('pauses when a refused token makes PocketBase treat the device as a guest (404/400)', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    await createProject({ title: 'Een' }, phone.db)
    // PocketBase ignores an invalid token: owner-only rules then answer 404 and 400.
    server.interceptor = (op) => (op === 'update' ? responseError(404) : op === 'create' ? responseError(400) : undefined)
    // Only the sign-in refresh tells; it marks the sign-in expired (src/auth).
    phone.auth.refreshAfterSync = async () => {
      phone.auth.set('expired')
      return 'expired'
    }
    await phone.sync()
    expect(phone.engine.getStatus()).toMatchObject({ needsSignIn: true, lastError: 'Opnieuw inloggen om te synchroniseren', nextRetryAt: null })
    expect(await countUnsynced(phone.db)).toBe(1)
  })

  it('records no success for a run that only saw what a guest sees', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    phone.auth.refreshAfterSync = async () => {
      phone.auth.set('expired')
      return 'expired'
    }
    await phone.sync()
    expect(phone.engine.getStatus()).toMatchObject({ lastSuccessAt: null, needsSignIn: true })
  })

  it('does nothing while signed out', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    await createProject({ title: 'Een' }, phone.db)
    phone.auth.set('signed-out')
    await phone.sync()
    expect(server.requests).toHaveLength(0)
    expect(await countUnsynced(phone.db)).toBe(1)
  })
})

describe('pull', () => {
  it('brings records made on another device, and moves the cursor on', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const project = await createProject({ title: 'Schuurdeur', tags: ['hout'] }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17', note: 'Geschuurd' }, phone.db)
    await phone.sync()

    await laptop.sync()
    expect(await laptop.db.projects.get(project.id)).toEqual(await phone.db.projects.get(project.id))
    expect(await laptop.db.entries.get(entry.id)).toEqual(await phone.db.entries.get(entry.id))
    expect(await countUnsynced(laptop.db)).toBe(0)
    expect(laptop.engine.getStatus().pulled).toBe(2)

    await laptop.sync()
    expect(laptop.engine.getStatus().pulled).toBe(0)
  })

  it('pages through more records than one request holds', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const db = openDb(`sync-engine-test-${++n}`)
    dbs.push(db)
    const client = server.client('u1')
    const laptop = createSyncEngine({ db, client, auth: fakeAuth(client), pageSize: 2 })
    engines.push(laptop)
    for (let i = 0; i < 5; i++) await createProject({ title: `P${i}` }, phone.db)
    await phone.sync()
    await laptop.syncNow()
    expect(await db.projects.count()).toBe(5)
  })

  it('sees only its own records', async () => {
    const server = new FakePocketBase()
    const phone = device(server, 'u1')
    const stranger = device(server, 'u2')
    await createProject({ title: 'Van mij' }, phone.db)
    await phone.sync()
    await stranger.sync()
    expect(await stranger.db.projects.count()).toBe(0)
  })

  it('keeps only its own records, although anyone may read public projects now (T-0026)', async () => {
    const server = new FakePocketBase()
    const phone = device(server, 'u1')
    const stranger = device(server, 'u2')
    const project = await createProject({ title: 'Openbaar' }, phone.db)
    expect(project.public).toBe(true)
    await addEntry({ projectId: project.id, date: '2026-11-17', note: 'Zichtbaar' }, phone.db)
    await phone.sync()
    expect(server.get('projects', project.id)).toMatchObject({ public: true })
    await stranger.sync()
    expect(await stranger.db.projects.count()).toBe(0)
    expect(await stranger.db.entries.count()).toBe(0)
  })

  it('syncs the public switch like any other field (D-0025)', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const project = await createProject({ title: 'Schuurdeur' }, phone.db)
    await phone.sync()
    await laptop.sync()
    expect((await laptop.db.projects.get(project.id))?.public).toBe(true)
    at('2099-01-01T00:00:00.000Z')
    await updateProject(project.id, { public: false }, laptop.db)
    await laptop.sync()
    expect(server.get('projects', project.id)).toMatchObject({ public: false })
    await phone.sync()
    expect((await phone.db.projects.get(project.id))?.public).toBe(false)
  })

  it('takes over a tombstone', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const project = await createProject({ title: 'Bank' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    await phone.sync()
    await laptop.sync()

    // T-0010 will tombstone through the write API; until then, as it will: record and row together.
    const time = new Date().toISOString()
    await phone.db.transaction('rw', phone.db.entries, phone.db.outbox, async () => {
      await phone.db.entries.update(entry.id, { deletedAt: time, updatedAt: time })
      await phone.db.outbox.add({ table: 'entries', recordId: entry.id, op: 'delete', queuedAt: time })
    })
    await phone.sync()
    await laptop.sync()
    expect((await laptop.db.entries.get(entry.id))?.deletedAt).toBe(time)
  })

  it('leaves photos whose files are not on the NAS yet, but takes over tombstones of known ones', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const project = await createProject({ title: 'Bank' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    await addPhotos(entry.id, [photo()], phone.db)
    server.interceptor = (op) => (op === 'upload' ? responseError(0) : undefined)
    await phone.sync()
    await laptop.sync()
    expect(await laptop.db.photos.count()).toBe(0)
    expect(await laptop.db.entries.count()).toBe(1)
    server.interceptor = null

    // The laptop's own photo, deleted on the phone.
    const [q] = await addPhotos(entry.id, [photo(2)], laptop.db)
    await laptop.sync()
    const time = new Date(Date.now() + 1000).toISOString()
    server.put('photos', { ...server.get('photos', q!.id)!, deletedAt: time, updatedAt: time })
    await laptop.sync()
    const local = await laptop.db.photos.get(q!.id)
    expect(local?.deletedAt).toBe(time)
    expect(local?.blob).toBeInstanceOf(Blob)
  })
})

describe('photo files (T-0017, D-0015)', () => {
  const bytes = async (blob: Blob | null | undefined) => (blob ? new Uint8Array(await blob.arrayBuffer()) : null)

  async function onePhotoEntry(db: DiyDb) {
    const project = await createProject({ title: 'Tafel' }, db)
    return addEntry({ projectId: project.id, date: '2026-11-17' }, db)
  }

  it('uploads copy and thumbnail, then the original, and drops the original once all three are confirmed', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const entry = await onePhotoEntry(phone.db)
    const [a] = await addPhotos(entry.id, [photo(1)], phone.db)
    await phone.sync()

    const uploads = server.requests.filter((r) => r.op === 'upload')
    expect(uploads.map((r) => r.files)).toEqual([['copy', 'thumbnail'], ['original']])
    expect(await bytes(server.file('photos', a!.id, 'original'))).toEqual(await bytes(photo(1).original))
    expect(await bytes(server.file('photos', a!.id, 'copy'))).toEqual(await bytes(photo(1).copy))
    expect(await bytes(server.file('photos', a!.id, 'thumbnail'))).toEqual(await bytes(photo(1).thumbnail))
    const local = (await phone.db.photos.get(a!.id))!
    expect(local.uploads).toEqual({ original: 'uploaded', copy: 'uploaded', thumbnail: 'uploaded' })
    expect(local.original).toBeNull()
    expect(local.blob).toBeInstanceOf(Blob)
    expect(local.thumbnail).toBeInstanceOf(Blob)
    expect(phone.engine.getStatus()).toMatchObject({ lastError: null, uploaded: 3, photoUpload: null })
  })

  it('sends every photo’s copy and thumbnail before any original, one request at a time', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const entry = await onePhotoEntry(phone.db)
    // One batch has one createdAt: then by id.
    const photos = (await addPhotos(entry.id, [photo(1), photo(2), photo(3)], phone.db)).sort((a, b) =>
      a.id < b.id ? -1 : 1,
    )
    const progress: unknown[] = []
    phone.engine.subscribe(() => {
      const p = phone.engine.getStatus().photoUpload
      if (p && progress.at(-1) !== p) progress.push(p)
    })
    await phone.sync()
    const uploads = server.requests.filter((r) => r.op === 'upload').map((r) => r.files!.join('+'))
    expect(uploads).toEqual([
      'copy+thumbnail',
      'copy+thumbnail',
      'copy+thumbnail',
      'original',
      'original',
      'original',
    ])
    expect(progress).toEqual([
      ...photos.map((p, i) => ({ photoId: p.id, step: 'copy+thumbnail', index: i + 1, count: 3 })),
      ...photos.map((p, i) => ({ photoId: p.id, step: 'original', index: i + 1, count: 3 })),
    ])
  })

  it('an upload interrupted halfway resumes after the app is closed, and the original arrives byte for byte', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const entry = await onePhotoEntry(phone.db)
    const big = new Uint8Array(256 * 1024).map((_, i) => (i * 31) % 251)
    const [a, b] = await addPhotos(entry.id, [{ ...photo(1), original: new Blob([big]) }, photo(2)], phone.db)
    // The connection drops on the first original.
    server.interceptor = (op, _c, _id, files) => (op === 'upload' && files?.includes('original') ? responseError(0) : undefined)
    await phone.sync()
    expect(phone.engine.getStatus().lastError).toBe('Geen verbinding met de server.')
    for (const p of [a!, b!]) {
      const local = (await phone.db.photos.get(p.id))!
      expect(local.uploads).toEqual({ original: 'pending', copy: 'uploaded', thumbnail: 'uploaded' })
      expect(local.original).toBeInstanceOf(Blob) // kept until all three are confirmed
    }
    expect(server.file('photos', a!.id, 'original')).toBeUndefined()

    // The app is closed and opened again: a new engine on the same database.
    phone.engine.stop()
    server.interceptor = null
    server.requests.length = 0
    const reopened = createSyncEngine({ db: phone.db, client: phone.client, auth: phone.auth, fetchFile: server.fetchFile })
    engines.push(reopened)
    await reopened.syncNow()
    expect(reopened.getStatus()).toMatchObject({ lastError: null, uploaded: 2 })
    expect(server.requests.filter((r) => r.op === 'upload').map((r) => r.files)).toEqual([['original'], ['original']])
    expect(await bytes(server.file('photos', a!.id, 'original'))).toEqual(big)
    expect((await phone.db.photos.get(a!.id))!.original).toBeNull()
    expect((await phone.db.photos.get(b!.id))!.original).toBeNull()
  })

  it('marks nothing uploaded that PocketBase’s answer does not show', async () => {
    const server = new FakePocketBase()
    const db = openDb(`sync-engine-test-${++n}`)
    dbs.push(db)
    // An answer without the original's file name (as if the field didn't take the file).
    const client = server.client()
    const wrapped = {
      ...client,
      collection(name: string) {
        const api = client.collection(name)
        return {
          ...api,
          async update(id: string, body: Record<string, unknown> | FormData) {
            const stored = await api.update(id, body)
            delete stored.original
            return stored
          },
        }
      },
    }
    const engine = createSyncEngine({ db, client: wrapped, auth: fakeAuth(client), fetchFile: server.fetchFile })
    engines.push(engine)
    const entry = await onePhotoEntry(db)
    const [a] = await addPhotos(entry.id, [photo(1)], db)
    await engine.syncNow()
    const phone = { db, engine }
    const local = (await phone.db.photos.get(a!.id))!
    expect(local.uploads.copy).toBe('uploaded')
    expect(local.uploads.original).toBe('pending')
    expect(local.original).toBeInstanceOf(Blob)
    expect(phone.engine.getStatus().lastError).not.toBeNull()
  })

  it('never uploads a photo deleted before its upload, and keeps its files on the device', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const entry = await onePhotoEntry(phone.db)
    const [kept, gone] = await addPhotos(entry.id, [photo(1), photo(2)], phone.db)
    await deletePhoto(gone!.id, phone.db)
    await phone.sync()

    const uploads = server.requests.filter((r) => r.op === 'upload')
    expect(uploads.map((r) => r.id)).toEqual([kept!.id, kept!.id])
    expect(server.get('photos', gone!.id)).toMatchObject({ deletedAt: (await phone.db.photos.get(gone!.id))!.deletedAt })
    expect(server.get('photos', gone!.id)).not.toHaveProperty('copy')
    const local = (await phone.db.photos.get(gone!.id))!
    expect(local.uploads).toEqual({ original: 'pending', copy: 'pending', thumbnail: 'pending' })
    expect(local.original).toBeInstanceOf(Blob)
    expect(phone.engine.getStatus().lastError).toBeNull()
  })

  it('a photo deleted between its copy and its original sends no original', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const entry = await onePhotoEntry(phone.db)
    const [a] = await addPhotos(entry.id, [photo(1)], phone.db)
    server.interceptor = (op, _c, _id, files) => (op === 'upload' && files?.includes('original') ? responseError(0) : undefined)
    await phone.sync()
    server.interceptor = null
    await deletePhoto(a!.id, phone.db)
    server.requests.length = 0
    await phone.sync()
    expect(server.requests.filter((r) => r.op === 'upload')).toEqual([])
    expect(server.get('photos', a!.id)?.deletedAt).not.toBe('')
    expect(server.get('photos', a!.id)?.copy).toBeTruthy()
    expect(server.get('photos', a!.id)?.original).toBeUndefined()
  })

  it('a refused file skips that photo, not the queue, and is reported', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const entry = await onePhotoEntry(phone.db)
    const [a, b] = await addPhotos(entry.id, [photo(1), photo(2)], phone.db)
    server.interceptor = (op, _c, id, files) =>
      op === 'upload' && id === a!.id && files?.includes('original') ? responseError(400) : undefined
    await phone.sync()
    expect((await phone.db.photos.get(a!.id))!.uploads.original).toBe('pending')
    expect((await phone.db.photos.get(b!.id))!.uploads.original).toBe('uploaded')
    expect(phone.engine.getStatus().lastError).toBe('De server weigerde een wijziging (400).')
  })

  it('another device downloads the copy and thumbnail, never the original', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const entry = await onePhotoEntry(phone.db)
    const [a] = await addPhotos(entry.id, [photo(1)], phone.db)
    await phone.sync()
    await laptop.sync()

    const local = (await laptop.db.photos.get(a!.id))!
    expect(local).toMatchObject({ entryId: entry.id, projectId: entry.projectId, width: 4, height: 3, original: null })
    expect(local.uploads).toEqual({ original: 'none', copy: 'none', thumbnail: 'none' })
    expect(local.updatedAt).toBe((await phone.db.photos.get(a!.id))!.updatedAt)
    expect(await bytes(local.blob)).toEqual(await bytes(photo(1).copy))
    expect(await bytes(local.thumbnail)).toEqual(await bytes(photo(1).thumbnail))
    const original = server.get('photos', a!.id)!.original
    const downloads = server.requests.filter((r) => r.op === 'download')
    expect(downloads).toHaveLength(2)
    expect(laptop.engine.getStatus()).toMatchObject({ lastError: null, pulled: 3, uploaded: 0 })
    expect(original).toBeTruthy()

    // Nothing to upload from the laptop, and nothing downloaded twice.
    server.requests.length = 0
    await laptop.sync()
    expect(server.requests.filter((r) => r.op === 'upload' || r.op === 'download')).toEqual([])
  })

  it('a photo whose files arrive later is downloaded then', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const entry = await onePhotoEntry(phone.db)
    const [a] = await addPhotos(entry.id, [photo(1)], phone.db)
    server.interceptor = (op) => (op === 'upload' ? responseError(0) : undefined)
    await phone.sync()
    await laptop.sync()
    expect(await laptop.db.photos.get(a!.id)).toBeUndefined()
    server.interceptor = null
    await phone.sync()
    await laptop.sync()
    expect((await laptop.db.photos.get(a!.id))?.blob).toBeInstanceOf(Blob)
  })

  it('a failed download keeps the cursor, so the next run fetches the photo', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const entry = await onePhotoEntry(phone.db)
    const [a] = await addPhotos(entry.id, [photo(1)], phone.db)
    await phone.sync()
    server.interceptor = (op) => (op === 'download' ? responseError(0) : undefined)
    await laptop.sync()
    expect(await laptop.db.photos.get(a!.id)).toBeUndefined()
    expect(laptop.engine.getStatus().lastError).toBe('Geen verbinding met de server.')
    server.interceptor = null
    await laptop.sync()
    expect((await laptop.db.photos.get(a!.id))?.blob).toBeInstanceOf(Blob)
  })

  it('pulls photo records again once, which T-0016 skipped and moved its cursor past', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const entry = await onePhotoEntry(phone.db)
    const [a] = await addPhotos(entry.id, [photo(1)], phone.db)
    await phone.sync()
    // As T-0016 left the laptop: its photos cursor past the photo, the photo not stored.
    await laptop.db.syncState.put({ key: 'cursor:photos', value: '2100-01-01 00:00:00.000Z' })
    await laptop.sync()
    expect((await laptop.db.photos.get(a!.id))?.blob).toBeInstanceOf(Blob)
    // Only once: a later cursor is kept.
    expect((await laptop.db.syncState.get('photoFiles'))?.value).toBeTruthy()
    await laptop.db.syncState.put({ key: 'cursor:photos', value: '2100-01-01 00:00:00.000Z' })
    await laptop.sync()
    expect((await laptop.db.syncState.get('cursor:photos'))?.value).toBe('2100-01-01 00:00:00.000Z')
  })

  it('holds the app update back while uploading (T-0019)', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const entry = await onePhotoEntry(phone.db)
    await addPhotos(entry.id, [photo(1)], phone.db)
    const busy: boolean[] = []
    server.interceptor = (op) => {
      if (op === 'upload') busy.push(isBusy())
    }
    await phone.sync()
    expect(busy).toEqual([true, true])
    expect(isBusy()).toBe(false)
  })

  it('stops without marking anything when sign-out clears the device during an upload', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const entry = await onePhotoEntry(phone.db)
    await addPhotos(entry.id, [photo(1)], phone.db)
    let cleared: Promise<void> | null = null
    server.interceptor = (op) => {
      if (op === 'upload' && !cleared) cleared = clearLocalData(phone.db)
    }
    await phone.sync()
    await cleared
    expect(await phone.db.photos.count()).toBe(0)
    expect(await phone.db.syncState.count()).toBe(0)
  })
})

describe('last-write-wins (D-0002)', () => {
  it('an edit on both while offline: the later wins everywhere, the earlier is in history', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    at('2026-11-17T09:00:00.000Z')
    const project = await createProject({ title: 'Schuurdeur' }, phone.db)
    await phone.sync()
    await laptop.sync()

    at('2026-11-17T10:00:00.000Z')
    await updateProject(project.id, { title: 'Van de telefoon' }, phone.db)
    at('2026-11-17T11:00:00.000Z')
    await updateProject(project.id, { title: 'Van de laptop' }, laptop.db)

    // The later edit syncs first; the earlier one arrives after it.
    await laptop.sync()
    await phone.sync()

    expect(server.get('projects', project.id)?.title).toBe('Van de laptop')
    expect((await phone.db.projects.get(project.id))?.title).toBe('Van de laptop')
    expect(await countUnsynced(phone.db)).toBe(0)
    const kept = server.history.filter((h) => h.recordId === project.id).map((h) => h.data.title)
    expect(kept).toContain('Van de telefoon')
    expect(kept).toContain('Schuurdeur')
  })

  it('the earlier edit syncing first is overwritten by the later and kept in history', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    at('2026-11-17T09:00:00.000Z')
    const project = await createProject({ title: 'Bank' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17', note: 'Begin' }, phone.db)
    await phone.sync()
    await laptop.sync()

    at('2026-11-17T10:00:00.000Z')
    await updateEntry(entry.id, { note: 'Telefoon' }, phone.db)
    at('2026-11-17T11:00:00.000Z')
    await updateEntry(entry.id, { note: 'Laptop' }, laptop.db)

    await phone.sync()
    await laptop.sync()
    await phone.sync()

    for (const d of [phone, laptop]) expect((await d.db.entries.get(entry.id))?.note).toBe('Laptop')
    expect(server.history.filter((h) => h.recordId === entry.id).map((h) => h.data.note)).toEqual(['Begin', 'Telefoon'])
  })

  it('never overwrites a local change that is still in the outbox', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    at('2026-11-17T09:00:00.000Z')
    const project = await createProject({ title: 'Bank' }, phone.db)
    await phone.sync()
    at('2026-11-17T12:00:00.000Z')
    await updateProject(project.id, { title: 'Lokaal' }, phone.db)
    // Another device wrote an older version; the phone's push fails, its pull still runs.
    server.put('projects', { ...server.get('projects', project.id)!, title: 'Ouder', updatedAt: '2026-11-17T10:00:00.000Z' })
    server.interceptor = (op) => (op === 'update' ? responseError(503) : undefined)
    await phone.sync()
    expect((await phone.db.projects.get(project.id))?.title).toBe('Lokaal')
    server.interceptor = null
    await phone.sync()
    expect(server.get('projects', project.id)?.title).toBe('Lokaal')
  })
})

describe('runs', () => {
  it('holds the busy registry while running (T-0019)', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    await createProject({ title: 'Een' }, phone.db)
    const seen: boolean[] = []
    server.interceptor = () => void seen.push(isBusy())
    await phone.sync()
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(Boolean)).toBe(true)
    expect(isBusy()).toBe(false)
  })

  it('runs one sync at a time; a call during a run gets one follow-up run', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    await createProject({ title: 'Een' }, phone.db)
    let active = 0
    let most = 0
    server.interceptor = (op) => {
      if (op !== 'create') return
      active++
      most = Math.max(most, active)
      setTimeout(() => active--, 0)
    }
    let runs = 0
    let was = false
    phone.engine.subscribe(() => {
      const now = phone.engine.getStatus().running
      if (now && !was) runs++
      was = now
    })
    await Promise.all([phone.sync(), phone.sync(), phone.sync()])
    expect(runs).toBe(2) // the first, and one follow-up for the two calls during it
    expect(most).toBe(1)
    expect(server.requests.filter((r) => r.op === 'create')).toHaveLength(1)
  })

  it('stops without writing anything back when sign-out clears the device mid-run', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    await createProject({ title: 'Een' }, phone.db)
    await createProject({ title: 'Twee' }, phone.db)
    await phone.sync()

    let cleared = false
    server.interceptor = (op) => {
      if (op !== 'getList' || cleared) return
      cleared = true
      void clearLocalData(laptop.db)
    }
    await laptop.sync()
    server.interceptor = null
    expect(await laptop.db.projects.count()).toBe(0)
    expect(await laptop.db.syncState.count()).toBe(0)
  })

  it('syncs shortly after a local change once started', async () => {
    const server = new FakePocketBase()
    const db = openDb(`sync-engine-test-${++n}`)
    dbs.push(db)
    const client = server.client('u1')
    const engine = createSyncEngine({ db, client, auth: fakeAuth(client), debounceMs: 10 })
    engines.push(engine)
    engine.start()
    await vi.waitFor(() => expect(engine.getStatus().lastSuccessAt).not.toBeNull())
    const project = await createProject({ title: 'Een' }, db)
    await vi.waitFor(() => expect(server.get('projects', project.id)).toBeDefined())
    await vi.waitFor(async () => expect(await countUnsynced(db)).toBe(0))
  })
})

describe('slugs (T-0027, D-0029)', () => {
  it('two devices offline with the same title end up as x and x-2, the same on both', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    at('2026-11-20T10:00:00.000Z')
    const first = await createProject({ title: 'Kast für Sanne' }, phone.db)
    at('2026-11-20T10:05:00.000Z')
    const second = await createProject({ title: 'Kast für Sanne' }, laptop.db)
    expect([first.slug, second.slug]).toEqual(['kast-fur-sanne', 'kast-fur-sanne'])

    await phone.sync()
    await laptop.sync() // the NAS answers its push with kast-fur-sanne-2, and it takes that over
    expect(await laptop.db.projects.get(second.id)).toMatchObject({ slug: 'kast-fur-sanne-2', updatedAt: second.updatedAt })
    expect(await countUnsynced(laptop.db)).toBe(0)
    await phone.sync()
    for (const d of [phone.db, laptop.db]) {
      expect((await d.projects.get(first.id))?.slug).toBe('kast-fur-sanne')
      expect((await d.projects.get(second.id))?.slug).toBe('kast-fur-sanne-2')
    }
  })

  it('a rename moves the old slug to oldSlugs on every device, and it is never given away', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const project = await createProject({ title: 'Kast' }, phone.db)
    await phone.sync()
    await laptop.sync()
    at('2099-01-01T00:00:00.000Z')
    await updateProject(project.id, { title: 'Bank' }, phone.db)
    await phone.sync()
    await laptop.sync()
    expect(await laptop.db.projects.get(project.id)).toMatchObject({ slug: 'bank', oldSlugs: ['kast'] })
    expect(server.get('projects', project.id)).toMatchObject({ slug: 'bank', oldSlugs: ['kast'] })

    // A new Kast on the laptop doesn't take the old address.
    const other = await createProject({ title: 'Kast' }, laptop.db)
    expect(other.slug).toBe('kast-2')
  })

  it('takes slugs the NAS set without a new updatedAt (its backfill), unless a change is pending', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const a = await createProject({ title: 'Kast' }, phone.db)
    const b = await createProject({ title: 'Bank' }, phone.db)
    await phone.sync()
    // The NAS's migration: new slugs, `updated` moved, `updatedAt` as it was.
    server.put('projects', { ...server.get('projects', a.id)!, slug: 'kast-nas', oldSlugs: [] })
    server.put('projects', { ...server.get('projects', b.id)!, slug: 'bank-nas', oldSlugs: [] })
    at('2099-01-01T00:00:00.000Z')
    await updateProject(b.id, { description: 'Pending' }, phone.db)
    vi.useRealTimers()
    await phone.sync()
    // a, unchanged here, takes the NAS's slug from the pull.
    expect((await phone.db.projects.get(a.id))?.slug).toBe('kast-nas')
    // b had a change pending: its push sent the device's slug, which the NAS kept (it is
    // free), keeping bank-nas as an earlier one; the device took that answer over.
    expect(await phone.db.projects.get(b.id)).toMatchObject({ slug: 'bank', oldSlugs: ['bank-nas'] })
    expect(server.get('projects', b.id)).toMatchObject({ slug: 'bank', oldSlugs: ['bank-nas'] })
  })

  it('keeps or makes a slug for projects from a NAS without slugs (before its migration)', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const project = await createProject({ title: 'Kast' }, phone.db)
    await phone.sync()
    const { slug: _slug, oldSlugs: _old, ...withoutSlugs } = server.get('projects', project.id)!
    server.put('projects', withoutSlugs)
    await phone.sync()
    expect((await phone.db.projects.get(project.id))?.slug).toBe('kast')
    await laptop.sync()
    expect(await laptop.db.projects.get(project.id)).toMatchObject({ slug: 'kast', oldSlugs: [] })
  })
})

describe('the bin (T-0022, D-0014)', () => {
  /** A project with an entry and two photos, synced from the phone and pulled by the laptop. */
  async function shared(server: FakePocketBase) {
    const phone = device(server)
    const laptop = device(server)
    at('2026-11-17T09:00:00.000Z')
    const project = await createProject({ title: 'Tuinbank' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17', note: 'Poten' }, phone.db)
    const photos = await addPhotos(entry.id, [photo(1), photo(2)], phone.db)
    vi.useRealTimers()
    await phone.sync()
    await laptop.sync()
    expect(await laptop.db.photos.count()).toBe(2)
    return { phone, laptop, project, entry, photos }
  }

  const all = async (db: DiyDb) => ({
    projects: await db.projects.count(),
    entries: await db.entries.count(),
    photos: await db.photos.count(),
    outbox: await db.outbox.count(),
  })

  it('a restore on one device shows on another', async () => {
    const server = new FakePocketBase()
    const { phone, laptop, project, entry, photos } = await shared(server)
    at('2026-11-17T10:00:00.000Z')
    await deleteProject(project.id, phone.db)
    vi.useRealTimers()
    await phone.sync()
    await laptop.sync()
    expect((await laptop.db.projects.get(project.id))?.deletedAt).not.toBeNull()

    at('2026-11-17T11:00:00.000Z')
    await restoreProject(project.id, phone.db)
    vi.useRealTimers()
    await phone.sync()
    expect(phone.engine.getStatus()).toMatchObject({ lastError: null, pushed: 4 })
    await laptop.sync()
    expect(laptop.engine.getStatus().lastError).toBeNull()
    expect((await laptop.db.projects.get(project.id))?.deletedAt).toBeNull()
    expect((await laptop.db.entries.get(entry.id))?.deletedAt).toBeNull()
    for (const p of photos) expect((await laptop.db.photos.get(p.id))?.deletedAt).toBeNull()
  })

  it('a permanent delete on the NAS reaches the other device, which drops its copies', async () => {
    const server = new FakePocketBase()
    const { phone, laptop, project, photos } = await shared(server)
    await deleteProject(project.id, phone.db)
    await phone.sync()
    await laptop.sync()

    await purgeOnNas(phone.client, 'project', project.id)
    await removePurged('project', project.id, phone.db)
    for (const p of photos) expect(server.file('photos', p.id, 'copy')).toBeUndefined()
    expect(server.get('photos', photos[0]!.id)).toMatchObject({ copy: '', original: '', thumbnail: '' })
    expect(server.history.filter((h) => h.recordId === project.id)).toEqual([])

    await laptop.sync()
    expect(laptop.engine.getStatus()).toMatchObject({ lastError: null, pulled: 4 })
    expect(await all(laptop.db)).toEqual({ projects: 0, entries: 0, photos: 0, outbox: 0 })
    // The markers never come back as records, also not on the phone.
    await phone.sync()
    await laptop.sync()
    expect(await all(phone.db)).toEqual({ projects: 0, entries: 0, photos: 0, outbox: 0 })
    expect(await all(laptop.db)).toEqual({ projects: 0, entries: 0, photos: 0, outbox: 0 })
  })

  it('a late edit of a purged record is refused (410) and dropped, without blocking the queue', async () => {
    const server = new FakePocketBase()
    const { phone, laptop, project, entry } = await shared(server)
    await deleteEntry(entry.id, phone.db)
    await phone.sync()
    // The laptop, offline, still edits the entry and adds a project.
    await updateEntry(entry.id, { note: 'Late' }, laptop.db)
    const other = await createProject({ title: 'Kast' }, laptop.db)
    await purgeOnNas(phone.client, 'entry', entry.id)

    await laptop.sync()
    expect(laptop.engine.getStatus().lastError).toBeNull()
    expect(await laptop.db.entries.get(entry.id)).toBeUndefined()
    expect(await laptop.db.photos.count()).toBe(0)
    expect(await countUnsynced(laptop.db)).toBe(0)
    expect(server.get('entries', entry.id)).toMatchObject({ note: '' })
    expect(server.get('projects', other.id)).toMatchObject({ title: 'Kast' })
    expect(await laptop.db.projects.get(project.id)).toBeDefined()
  })

  it('a new photo under a purged entry is refused (410) and not created', async () => {
    const server = new FakePocketBase()
    const { phone, laptop, entry } = await shared(server)
    // The laptop, offline, adds a photo to the entry the phone then deletes for good.
    const [late] = await addPhotos(entry.id, [photo(3)], laptop.db)
    await deleteEntry(entry.id, phone.db)
    await phone.sync()
    await purgeOnNas(phone.client, 'entry', entry.id)

    await laptop.sync()
    expect(laptop.engine.getStatus().lastError).toBeNull()
    expect(server.get('photos', late!.id)).toBeUndefined()
    expect(await laptop.db.photos.get(late!.id)).toBeUndefined()
    expect(await countUnsynced(laptop.db)).toBe(0)
  })

  it('an upload of a photo purged in between is refused (410), not stored, and the photo dropped', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const project = await createProject({ title: 'Kast' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    const [p] = await addPhotos(entry.id, [photo(1)], phone.db)
    // Another device deletes the photo for good after this device's pull, before its upload.
    server.interceptor = (op) => {
      if (op !== 'upload') return
      server.interceptor = null
      server.put('photos', { ...server.get('photos', p!.id)!, deletedAt: '2026-11-17T12:00:00.000Z' })
      server.purge('photos', p!.id)
    }
    await phone.sync()
    expect(phone.engine.getStatus()).toMatchObject({ lastError: null, uploaded: 0 })
    expect(await phone.db.photos.get(p!.id)).toBeUndefined()
    expect(server.get('photos', p!.id)).toMatchObject({ copy: '', thumbnail: '', original: '' })
    expect([...server.files.keys()].filter((k) => k.includes(p!.id))).toEqual([])
  })

  it('the NAS refuses to purge a live record', async () => {
    const server = new FakePocketBase()
    const { phone, project } = await shared(server)
    await expect(purgeOnNas(phone.client, 'project', project.id)).rejects.toMatchObject({ status: 400 })
    expect(server.get('projects', project.id)).toMatchObject({ title: 'Tuinbank' })
    expect(server.get('projects', project.id)?.purgedAt).toBeUndefined()
  })
})
