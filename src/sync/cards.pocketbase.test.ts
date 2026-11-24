// @vitest-environment node
// T-0040 (D-0041): the card image against a real, throwaway PocketBase built from backend/
// (its migrations and hooks): `pnpm exec harness backend start` locally, CI's
// `pocketbase-auth` job. Skipped everywhere else. Never point this at the NAS (G-0019).
//
// - The migration: photos.thumbnail allows one thumb, 640×480.
// - A visitor gets that thumb of a public photo's thumbnail (a PNG: PocketBase has no WebP
//   encoder), and nothing of a private one.
// - The device's own card image is never synced: not in any upload, not on the NAS, and kept
//   when a newer record is pulled.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import PocketBase, { ClientResponseError } from 'pocketbase'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createAuth } from '../auth/auth'
import { openDb, type DiyDb } from '../db/db'
import { addEntry, addPhotos, countUnsynced, createProject, type NewPhoto } from '../db/write'
import { CARD_HEIGHT, CARD_THUMB, CARD_WIDTH } from '../photos/resize'
import { createPocketBaseSource, visitorClient } from '../public/source'
import { createSyncEngine, type SyncEngine } from './engine'

const URL_ = process.env.POCKETBASE_TEST_URL ?? ''
const SU_EMAIL = process.env.POCKETBASE_TEST_SUPERUSER_EMAIL ?? ''
const SU_PASSWORD = process.env.POCKETBASE_TEST_SUPERUSER_PASSWORD ?? ''
const PASSWORD = 'ci-only-password-123456'

/** A generated, photo-like 1280×960 WebP at the thumbnail's quality (0.8), made in Chromium. */
const THUMBNAIL = new Uint8Array(readFileSync(new URL('./fixtures/thumbnail-1280x960.webp', import.meta.url)))

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
  const pb = new PocketBase(URL_)
  pb.autoCancellation(false)
  return pb
}

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

/** A PNG's pixel size, from its IHDR chunk. */
function pngSize(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  expect([...bytes.slice(1, 4)]).toEqual([0x50, 0x4e, 0x47]) // "PNG"
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

/** A photo with its card image made on this device, as an import makes it. */
function photo(i: number): NewPhoto {
  return {
    original: new File([`original-${i}`.repeat(1000)], `IMG_000${i}.jpg`, { type: 'image/jpeg' }),
    copy: new Blob([`copy-${i}`.repeat(1000)], { type: 'image/webp' }),
    thumbnail: new Blob([THUMBNAIL], { type: 'image/webp' }),
    thumbnailWidth: 1280,
    card: new Blob([`card-${i}`.repeat(500)], { type: 'image/webp' }),
    cardWidth: CARD_WIDTH,
    takenAt: '2026-11-16T09:00:00.000Z',
    width: 2560,
    height: 1920,
  }
}

describe.skipIf(!URL_)('card images against a real PocketBase (T-0040)', { timeout: 120_000 }, () => {
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
    const email = `cards-${Date.now()}-${++n}@ci.invalid`
    await su.collection('users').create({ email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true })
    return email
  }

  /** A device: its own database, client and engine, signed in as `email`. */
  async function device(email: string) {
    const db = openDb(`cards-pocketbase-test-${++n}`)
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
      auth: { ...auth, refreshAfterSync: async () => auth.state() },
      lock: (fn) => fn(),
      retryBaseMs: 1_000_000,
      retryMaxMs: 1_000_000,
    })
    engines.push(engine)
    const sync = async () => {
      await engine.syncNow()
      return engine.getStatus()
    }
    /** Every request this device sends: its JSON fields or its multipart fields. */
    const sent: string[][] = []
    pb.beforeSend = (url, options) => {
      if (options.body instanceof FormData) sent.push([...options.body.keys()])
      else if (typeof options.body === 'string') sent.push(Object.keys(JSON.parse(options.body) as object))
      return { url, options }
    }
    return { db, pb, sync, sent }
  }

  async function entryOn(db: DiyDb, title: string, isPublic = true) {
    const project = await createProject({ title, public: isPublic }, db)
    return addEntry({ projectId: project.id, date: '2026-11-17' }, db)
  }

  it(`the migration allows exactly one thumb, ${CARD_THUMB}, on the thumbnail only`, async () => {
    const photos = await su.collections.getOne('photos')
    const field = (name: string) => photos.fields.find((f) => f.name === name) as { thumbs?: string[] } | undefined
    expect(field('thumbnail')?.thumbs).toEqual([`${CARD_WIDTH}x${CARD_HEIGHT}`])
    expect(field('copy')?.thumbs ?? []).toEqual([])
    expect(field('original')?.thumbs ?? []).toEqual([])
  })

  it('a visitor gets a 640×480 PNG of a public photo’s thumbnail, the WebP without ?thumb, and nothing of a private one', async () => {
    const email = await user()
    const phone = await device(email)
    const tag = Date.now().toString(36)
    const shown = await entryOn(phone.db, `Kast ${tag}`)
    const hidden = await entryOn(phone.db, `Geheim ${tag}`, false)
    const [open] = await addPhotos(shown.id, [photo(1)], phone.db)
    const [closed] = await addPhotos(hidden.id, [photo(2)], phone.db)
    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 6 })

    const visitor = visitorClient(URL_)
    expect(visitor.authStore.token).toBe('')
    const project = (await createPocketBaseSource(visitor).project(`kast-${tag}`))!
    const seen = project.photos.find((p) => p.id === open!.id)!
    expect(seen.cardUrl).toBe(`${seen.thumbnailUrl}?thumb=${CARD_THUMB}`)

    const card = await fetch(seen.cardUrl!)
    expect(card.status).toBe(200)
    expect(card.headers.get('content-type')).toBe('image/png')
    const png = new Uint8Array(await card.arrayBuffer())
    expect(pngSize(png)).toEqual({ width: CARD_WIDTH, height: CARD_HEIGHT })

    const plain = await fetch(seen.thumbnailUrl)
    expect(plain.status).toBe(200)
    expect(plain.headers.get('content-type')).toBe('image/webp')
    const webp = new Uint8Array(await plain.arrayBuffer())
    expect(sha256(webp)).toBe(sha256(THUMBNAIL))

    // T-0040 Done when 6: measured, not asserted.
    console.log(`bytes: thumbnail WebP ${webp.byteLength}, PocketBase ${CARD_THUMB} PNG ${png.byteLength} (${(png.byteLength / webp.byteLength).toFixed(2)}x)`)

    const record = await su.collection('photos').getOne(closed!.id)
    const privateCard = await fetch(visitor.files.getURL(record, record.thumbnail as string, { thumb: CARD_THUMB }))
    expect(privateCard.status).toBe(404)
    expect((await fetch(visitor.files.getURL(record, record.thumbnail as string))).status).toBe(404)
  })

  it('the card image is never synced: no upload carries it, the NAS has no such field, a pulled newer record keeps it', async () => {
    const email = await user()
    const phone = await device(email)
    const entry = await entryOn(phone.db, `Bank ${Date.now().toString(36)}`)
    const [p] = await addPhotos(entry.id, [photo(3)], phone.db)
    const card = (await phone.db.photos.get(p!.id))!.card!

    expect(await phone.sync()).toMatchObject({ lastError: null, uploaded: 3 })
    expect(await countUnsynced(phone.db)).toBe(0)
    // Every request's fields: the record's own, and the three files, never the card image.
    for (const fields of phone.sent) for (const f of fields) expect(f).not.toMatch(/card/i)
    const files = phone.sent.flat().filter((f) => ['original', 'copy', 'thumbnail'].includes(f))
    expect(files.sort()).toEqual(['copy', 'original', 'thumbnail'])

    const record = await su.collection('photos').getOne(p!.id)
    expect(Object.keys(record).filter((k) => /card/i.test(k))).toEqual([])
    const before = await phone.db.photos.get(p!.id)

    // A newer version of the record on the NAS (as another device would leave it).
    const later = new Date(Date.parse(before!.updatedAt) + 60_000).toISOString()
    await su.collection('photos').update(p!.id, { takenAt: '2026-11-16T10:00:00.000Z', updatedAt: later })
    expect(await phone.sync()).toMatchObject({ lastError: null })
    const after = (await phone.db.photos.get(p!.id))!
    expect(after.updatedAt).toBe(later)
    expect(after.takenAt).toBe('2026-11-16T10:00:00.000Z')
    expect(after.cardWidth).toBe(CARD_WIDTH)
    expect(after.card!.size).toBe(card.size)
    expect(await after.card!.text()).toBe(await card.text())
    expect(await countUnsynced(phone.db)).toBe(0)
  })
})
