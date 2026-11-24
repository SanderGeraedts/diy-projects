// @vitest-environment node
// T-0038 (D-0039): rebuilt thumbnails replace the older ones on a real, throwaway PocketBase
// built from backend/ (its migrations and hooks): `pnpm exec harness backend start` locally,
// CI's `pocketbase-auth` job. Skipped everywhere else. Never point this at the NAS (G-0019).
//
// Simulated devices, each its own Dexie database and PocketBase client, signed in as the same
// user. The photo worker is faked: an "image" is a Blob whose text starts with its size
// ("WxH"); "measured" is what that says, "the same file" is an equal sha256.
import { createHash } from 'node:crypto'
import PocketBase, { ClientResponseError } from 'pocketbase'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuth } from '../auth/auth'
import { openDb, type DiyDb } from '../db/db'
import { addEntry, addPhotos, countUnsynced, createProject, deleteEntry, restoreEntry, type NewPhoto } from '../db/write'
import { rebuildThumbnails } from '../photos/rebuild'
import { createPocketBaseSource, visitorClient } from '../public/source'
import { createSyncEngine, type SyncEngine, type SyncStatus } from './engine'

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

const image = (width: number, height: number, tag: string) =>
  new Blob([`${width}x${height} ${tag} `.repeat(20)], { type: 'image/webp' })

async function measureBlob(blob: Blob) {
  const [width, height] = (await blob.text()).split(' ')[0]!.split('x').map(Number)
  if (!width || !height) throw new Error('not an image')
  return { width, height }
}

/** A photo from before T-0037: a 512 px thumbnail, not measured yet. */
function older(i: number): NewPhoto {
  return {
    original: new File([`original-${i}`.repeat(100)], `IMG_000${i}.jpg`, { type: 'image/jpeg' }),
    copy: image(2560, 1920, `copy-${i}`),
    thumbnail: image(512, 384, `thumb-${i}`),
    takenAt: '2026-11-16T09:00:00.000Z',
    width: 4000,
    height: 3000,
  }
}

/** A photo imported after T-0037: its thumbnail made and measured at 1280 px. */
function newer(i: number): NewPhoto {
  return { ...older(i), thumbnail: image(1280, 960, `thumb-${i}`), thumbnailWidth: 1280 }
}

interface Sent {
  method: string
  url: string
  fields: string[] | null
}

describe.skipIf(!URL)('rebuilt thumbnails against a real PocketBase (T-0038)', { timeout: 120_000 }, () => {
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
    const email = `thumbs-${Date.now()}-${++n}@ci.invalid`
    await su.collection('users').create({ email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true })
    return email
  }

  /** A device: its own database, client and engine, signed in as `email`. */
  async function device(email: string, measure = vi.fn(measureBlob), realRefresh = false) {
    const db = openDb(`thumbs-pocketbase-test-${++n}`)
    dbs.push(db)
    const pb = client()
    const auth = createAuth({ client: pb, db })
    const result = await retry429(async () => {
      const r = await auth.signIn(email, PASSWORD)
      if (!r.ok && r.message.startsWith('Te veel')) throw new ClientResponseError({ status: 429 })
      return r
    })
    expect(result).toEqual({ ok: true })
    const engine = createSyncEngine({
      db,
      client: pb,
      // refreshAfterSync signs in again: keep it out of the auth rate limit in these tests.
      // A device that must find a revoked sign-in out keeps the real one (an authRefresh).
      auth: realRefresh ? auth : { ...auth, refreshAfterSync: async () => auth.state() },
      measure,
      // Its own lock: Node's Web Locks would make all simulated devices wait for each other.
      lock: (fn) => fn(),
      retryBaseMs: 1_000_000,
      retryMaxMs: 1_000_000,
    })
    engines.push(engine)
    const statuses: SyncStatus[] = []
    engine.subscribe(() => statuses.push(engine.getStatus()))
    const sync = async () => {
      await engine.syncNow()
      return engine.getStatus()
    }
    /** Every request this device sends, with the fields of a multipart body. */
    const sent: Sent[] = []
    pb.beforeSend = (url, options) => {
      const fields = options.body instanceof FormData ? [...options.body.keys()] : null
      sent.push({ method: String(options.method ?? 'GET'), url, fields })
      return { url, options }
    }
    /** This device's own rebuild (T-0037), with a thumbnail that says who made it. */
    const rebuild = (tag: string) =>
      rebuildThumbnails({ db, measure: measureBlob, makeThumbnail: async () => image(1280, 960, tag), makeCard: async () => image(640, 480, `card-${tag}`) })
    return { db, pb, engine, sync, sent, statuses, measure, rebuild }
  }

  const patches = (sent: Sent[], id: string) =>
    sent.filter((s) => s.method === 'PATCH' && s.url.includes(`/api/collections/photos/records/${id}`))

  /** A stored file, fetched as the superuser with a file token. */
  async function stored(photoId: string, field: 'original' | 'copy' | 'thumbnail'): Promise<Blob | null> {
    const record = await su.collection('photos').getOne(photoId)
    if (!record[field]) return null
    const token = await su.files.getToken()
    const response = await fetch(su.files.getURL(record, record[field], { token }))
    expect(response.status).toBe(200)
    return response.blob()
  }

  async function fileStatus(photoId: string, name: string): Promise<number> {
    const record = await su.collection('photos').getOne(photoId)
    const token = await su.files.getToken()
    const response = await fetch(su.files.getURL(record, name, { token }))
    await response.arrayBuffer()
    return response.status
  }

  async function historyRows(...ids: string[]): Promise<number> {
    const filter = ids.map((id) => su.filter('recordId = {:id}', { id })).join(' || ')
    return (await su.collection('history').getFullList({ filter })).length
  }

  /** Phone adds an older photo in a public project and syncs; the laptop pulls it. */
  async function shared(email: string) {
    const tag = `${Date.now().toString(36)}${++n}`
    const phone = await device(email)
    const project = await createProject({ title: `Werkbank ${tag}` }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    const [p] = await addPhotos(entry.id, [older(1)], phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 3 })
    const laptop = await device(email)
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    expect(await laptop.db.photos.get(p!.id)).toBeDefined()
    return { phone, laptop, project, entry, photo: p!, slug: `werkbank-${tag}` }
  }

  it('1, 3, 4: uploaded once, from the first device; nothing else moves; others pick it up', async () => {
    const email = await user()
    const { phone, laptop, project, entry, photo, slug } = await shared(email)
    const id = photo.id
    const visitor = createPocketBaseSource(visitorClient(URL))
    const seenBefore = (await visitor.project(slug))!.photos[0]!.thumbnailUrl

    expect((await phone.rebuild('phone')).rebuilt).toBe(1)
    expect((await laptop.rebuild('laptop')).rebuilt).toBe(1)
    const phoneThumb = (await phone.db.photos.get(id))!.thumbnail
    const before = await su.collection('photos').getOne(id)
    const historyBefore = await historyRows(id, entry.id, project.id)
    const local = (await phone.db.photos.get(id))!

    // 1 + 3: the phone replaces it, sending only the thumbnail; nothing local moves.
    phone.sent.length = 0
    phone.statuses.length = 0
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 0 })
    expect(phone.statuses.every((s) => s.photoUpload === null && s.lastError === null)).toBe(true)
    expect(patches(phone.sent, id).map((s) => s.fields)).toEqual([['thumbnail']])
    expect(await sha256((await stored(id, 'thumbnail'))!)).toBe(await sha256(phoneThumb))
    const after = await su.collection('photos').getOne(id)
    const strip = ({ thumbnail: _t, updated: _u, ...rest }: Record<string, unknown>) => rest
    expect(strip(after)).toEqual(strip(before))
    expect(after.updatedAt).toBe(before.updatedAt)
    expect(after.copy).toBe(before.copy)
    expect(after.original).toBe(before.original)
    expect(after.thumbnail).not.toBe(before.thumbnail)
    expect(await fileStatus(id, before.thumbnail)).toBe(404) // PocketBase removed the old file
    expect(await historyRows(id, entry.id, project.id)).toBe(historyBefore)
    const now = (await phone.db.photos.get(id))!
    expect(now.thumbnailOnNas).toBe('done')
    expect(now.updatedAt).toBe(local.updatedAt)
    expect(now.uploads).toEqual(local.uploads)
    expect(await sha256(now.blob)).toBe(await sha256(local.blob))
    expect(await sha256(now.thumbnail)).toBe(await sha256(local.thumbnail))
    expect(await phone.db.outbox.count()).toBe(0)
    expect(await countUnsynced(phone.db)).toBe(0)

    // 1: the laptop fetches and measures the NAS's thumbnail, and sends no update for it.
    laptop.sent.length = 0
    laptop.measure.mockClear()
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    expect(laptop.measure).toHaveBeenCalledTimes(1)
    expect(patches(laptop.sent, id)).toEqual([])
    expect(await sha256((await stored(id, 'thumbnail'))!)).toBe(await sha256(phoneThumb))
    expect((await laptop.db.photos.get(id))!.thumbnailOnNas).toBe('done')

    // A third sync on each sends nothing for it.
    phone.sent.length = 0
    laptop.sent.length = 0
    await phone.sync()
    await laptop.sync()
    expect(patches(phone.sent, id)).toEqual([])
    expect(patches(laptop.sent, id)).toEqual([])
    expect(phone.sent.filter((s) => s.url.includes(after.thumbnail))).toEqual([])

    // 4: a new, empty device gets the 1280 px file; its rebuild only measures it; it sends nothing.
    const fresh = await device(email)
    expect(await fresh.sync()).toMatchObject({ lastError: null })
    const got = (await fresh.db.photos.get(id))!
    expect(await sha256(got.thumbnail)).toBe(await sha256(phoneThumb))
    expect(await fresh.rebuild('fresh')).toMatchObject({ measured: 1, rebuilt: 0 })
    expect((await fresh.db.photos.get(id))!).toMatchObject({ thumbnailWidth: 1280, thumbnailOnNas: 'done' })
    fresh.sent.length = 0
    fresh.measure.mockClear()
    await fresh.sync()
    expect(patches(fresh.sent, id)).toEqual([])
    expect(fresh.measure).not.toHaveBeenCalled()

    // 4: a visitor's thumbnail address is new, and gives the phone's rebuilt file.
    const seen = (await createPocketBaseSource(visitorClient(URL)).project(slug))!.photos[0]!.thumbnailUrl
    expect(seen).not.toBe(seenBefore)
    expect(await sha256(await (await fetch(seen)).blob())).toBe(await sha256(phoneThumb))
  })

  it('2: a race: both checked before either upload; one rebuilt file stays, both mark it done', async () => {
    const email = await user()
    // Each device's check waits until both have measured the NAS's (older) thumbnail.
    let release!: () => void
    const bothChecked = new Promise<void>((r) => (release = r))
    let checks = 0
    const gated = () =>
      vi.fn(async (blob: Blob) => {
        const size = await measureBlob(blob)
        if (++checks === 2) release()
        await bothChecked
        return size
      })
    const tag = `${Date.now().toString(36)}${++n}`
    const phone = await device(email, gated())
    const project = await createProject({ title: `Race ${tag}` }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    const [p] = await addPhotos(entry.id, [older(2)], phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 3 })
    const laptop = await device(email, gated())
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    const id = p!.id
    const old = (await su.collection('photos').getOne(id)).thumbnail
    await phone.rebuild('phone')
    await laptop.rebuild('laptop')
    const names: string[] = []
    for (const d of [phone, laptop]) {
      d.pb.afterSend = (response, data) => {
        if (response.url.includes(`/api/collections/photos/records/${id}`) && typeof data?.thumbnail === 'string') {
          if (data.thumbnail !== old) names.push(data.thumbnail)
        }
        return data
      }
    }

    phone.sent.length = 0
    laptop.sent.length = 0
    const [a, b] = await Promise.all([phone.sync(), laptop.sync()])
    expect(a.lastError).toBeNull()
    expect(b.lastError).toBeNull()
    expect(patches(phone.sent, id).filter((s) => s.fields)).toEqual([{ method: 'PATCH', url: expect.any(String), fields: ['thumbnail'] }])
    expect(patches(laptop.sent, id).filter((s) => s.fields)).toEqual([{ method: 'PATCH', url: expect.any(String), fields: ['thumbnail'] }])

    const record = await su.collection('photos').getOne(id)
    const onNas = await sha256((await stored(id, 'thumbnail'))!)
    const rebuilt = [await sha256((await phone.db.photos.get(id))!.thumbnail), await sha256((await laptop.db.photos.get(id))!.thumbnail)]
    expect(rebuilt).toContain(onNas)
    // Exactly one thumbnail file: the other upload's file and the old one are gone.
    expect(names).toHaveLength(2)
    expect(names).toContain(record.thumbnail)
    for (const name of [old, ...names.filter((x) => x !== record.thumbnail)]) expect(await fileStatus(id, name)).toBe(404)

    for (const d of [phone, laptop]) {
      expect((await d.db.photos.get(id))!.thumbnailOnNas).toBe('done')
      d.sent.length = 0
      await d.sync()
      expect(patches(d.sent, id)).toEqual([])
    }
  })

  it('5: after every other upload; a tombstoned one waits for its restore; an outbox row for its push', async () => {
    const email = await user()
    const { phone, entry, photo } = await shared(email)
    const id = photo.id
    await phone.rebuild('phone')

    // A tombstoned candidate sends nothing.
    await deleteEntry(entry.id, phone.db)
    phone.sent.length = 0
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(patches(phone.sent, id).map((s) => s.fields)).toEqual([null]) // the tombstone's push
    expect((await phone.db.photos.get(id))!.thumbnailOnNas).toBe('check')

    // Restored, with a new photo pending: the new one's files go first, then the replacement.
    await restoreEntry(entry.id, phone.db)
    const [fresh] = await addPhotos(entry.id, [newer(3)], phone.db)
    phone.sent.length = 0
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 3 })
    const multipart = phone.sent.filter((s) => s.fields).map((s) => [s.url.includes(id) ? 'old' : s.url.includes(fresh!.id) ? 'new' : '?', s.fields])
    expect(multipart).toEqual([
      ['new', ['copy', 'thumbnail']],
      ['new', ['original']],
      ['old', ['thumbnail']],
    ])
    expect((await phone.db.photos.get(id))!.thumbnailOnNas).toBe('done')
    // The new photo, made at 1280 and uploaded here, is done without a check.
    expect((await phone.db.photos.get(fresh!.id))!.thumbnailOnNas).toBe('done')
    expect(phone.sent.filter((s) => s.method === 'GET' && s.url.includes(`/records/${fresh!.id}`))).toEqual([])
  })

  it('5: a photo with a change in the outbox waits for its push', async () => {
    const email = await user()
    const { phone, photo } = await shared(email)
    const id = photo.id
    await phone.rebuild('phone')
    await phone.db.outbox.add({ table: 'photos', recordId: id, op: 'put', queuedAt: new Date().toISOString() })
    const passOn = phone.pb.beforeSend!
    phone.pb.beforeSend = (url, options) => {
      if (url.includes(`/records/${id}`) && options.method === 'PATCH' && !(options.body instanceof FormData)) {
        throw new TypeError('Failed to fetch')
      }
      return passOn(url, options)
    }
    phone.sent.length = 0
    expect((await phone.sync()).lastError).not.toBeNull()
    expect(patches(phone.sent, id)).toEqual([])
    expect((await phone.db.photos.get(id))!.thumbnailOnNas).toBe('check')

    phone.pb.beforeSend = passOn
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(patches(phone.sent, id).map((s) => s.fields)).toEqual([null, ['thumbnail']])
  })

  it('6: a network failure on the replacement is no sync error; the next run uploads it', async () => {
    const email = await user()
    const { phone, photo } = await shared(email)
    const id = photo.id
    await phone.rebuild('phone')
    const passOn = phone.pb.beforeSend!
    phone.pb.beforeSend = (url, options) => {
      if (options.body instanceof FormData) throw new TypeError('Failed to fetch')
      return passOn(url, options)
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await phone.sync()).toMatchObject({ lastError: null, nextRetryAt: null, needsSignIn: false })
    } finally {
      warn.mockRestore()
    }
    expect((await phone.db.photos.get(id))!.thumbnailOnNas).toBe('check')
    const old = await stored(id, 'thumbnail')
    expect(await old!.text()).toMatch(/^512x384/)

    phone.pb.beforeSend = passOn
    phone.sent.length = 0
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(patches(phone.sent, id).map((s) => s.fields)).toEqual([['thumbnail']])
    expect(await (await stored(id, 'thumbnail'))!.text()).toMatch(/^1280x960 phone/)
  })

  it('7: a photo rebuilt before this shipped is checked and replaced; one imported after is left alone', async () => {
    const email = await user()
    const { phone, entry, photo } = await shared(email)
    const [fresh] = await addPhotos(entry.id, [newer(4)], phone.db)
    // As T-0037 left production devices: rebuilt (thumbnailWidth 1280), and no state for this.
    await phone.rebuild('phone')
    const id = photo.id
    await phone.db.photos.update(id, { thumbnailOnNas: undefined })
    expect((await phone.db.photos.get(id))!).toMatchObject({ thumbnailWidth: 1280 })
    expect((await phone.db.photos.get(id))!.thumbnailOnNas).toBeUndefined()

    phone.sent.length = 0
    expect(await phone.sync()).toMatchObject({ lastError: null })
    expect(patches(phone.sent, id).map((s) => s.fields)).toEqual([['thumbnail']])
    // The one imported at 1280 was marked done by its own upload: not fetched, not sent.
    // Its record's push, its own two uploads; no check and no replacement.
    expect(patches(phone.sent, fresh!.id).map((s) => s.fields)).toEqual([null, ['copy', 'thumbnail'], ['original']])
    expect(phone.sent.filter((s) => s.method === 'GET' && s.url.includes(fresh!.id))).toEqual([])
    expect((await phone.db.photos.get(fresh!.id))!.thumbnailOnNas).toBe('done')
  })

  it('6: a sign-in revoked during the step marks nothing done, and the run asks to sign in again', async () => {
    const email = await user()
    const phone = await device(email, vi.fn(measureBlob), true)
    // A private project: a guest (a refused token) gets 404 for its photos.
    const project = await createProject({ title: `Privé ${Date.now().toString(36)}${++n}`, public: false }, phone.db)
    const entry = await addEntry({ projectId: project.id, date: '2026-11-17' }, phone.db)
    const photos = await addPhotos(entry.id, [older(5), older(6)], phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 6 })
    expect((await phone.rebuild('phone')).rebuilt).toBe(2)

    // The sign-in is revoked (a new password) right before the step's first check.
    const userId = phone.pb.authStore.record!.id
    let revoked = false
    const passOn = phone.pb.beforeSend!
    phone.pb.beforeSend = async (url, options) => {
      if (!revoked && (options.method ?? 'GET') === 'GET' && /\/api\/collections\/photos\/records\/[^/?]+/.test(url)) {
        revoked = true
        const password = 'a-new-ci-only-password-654321'
        await su.collection('users').update(userId, { password, passwordConfirm: password })
      }
      return passOn(url, options)
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await phone.sync()).toMatchObject({ needsSignIn: true })
    } finally {
      warn.mockRestore()
    }
    expect(revoked).toBe(true)
    for (const p of photos) {
      expect((await phone.db.photos.get(p.id))!.thumbnailOnNas).toBe('check')
      expect(await (await stored(p.id, 'thumbnail'))!.text()).toMatch(/^512x384/)
    }
  })
})
