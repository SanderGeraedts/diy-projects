import { expect, test, type Locator, type Page } from '@playwright/test'
import { withExif } from '../src/photos/exifFixture'

// T-0037 (D-0038): cards and tiles load an image close to the pixels they show. For every
// overview card and day tile showing the imported photos, the delivered width (the decoded
// image behind `currentSrc`, cropped to the 4:3 box when wider) divided by the element's CSS
// width × devicePixelRatio stays between 0.9 and 3. Generated photos only (G-0019).

/** A JPEG of the given size, drawn in the page's canvas with a little detail. */
async function jpeg(page: Page, width: number, height: number, color: string): Promise<Uint8Array> {
  const bytes = await page.evaluate(
    async ([w, h, c]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = c
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = '#ffffff'
      for (let x = 0; x < w; x += 200) ctx.fillRect(x, 0, 20, h)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    [width, height, color] as const,
  )
  return new Uint8Array(bytes)
}

const VIEWPORTS = [
  { name: 'laptop', width: 1280, height: 800, dpr: 1.5, mobile: false },
  { name: 'fold', width: 840, height: 900, dpr: 2.625, mobile: true },
  { name: 'phone', width: 412, height: 915, dpr: 2.625, mobile: true },
] as const

interface Row {
  viewport: string
  place: string
  photo: string
  css: number
  dpr: number
  delivered: number
  r: number
}

/** Waits for the image to load, then decodes what it loaded and measures it. */
async function measure(img: Locator) {
  await img.scrollIntoViewIfNeeded()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  return img.evaluate(async (el: HTMLImageElement) => {
    const bitmap = await createImageBitmap(await (await fetch(el.currentSrc)).blob())
    // object-cover in a 4:3 box: a photo wider than 4:3 shows only its middle.
    const delivered = Math.min(bitmap.width, Math.round((bitmap.height * 4) / 3))
    bitmap.close()
    return { css: el.getBoundingClientRect().width, dpr: devicePixelRatio, delivered, width: el.getAttribute('width') }
  })
}

test('cards and tiles load an image sized to what they show, at three screens', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  const landscape = withExif(await jpeg(page, 4000, 3000, '#a05030'), { dateTimeOriginal: '2026:11:01 10:00:00' })
  const portrait = withExif(await jpeg(page, 3000, 4000, '#3050a0'), { dateTimeOriginal: '2026:11:01 10:05:00' })

  await page.getByRole('link', { name: 'Nieuw project' }).click()
  await page.getByLabel('Titel').fill('Zaagbok')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Zaagbok' })).toBeVisible()
  const projectPath = new URL(page.url()).pathname
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'liggend.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(landscape) },
    { name: 'staand.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(portrait) },
  ])
  // The first imported photo (the landscape one) becomes the cover.
  await expect(page.getByTestId('import-status')).toContainText("2 foto's toegevoegd.", { timeout: 60_000 })

  const name = (width: string | null) => (width === '2560' ? 'landscape' : width === '1920' ? 'portrait' : `width ${width}`)
  const cdp = await page.context().newCDPSession(page)
  const rows: Row[] = []
  for (const v of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: v.width,
      height: v.height,
      deviceScaleFactor: v.dpr,
      mobile: v.mobile,
    })
    await page.goto('/')
    const card = page.getByRole('link', { name: /Zaagbok/ }).locator('img')
    const c = await measure(card)
    rows.push({ viewport: v.name, place: 'card', photo: name(c.width), css: c.css, dpr: c.dpr, delivered: c.delivered, r: 0 })

    await page.goto(projectPath)
    const tiles = page.locator('.timeline img')
    await expect(tiles).toHaveCount(2)
    for (const tile of await tiles.all()) {
      const t = await measure(tile)
      rows.push({ viewport: v.name, place: 'tile', photo: name(t.width), css: t.css, dpr: t.dpr, delivered: t.delivered, r: 0 })
    }
  }
  for (const row of rows) row.r = row.delivered / (row.css * row.dpr)

  const table = [
    'viewport | place | photo     | CSS px | DPR   | delivered | r',
    ...rows.map((r) =>
      [r.viewport.padEnd(8), r.place.padEnd(5), r.photo.padEnd(9), r.css.toFixed(1).padStart(6), String(r.dpr).padEnd(5), String(r.delivered).padStart(9), r.r.toFixed(2)].join(' | '),
    ),
  ].join('\n')
  console.log(table)
  await test.info().attach('sizes', { body: table, contentType: 'text/plain' })

  expect(rows).toHaveLength(9)
  for (const row of rows) {
    expect.soft(row.r, `${row.viewport} ${row.place} ${row.photo}`).toBeGreaterThanOrEqual(0.9)
    expect.soft(row.r, `${row.viewport} ${row.place} ${row.photo}`).toBeLessThanOrEqual(3)
  }
})
