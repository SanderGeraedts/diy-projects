import { devices, expect, test, type Page } from '@playwright/test'
import { withExif, type ExifFields } from '../src/photos/exifFixture'

// T-0031 (D-0033): files dropped on the owner's project page take the same import as
// "+ Foto's toevoegen" (e2e/import.spec.ts); non-photos are listed as not added; a drop
// anywhere else does nothing. Generated photos only (D-0006, D-0010), on the seeded demo
// data. Drops are DragEvents with a DataTransfer built in the page, as a real drop delivers.

// A laptop: a desktop viewport with a mouse (the project's only profile is the Pixel 7).
test.use({
  viewport: { width: 1280, height: 800 },
  isMobile: false,
  hasTouch: false,
  deviceScaleFactor: 1,
  userAgent: devices['Desktop Chrome'].userAgent,
})

interface Dropped {
  name: string
  type: string
  bytes: number[]
}

/** A plain JPEG of the given size, drawn in the page's canvas. */
async function jpeg(page: Page, width: number, height: number, color: string): Promise<Uint8Array> {
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
  return new Uint8Array(bytes)
}

const dropped = (name: string, type: string, bytes: Uint8Array): Dropped => ({ name, type, bytes: Array.from(bytes) })
const photo = async (page: Page, name: string, w: number, h: number, color: string, exif: ExifFields) =>
  dropped(name, 'image/jpeg', withExif(await jpeg(page, w, h, color), exif))
const brokenJpeg = () => dropped('kapot.jpg', 'image/jpeg', new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02]))

/** A DataTransfer holding the files, as a drop from the computer carries them. */
const filesTransfer = (page: Page, files: Dropped[]) =>
  page.evaluateHandle((fs) => {
    const dt = new DataTransfer()
    for (const f of fs) dt.items.add(new File([new Uint8Array(f.bytes)], f.name, { type: f.type }))
    return dt
  }, files)

/** Drags the files onto the page and drops them: dragenter, dragover, drop. */
async function dropFiles(page: Page, files: Dropped[]) {
  const dataTransfer = await filesTransfer(page, files)
  for (const type of ['dragenter', 'dragover', 'drop']) await page.dispatchEvent('main', type, { dataTransfer })
}

/** Goes to the app, waits for the service worker to control it, makes the fixtures, goes offline. */
async function offlineWithNewProject(page: Page, makeFixtures: () => Promise<Dropped[]>) {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  const fixtures = await makeFixtures()
  await page.context().setOffline(true)
  await page.getByRole('link', { name: 'Nieuw project' }).click()
  await page.getByLabel('Titel').fill('Vogelhuisje')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Vogelhuisje' })).toBeVisible()
  return fixtures
}

const overlay = (page: Page) => page.getByTestId('drop-overlay')
const hint = (page: Page) => page.getByText("of sleep foto's naar deze pagina")

test('dropped photos land in the days they were taken, offline, as picked ones do', async ({ page }) => {
  test.setTimeout(90_000)
  const files = await offlineWithNewProject(page, async () => [
    await photo(page, 'PXL_0901_a.jpg', 3000, 2000, '#c04020', { dateTimeOriginal: '2026:09:01 09:15:00' }),
    brokenJpeg(),
    await photo(page, 'PXL_0903.jpg', 2400, 1800, '#2040c0', { dateTimeOriginal: '2026:09:03 17:40:00' }),
    await photo(page, 'PXL_0901_b.jpg', 2000, 3000, '#20a040', { dateTimeOriginal: '2026:09:01 16:05:00' }),
  ])
  const projectUrl = page.url()
  await expect(hint(page)).toBeVisible()

  // The overlay shows while files are dragged over the page and goes on the drop.
  const dataTransfer = await filesTransfer(page, files)
  await page.dispatchEvent('main', 'dragenter', { dataTransfer })
  await expect(overlay(page)).toBeVisible()
  await expect(overlay(page)).toContainText("Laat los om foto's toe te voegen")
  await expect(overlay(page)).toContainText('aan Vogelhuisje')
  await expect(overlay(page)).toHaveAttribute('aria-hidden', 'true')
  await page.dispatchEvent('main', 'dragover', { dataTransfer })
  await page.dispatchEvent('main', 'drop', { dataTransfer })
  await expect(overlay(page)).toHaveCount(0)

  const status = page.getByTestId('import-status')
  await expect(status).toContainText("3 foto's toegevoegd.", { timeout: 30_000 })
  await expect(status).toContainText('1 foto niet gelukt:')
  await expect(page.getByTestId('import-failed').getByRole('listitem')).toHaveText(['kapot.jpg: kon niet worden gelezen'])

  // Two days, newest first, each with its photos as the picker puts them (e2e/import.spec.ts).
  const entries = page.locator('.timeline > li')
  await expect(page.locator('.timeline time')).toHaveText(['3 sep 2026', '1 sep 2026'])
  const widths = (date: string) =>
    entries
      .filter({ has: page.locator(`time[datetime="${date}"]`) })
      .locator('img')
      .evaluateAll((imgs) => imgs.map((img) => img.getAttribute('width')))
  await expect.poll(() => widths('2026-09-03')).toEqual(['2400'])
  await expect.poll(() => widths('2026-09-01')).toEqual(['1707', '2560'])

  expect(page.url()).toBe(projectUrl)
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})

test('dropped non-photos are listed as not added, each with a reason', async ({ page }) => {
  test.setTimeout(60_000)
  const files = await offlineWithNewProject(page, async () => [
    dropped('notes.txt', 'text/plain', new TextEncoder().encode('lijm kopen')),
    await photo(page, 'PXL_0905.jpg', 1600, 1200, '#c04020', { dateTimeOriginal: '2026:09:05 10:00:00' }),
    dropped('plan.pdf', 'application/pdf', new TextEncoder().encode('%PDF-1.4')),
  ])
  const projectUrl = page.url()

  await dropFiles(page, files)
  const status = page.getByTestId('import-status')
  await expect(status).toContainText("1 foto toegevoegd.", { timeout: 30_000 })
  await expect(status).toContainText('2 bestanden niet toegevoegd:')
  await expect(page.getByTestId('import-failed').getByRole('listitem')).toHaveText([
    'notes.txt: is geen foto',
    'plan.pdf: is geen foto',
  ])
  await expect(page.locator('.timeline time')).toHaveText(['5 sep 2026'])
  await expect(page.locator('.timeline img')).toHaveCount(1)
  expect(page.url()).toBe(projectUrl)

  // Only non-photos: straight to the summary.
  await page.getByRole('button', { name: 'Sluiten' }).click()
  await dropFiles(page, [files[0]!])
  await expect(status).toContainText("Geen foto's toegevoegd.")
  await expect(status).toContainText('1 bestand niet toegevoegd:')
  await expect(status).not.toContainText('importeren')
})

test('after a drop low on the page, the import block shows below the sticky header', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await page.goto('/projects/tuinbank')
  await expect(page.locator('.timeline img')).toHaveCount(6)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await dropFiles(page, [dropped('notes.txt', 'text/plain', new TextEncoder().encode('lijm kopen'))])
  const status = page.getByTestId('import-status')
  await expect(status).toContainText('1 bestand niet toegevoegd:')
  // Wait for the (smooth) scroll to settle, then the block's top must clear the header.
  const position = () =>
    page.evaluate(() => ({
      header: document.querySelector('header.sticky')!.getBoundingClientRect().bottom,
      block: document.querySelector('[data-testid="import-status"]')!.getBoundingClientRect().top,
    }))
  await expect.poll(async () => {
    const { header, block } = await position()
    return block >= header && block < 600
  }).toBe(true)
})

test('a drag that carries only text shows no overlay', async ({ page }) => {
  await page.goto('/projects/tuinbank')
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
  const text = await page.evaluateHandle(() => {
    const dt = new DataTransfer()
    dt.setData('text/plain', 'hallo')
    return dt
  })
  await page.dispatchEvent('main', 'dragenter', { dataTransfer: text })
  await page.dispatchEvent('main', 'dragover', { dataTransfer: text })
  await expect(overlay(page)).toHaveCount(0)
  await page.dispatchEvent('main', 'drop', { dataTransfer: text })
  await expect(page.getByTestId('import-status')).toHaveCount(0)
})

test('a drop on the overview or a visitor page does nothing', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Tuinbank/ })).toBeVisible()
  const files = [await photo(page, 'PXL_0907.jpg', 1600, 1200, '#2040c0', { dateTimeOriginal: '2026:09:07 10:00:00' })]

  const strayDrop = async () => {
    const before = await page.locator('main').innerHTML()
    const url = page.url()
    const dataTransfer = await filesTransfer(page, files)
    await page.dispatchEvent('main', 'dragenter', { dataTransfer })
    await page.dispatchEvent('main', 'dragover', { dataTransfer })
    await expect(overlay(page)).toHaveCount(0)
    await page.dispatchEvent('main', 'drop', { dataTransfer })
    await expect(overlay(page)).toHaveCount(0)
    await expect(page.getByTestId('import-status')).toHaveCount(0)
    expect(page.url()).toBe(url)
    expect(await page.locator('main').innerHTML()).toBe(before)
    // The browser's own handling (opening the file) is cancelled, with the "not allowed" cursor.
    const handled = await page.evaluate((dt) => {
      const main = document.querySelector('main')!
      const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })
      const drop = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })
      main.dispatchEvent(over)
      main.dispatchEvent(drop)
      return { over: over.defaultPrevented, dropEffect: dt.dropEffect, drop: drop.defaultPrevented }
    }, dataTransfer)
    expect(handled).toEqual({ over: true, dropEffect: 'none', drop: true })
  }

  await strayDrop()

  await page.goto('/projects/tuinbank?bezoeker')
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
  await expect(page.locator('.timeline img').first()).toBeVisible()
  await expect(hint(page)).toHaveCount(0)
  await strayDrop()

  // As the owner, Tuinbank still has its 6 photos.
  await page.goto('/projects/tuinbank?bezoeker=uit')
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
  await expect(page.locator('.timeline img')).toHaveCount(6)
})
