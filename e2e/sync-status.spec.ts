import { expect, test } from '@playwright/test'

// T-0018: the sync status. Sync runs only in production (D-0006), so the e2e build has no
// sync engine: /design/sync-status (not in production builds) renders the real status
// component with a stubbed engine state, picked with ?state=. Offline is the browser's own.

const status = (page: import('@playwright/test').Page) => page.getByRole('region', { name: 'Synchronisatie' })

test('the app shows only the demo banner, no sync status, outside production (D-0006)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Demodata')
  await expect(status(page)).toHaveCount(0)
})

test('everything synced: nothing shown', async ({ page }) => {
  await page.goto('/design/sync-status?state=synced')
  await expect(page.getByRole('heading', { name: 'Synchronisatiestatus' })).toBeVisible()
  await expect(status(page)).toHaveCount(0)
})

test('pending changes: the count, details, and "Nu synchroniseren"', async ({ page }) => {
  await page.goto('/design/sync-status?state=pending')
  const summary = status(page).getByRole('button', { name: '3 wijzigingen niet gesynchroniseerd' })
  await summary.click()
  await expect(status(page).getByText('Laatst gesynchroniseerd')).toBeVisible()
  await expect(status(page).getByText('17 nov 2026', { exact: false })).toBeVisible()
  await status(page).getByRole('button', { name: 'Nu synchroniseren' }).click()
  await expect(status(page)).toHaveCount(0) // the stubbed run cleared the outbox
})

test('an error: the last error in plain Dutch', async ({ page }) => {
  await page.goto('/design/sync-status?state=error')
  await status(page).getByRole('button', { name: 'Synchroniseren mislukt · 2 wijzigingen niet gesynchroniseerd' }).click()
  await expect(status(page).getByText('Laatste fout')).toBeVisible()
  await expect(status(page).getByText('Geen verbinding met de server.')).toBeVisible()
})

test('offline: changes are synced later', async ({ page, context }) => {
  await page.goto('/design/sync-status?state=pending')
  await expect(status(page).getByRole('button', { name: '3 wijzigingen niet gesynchroniseerd' })).toBeVisible()
  await context.setOffline(true)
  const summary = status(page).getByRole('button', { name: 'Offline – wijzigingen worden later gesynchroniseerd' })
  await summary.click()
  await expect(status(page).getByRole('button', { name: 'Nu synchroniseren' })).toBeDisabled()
  await context.setOffline(false)
  await expect(status(page).getByRole('button', { name: '3 wijzigingen niet gesynchroniseerd' })).toBeVisible()
})

test('sign-in expired: a link to sign in again (D-0013)', async ({ page }) => {
  await page.goto('/design/sync-status?state=expired')
  await expect(status(page).getByText('1 wijziging niet gesynchroniseerd')).toBeVisible()
  const link = status(page).getByRole('link', { name: 'Opnieuw inloggen om te synchroniseren' })
  await expect(link).toHaveAttribute('href', '/account')
})

test('storage not persisted: a warning with how to fix it', async ({ page }) => {
  await page.goto('/design/sync-status?state=storage')
  await status(page).getByRole('button', { name: 'Opslag niet beveiligd – installeer de app' }).click()
  await expect(status(page).getByText(/wat nog niet gesynchroniseerd is, gaat dan verloren/)).toBeVisible()
  await expect(status(page).getByText(/Installeer de app/)).toBeVisible()
})
