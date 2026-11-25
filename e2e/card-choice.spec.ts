import { expect, test, type Locator, type Page } from '@playwright/test'
import { withExif } from '../src/photos/exifFixture'

// T-0041 (D-0042): Chrome takes a larger srcset candidate whose address it already loaded in
// the page. So every cover on the overview must show the 640 px card image on a laptop at a
// pixel ratio of 1, in every state the app passes through: first load (a), the card image
// added while the page is open (b), the thumbnail unmeasured and shown alone first (c), after
// the photo viewer loaded the copy (d), and after a reload (e). "Shown width" is the decoded
// width of the file behind `currentSrc`, never `naturalWidth` (D-0042). Generated photos in
// the browser's own IndexedDB only, never the NAS (G-0019).

test.use({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
  // Routes see the photo worker's script only without the service worker in between.
  serviceWorkers: 'block',
})

const PROJECTS = 12
const title = (i: number) => `Bok ${String(i + 1).padStart(2, '0')}`

/** A 4000×3000 JPEG with a little detail, drawn in the page's canvas. */
async function jpeg(page: Page, hue: number): Promise<Buffer> {
  const bytes = await page.evaluate(async (h) => {
    const canvas = document.createElement('canvas')
    canvas.width = 4000
    canvas.height = 3000
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = `hsl(${h}, 50%, 40%)`
    ctx.fillRect(0, 0, 4000, 3000)
    ctx.fillStyle = '#ffffff'
    for (let x = 0; x < 4000; x += 200) ctx.fillRect(x, 0, 20, 3000)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  }, hue)
  return Buffer.from(bytes)
}

/** Edits the imported (non-demo) photos in IndexedDB, as an older device would have them. */
function editPhotos(page: Page, how: 'no card' | 'unmeasured') {
  return page.evaluate(async (mode) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('diy-projects')
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    type Row = { id: string; card?: Blob; cardWidth?: number; thumbnailWidth?: number; thumbnailOnNas?: string; uploads: Record<string, string> }
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
        if (mode === 'unmeasured') {
          // Measured only once uploaded (rebuild.ts needsCheck): as after a sync.
          delete p.thumbnailWidth
          delete p.thumbnailOnNas
          p.uploads = { original: 'uploaded', copy: 'uploaded', thumbnail: 'uploaded' }
        }
        tx.objectStore('photos').put(p)
      }
      tx.objectStore('outbox').clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  }, how)
}

/**
 * Holds the photo worker's script, so the background pass that measures thumbnails and makes
 * card images waits until `release` is called (it starts a second after the app).
 */
async function holdBackgroundPass(page: Page) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const pattern = '**/photo.worker*'
  await page.context().route(pattern, async (route) => {
    await gate
    await route.continue()
  })
  return async () => {
    release()
    await page.context().unroute(pattern)
  }
}

interface Shown {
  title: string
  srcset: string
  /** The decoded width of the file behind currentSrc; 0 while it can't be read. */
  width: number
  /** Its natural width is 0: the image is empty. */
  empty: boolean
}

/**
 * Scrolls the image into view, waits for it to load, and decodes the file behind currentSrc.
 * Only once the image has made its choice: fetching an address takes it out of Chrome's memory
 * cache, which would hide the very preference this checks (so `chosen` reads the label instead).
 */
async function shown(img: Locator, name: string): Promise<Shown> {
  await img.scrollIntoViewIfNeeded()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  const r = await img.evaluate(async (el: HTMLImageElement) => {
    let width = 0
    try {
      const bitmap = await createImageBitmap(await (await fetch(el.currentSrc)).blob())
      width = bitmap.width
      bitmap.close()
    } catch {
      width = 0
    }
    return { srcset: el.getAttribute('srcset') ?? '', width, empty: el.naturalWidth === 0 }
  })
  return { title: name, ...r }
}

/**
 * Which candidate the image shows, without loading anything: the label of the srcset entry
 * whose address is currentSrc, or `src` without a srcset. Waits for it to load first.
 */
async function chosen(img: Locator): Promise<{ srcset: string; label: string }> {
  await img.scrollIntoViewIfNeeded()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  return img.evaluate((el: HTMLImageElement) => {
    const srcset = el.getAttribute('srcset') ?? ''
    const hit = srcset
      .split(', ')
      .map((c) => c.split(' '))
      .find(([url]) => url === el.currentSrc)
    return { srcset, label: hit ? hit[1]! : el.currentSrc === el.src ? 'src' : '?' }
  })
}

function cards(page: Page) {
  return Array.from({ length: PROJECTS }, (_, i) => ({ title: title(i), img: page.getByRole('link', { name: new RegExp(title(i)) }).locator('img') }))
}

async function allCards(page: Page): Promise<Shown[]> {
  const out: Shown[] = []
  for (const c of cards(page)) out.push(await shown(c.img, c.title))
  return out
}

const report = (state: string, rows: Shown[]) =>
  [`${state}:`, ...rows.map((r) => `  ${r.title} | shown ${String(r.width).padStart(4)} | srcset ${r.srcset.replace(/blob:\S+/g, 'blob').replace(/http\S+/g, 'url')}`)].join('\n')

function expectAll640(state: string, rows: Shown[]) {
  console.log(report(state, rows))
  expect(rows).toHaveLength(PROJECTS)
  for (const r of rows) {
    expect.soft(r.srcset, `${state}: ${r.title} offers the card image`).toMatch(/ 640w/)
    expect.soft(r.width, `${state}: ${r.title} shown width`).toBe(640)
  }
}

/**
 * b and c: with the background pass held, every card shows the thumbnail; then the pass adds
 * the card images, and within 10 s every card offers and shows the card image, never empty.
 */
async function cardImageArrives(page: Page, state: string, before: RegExp, thumbnail: string) {
  const release = await holdBackgroundPass(page)
  await page.goto('/')
  const lines = [`${state}, before the pass:`]
  for (const c of cards(page)) {
    const r = await chosen(c.img)
    lines.push(`  ${c.title} | shows ${r.label} | srcset ${r.srcset.replace(/blob:\S+/g, 'blob')}`)
    expect(r.srcset, `${state}: ${c.title} before the pass`).toMatch(before)
    expect(r.label, `${state}: ${c.title} shows the thumbnail before the pass`).toBe(thumbnail)
  }
  console.log(lines.join('\n'))
  await release()

  // Within 10 s: every card offers the card image (read without loading anything), and then
  // shows it. The T-0040 check meanwhile: no image becomes empty.
  const until = Date.now() + 10_000
  const imgs = page.locator('a img')
  for (;;) {
    const now = await imgs.evaluateAll((els) =>
      els.map((el) => ({ srcset: el.getAttribute('srcset') ?? '', empty: (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth === 0 })),
    )
    expect(now.filter((i) => i.empty), `${state}: images that became empty`).toHaveLength(0)
    const offered = await Promise.all(cards(page).map((c) => c.img.getAttribute('srcset')))
    if (offered.every((s) => / 640w/.test(s ?? '')) || Date.now() > until) break
    await page.waitForTimeout(100)
  }
  let rows = await allCards(page)
  while (!rows.every((r) => / 640w/.test(r.srcset) && r.width === 640) && Date.now() < until) {
    await page.waitForTimeout(250)
    rows = await allCards(page)
  }
  expectAll640(state, rows)
}

test('every cover shows the 640 px card image at pixel ratio 1, in every state', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/')
  for (let i = 0; i < PROJECTS; i++) {
    const photo = withExif(await jpeg(page, (i * 30) % 360), { dateTimeOriginal: '2026:11:20 10:00:00' })
    await page.goto('/')
    await page.getByRole('link', { name: 'Nieuw project' }).click()
    await page.getByLabel('Titel').fill(title(i))
    await page.getByRole('button', { name: 'Opslaan' }).click()
    await expect(page.getByRole('heading', { level: 1, name: title(i) })).toBeVisible()
    await page.locator('input[type="file"]').setInputFiles([{ name: `bok-${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(photo) }])
    await expect(page.getByTestId('import-status')).toContainText('toegevoegd.', { timeout: 60_000 })
  }

  // a. First load: the card images exist before the page opens.
  await page.goto('/')
  expectAll640('a. first load', await allCards(page))

  // b. The card image added while the page is open (thumbnail measured).
  await editPhotos(page, 'no card')
  await cardImageArrives(page, 'b. card image added while open', /^\S+ 1280w, \S+ 2560w$/, '1280w')

  // e. A reload after b.
  await page.reload()
  expectAll640('e. reload after b', await allCards(page))

  // c. Unmeasured first: the thumbnail alone (D-0040), then measured with its card image.
  await editPhotos(page, 'unmeasured')
  await cardImageArrives(page, 'c. unmeasured first', /^$/, 'src')

  // d. After the viewer: from the project page, open the cover in the viewer (the copy), go
  // back to the project page and to the overview, all without a reload.
  await page.goto('/')
  await allCards(page)
  const viewed = title(0)
  await page.getByRole('link', { name: new RegExp(viewed) }).click()
  await expect(page.getByRole('heading', { level: 1, name: viewed })).toBeVisible()
  await page.locator('.timeline a').first().click()
  // The viewer's image has no srcset, so its natural width is the file's; never fetched here,
  // which would take the copy's address out of Chrome's memory cache.
  const big = page.getByRole('dialog').locator('img[data-current]')
  await expect.poll(() => big.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(2560)
  expect(await big.getAttribute('srcset')).toBeNull()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The tile is read by its label (the file's real width, D-0038), not fetched: fetching the
  // copy's address would take it out of the cache before the overview is checked.
  const tile = page.locator('.timeline img').first()
  const t = await chosen(tile)
  const css = await tile.evaluate((el) => el.getBoundingClientRect().width * devicePixelRatio)
  const tileWidth = Number.parseInt(t.label, 10)
  console.log(`d. tile: shows ${t.label}, CSS ${css.toFixed(1)} px × pixel ratio, r ${(tileWidth / css).toFixed(2)}`)
  expect.soft(t.label, 'd: the tile never shows the copy').not.toBe('2560w')
  expect.soft(tileWidth / css, 'd: tile shown width ÷ CSS width × pixel ratio').toBeLessThanOrEqual(2.2)
  await page.goBack()
  await expect(page.getByRole('link', { name: 'Nieuw project' })).toBeVisible()
  expectAll640('d. after the viewer', await allCards(page))
})
