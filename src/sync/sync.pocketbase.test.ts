// @vitest-environment node
// T-0016: the sync engine against a real, throwaway PocketBase built from deploy/nas (its
// migrations and hooks). CI's `pocketbase-sync` job starts one on an empty database and sets
// the variables below. Skipped everywhere else. Never point this at the NAS (D-0006).
//
// Two simulated devices: each its own Dexie database and PocketBase client, signed in as the
// same user.
import PocketBase, { ClientResponseError, type RecordModel } from 'pocketbase'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuth } from '../auth/auth'
import { openDb, type DiyDb } from '../db/db'
import { addEntry, addPhotos, countUnsynced, createProject, deletePhoto, updateEntry, updateProject } from '../db/write'
import { createSyncEngine, type SyncEngine } from './engine'

const URL = process.env.POCKETBASE_TEST_URL ?? ''
const SU_EMAIL = process.env.POCKETBASE_TEST_SUPERUSER_EMAIL ?? ''
const SU_PASSWORD = process.env.POCKETBASE_TEST_SUPERUSER_PASSWORD ?? ''
const PASSWORD = 'ci-only-password-123456'

/** PocketBase's default *:auth rate limit allows 2 sign-ins per 3 s: wait and retry on 429. */
async function retry429<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!(err instanceof ClientResponseError && err.status === 429) || attempt >= 10) throw err
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

function client(): PocketBase {
  const pb = new PocketBase(URL)
  pb.autoCancellation(false)
  return pb
}

/** Pins the clock, so `updatedAt` says which edit came last. Only Date is faked. */
function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

const photo = (i: number) => ({
  original: new Blob([`original-${i}`]),
  copy: new Blob([`copy-${i}`]),
  thumbnail: new Blob([`thumb-${i}`]),
  takenAt: '2026-11-16T09:00:00.000Z',
  width: 4,
  height: 3,
})

describe.skipIf(!URL)('sync against a real PocketBase (T-0016)', { timeout: 120_000 }, () => {
  const su = client()
  let n = 0
  const dbs: DiyDb[] = []
  const engines: SyncEngine[] = []

  beforeAll(async () => {
    await retry429(() => su.collection('_superusers').authWithPassword(SU_EMAIL, SU_PASSWORD))
  })

  afterEach(async () => {
    vi.useRealTimers()
    for (const engine of engines.splice(0)) engine.stop()
    for (const d of dbs.splice(0)) await d.delete()
  })

  /** A fresh user, made by the superuser as in the admin screen (D-0013). */
  async function user() {
    const email = `sync-${Date.now()}-${++n}@ci.invalid`
    const record = await su
      .collection('users')
      .create({ email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true })
    return { email, id: record.id as string }
  }

  /** A device: its own database and client, signed in as `email`. */
  async function device(email: string, { refresh = false } = {}) {
    const db = openDb(`sync-pocketbase-test-${++n}`)
    dbs.push(db)
    const pb = client()
    const auth = createAuth({ client: pb, db })
    const result = await retry429(async () => {
      const r = await auth.signIn(email, PASSWORD)
      if (!r.ok && r.message.startsWith('Te veel')) throw new ClientResponseError({ status: 429 })
      return r
    })
    expect(result).toEqual({ ok: true })
    // refreshAfterSync signs in again: keep it out of the auth rate limit in these tests.
    const engine = createSyncEngine({
      db,
      client: pb,
      auth: refresh ? auth : { ...auth, refreshAfterSync: async () => auth.state() },
      retryBaseMs: 1_000_000,
      retryMaxMs: 1_000_000,
    })
    engines.push(engine)
    const sync = async () => {
      await engine.syncNow()
      return engine.getStatus()
    }
    return { db, pb, engine, sync }
  }

  const history = (recordId: string) =>
    su.collection('history').getFullList({ filter: su.filter('recordId = {:id}', { id: recordId }), sort: 'created' })

  it('pushes from one device and pulls on another', async () => {
    const { email } = await user()
    const phone = await device(email)
    const laptop = await device(email)

    const project = await createProject({ title: 'Schuurdeur', tags: ['hout'] }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17', note: 'Geschuurd' }, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, pushed: 2 })
    expect(await countUnsynced(phone.db)).toBe(0)

    // Stored under the device's own id.
    const stored = await su.collection('projects').getOne(project.id)
    expect(stored).toMatchObject({ title: 'Schuurdeur', tags: ['hout'], status: 'idea' })

    expect(await laptop.sync()).toMatchObject({ lastError: null, pulled: 2 })
    expect(await laptop.db.projects.get(project.id)).toEqual(await phone.db.projects.get(project.id))
    expect(await laptop.db.entries.get(entry.id)).toEqual(await phone.db.entries.get(entry.id))

    // And back: an edit on the laptop reaches the phone.
    await updateEntry(entry.id, { note: 'Geschuurd en gegrond' }, laptop.db)
    expect(await laptop.sync()).toMatchObject({ lastError: null, pushed: 1 })
    expect(await phone.sync()).toMatchObject({ lastError: null, pulled: 1 })
    expect((await phone.db.entries.get(entry.id))?.note).toBe('Geschuurd en gegrond')
  })

  it('an edit on both while offline: the later wins, the earlier is in history', async () => {
    const { email } = await user()
    const phone = await device(email)
    const laptop = await device(email)
    at('2026-11-17T09:00:00.000Z')
    const project = await createProject({ title: 'Bank' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17', note: 'Begin' }, phone.db)
    await phone.sync()
    await laptop.sync()

    // Both offline: the phone edits first, the laptop later.
    at('2026-11-17T10:00:00.000Z')
    await updateProject(project.id, { title: 'Bank (telefoon)' }, phone.db)
    await updateEntry(entry.id, { note: 'Telefoon' }, phone.db)
    at('2026-11-17T11:00:00.000Z')
    await updateProject(project.id, { title: 'Bank (laptop)' }, laptop.db)
    await updateEntry(entry.id, { note: 'Laptop' }, laptop.db)
    vi.useRealTimers()

    // The project: the later edit reaches the NAS first, the earlier one after it.
    // The entry: the same two devices, so the earlier edit also arrives first for it; both
    // orders are covered because each device pushes both records.
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(await laptop.sync()).toMatchObject({ lastError: null })

    for (const d of [phone, laptop]) {
      expect((await d.db.projects.get(project.id))?.title).toBe('Bank (laptop)')
      expect((await d.db.entries.get(entry.id))?.note).toBe('Laptop')
      expect(await countUnsynced(d.db)).toBe(0)
    }
    expect((await su.collection('projects').getOne(project.id)).title).toBe('Bank (laptop)')
    const titles = (await history(project.id)).map((h: RecordModel) => h.data.title)
    expect(titles).toContain('Bank (telefoon)')
    expect(titles).toContain('Bank')
  })

  it('the earlier edit reaching the NAS first is overwritten and kept in history', async () => {
    const { email } = await user()
    const phone = await device(email)
    const laptop = await device(email)
    at('2026-11-17T09:00:00.000Z')
    const project = await createProject({ title: 'Kast' }, phone.db)
    await phone.sync()
    await laptop.sync()
    at('2026-11-17T10:00:00.000Z')
    await updateProject(project.id, { title: 'Kast (telefoon)' }, phone.db)
    at('2026-11-17T11:00:00.000Z')
    await updateProject(project.id, { title: 'Kast (laptop)' }, laptop.db)
    vi.useRealTimers()

    await phone.sync()
    await laptop.sync()
    await phone.sync()

    for (const d of [phone, laptop]) expect((await d.db.projects.get(project.id))?.title).toBe('Kast (laptop)')
    expect((await history(project.id)).map((h: RecordModel) => h.data.title)).toEqual(['Kast', 'Kast (telefoon)'])
  })

  it('syncs tombstones, and photo records without their files', async () => {
    const { email } = await user()
    const phone = await device(email)
    const laptop = await device(email)
    const project = await createProject({ title: 'Tuinbank' }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    const [kept, gone] = await addPhotos(entry.id, [photo(1), photo(2)], phone.db)
    await phone.sync()

    // The laptop has its own copy of the record now (T-0017 brings files; here only records).
    await laptop.sync()
    expect(await laptop.db.entries.get(entry.id)).toBeDefined()

    await deletePhoto(gone!.id, phone.db)
    // An entry tombstone, as T-0010 will write it: record and outbox row together.
    const time = new Date().toISOString()
    await phone.db.transaction('rw', phone.db.entries, phone.db.outbox, async () => {
      await phone.db.entries.update(entry.id, { deletedAt: time, updatedAt: time })
      await phone.db.outbox.add({ table: 'entries', recordId: entry.id, op: 'delete', queuedAt: time })
    })
    expect(await phone.sync()).toMatchObject({ lastError: null })

    const photos = await su.collection('photos').getFullList({ filter: su.filter('entryId = {:id}', { id: entry.id }) })
    expect(photos).toHaveLength(2)
    expect(photos.find((p) => p.id === gone!.id)?.deletedAt).toBe((await phone.db.photos.get(gone!.id))!.deletedAt)
    expect(photos.find((p) => p.id === kept!.id)?.deletedAt).toBe('')
    expect(photos.every((p) => p.original === '' && p.copy === '')).toBe(true)
    expect((await su.collection('entries').getOne(entry.id)).deletedAt).toBe(time)

    await laptop.sync()
    expect((await laptop.db.entries.get(entry.id))?.deletedAt).toBe(time)
  })

  it('a push that fails halfway resumes without losing or duplicating anything', async () => {
    const { email } = await user()
    const phone = await device(email)
    const laptop = await device(email)
    const titles = ['Een', 'Twee', 'Drie', 'Vier']
    const projects = []
    for (const title of titles) projects.push(await createProject({ title }, phone.db))
    await updateProject(projects[0]!.id, { description: 'bewerkt' }, phone.db)

    // The connection drops after two records reached the NAS.
    let writes = 0
    phone.pb.beforeSend = (url, options) => {
      if (options.method === 'POST' && url.includes('/api/collections/projects/records') && ++writes > 2) {
        throw new TypeError('Failed to fetch')
      }
      return { url, options }
    }
    const failed = await phone.sync()
    expect(failed.lastError).not.toBeNull()
    expect(failed.pushed).toBe(3) // Een (two rows) and Twee
    expect((await phone.db.outbox.toArray()).map((r) => r.recordId)).toEqual([projects[2]!.id, projects[3]!.id])
    expect(await su.collection('projects').getFullList({ filter: su.filter('owner = {:o}', { o: phone.pb.authStore.record!.id }) })).toHaveLength(2)

    phone.pb.beforeSend = undefined
    expect(await phone.sync()).toMatchObject({ lastError: null, pushed: 2 })
    expect(await countUnsynced(phone.db)).toBe(0)
    const stored = await su
      .collection('projects')
      .getFullList({ filter: su.filter('owner = {:o}', { o: phone.pb.authStore.record!.id }) })
    expect(stored.map((p) => p.title).sort()).toEqual([...titles].sort())
    expect(stored.map((p) => p.id).sort()).toEqual(projects.map((p) => p.id).sort())

    await laptop.sync()
    expect((await laptop.db.projects.toArray()).map((p) => p.title).sort()).toEqual([...titles].sort())
  })

  it('pauses on a revoked sign-in and keeps the outbox', async () => {
    const { email, id } = await user()
    const phone = await device(email, { refresh: true })
    await createProject({ title: 'Een' }, phone.db)
    // A refused token reads as no sign-in to PocketBase, so the engine asks the sign-in
    // itself; wait out the *:auth rate limit (2 per 3 s) the sign-in above used.
    await new Promise((r) => setTimeout(r, 3100))
    const newPassword = `${PASSWORD}-changed`
    await su.collection('users').update(id, { password: newPassword, passwordConfirm: newPassword })
    const status = await phone.sync()
    expect(status).toMatchObject({ needsSignIn: true, lastError: 'Opnieuw inloggen om te synchroniseren' })
    expect(await countUnsynced(phone.db)).toBe(1)
  })

  it('notices a revoked sign-in with nothing to push', async () => {
    const { email, id } = await user()
    const phone = await device(email, { refresh: true })
    await new Promise((r) => setTimeout(r, 3100))
    const newPassword = `${PASSWORD}-changed`
    await su.collection('users').update(id, { password: newPassword, passwordConfirm: newPassword })
    expect(await phone.sync()).toMatchObject({ needsSignIn: true, lastSuccessAt: null })
  })

  it("never shows one user's records to another", async () => {
    const a = await user()
    const b = await user()
    const phone = await device(a.email)
    const other = await device(b.email)
    await createProject({ title: 'Van A' }, phone.db)
    await phone.sync()
    expect(await other.sync()).toMatchObject({ lastError: null, pulled: 0 })
    expect(await other.db.projects.count()).toBe(0)
  })

  it("lets no one else see or change a record through the last-write-wins hook", async () => {
    const a = await user()
    const b = await user()
    const phone = await device(a.email)
    const other = await device(b.email)
    const project = await createProject({ title: 'Van A' }, phone.db)
    await phone.sync()
    // An older version from another user: refused, not answered with A's record.
    const older = { title: 'Overschreven', updatedAt: '2000-01-01T00:00:00.000Z' }
    await expect(other.pb.collection('projects').update(project.id, older)).rejects.toMatchObject({ status: 404 })
    const newer = { title: 'Overschreven', updatedAt: '2100-01-01T00:00:00.000Z' }
    await expect(other.pb.collection('projects').update(project.id, newer)).rejects.toMatchObject({ status: 404 })
    expect((await su.collection('projects').getOne(project.id)).title).toBe('Van A')
    expect(await history(project.id)).toHaveLength(0)
  })
})
