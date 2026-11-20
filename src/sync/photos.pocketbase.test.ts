// @vitest-environment node
// T-0017: photo files against a real, throwaway PocketBase built from deploy/nas (its
// migrations and hooks). CI's `pocketbase-auth` job starts one on an empty database and sets
// the variables below. Skipped everywhere else. Never point this at the NAS (D-0006).
//
// Simulated devices: each its own Dexie database and PocketBase client, signed in as the same
// user. Files are fetched with Node's fetch, as the browser would.
import { createHash } from 'node:crypto'
import PocketBase, { ClientResponseError } from 'pocketbase'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createAuth } from '../auth/auth'
import { openDb, type DiyDb } from '../db/db'
import {
  addEntry,
  addPhotos,
  createProject,
  deleteEntry,
  deletePhoto,
  deleteProject,
  removePurged,
  updateProject,
} from '../db/write'
import { createPocketBaseSource, visitorClient } from '../public/source'
import { createSyncEngine, type SyncEngine } from './engine'
import { uploadBody } from './photos'
import { purgeOnNas } from './purge'

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

const sha256 = async (blob: Blob) => createHash('sha256').update(new Uint8Array(await blob.arrayBuffer())).digest('hex')

/** Bytes that no encoder would leave as they are: a byte-for-byte check means something. */
function originalBytes(seed: number, size = 3 * 1024 * 1024): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  let x = seed * 2654435761
  for (let i = 0; i < size; i++) {
    x = (x * 1103515245 + 12345) >>> 0
    bytes[i] = x >>> 24
  }
  // A JPEG's start, so it looks like what the gallery gives (it isn't decoded anywhere).
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  return bytes
}

function photo(i: number) {
  const original = new File([originalBytes(i)], `IMG_000${i}.jpg`, { type: 'image/jpeg' })
  return {
    original,
    copy: new Blob([`copy-${i}`.repeat(1000)], { type: 'image/webp' }),
    thumbnail: new Blob([`thumb-${i}`.repeat(100)], { type: 'image/webp' }),
    takenAt: '2026-11-16T09:00:00.000Z',
    width: 4,
    height: 3,
  }
}

describe.skipIf(!URL)('photo files against a real PocketBase (T-0017)', { timeout: 120_000 }, () => {
  const su = client()
  let n = 0
  const dbs: DiyDb[] = []
  const engines: SyncEngine[] = []

  beforeAll(async () => {
    await retry429(() => su.collection('_superusers').authWithPassword(SU_EMAIL, SU_PASSWORD))
  })

  afterEach(async () => {
    for (const engine of engines.splice(0)) engine.stop()
    for (const d of dbs.splice(0)) await d.delete()
  })

  async function user() {
    const email = `photos-${Date.now()}-${++n}@ci.invalid`
    await su.collection('users').create({ email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true })
    return email
  }

  function engineFor(db: DiyDb, pb: PocketBase, auth: ReturnType<typeof createAuth>) {
    const engine = createSyncEngine({
      db,
      client: pb,
      // refreshAfterSync signs in again: keep it out of the auth rate limit in these tests.
      auth: { ...auth, refreshAfterSync: async () => auth.state() },
      retryBaseMs: 1_000_000,
      retryMaxMs: 1_000_000,
    })
    engines.push(engine)
    return engine
  }

  /** A device: its own database and client, signed in as `email`. */
  async function device(email: string) {
    const db = openDb(`photos-pocketbase-test-${++n}`)
    dbs.push(db)
    const pb = client()
    const auth = createAuth({ client: pb, db })
    const result = await retry429(async () => {
      const r = await auth.signIn(email, PASSWORD)
      if (!r.ok && r.message.startsWith('Te veel')) throw new ClientResponseError({ status: 429 })
      return r
    })
    expect(result).toEqual({ ok: true })
    const engine = engineFor(db, pb, auth)
    const sync = async () => {
      await engine.syncNow()
      return engine.getStatus()
    }
    /** Every multipart request this device sends, by the file fields in it. */
    const uploads: string[][] = []
    pb.beforeSend = (url, options) => {
      if (options.body instanceof FormData) uploads.push([...options.body.keys()])
      return { url, options }
    }
    return { db, pb, auth, engine, sync, uploads }
  }

  /** A stored file, fetched as the superuser with a file token. */
  async function stored(photoId: string, field: 'original' | 'copy' | 'thumbnail'): Promise<Blob | null> {
    const record = await su.collection('photos').getOne(photoId)
    if (!record[field]) return null
    const token = await su.files.getToken()
    const response = await fetch(su.files.getURL(record, record[field], { token }))
    expect(response.status).toBe(200)
    return response.blob()
  }

  async function entryOn(db: DiyDb, title = 'Werkbank') {
    const project = await createProject({ title }, db)
    return addEntry({ projectId: project.id, date: '2026-11-17' }, db)
  }

  it('an upload interrupted halfway resumes after the app is closed; the originals arrive byte for byte', async () => {
    const email = await user()
    const phone = await device(email)
    const entry = await entryOn(phone.db)
    const inputs = [photo(1), photo(2), photo(3)]
    const photos = await addPhotos(entry.id, inputs, phone.db)

    // The connection drops on the second original, after both small files of all three and
    // the first original reached the NAS.
    let originals = 0
    const passOn = phone.pb.beforeSend!
    phone.pb.beforeSend = (url, options) => {
      if (options.body instanceof FormData && options.body.has('original') && ++originals === 2) {
        throw new TypeError('Failed to fetch')
      }
      return passOn(url, options)
    }
    const failed = await phone.sync()
    expect(failed.lastError).not.toBeNull()
    expect(failed.uploaded).toBe(3 * 2 + 1)
    const states = await Promise.all(photos.map(async (p) => (await phone.db.photos.get(p.id))!))
    expect(states.map((p) => p.uploads.original).sort()).toEqual(['pending', 'pending', 'uploaded'])
    for (const p of states) {
      expect(p.uploads.copy).toBe('uploaded')
      expect(p.uploads.thumbnail).toBe('uploaded')
      // The original stays until all three files are confirmed.
      expect(p.original === null).toBe(p.uploads.original === 'uploaded')
    }

    // The app is closed and opened again: a new engine on the same database and sign-in.
    phone.engine.stop()
    phone.pb.beforeSend = passOn
    phone.uploads.length = 0
    const reopened = engineFor(phone.db, phone.pb, phone.auth)
    await reopened.syncNow()
    expect(reopened.getStatus()).toMatchObject({ lastError: null, uploaded: 2 })
    expect(phone.uploads).toEqual([['original'], ['original']])

    for (const [i, p] of photos.entries()) {
      expect(await sha256((await stored(p.id, 'original'))!)).toBe(await sha256(inputs[i]!.original))
      expect(await sha256((await stored(p.id, 'copy'))!)).toBe(await sha256(inputs[i]!.copy))
      expect(await sha256((await stored(p.id, 'thumbnail'))!)).toBe(await sha256(inputs[i]!.thumbnail))
      const local = (await phone.db.photos.get(p.id))!
      expect(local.uploads).toEqual({ original: 'uploaded', copy: 'uploaded', thumbnail: 'uploaded' })
      expect(local.original).toBeNull()
      expect(local.blob).toBeInstanceOf(Blob)
    }
  })

  it('drops the device’s original only once the NAS has confirmed all three files', async () => {
    const email = await user()
    const phone = await device(email)
    const entry = await entryOn(phone.db)
    const [p] = await addPhotos(entry.id, [photo(4)], phone.db)

    // The NAS refuses the original's request (400, as for a file over the size limit): copy
    // and thumbnail are confirmed, the original isn't, and the device keeps it.
    const passOn = phone.pb.beforeSend!
    phone.pb.beforeSend = (url, options) => {
      if (options.body instanceof FormData && options.body.has('original')) {
        options.body.append('projectId', '') // required: a validation error
      }
      return passOn(url, options)
    }
    const status = await phone.sync()
    expect(status.lastError).toBe('De server weigerde een wijziging (400).')
    let local = (await phone.db.photos.get(p!.id))!
    expect(local.uploads).toEqual({ original: 'pending', copy: 'uploaded', thumbnail: 'uploaded' })
    expect(local.original).toBeInstanceOf(Blob)
    expect(await stored(p!.id, 'original')).toBeNull()
    expect(await stored(p!.id, 'copy')).not.toBeNull()

    phone.pb.beforeSend = passOn
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 1 })
    local = (await phone.db.photos.get(p!.id))!
    expect(local.original).toBeNull()
    expect(await sha256((await stored(p!.id, 'original'))!)).toBe(await sha256(photo(4).original))
  })

  it('a second device ends up with the copy and thumbnail, and no original', async () => {
    const email = await user()
    const phone = await device(email)
    const entry = await entryOn(phone.db)
    const [p] = await addPhotos(entry.id, [photo(5)], phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 3 })

    const laptop = await device(email)
    const requested: string[] = []
    const passOn = laptop.pb.beforeSend!
    laptop.pb.beforeSend = (url, options) => {
      requested.push(url)
      return passOn(url, options)
    }
    const fetched: string[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (input, init) => {
      fetched.push(String(input))
      return realFetch(input, init)
    }
    try {
      expect(await laptop.sync()).toMatchObject({ lastError: null, uploaded: 0 })
    } finally {
      globalThis.fetch = realFetch
    }

    const local = (await laptop.db.photos.get(p!.id))!
    expect(local).toMatchObject({ entryId: entry.id, projectId: entry.projectId, width: 4, height: 3, original: null })
    expect(local.uploads).toEqual({ original: 'none', copy: 'none', thumbnail: 'none' })
    expect(await sha256(local.blob)).toBe(await sha256(photo(5).copy))
    expect(await sha256(local.thumbnail)).toBe(await sha256(photo(5).thumbnail))

    // Exactly the copy and the thumbnail, through /api/files/ with a file token; never the original.
    const record = await su.collection('photos').getOne(p!.id)
    const files = fetched.filter((u) => u.includes('/api/files/') && !u.includes('/api/files/token'))
    expect(files).toHaveLength(2)
    expect(files.some((u) => u.includes(record.copy))).toBe(true)
    expect(files.some((u) => u.includes(record.thumbnail))).toBe(true)
    expect(files.some((u) => u.includes(record.original))).toBe(false)
    expect(files.every((u) => /[?&]token=[^&]+/.test(u))).toBe(true)
    expect(requested.some((u) => u.includes(record.original))).toBe(false)
    expect(laptop.uploads).toEqual([])
  })

  it('protects the files: no token or another user’s token gets nothing', async () => {
    const email = await user()
    const phone = await device(email)
    // T-0026: a private project's photos; a public one's copy and thumbnail are for anyone.
    const project = await createProject({ title: 'Werkbank', public: false }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    const [p] = await addPhotos(entry.id, [photo(6)], phone.db)
    await phone.sync()
    const record = await su.collection('photos').getOne(p!.id)
    const stranger = await device(await user())
    const token = await stranger.pb.files.getToken()
    for (const file of [record.original, record.copy, record.thumbnail]) {
      expect((await fetch(su.files.getURL(record, file))).status).not.toBe(200)
      expect((await fetch(su.files.getURL(record, file, { token }))).status).not.toBe(200)
    }
  })

  it('never sends a photo deleted before its upload', async () => {
    const email = await user()
    const phone = await device(email)
    const entry = await entryOn(phone.db)
    const [kept, gone] = await addPhotos(entry.id, [photo(7), photo(8)], phone.db)
    await deletePhoto(gone!.id, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 3 })

    expect(phone.uploads).toEqual([['copy', 'thumbnail'], ['original']])
    const record = await su.collection('photos').getOne(gone!.id)
    expect(record.deletedAt).toBe((await phone.db.photos.get(gone!.id))!.deletedAt)
    expect([record.original, record.copy, record.thumbnail]).toEqual(['', '', ''])
    expect((await su.collection('photos').getOne(kept!.id)).original).not.toBe('')

    // Nor later, and another device doesn't store it.
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 0 })
    const laptop = await device(email)
    await laptop.sync()
    expect(await laptop.db.photos.get(gone!.id)).toBeUndefined()
    expect(await laptop.db.photos.get(kept!.id)).toBeDefined()
  })

  it('a visitor reads a public project online: copy and thumbnail load, the original never (T-0026)', async () => {
    const email = await user()
    const phone = await device(email)
    // T-0027: visitors find a project by its slug among all public ones: keep this run's apart.
    const tag = Date.now().toString(36)
    const entry = await entryOn(phone.db, `Werkbank ${tag}`)
    const [p] = await addPhotos(entry.id, [photo(7)], phone.db)
    const hidden = await createProject({ title: `Privé ${tag}`, public: false }, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 3 })

    const visitor = visitorClient(URL)
    expect(visitor.authStore.token).toBe('')
    const source = createPocketBaseSource(visitor)
    const overview = await source.overview()
    expect(overview.projects.map((x) => x.id)).toContain(entry.projectId)
    expect(overview.projects.map((x) => x.id)).not.toContain(hidden.id)
    expect(await source.project(hidden.slug)).toBeNull()

    const slug = `werkbank-${tag}`
    expect((await phone.db.projects.get(entry.projectId))?.slug).toBe(slug)
    const shown = (await source.project(slug))!
    expect(shown.entries.map((e) => e.id)).toEqual([entry.id])
    expect(shown.photos.map((x) => x.id)).toEqual([p!.id])
    const [seen] = shown.photos
    expect(seen!.copyUrl).not.toMatch(/token=/)
    expect(await sha256(await (await fetch(seen!.copyUrl)).blob())).toBe(await sha256(photo(7).copy))
    expect(await sha256(await (await fetch(seen!.thumbnailUrl)).blob())).toBe(await sha256(photo(7).thumbnail))
    const record = await su.collection('photos').getOne(p!.id)
    expect((await fetch(visitor.files.getURL(record, record.original))).status).toBe(404)

    // Switched off: gone for visitors, files included (a fresh source: no cache).
    await updateProject(entry.projectId, { public: false }, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(await createPocketBaseSource(visitor).project(slug)).toBeNull()
    expect((await fetch(seen!.copyUrl)).status).toBe(404)
  })

  it('a permanent delete removes the files on the NAS; the other device drops its copies (T-0022)', async () => {
    const email = await user()
    const phone = await device(email)
    const entry = await entryOn(phone.db)
    const photos = await addPhotos(entry.id, [photo(9), photo(10)], phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 6 })
    const laptop = await device(email)
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    expect(await laptop.db.photos.count()).toBe(2)

    await deleteProject(entry.projectId, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    // Before: every file is there for the owner.
    const before = await Promise.all(photos.map((p) => su.collection('photos').getOne(p.id)))
    const token = await su.files.getToken()
    const urls = before.flatMap((r) => [r.original, r.copy, r.thumbnail].map((f) => su.files.getURL(r, f, { token })))
    // Read each body to its end, so no download still holds a file open.
    const status = async (url: string) => {
      const response = await fetch(url)
      await response.arrayBuffer()
      return response.status
    }
    for (const url of urls) expect(await status(url)).toBe(200)

    await purgeOnNas(phone.pb, 'project', entry.projectId)
    await removePurged('project', entry.projectId, phone.db)

    // The NAS removed all three files of each photo, and the records' history; markers stay.
    for (const url of urls) expect(await status(url)).toBe(404)
    for (const p of photos) {
      const marker = await su.collection('photos').getOne(p.id)
      expect([marker.original, marker.copy, marker.thumbnail]).toEqual(['', '', ''])
      expect(marker.purgedAt).not.toBe('')
    }
    const project = await su.collection('projects').getOne(entry.projectId)
    expect(project).toMatchObject({ title: '', description: '' })
    expect(project.purgedAt).not.toBe('')
    const history = await su.collection('history').getFullList({
      filter: su.filter('recordId = {:p} || recordId = {:e}', { p: entry.projectId, e: entry.id }),
    })
    expect(history).toEqual([])

    // The markers reach the laptop, which drops its copies.
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    expect(await laptop.db.photos.count()).toBe(0)
    expect(await laptop.db.entries.count()).toBe(0)
    expect(await laptop.db.projects.count()).toBe(0)
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(await phone.db.projects.count()).toBe(0)
  })

  it('an upload of a purged photo from a second device is refused and doesn’t re-create it (T-0022)', async () => {
    const email = await user()
    const phone = await device(email)
    const entry = await entryOn(phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null })
    const laptop = await device(email)
    expect(await laptop.sync()).toMatchObject({ lastError: null })

    // The laptop adds a photo; its record reaches the NAS, its files don't yet.
    const [late] = await addPhotos(entry.id, [photo(11)], laptop.db)
    const passOn = laptop.pb.beforeSend!
    laptop.pb.beforeSend = (url, options) => {
      if (options.body instanceof FormData) throw new TypeError('Failed to fetch')
      return passOn(url, options)
    }
    expect((await laptop.sync()).lastError).not.toBeNull()
    expect((await su.collection('photos').getOne(late!.id)).copy).toBe('')

    // Meanwhile the phone deletes the entry and then deletes it for good.
    await deleteEntry(entry.id, phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null })
    await purgeOnNas(phone.pb, 'entry', entry.id)
    expect((await su.collection('photos').getOne(late!.id)).purgedAt).not.toBe('')

    // The laptop's late upload, and a re-create under the same id, are refused (410).
    laptop.pb.beforeSend = passOn
    const local = (await laptop.db.photos.get(late!.id))!
    const refused = laptop.pb.collection('photos').update(late!.id, uploadBody(local, 'copy+thumbnail'))
    await expect(refused).rejects.toMatchObject({ status: 410 })
    const recreate = laptop.pb.collection('photos').create({
      id: late!.id,
      owner: laptop.pb.authStore.record!.id,
      projectId: entry.projectId,
      entryId: entry.id,
      createdAt: local.createdAt,
      updatedAt: new Date().toISOString(),
      deletedAt: '',
    })
    await expect(recreate).rejects.toMatchObject({ status: 410 })
    const marker = await su.collection('photos').getOne(late!.id)
    expect([marker.original, marker.copy, marker.thumbnail, marker.deletedAt === '']).toEqual(['', '', '', false])

    // Its own sync then drops the photo instead of retrying it forever.
    expect(await laptop.sync()).toMatchObject({ lastError: null, uploaded: 0 })
    expect(await laptop.db.photos.get(late!.id)).toBeUndefined()
    expect(await laptop.db.entries.get(entry.id)).toBeUndefined()
    expect(await laptop.db.outbox.count()).toBe(0)
    expect((await su.collection('photos').getOne(late!.id)).copy).toBe('')
  })
})
