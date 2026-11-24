import { expect, test, type Page } from '@playwright/test'

// T-0009: choose a project's cover and delete photos from the viewer, offline, on the seeded
// demo data (D-0006). Tuinbank's cover is the photo of 25 okt 2026, its newest; 11 okt has
// two photos and 4 okt three. Fietsenrek has one entry with one photo.

const bench = 'demo-garden-bench'
const benchPhoto = (entry: number, n: number) => `${bench}-entry-${entry}-photo-${n}`
// D-0029 (T-0027): addresses are the slug, the entry's day and the photo's place.
const benchUrl = '/projects/tuinbank'
const DAYS = ['', '2026-10-04', '2026-10-11', '2026-10-25']
const benchPhotoUrl = (entry: number, n: number) => `${benchUrl}/${DAYS[entry]}/${n}`

async function goOffline(page: Page) {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker
  await page.context().setOffline(true)
}

/** The photo on a project's card in the overview, or none for the no-photo tile. */
function cardImage(page: Page, title: string) {
  return page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: title }) }).locator('img')
}

async function openProject(page: Page, title: string) {
  await page.getByRole('heading', { name: title }).click()
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
}

async function backToOverview(page: Page) {
  await page.getByRole('link', { name: '← Alle projecten' }).click()
  await expect(page).toHaveURL('/')
}

test('a photo becomes the cover, and the overview card shows it, offline', async ({ page }) => {
  await goOffline(page)
  await expect(cardImage(page, 'Tuinbank')).toHaveAttribute('data-photo-id', benchPhoto(3, 1))

  await openProject(page, 'Tuinbank')
  await page.getByRole('link', { name: 'Tuinbank, 4 okt 2026' }).nth(1).click()
  await expect(page).toHaveURL(benchPhotoUrl(1, 2))
  await page.getByRole('button', { name: 'Als omslagfoto gebruiken' }).click()
  await expect(page.getByRole('button', { name: 'Dit is de omslagfoto' })).toBeDisabled()

  await page.getByRole('button', { name: 'Sluiten' }).click()
  await backToOverview(page)
  await expect(cardImage(page, 'Tuinbank')).toHaveAttribute('data-photo-id', benchPhoto(1, 2))
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})

test('deleting the cover asks first, then falls back to the newest remaining photo, offline', async ({ page }) => {
  await goOffline(page)
  await openProject(page, 'Tuinbank')
  await page.getByRole('link', { name: 'Tuinbank, 25 okt 2026' }).click()
  await expect(page.getByRole('button', { name: 'Dit is de omslagfoto' })).toBeVisible()

  // Annuleren keeps the photo.
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  const confirm = page.getByRole('alertdialog', { name: 'Deze foto verwijderen?' })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Annuleren' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(page.locator('img[data-current]')).toHaveAttribute('data-photo-id', benchPhoto(3, 1))

  // Verwijderen deletes it; it was the entry's only photo, so the viewer shows the next day's
  // first (T-0029, D-0031), and Sluiten goes back to the project.
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  await confirm.getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page).toHaveURL(benchPhotoUrl(2, 1))
  await page.getByRole('button', { name: 'Sluiten' }).click()
  await expect(page).toHaveURL(benchUrl)
  await expect(page.getByRole('link', { name: 'Tuinbank, 25 okt 2026' })).toHaveCount(0)
  // The entry keeps its date and note.
  await expect(page.getByText('Eerste laag olie. Na een droge week nog een tweede.')).toBeVisible()
  await expect(page.getByText("Geen foto's meer")).toHaveCount(0)

  // The cover falls back to the newest remaining photo: 11 okt, the second.
  await backToOverview(page)
  await expect(cardImage(page, 'Tuinbank')).toHaveAttribute('data-photo-id', benchPhoto(2, 2))

  // A deleted photo is gone from the viewer too: its URL no longer opens it.
  await page.goto(benchPhotoUrl(3, 1))
  await expect(page.getByRole('heading', { name: 'Foto niet gevonden' })).toBeVisible()
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})

test('deleting a photo shows the next one of the entry, and leaves the others', async ({ page }) => {
  await goOffline(page)
  await openProject(page, 'Tuinbank')
  await page.getByRole('link', { name: 'Tuinbank, 4 okt 2026' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 3, 4 okt 2026' })).toBeVisible()

  await page.getByRole('button', { name: 'Verwijderen' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click()
  // The next photo takes the deleted one's place, so the address stays.
  await expect(page).toHaveURL(benchPhotoUrl(1, 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 2, 4 okt 2026' })).toBeVisible()
  await expect(page.locator('img[data-current]')).toHaveAttribute('data-photo-id', benchPhoto(1, 2))

  await page.getByRole('button', { name: 'Sluiten' }).click()
  await expect(page.getByRole('link', { name: 'Tuinbank, 4 okt 2026' })).toHaveCount(2)
  // The cover was another photo, so it stays.
  await backToOverview(page)
  await expect(cardImage(page, 'Tuinbank')).toHaveAttribute('data-photo-id', benchPhoto(3, 1))
})

test("an entry left without photos or note says Geen foto's meer; the card shows the no-photo tile", async ({
  page,
}) => {
  await goOffline(page)
  const title = 'Fietsenrek voor de schuur'
  await openProject(page, title)

  await page.getByRole('button', { name: 'Notitie van 1 nov 2026 bewerken' }).click()
  await page.getByLabel('Notitie van 1 nov 2026').fill('')
  await page.getByRole('button', { name: 'Opslaan' }).click()

  await page.getByRole('link', { name: `${title}, 1 nov 2026` }).click()
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page).toHaveURL('/projects/fietsenrek-voor-de-schuur')

  await expect(page.getByRole('heading', { level: 2, name: '1 nov 2026' })).toBeVisible()
  await expect(page.getByText("Geen foto's meer")).toBeVisible()

  await backToOverview(page)
  await expect(cardImage(page, title)).toHaveCount(0)
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})
