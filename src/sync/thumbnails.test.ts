// @vitest-environment node
// Node, not jsdom: jsdom Blobs do not survive fake-indexeddb's structured clone.
// T-0038 (D-0039): a device's rebuilt thumbnails replace the NAS's older ones, once, as the
// sync's last step. Against the fake PocketBase (./testing.ts); the same scenarios run against
// a real one in thumbnails.pocketbase.test.ts (CI). The photo worker is faked: an "image" is a
// Blob whose text starts with its size, "WxH".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb, type DiyDb } from '../db/db'
import { addEntry, addPhotos, countUnsynced, createProject, deleteEntry, restoreEntry, type NewPhoto } from '../db/write'
import { rebuildThumbnails } from '../photos/rebuild'
import { createSyncEngine, type SyncEngine, type SyncStatus } from './engine'
import { FakePocketBase, fakeAuth, responseError } from './testing'

let n = 0
const dbs: DiyDb[] = []
const engines: SyncEngine[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  for (const engine of engines.splice(0)) engine.stop()
  for (const d of dbs.splice(0)) await d.delete()
})

const image = (width: number, height: number, tag = '') => new Blob([`${width}x${height} ${tag}`], { type: 'image/webp' })

async function measureBlob(blob: Blob) {
  const [width, height] = (await blob.text()).split(' ')[0]!.split('x').map(Number)
  if (!width || !height) throw new Error('not an image')
  return { width, height }
}

/** One device: its own database, client and engine (with a fake photo worker). */
function device(server: FakePocketBase, db = openDb(`thumbnails-test-${++n}`)) {
  if (!dbs.includes(db)) dbs.push(db)
  const client = server.client('u1')
  const auth = fakeAuth(client)
  const measure = vi.fn(measureBlob)
  const engine = createSyncEngine({
    db,
    client,
    auth,
    fetchFile: server.fetchFile,
    measure,
    retryBaseMs: 1_000_000,
    retryMaxMs: 1_000_000,
  })
  engines.push(engine)
  /** Every status the engine had, from now on. */
  const statuses: SyncStatus[] = []
  engine.subscribe(() => statuses.push(engine.getStatus()))
  const sync = async () => {
    await engine.syncNow()
    return engine.getStatus()
  }
  /** This device's own rebuild (T-0037), with a thumbnail that says who made it. */
  const rebuild = (tag: string) =>
    rebuildThumbnails({
      db,
      measure: measureBlob,
      makeThumbnail: async () => image(1280, 960, tag),
      makeCard: async () => image(640, 480, `card-${tag}`),
    })
  return { db, client, auth, engine, measure, sync, rebuild, statuses }
}

/** A photo from before T-0037: a 512 px thumbnail, not measured on this device yet. */
function older(i: number): NewPhoto {
  return {
    original: new Blob([`original-${i}`]),
    copy: image(2560, 1920, `copy-${i}`),
    thumbnail: image(512, 384, `thumb-${i}`),
    takenAt: '2026-11-16T09:00:00.000Z',
    width: 4000,
    height: 3000,
  }
}

/** A photo imported after T-0037: its thumbnail made (and measured) at 1280 px. */
function newer(i: number): NewPhoto {
  return { ...older(i), thumbnail: image(1280, 960, `thumb-${i}`), thumbnailWidth: 1280 }
}

async function entryOn(db: DiyDb) {
  const project = await createProject({ title: 'Werkbank' }, db)
  return addEntry({ projectId: project.id, date: '2026-11-17' }, db)
}

const text = async (blob: Blob | undefined) => (blob ? blob.text() : null)

/** The phone added older photos and uploaded them, then rebuilt their thumbnails. */
async function rebuiltOn(server: FakePocketBase, count = 1) {
  const phone = device(server)
  const entry = await entryOn(phone.db)
  const photos = await addPhotos(entry.id, Array.from({ length: count }, (_, i) => older(i + 1)), phone.db)
  expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 3 * count })
  expect((await phone.rebuild('phone')).rebuilt).toBe(count)
  server.requests.length = 0
  return { phone, entry, photos }
}

const requestsFor = (server: FakePocketBase, id: string) => server.requests.filter((r) => r.id === id)

describe('rebuilt thumbnails (T-0038, D-0039)', () => {
  it('replaces the NAS’s older thumbnail once, with only the thumbnail; nothing local moves', async () => {
    const server = new FakePocketBase()
    const { phone, photos } = await rebuiltOn(server)
    const id = photos[0]!.id
    const before = server.get('photos', id)!
    const local = (await phone.db.photos.get(id))!
    phone.statuses.length = 0

    const status = await phone.sync()
    expect(status).toMatchObject({ lastError: null, nextRetryAt: null, uploaded: 0 })
    expect(requestsFor(server, id).map((r) => [r.op, r.files])).toEqual([
      ['getOne', undefined],
      ['download', undefined],
      ['upload', ['thumbnail']],
    ])
    expect(await text(server.file('photos', id, 'thumbnail'))).toBe(await text(local.thumbnail))
    const after = server.get('photos', id)!
    const { thumbnail: _a, updated: _b, ...rest } = after
    const { thumbnail: _c, updated: _d, ...restBefore } = before
    expect(rest).toEqual(restBefore)
    expect(after.updatedAt).toBe(before.updatedAt)
    expect(server.history).toEqual([])

    const now = (await phone.db.photos.get(id))!
    expect(now.thumbnailOnNas).toBe('done')
    expect({ ...now, thumbnailOnNas: undefined }).toEqual({ ...local, thumbnailOnNas: undefined })
    expect(await countUnsynced(phone.db)).toBe(0)
    expect(phone.statuses.every((s) => s.photoUpload === null)).toBe(true)

    // Once: the next run sends nothing for it.
    server.requests.length = 0
    await phone.sync()
    expect(requestsFor(server, id)).toEqual([])
  })

  it('a second device finds the NAS’s thumbnail current and sends nothing', async () => {
    const server = new FakePocketBase()
    const { phone, photos } = await rebuiltOn(server)
    const id = photos[0]!.id
    const laptop = device(server)
    await laptop.sync() // downloads the 512 px thumbnail
    await laptop.rebuild('laptop')
    await phone.sync() // the phone replaces it first
    const replaced = await text(server.file('photos', id, 'thumbnail'))

    server.requests.length = 0
    expect(await laptop.sync()).toMatchObject({ lastError: null })
    expect(requestsFor(server, id).map((r) => r.op)).toEqual(['getOne', 'download'])
    expect(await text(server.file('photos', id, 'thumbnail'))).toBe(replaced)
    expect((await laptop.db.photos.get(id))!.thumbnailOnNas).toBe('done')
    server.requests.length = 0
    await laptop.sync()
    expect(requestsFor(server, id)).toEqual([])
  })

  it('a photo imported at the current size and uploaded here is never fetched or sent again', async () => {
    const server = new FakePocketBase()
    const phone = device(server)
    const entry = await entryOn(phone.db)
    const [p] = await addPhotos(entry.id, [newer(1)], phone.db)
    await phone.sync()
    expect((await phone.db.photos.get(p!.id))!.thumbnailOnNas).toBe('done')
    // The record's push (update, then create), its own two uploads; no check, no replacement.
    expect(requestsFor(server, p!.id).map((r) => r.files ?? r.op)).toEqual(['update', 'create', ['copy', 'thumbnail'], ['original']])
    expect(phone.measure).not.toHaveBeenCalled()
  })

  it('a photo already rebuilt before this shipped (no state) is checked and replaced', async () => {
    const server = new FakePocketBase()
    const { phone, photos } = await rebuiltOn(server)
    const id = photos[0]!.id
    // As T-0037 left production devices: thumbnailWidth 1280, nothing about the NAS.
    await phone.db.photos.update(id, { thumbnailOnNas: undefined })
    await phone.sync()
    expect(requestsFor(server, id).map((r) => r.files ?? r.op)).toEqual(['getOne', 'download', ['thumbnail']])
  })

  it('a device that downloads the photo later only measures it, and sends nothing', async () => {
    const server = new FakePocketBase()
    const { phone, photos } = await rebuiltOn(server)
    const id = photos[0]!.id
    await phone.sync()
    const fresh = device(server)
    await fresh.sync()
    const result = await fresh.rebuild('fresh')
    expect(result).toMatchObject({ measured: 1, rebuilt: 0 })
    const local = (await fresh.db.photos.get(id))!
    expect(local).toMatchObject({ thumbnailWidth: 1280, thumbnailOnNas: 'done' })
    expect(await local.thumbnail.text()).toBe('1280x960 phone')
    server.requests.length = 0
    await fresh.sync()
    expect(requestsFor(server, id)).toEqual([])
  })

  it('goes after every other upload, in the same run', async () => {
    const server = new FakePocketBase()
    const { phone, entry, photos } = await rebuiltOn(server)
    const [fresh] = await addPhotos(entry.id, [newer(9)], phone.db)
    server.requests.length = 0
    await phone.sync()
    const uploads = server.requests.filter((r) => r.op === 'upload').map((r) => [r.id, r.files])
    expect(uploads).toEqual([
      [fresh!.id, ['copy', 'thumbnail']],
      [fresh!.id, ['original']],
      [photos[0]!.id, ['thumbnail']],
    ])
  })

  it('a tombstoned photo sends nothing; after a restore it is replaced', async () => {
    const server = new FakePocketBase()
    const { phone, entry, photos } = await rebuiltOn(server)
    const id = photos[0]!.id
    await deleteEntry(entry.id, phone.db)
    await phone.sync()
    expect(requestsFor(server, id).map((r) => r.op)).toEqual(['update']) // the tombstone only
    await restoreEntry(entry.id, phone.db)
    server.requests.length = 0
    await phone.sync()
    expect(requestsFor(server, id).map((r) => r.files ?? r.op)).toEqual(['update', 'getOne', 'download', ['thumbnail']])
  })

  it('a photo with a change in the outbox waits for its push', async () => {
    const server = new FakePocketBase()
    const { phone, photos } = await rebuiltOn(server)
    const id = photos[0]!.id
    await phone.db.outbox.add({ table: 'photos', recordId: id, op: 'put', queuedAt: new Date().toISOString() })
    server.interceptor = (op, _c, rid) => (op === 'update' && rid === id ? responseError(500) : undefined)
    await phone.sync()
    expect(requestsFor(server, id).map((r) => r.op)).toEqual(['update'])
    server.interceptor = null
    server.requests.length = 0
    await phone.sync()
    expect(requestsFor(server, id).map((r) => r.files ?? r.op)).toEqual(['update', 'getOne', 'download', ['thumbnail']])
  })

  describe('failures', () => {
    it('offline: the run still succeeds, no error or retry, and the next run uploads it', async () => {
      const server = new FakePocketBase()
      const { phone, photos } = await rebuiltOn(server, 2)
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      server.interceptor = (op) => (op === 'upload' ? responseError(0) : undefined)
      const status = await phone.sync()
      expect(status).toMatchObject({ lastError: null, lastErrorAt: null, nextRetryAt: null, needsSignIn: false })
      expect(warn).toHaveBeenCalled()
      // It stopped at the first: the second wasn't tried in that run.
      expect(server.requests.filter((r) => r.op === 'upload')).toHaveLength(1)
      for (const p of photos) expect((await phone.db.photos.get(p.id))!.thumbnailOnNas).toBe('check')

      server.interceptor = null
      server.requests.length = 0
      await phone.sync()
      expect(server.requests.filter((r) => r.op === 'upload').map((r) => r.files)).toEqual([['thumbnail'], ['thumbnail']])
    })

    it('a 5xx on the check stops the step quietly', async () => {
      const server = new FakePocketBase()
      const { phone, photos } = await rebuiltOn(server)
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      server.interceptor = (op) => (op === 'getOne' ? responseError(503) : undefined)
      expect(await phone.sync()).toMatchObject({ lastError: null, nextRetryAt: null })
      expect((await phone.db.photos.get(photos[0]!.id))!.thumbnailOnNas).toBe('check')
    })

    it('400: warns, is not tried again in this app session, and the next photo still goes', async () => {
      const server = new FakePocketBase()
      const { phone, photos } = await rebuiltOn(server, 2)
      const [a, b] = photos
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      server.interceptor = (op, _c, id) => (op === 'upload' && id === a!.id ? responseError(400) : undefined)
      expect(await phone.sync()).toMatchObject({ lastError: null })
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(a!.id), expect.anything())
      expect((await phone.db.photos.get(a!.id))!.thumbnailOnNas).toBe('check')
      expect((await phone.db.photos.get(b!.id))!.thumbnailOnNas).toBe('done')

      server.requests.length = 0
      await phone.sync()
      expect(requestsFor(server, a!.id)).toEqual([])

      // The app starts again: tried once more.
      server.interceptor = null
      const again = device(server, phone.db)
      await again.sync()
      expect(requestsFor(server, a!.id).map((r) => r.files ?? r.op)).toEqual(['getOne', 'download', ['thumbnail']])
    })

    it('410: the photo was deleted for good, and is dropped here', async () => {
      const server = new FakePocketBase()
      const { phone, photos } = await rebuiltOn(server)
      const id = photos[0]!.id
      server.interceptor = (op) => (op === 'upload' ? responseError(410) : undefined)
      expect(await phone.sync()).toMatchObject({ lastError: null })
      expect(await phone.db.photos.get(id)).toBeUndefined()
    })

    it('404 on the record (not on the NAS): marked done, never asked again', async () => {
      const server = new FakePocketBase()
      const { phone, photos } = await rebuiltOn(server)
      const id = photos[0]!.id
      server.records.get('photos')!.delete(id)
      expect(await phone.sync()).toMatchObject({ lastError: null })
      expect((await phone.db.photos.get(id))!.thumbnailOnNas).toBe('done')
      server.requests.length = 0
      await phone.sync()
      expect(requestsFor(server, id)).toEqual([])
    })

    it('a NAS thumbnail file that is missing, or can’t be measured, is replaced', async () => {
      const server = new FakePocketBase()
      const { phone, photos } = await rebuiltOn(server, 2)
      const [a, b] = photos
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const name = server.get('photos', a!.id)!.thumbnail as string
      server.files.delete(`photos/${a!.id}/${name}`)
      const nameB = server.get('photos', b!.id)!.thumbnail as string
      server.files.set(`photos/${b!.id}/${nameB}`, new Blob(['not an image']))
      expect(await phone.sync()).toMatchObject({ lastError: null })
      for (const p of [a!, b!]) {
        expect(await text(server.file('photos', p.id, 'thumbnail'))).toBe('1280x960 phone')
        expect((await phone.db.photos.get(p.id))!.thumbnailOnNas).toBe('done')
      }
    })

    it('a 404 or 400 from a refused token marks nothing done: the run pauses for sign-in', async () => {
      for (const status of [404, 400]) {
        const server = new FakePocketBase()
        const { phone, photos } = await rebuiltOn(server, 2)
        // The token is refused mid-step; PocketBase then answers as to a guest.
        server.interceptor = (op) => {
          if (op !== 'getOne') return
          phone.auth.set('expired')
          return responseError(status)
        }
        expect(await phone.sync()).toMatchObject({ needsSignIn: true })
        for (const p of photos) expect((await phone.db.photos.get(p.id))!.thumbnailOnNas).toBe('check')
        expect(server.requests.filter((r) => r.op === 'getOne')).toHaveLength(1)
      }
    })

    it('a refused sign-in pauses sync, as in the rest of the run', async () => {
      const server = new FakePocketBase()
      const { phone, photos } = await rebuiltOn(server)
      server.interceptor = (op) => (op === 'getOne' ? responseError(401) : undefined)
      expect(await phone.sync()).toMatchObject({ needsSignIn: true })
      expect((await phone.db.photos.get(photos[0]!.id))!.thumbnailOnNas).toBe('check')
    })
  })

  it('without a measure (no photo worker), nothing is checked', async () => {
    const server = new FakePocketBase()
    const { phone, photos } = await rebuiltOn(server)
    const plain = createSyncEngine({ db: phone.db, client: phone.client, auth: phone.auth, fetchFile: server.fetchFile })
    engines.push(plain)
    await plain.syncNow()
    expect(requestsFor(server, photos[0]!.id)).toEqual([])
  })
})
