import { expect, test, type Page } from '@playwright/test'
import { withExif } from '../src/photos/exifFixture'

// T-0037 (D-0038): a device rebuilds its older (512 px) thumbnails from its copy after the
// app starts: in the background, unseen, locally only (no outbox row, `uploads` and
// `updatedAt` unchanged). A photo whose copy is itself that small is left alone. And the
// `sizes` on cards and tiles are exactly the designed ones, for the owner and a visitor.
// Generated photos only (G-0019).

const CARD_SIZES =
  'auto, (min-width: 1024px) 320px, (min-width: 832px) calc((100vw - 64px) / 3), (min-width: 560px) calc((100vw - 48px) / 2), calc(100vw - 32px)'
const TILE_SIZES = 'auto, (min-width: 1024px) 492px, calc((100vw - 40px) / 2)'

async function jpeg(page: Page, width: number, height: number, color: string): Promise<Buffer> {
  const bytes = await page.evaluate(
    async ([w, h, c]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = c
      ctx.fillRect(0, 0, w, h)
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
  thumbnailWidth: number | null
  thumbnailSize: number
  thumbnailPixels: number
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
    type Row = { id: string; width: number; thumbnail: Blob; thumbnailWidth?: number; uploads: unknown; updatedAt: string }
    const photos = (await all<Row>('photos')).filter((p) => !p.id.startsWith('demo-'))
    const outbox = (await all<unknown>('outbox')).length
    const out = []
    for (const p of photos) {
      const bitmap = await createImageBitmap(p.thumbnail)
      out.push({
        id: p.id,
        width: p.width,
        thumbnailWidth: p.thumbnailWidth ?? null,
        thumbnailSize: p.thumbnail.size,
        thumbnailPixels: bitmap.width,
        uploads: p.uploads,
        updatedAt: p.updatedAt,
      })
      bitmap.close()
    }
    db.close()
    return { photos: out as Stored[], outbox }
  })
}

/**
 * Turns the imported photos into photos as an older version left them: a 512 px thumbnail
 * (or, for a small copy, the copy's size) whose width the device hasn't measured, already
 * uploaded; and an empty outbox, as after a sync.
 */
function makeOld(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('diy-projects')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    type Row = { id: string; width: number; height: number; blob: Blob; thumbnail: Blob; thumbnailWidth?: number; uploads: unknown }
    const photos = await new Promise<Row[]>((resolve, reject) => {
      const req = db.transaction('photos').objectStore('photos').getAll()
      req.onsuccess = () => resolve((req.result as Row[]).filter((p) => !p.id.startsWith('demo-')))
      req.onerror = () => reject(req.error)
    })
    for (const p of photos) {
      const scale = Math.min(1, 512 / Math.max(p.width, p.height))
      const bitmap = await createImageBitmap(p.blob)
      const canvas = new OffscreenCanvas(Math.round(p.width * scale), Math.round(p.height * scale))
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      p.thumbnail = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
      delete p.thumbnailWidth
      p.uploads = { original: 'uploaded', copy: 'uploaded', thumbnail: 'uploaded' }
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['photos', 'outbox'], 'readwrite')
      for (const p of photos) tx.objectStore('photos').put(p)
      tx.objectStore('outbox').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
}

test('older thumbnails are rebuilt in the background, unseen and locally only', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  const big = withExif(await jpeg(page, 4000, 3000, '#7a4a20'), { dateTimeOriginal: '2026:11:02 09:00:00' })
  const small = withExif(await jpeg(page, 400, 300, '#204a7a'), { dateTimeOriginal: '2026:11:02 09:30:00' })

  await page.getByRole('link', { name: 'Nieuw project' }).click()
  await page.getByLabel('Titel').fill('Werkbank')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Werkbank' })).toBeVisible()
  const projectPath = new URL(page.url()).pathname
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'groot.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(big) },
    { name: 'klein.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(small) },
  ])
  await expect(page.getByTestId('import-status')).toContainText("2 foto's toegevoegd.", { timeout: 60_000 })

  // A new import already has the 1280 px thumbnail, and the device knows its width.
  const imported = await stored(page)
  expect(imported.photos.map((p) => [p.width, p.thumbnailPixels, p.thumbnailWidth]).sort()).toEqual([
    [2560, 1280, 1280],
    [400, 400, 400],
  ])

  await makeOld(page)
  const before = await stored(page)
  const old = before.photos.find((p) => p.width === 2560)!
  const tiny = before.photos.find((p) => p.width === 400)!
  expect(old.thumbnailPixels).toBe(512)
  expect(old.thumbnailWidth).toBeNull()
  expect(before.outbox).toBe(0)

  // The app starts on the project page; the check begins a moment later.
  await page.goto(projectPath)
  const tile = page.locator(`.timeline img[data-photo-id="${old.id}"]`)
  // D-0040: an unmeasured thumbnail is offered alone, never with the copy as a candidate.
  await expect(tile).not.toHaveAttribute('srcset')
  await expect.poll(() => tile.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  const alt = await tile.getAttribute('alt')
  const text = await page.locator('body').innerText()

  // While it runs: no new text anywhere (no message, no unsent count), the tile keeps an image.
  let after = before
  for (let i = 0; i < 200; i++) {
    expect(await page.locator('body').innerText()).toBe(text)
    expect(await tile.evaluate((img: HTMLImageElement) => img.naturalWidth > 0)).toBe(true)
    expect(await tile.getAttribute('alt')).toBe(alt)
    after = await stored(page)
    if (after.photos.find((p) => p.id === old.id)!.thumbnailWidth !== null) break
    await page.waitForTimeout(100)
  }

  const rebuilt = after.photos.find((p) => p.id === old.id)!
  expect(rebuilt.thumbnailWidth).toBe(1280)
  expect(rebuilt.thumbnailPixels).toBe(1280)
  expect(rebuilt.uploads).toEqual(old.uploads)
  expect(rebuilt.updatedAt).toBe(old.updatedAt)
  expect(after.outbox).toBe(0)

  // Afterwards: the tile shows the rebuilt thumbnail, labelled 1280w, loaded, nothing new to read.
  await expect(tile).toHaveAttribute('srcset', / 1280w, /)
  await expect.poll(() => tile.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true)
  await expect(tile).toHaveAttribute('alt', alt!)
  expect(await page.locator('body').innerText()).toBe(text)

  // The small photo was only measured: its thumbnail is the one it had.
  await expect.poll(async () => (await stored(page)).photos.find((p) => p.id === tiny.id)!.thumbnailWidth).toBe(400)
  const kept = (await stored(page)).photos.find((p) => p.id === tiny.id)!
  expect(kept.thumbnailSize).toBe(tiny.thumbnailSize)
  expect(kept.updatedAt).toBe(tiny.updatedAt)
  expect(kept.uploads).toEqual(tiny.uploads)

  // A later start changes nothing more.
  await page.reload()
  await expect(tile).toHaveAttribute('srcset', / 1280w, /)
  await page.waitForTimeout(2000)
  const again = await stored(page)
  expect(again.photos.find((p) => p.id === tiny.id)).toEqual(kept)
  expect(again.photos.find((p) => p.id === old.id)).toEqual(rebuilt)
  expect(again.outbox).toBe(0)
})

/** Every card's and tile's `sizes`, and whether the viewer's image has a `srcset`. */
async function checkSizes(page: Page, project: string, slug: string) {
  await page.goto(page.url().includes('bezoeker') ? '/?bezoeker' : '/')
  const cards = page.getByRole('main').locator('a[href^="/projects/"] img')
  await expect(cards.first()).toBeAttached()
  for (const sizes of await cards.evaluateAll((imgs) => imgs.map((img) => img.getAttribute('sizes')))) expect(sizes).toBe(CARD_SIZES)
  // T-0040 (D-0041): the owner's cards may lead with their card image once the device made
  // it; the demo visitor view has none.
  const visitor = page.url().includes('bezoeker')
  const pattern = visitor ? /^\S+ \d+w, \S+ \d+w$/ : /^(\S+ 640w, )?\S+ \d+w, \S+ \d+w$/
  for (const srcset of await cards.evaluateAll((imgs) => imgs.map((img) => img.getAttribute('srcset')))) expect(srcset).toMatch(pattern)

  await page.getByRole('link', { name: new RegExp(project) }).click()
  await expect(page.getByRole('heading', { level: 1, name: project })).toBeVisible()
  const tiles = page.locator('.timeline img')
  await expect(tiles.first()).toBeAttached()
  for (const sizes of await tiles.evaluateAll((imgs) => imgs.map((img) => img.getAttribute('sizes')))) expect(sizes).toBe(TILE_SIZES)
  expect(await tiles.count()).toBeGreaterThan(0)
  const srcset = (await tiles.first().getAttribute('srcset'))!
  const [thumbnail, copy] = srcset.split(', ').slice(-2).map((candidate) => candidate.split(' ')[0])

  await tiles.first().click()
  const viewer = page.getByRole('dialog')
  const shown = viewer.locator('img[data-current]')
  await expect(shown).toBeVisible()
  expect(await shown.getAttribute('srcset')).toBeNull()
  await expect(page).toHaveURL(new RegExp(`/projects/${slug}/`))
  return { thumbnail, copy, viewerSrc: await shown.getAttribute('src') }
}

test('cards and tiles carry the designed sizes and a srcset, the viewer the copy only (owner)', async ({ page }) => {
  await page.goto('/')
  const { viewerSrc, thumbnail, copy } = await checkSizes(page, 'Tuinbank', 'tuinbank')
  expect(thumbnail).toMatch(/^blob:/)
  expect(copy).toMatch(/^blob:/)
  expect(viewerSrc).toMatch(/^blob:/)
})

test('a visitor’s cards and tiles have the thumbnail and the copy in their srcset, and the viewer shows the copy', async ({ page }) => {
  await page.goto('/?bezoeker')
  const { viewerSrc, thumbnail, copy } = await checkSizes(page, 'Tuinbank', 'tuinbank')
  expect(thumbnail).toBeTruthy()
  expect(copy).toBeTruthy()
  // In the demo visitor view both addresses are the same (src/public/source.ts); the viewer
  // shows the copy's.
  expect(viewerSrc).toBe(copy)
})
