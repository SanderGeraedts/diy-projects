import { expect, test, type Page } from '@playwright/test'

// T-0012: search runs on the device's local copy, so it works with the network off.
async function goOffline(page: Page, context: import('@playwright/test').BrowserContext) {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toBeVisible()
  await context.setOffline(true)
}

test('finds a project by a title word, offline, and opens it', async ({ page, context }) => {
  await goOffline(page, context)
  await page.getByRole('link', { name: 'Zoeken' }).click()
  await page.getByRole('searchbox').fill('fiets')
  const result = page.getByRole('link', { name: 'Fietsenrek voor de schuur' })
  await expect(result).toBeVisible()
  await expect(result.locator('mark')).toHaveText('Fiets')
  await expect(page.getByText('1 project gevonden.')).toBeVisible()
  await result.click()
  await expect(page.getByRole('heading', { level: 1, name: 'Fietsenrek voor de schuur' })).toBeVisible()
})

test('finds an entry by a note word, offline, and opens that entry', async ({ page, context }) => {
  await goOffline(page, context)
  await page.getByRole('link', { name: 'Zoeken' }).click()
  await page.getByRole('searchbox').fill('DIAMANT')
  const hit = page.getByRole('link', { name: /diamantboor in de tegels/ })
  await expect(hit).toBeVisible()
  await expect(hit.locator('mark')).toHaveText('diamant')
  await hit.click()
  // D-0029 (T-0027): the project's slug and the entry's day, never an id.
  await expect(page).toHaveURL(/\/projects\/badkamerplank#2026-08-15$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Badkamerplank' })).toBeVisible()
  await expect(page.locator('[id="2026-08-15"]')).toBeInViewport()
})

test('keeps the query in the URL and shows when nothing matches', async ({ page }) => {
  await page.goto('/zoeken?q=olie')
  await expect(page.getByRole('searchbox')).toHaveValue('olie')
  await expect(page.getByRole('link', { name: /Eerste laag olie/ })).toBeVisible()
  await page.getByRole('searchbox').fill('xyzzy')
  await expect(page.getByText('Niets gevonden.')).toBeVisible()
  await expect(page).toHaveURL(/q=xyzzy/)
})
