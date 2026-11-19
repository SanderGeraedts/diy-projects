import { expect, test, type Page } from '@playwright/test'

// T-0026 (D-0025): the read-only view for visitors who aren't signed in. In production it
// reads public projects from the NAS; previews and this build have no NAS (D-0006), so
// `?bezoeker` shows the same view with the seeded demo data from memory. Either way: no
// create, edit, delete, import or cover controls, and no local database, outbox or sync.

/** The names of this origin's IndexedDB databases; the app's is "diy-projects". */
const databases = (page: Page) =>
  page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))

test('a visitor sees projects, timelines and photos read-only, and the app never opens its database', async ({
  page,
}) => {
  await page.goto('/?bezoeker')
  const main = page.getByRole('main')
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Badkamerplank' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Nieuw project/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Zoeken' })).toHaveCount(0)
  // The overview's filters stay (D-0025).
  await expect(main.getByRole('button', { name: 'klaar' })).toBeVisible()

  await page.getByRole('link', { name: /Tuinbank/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
  expect(await page.locator('.timeline time').allTextContents()).toEqual(['25 okt 2026', '11 okt 2026', '4 okt 2026'])
  await expect(main.getByText('Poten en zitregels op lengte gezaagd.')).toBeVisible()
  await expect(main.getByRole('button')).toHaveCount(0)
  for (const name of [/Bewerken/, /Notitie toevoegen/, /Foto's toevoegen/, /Verwijderen/]) {
    await expect(main.getByRole('link', { name })).toHaveCount(0)
  }
  await expect(main.locator('input, textarea, select, form')).toHaveCount(0)

  await main.locator('.timeline img').first().click()
  const viewer = page.getByRole('dialog')
  await expect(viewer).toBeVisible()
  await expect(viewer.locator('img[data-current]')).toBeVisible()
  await expect(viewer.getByRole('button', { name: /omslagfoto/ })).toHaveCount(0)
  await expect(viewer.getByRole('button', { name: 'Verwijderen' })).toHaveCount(0)
  await viewer.getByRole('button', { name: 'Sluiten' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()

  for (const path of ['/projects/new', '/projects/demo-garden-bench/edit', '/projects/demo-garden-bench/entries/new', '/zoeken']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Niet gevonden' })).toBeVisible()
    await expect(page.getByRole('main').locator('input, textarea, select, form')).toHaveCount(0)
  }

  // No Dexie, so no outbox: the app's database was never created.
  expect(await databases(page)).not.toContain('diy-projects')
})

test('a visitor is told when the projects can’t be reached', async ({ page }) => {
  await page.goto('/?bezoeker=onbereikbaar')
  await expect(page.getByRole('main').getByText('Projecten zijn nu niet bereikbaar.')).toBeVisible()
  await page.goto('/projects/demo-garden-bench')
  await expect(page.getByRole('main').getByText('Projecten zijn nu niet bereikbaar.')).toBeVisible()
  expect(await databases(page)).not.toContain('diy-projects')
})

test('the owner’s demo comes back with ?bezoeker=uit, with the public switch on the form', async ({ page }) => {
  await page.goto('/?bezoeker')
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toBeVisible()
  await page.goto('/?bezoeker=uit')
  await page.getByRole('link', { name: /Nieuw project/ }).click()
  // D-0025: on by default, saying what that means.
  const toggle = page.getByRole('switch', { name: 'Openbaar' })
  await expect(toggle).toBeChecked()
  await expect(page.getByText(/Iedereen kan dit project zien/)).toBeVisible()
  await toggle.uncheck()
  await expect(page.getByText('Alleen jij ziet dit project.')).toBeVisible()
})
