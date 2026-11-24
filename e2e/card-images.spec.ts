import { expect, test, type Page } from '@playwright/test'
import { withExif } from '../src/photos/exifFixture'

// T-0040 (D-0041): each device makes a 640×480 card image of every photo, from its copy: at
// import, and for photos without one in the background after the app starts, unseen and
// locally only (no outbox row, `uploads` and `updatedAt` unchanged). A photo whose copy is
// too small gets none, and isn't tried again. Generated photos only (G-0019).

async function jpeg(page: Page, width: number, height: number, color: string): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ([w, h, c]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      // Photo-like, so the byte sizes logged below mean something (T-0040 Done when 6): a
      // gradient, planks, wood grain and sensor noise, from a fixed seed.
      let seed = 42
      const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
      const sky = ctx.createLinearGradient(0, 0, 0, h)
      sky.addColorStop(0, '#8fb3d9')
      sky.addColorStop(0.55, c)
      sky.addColorStop(1, '#6b4a2b')
      ctx.fillStyle = sky
      ctx.fillRect(0, 0, w, h)
      const s = w / 1280
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `hsla(${20 + rand() * 30}, ${30 + rand() * 40}%, ${25 + rand() * 45}%, ${0.4 + rand() * 0.5})`
        ctx.save()
        ctx.translate(rand() * w, rand() * h)
        ctx.rotate((rand() - 0.5) * 0.6)
        ctx.fillRect(-rand() * 300 * s, (-10 - rand() * 30) * s, (200 + rand() * 400) * s, (20 + rand() * 60) * s)
        ctx.restore()
      }
      ctx.strokeStyle = 'rgba(40, 25, 10, 0.25)'
      for (let y = 0; y < h; y += (3 + rand() * 6) * s) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        for (let x = 0; x <= w; x += 40 * s) ctx.lineTo(x, y + Math.sin(x / (90 * s) + y) * 4 * s)
        ctx.stroke()
      }
      const data = ctx.getImageData(0, 0, w, h)
      for (let i = 0; i < data.data.length; i += 4) {
        const n = (rand() - 0.5) * 18
        data.data[i]! += n
        data.data[i + 1]! += n
        data.data[i + 2]! += n
      }
      ctx.putImageData(data, 0, 0)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    [width, height, color] as const,
  )
  return Buffer.from(bytes)
}

interface Stored {
  id: string
  width: number
  cardWidth: number | null
  card: { type: string; width: number; height: number; size: number } | null
  thumbnailSize: number
  uploads: unknown
  updatedAt: string
}

/** The imported (non-demo) photos as stored in IndexedDB, plus the outbox's size. */
function stored(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('diy-projects')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const all = <T,>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const req = db.transaction(store).objectStore(store).getAll()
        req.onsuccess = () => resolve(req.result as T[])
        req.onerror = () => reject(req.error)
      })
    type Row = { id: string; width: number; thumbnail: Blob; card?: Blob; cardWidth?: number; uploads: unknown; updatedAt: string }
    const photos = (await all<Row>('photos')).filter((p) => !p.id.startsWith('demo-'))
    const outbox = (await all<unknown>('outbox')).length
    const out = []
    for (const p of photos) {
      let card = null
      if (p.card) {
        const bitmap = await createImageBitmap(p.card)
        card = { type: p.card.type, width: bitmap.width, height: bitmap.height, size: p.card.size }
        bitmap.close()
      }
      out.push({
        id: p.id,
        width: p.width,
        cardWidth: p.cardWidth ?? null,
        card,
        thumbnailSize: p.thumbnail.size,
        uploads: p.uploads,
        updatedAt: p.updatedAt,
      })
    }
    db.close()
    return { photos: out as Stored[], outbox }
  })
}

/** Takes the card images away again, as on a device from before T-0040, and empties the outbox. */
function dropCards(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('diy-projects')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    type Row = { id: string; card?: Blob; cardWidth?: number }
    const photos = await new Promise<Row[]>((resolve, reject) => {
      const req = db.transaction('photos').objectStore('photos').getAll()
      req.onsuccess = () => resolve((req.result as Row[]).filter((p) => !p.id.startsWith('demo-')))
      req.onerror = () => reject(req.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['photos', 'outbox'], 'readwrite')
      for (const p of photos) {
        delete p.card
        delete p.cardWidth
        tx.objectStore('photos').put(p)
      }
      tx.objectStore('outbox').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
}

test('card images are made at import, and in the background for photos without one, unseen and locally only', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  const big = withExif(await jpeg(page, 4000, 3000, '#7a4a20'), { dateTimeOriginal: '2026:11:03 09:00:00' })
  const small = withExif(await jpeg(page, 600, 450, '#204a7a'), { dateTimeOriginal: '2026:11:03 09:30:00' })

  await page.getByRole('link', { name: 'Nieuw project' }).click()
  await page.getByLabel('Titel').fill('Kaartenbak')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Kaartenbak' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'groot.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(big) },
    { name: 'klein.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(small) },
  ])
  await expect(page.getByTestId('import-status')).toContainText("2 foto's toegevoegd.", { timeout: 60_000 })

  // At import: a 640×480 WebP for the big photo; the small one (600×450) gets none.
  const imported = await stored(page)
  const bigOne = imported.photos.find((p) => p.width === 2560)!
  const smallOne = imported.photos.find((p) => p.width === 600)!
  expect(bigOne.card).toMatchObject({ type: 'image/webp', width: 640, height: 480 })
  expect(bigOne.cardWidth).toBe(640)
  expect(smallOne.card).toBeNull()
  expect(smallOne.cardWidth).toBe(0)
  console.log(`bytes: card image ${bigOne.card!.size}, thumbnail ${bigOne.thumbnailSize}`)

  // As a device from before T-0040: no card images; the uploads done, as after a sync.
  await dropCards(page)
  const before = await stored(page)
  expect(before.photos.every((p) => p.cardWidth === null && p.card === null)).toBe(true)
  expect(before.outbox).toBe(0)
  const old = before.photos.find((p) => p.id === bigOne.id)!

  // The app starts on the overview, where the big photo is the cover; the job begins a moment later.
  await page.goto('/')
  const card = page.getByRole('link', { name: /Kaartenbak/ }).locator('img')
  await expect(card).toHaveAttribute('srcset', /^\S+ \d+w, \S+ \d+w$/)
  await expect.poll(() => card.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  const text = await page.locator('body').innerText()

  // While it runs: no new text anywhere (no message, no unsent count), the card keeps an image.
  let after = before
  for (let i = 0; i < 200; i++) {
    expect(await page.locator('body').innerText()).toBe(text)
    expect(await card.evaluate((img: HTMLImageElement) => img.naturalWidth > 0)).toBe(true)
    after = await stored(page)
    if (after.photos.find((p) => p.id === old.id)!.cardWidth !== null) break
    await page.waitForTimeout(100)
  }

  const made = after.photos.find((p) => p.id === old.id)!
  expect(made.card).toMatchObject({ type: 'image/webp', width: 640, height: 480 })
  expect(made.uploads).toEqual(old.uploads)
  expect(made.updatedAt).toBe(old.updatedAt)
  expect(after.outbox).toBe(0)

  // Afterwards: the card offers it as its smallest candidate, loaded, nothing new to read.
  await expect(card).toHaveAttribute('srcset', /^\S+ 640w, \S+ 1280w, \S+ 2560w$/)
  await expect.poll(() => card.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  expect(await page.locator('body').innerText()).toBe(text)

  // The small photo is recorded as too small, and stays so on a later start.
  await expect.poll(async () => (await stored(page)).photos.find((p) => p.id === smallOne.id)!.cardWidth).toBe(0)
  const kept = (await stored(page)).photos.find((p) => p.id === smallOne.id)!
  await page.reload()
  await expect(card).toHaveAttribute('srcset', / 640w, /)
  await page.waitForTimeout(2000)
  const again = await stored(page)
  expect(again.photos.find((p) => p.id === smallOne.id)).toEqual(kept)
  expect(again.photos.find((p) => p.id === old.id)).toEqual(made)
  expect(again.outbox).toBe(0)
})
