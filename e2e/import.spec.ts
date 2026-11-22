import { expect, test, type Page } from '@playwright/test'
import { withExif, type ExifFields } from '../src/photos/exifFixture'

// T-0007: import generated photos (no real photos, D-0006, D-0010) taken on two days into a
// new project, offline. Each day gets one entry with its own photos; a broken file is
// reported without losing the others; the first photo becomes the cover; a photo without
// EXIF is filed by the file's date and flagged in the summary.

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

const file = (name: string, bytes: Uint8Array) => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from(bytes) })
const photo = async (page: Page, name: string, w: number, h: number, color: string, exif: ExifFields) =>
  file(name, withExif(await jpeg(page, w, h, color), exif))

test('imports photos taken on two days into two entries, offline', async ({ page, context }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker

  // Fixtures, made before going offline. Sizes tell the photos apart: the copy is never
  // upscaled, so 2400×1800 stays as it is and the others fit 2560 px.
  const first = await photo(page, 'PXL_0901_a.jpg', 3000, 2000, '#c04020', { dateTimeOriginal: '2026:09:01 09:15:00' })
  const second = await photo(page, 'PXL_0903.jpg', 2400, 1800, '#2040c0', { dateTimeOriginal: '2026:09:03 17:40:00' })
  const third = await photo(page, 'PXL_0901_b.jpg', 2000, 3000, '#20a040', { dateTimeOriginal: '2026:09:01 16:05:00' })
  const broken = file('kapot.jpg', new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02]))
  const noExif = file('scan.jpg', await jpeg(page, 1200, 900, '#808080'))

  await context.setOffline(true)

  await page.getByRole('link', { name: 'Nieuw project' }).click()
  await page.getByLabel('Titel').fill('Vogelhuisje')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Vogelhuisje' })).toBeVisible()
  const projectUrl = page.url()

  const input = page.locator('input[type="file"]')
  await expect(input).toHaveAttribute('accept', 'image/*')
  await expect(input).toHaveAttribute('multiple', '')
  const status = page.getByTestId('import-status')

  await input.setInputFiles([first, broken, second, third])
  await expect(status).toContainText(/Foto's importeren: \d van 4|toegevoegd/)

  // Leaving the page doesn't stop the import.
  await page.getByRole('link', { name: 'Alle projecten' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: /Vogelhuisje/ }).click()
  await expect(page).toHaveURL(projectUrl)

  await expect(status).toContainText("3 foto's toegevoegd.", { timeout: 30_000 })
  await expect(page.getByTestId('import-failed').getByRole('listitem')).toHaveText(['kapot.jpg: kon niet worden gelezen'])
  await expect(page.getByTestId('import-file-date')).toHaveCount(0)

  // Two entries, newest first, each with its own photos (newest first too, D-0031).
  const entries = page.locator('.timeline > li')
  await expect(page.locator('.timeline time')).toHaveText(['3 sep 2026', '1 sep 2026'])
  const widths = (date: string) =>
    entries.filter({ has: page.locator(`time[datetime="${date}"]`) }).locator('img').evaluateAll((imgs) => imgs.map((img) => img.getAttribute('width')))
  await expect.poll(() => widths('2026-09-03')).toEqual(['2400'])
  await expect.poll(() => widths('2026-09-01')).toEqual(['1707', '2560'])

  await page.getByRole('button', { name: 'Sluiten' }).click()
  await expect(status).toHaveCount(0)

  // A photo without EXIF is filed by the file's date and flagged.
  await input.setInputFiles([noExif])
  await expect(status).toContainText('1 foto toegevoegd.', { timeout: 30_000 })
  await expect(page.getByTestId('import-file-date').getByRole('listitem')).toHaveText(['scan.jpg'])
  await expect(page.locator('.timeline time')).toHaveCount(3)

  // The first imported photo is the cover on the overview; all kept after a reload.
  await page.getByRole('link', { name: 'Alle projecten' }).click()
  const card = page.getByRole('link', { name: /Vogelhuisje/ })
  await expect(card.locator('img')).toHaveAttribute('width', '2560')
  await page.reload()
  await card.click()
  await expect(page.locator('.timeline time')).toHaveCount(3)
  await expect.poll(() => widths('2026-09-01')).toEqual(['1707', '2560'])
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})
