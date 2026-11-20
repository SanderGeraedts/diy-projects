import { expect, test, type Page } from '@playwright/test'
import { withExif } from '../src/photos/exifFixture'

// T-0027 (D-0029): no UUID in any address, for the owner or a visitor. A project is at
// /projects/<slug>, an entry is its date (the hash on the project page), a photo is
// /projects/<slug>/<day>/<n>. An earlier slug redirects to the current one.

/** A UUID anywhere in a string. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** The address bar and every link on the page: none may hold a UUID. */
async function expectNoUuid(page: Page) {
  expect(page.url()).not.toMatch(UUID)
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).href))
  expect(hrefs.length).toBeGreaterThan(0)
  for (const href of hrefs) expect(href).not.toMatch(UUID)
}

async function jpeg(page: Page): Promise<Uint8Array> {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 900
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#c04020'
    ctx.fillRect(0, 0, 1200, 900)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  return new Uint8Array(bytes)
}

test('a new project, its photos and search use slugs, dates and places, never a UUID', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/')
  const picture = (n: number, time: string) => ({
    name: `PXL_${n}.jpg`,
    mimeType: 'image/jpeg',
    buffer: Buffer.from(withExif(bytes, { dateTimeOriginal: `2026:09:01 ${time}` })),
  })
  const bytes = await jpeg(page)

  await page.getByRole('link', { name: 'Nieuw project' }).click()
  await page.getByLabel('Titel').fill('Kast für Sanne')
  await page.getByLabel('Omschrijving').fill('Een eiken kast met twee deuren.')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page).toHaveURL('/projects/kast-fur-sanne')
  await expect(page.getByRole('heading', { level: 1, name: 'Kast für Sanne' })).toBeVisible()

  await page.locator('input[type="file"]').setInputFiles([picture(1, '09:15:00'), picture(2, '16:05:00')])
  await expect(page.getByTestId('import-status')).toContainText("2 foto's toegevoegd.", { timeout: 30_000 })
  await expect(page.locator('[id="2026-09-01"] img')).toHaveCount(2)
  await expectNoUuid(page)

  // The photo viewer: the entry's day and the photo's place.
  await page.getByRole('link', { name: 'Kast für Sanne, 1 sep 2026' }).nth(1).click()
  await expect(page).toHaveURL('/projects/kast-fur-sanne/2026-09-01/2')
  await expect(page.getByRole('dialog', { name: 'Foto 2 van 2, 1 sep 2026' })).toBeVisible()
  await expectNoUuid(page)
  await page.getByRole('button', { name: 'Sluiten' }).click()

  // The overview.
  await page.getByRole('link', { name: '← Alle projecten' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: /Kast für Sanne/ })).toHaveAttribute('href', '/projects/kast-fur-sanne')
  await expectNoUuid(page)

  // Search: a hit in a note opens the project at the entry's day.
  await page.goto('/projects/kast-fur-sanne/entries/new')
  await page.getByLabel('Datum').fill('2026-09-01')
  await page.getByLabel('Notitie').fill('Deuren afgehangen.')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page).toHaveURL('/projects/kast-fur-sanne')
  await page.goto('/zoeken?q=afgehangen')
  const hit = page.getByRole('link', { name: /Deuren afgehangen/ })
  await expect(hit).toHaveAttribute('href', '/projects/kast-fur-sanne#2026-09-01')
  await expectNoUuid(page)
  await hit.click()
  await expect(page).toHaveURL('/projects/kast-fur-sanne#2026-09-01')
  await expect(page.locator('[id="2026-09-01"]')).toBeInViewport()
  await expectNoUuid(page)
})

test('renaming gives a new slug; the old one redirects, with the rest of the address, and stays taken', async ({
  page,
}) => {
  await page.goto('/projects/tuinbank/edit')
  await page.getByLabel('Titel').fill('Tuinbank van eiken')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page).toHaveURL('/projects/tuinbank-van-eiken')
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank van eiken' })).toBeVisible()

  // The old address leads here, replaced in the history.
  await page.goto('/')
  await page.goto('/projects/tuinbank')
  await expect(page).toHaveURL('/projects/tuinbank-van-eiken')
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank van eiken' })).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL('/')

  // A photo's and a form's address too.
  await page.goto('/projects/tuinbank/2026-10-04/2')
  await expect(page).toHaveURL('/projects/tuinbank-van-eiken/2026-10-04/2')
  await expect(page.getByRole('dialog', { name: 'Foto 2 van 3, 4 okt 2026' })).toBeVisible()
  await page.goto('/projects/tuinbank/edit')
  await expect(page).toHaveURL('/projects/tuinbank-van-eiken/edit')
  await expect(page.getByLabel('Titel')).toHaveValue('Tuinbank van eiken')

  // A new project with the old name doesn't take the old address.
  await page.goto('/projects/new')
  await page.getByLabel('Titel').fill('Tuinbank')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page).toHaveURL('/projects/tuinbank-2')
  await page.goto('/projects/tuinbank')
  await expect(page).toHaveURL('/projects/tuinbank-van-eiken')
})

test('a project titled like a route gets a fallback slug; an unknown slug is not found', async ({ page }) => {
  await page.goto('/projects/new')
  await page.getByLabel('Titel').fill('New')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page).toHaveURL('/projects/project')
  await expect(page.getByRole('heading', { level: 1, name: 'New' })).toBeVisible()
  await page.goto('/projects/bestaat-niet')
  await expect(page.getByRole('heading', { name: 'Project niet gevonden' })).toBeVisible()
})

test('a visitor’s addresses hold no UUID either', async ({ page }) => {
  await page.goto('/?bezoeker')
  await expect(page.getByRole('link', { name: /Tuinbank/ })).toHaveAttribute('href', '/projects/tuinbank')
  await expectNoUuid(page)
  await page.getByRole('link', { name: /Tuinbank/ }).click()
  await expect(page).toHaveURL('/projects/tuinbank')
  await expectNoUuid(page)
  await page.locator('.timeline img').first().click()
  await expect(page).toHaveURL('/projects/tuinbank/2026-10-25/1')
  await expectNoUuid(page)
})
