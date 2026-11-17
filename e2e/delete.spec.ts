import { expect, test, type Page } from '@playwright/test'

// T-0010 (D-0014): deleting an entry or a project, offline, on the seeded demo data (D-0006).
// Tuinbank has three entries: 4 okt (3 photos), 11 okt (2) and 25 okt (1). It is the only
// project tagged #tuin. A delete is a tombstone, so a reload must not bring anything back.

const bench = 'demo-garden-bench'
const benchPhoto = (entry: number, n: number) => `${bench}-entry-${entry}-photo-${n}`
const cards = (page: Page) => page.locator('section > ul > li h2')

async function goOffline(page: Page) {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker
  await expect(cards(page)).toHaveCount(4)
  await page.context().setOffline(true)
}

async function searchFor(page: Page, query: string) {
  await page.goto(`/zoeken?q=${encodeURIComponent(query)}`)
  await expect(page.getByRole('searchbox')).toHaveValue(query)
}

test('deletes an entry and its photos offline, and it stays gone after a reload', async ({ page }) => {
  await goOffline(page)
  await page.getByRole('heading', { name: 'Tuinbank' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
  const note = page.getByText('Frame gelijmd en geschroefd; haaks binnen 2 mm.')
  await expect(note).toBeVisible()

  // Annuleren keeps it.
  await page.getByRole('button', { name: 'Notitie van 11 okt 2026 verwijderen' }).click()
  const confirm = page.getByRole('alertdialog', { name: "Notitie van 11 okt 2026 verwijderen, met 2 foto's?" })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Annuleren' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(note).toBeVisible()

  await page.getByRole('button', { name: 'Notitie van 11 okt 2026 verwijderen' }).click()
  await confirm.getByRole('button', { name: 'Verwijderen' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(note).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tuinbank, 11 okt 2026' })).toHaveCount(0)
  // The other entries stay.
  await expect(page.getByRole('link', { name: 'Tuinbank, 4 okt 2026' })).toHaveCount(3)
  await expect(page.getByRole('link', { name: 'Tuinbank, 25 okt 2026' })).toHaveCount(1)

  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tuinbank, 4 okt 2026' })).toHaveCount(3)
  await expect(note).toHaveCount(0)

  // Gone from the viewer and from search too.
  await page.goto(`/projects/${bench}/photos/${benchPhoto(2, 1)}`)
  await expect(page.getByRole('heading', { name: 'Foto niet gevonden' })).toBeVisible()
  await searchFor(page, 'haaks')
  await expect(page.getByText('Niets gevonden.')).toBeVisible()
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})

test('deletes a project with its entries and photos offline, and it stays gone after a reload', async ({ page }) => {
  await goOffline(page)
  await page.getByRole('heading', { name: 'Tuinbank' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()

  // Annuleren keeps it.
  await page.getByRole('button', { name: 'Project verwijderen' }).click()
  const confirm = page.getByRole('alertdialog', { name: "Project 'Tuinbank' verwijderen, met 3 notities en 6 foto's?" })
  await expect(confirm).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(confirm).toHaveCount(0)

  await page.getByRole('button', { name: 'Project verwijderen' }).click()
  await confirm.getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page).toHaveURL('/')
  await expect(cards(page)).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toHaveCount(0)
  // Its tag is gone from the filters.
  await expect(page.getByRole('group', { name: 'Tags' }).getByRole('button', { name: '#tuin' })).toHaveCount(0)

  await page.reload()
  await expect(cards(page)).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toHaveCount(0)
  await page.goto('/?tag=hout')
  await expect(cards(page)).toHaveText(['Badkamerplank'])

  // Gone from the project page, the viewer and search too.
  await page.goto(`/projects/${bench}`)
  await expect(page.getByRole('heading', { name: 'Project niet gevonden' })).toBeVisible()
  await page.goto(`/projects/${bench}/photos/${benchPhoto(1, 1)}`)
  await expect(page.getByRole('heading', { name: 'Foto niet gevonden' })).toBeVisible()
  await searchFor(page, 'olie')
  await expect(page.getByText('Niets gevonden.')).toBeVisible()
  await searchFor(page, 'tuinbank')
  await expect(page.getByText('Niets gevonden.')).toBeVisible()
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})
