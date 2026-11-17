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
  deletePhoto,
  updateEntry,
  updateProject,
  type NewPhoto,
} from '../db/write'
import { isBusy } from '../sw/busy'
import { createSyncEngine, type SyncEngine } from './engine'
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
  const engine = createSyncEngine({ db, client, auth, retryBaseMs: 1_000_000, retryMaxMs: 1_000_000 })
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

  it('sends photo records and tombstones, without files', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const project = await createProject({ title: 'Bank' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    const [a, b] = await addPhotos(entry.id, [photo(1), photo(2)], phone.db)
    await phone.sync()
    expect(server.get('photos', a!.id)).toMatchObject({ entryId: entry.id, projectId: project.id, width: 4, deletedAt: '' })
    expect(server.get('photos', a!.id)).not.toHaveProperty('original')

    await deletePhoto(b!.id, phone.db)
    await phone.sync()
    expect(server.get('photos', b!.id)?.deletedAt).toBe((await phone.db.photos.get(b!.id))!.deletedAt)
    expect(await countUnsynced(phone.db)).toBe(0)
    // Its files stay on the device (T-0017 decides when they go).
    expect((await phone.db.photos.get(b!.id))?.original).toBeInstanceOf(Blob)
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

  it('leaves photos without files here for T-0017, but takes over tombstones of known ones', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const laptop = device(server)
    const project = await createProject({ title: 'Bank' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    const [p] = await addPhotos(entry.id, [photo()], phone.db)
    await phone.sync()
    await laptop.sync()
    expect(await laptop.db.photos.count()).toBe(0)
    expect(await laptop.db.entries.count()).toBe(1)

    // The laptop's own photo, deleted on the phone.
    const [q] = await addPhotos(entry.id, [photo(2)], laptop.db)
    await laptop.sync()
    await phone.sync()
    expect(await phone.db.photos.get(q!.id)).toBeUndefined() // no files on the phone either
    const time = new Date(Date.now() + 1000).toISOString()
    server.put('photos', { ...server.get('photos', q!.id)!, deletedAt: time, updatedAt: time })
    await laptop.sync()
    const local = await laptop.db.photos.get(q!.id)
    expect(local?.deletedAt).toBe(time)
    expect(local?.blob).toBeInstanceOf(Blob)
    expect(p).toBeDefined()
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
