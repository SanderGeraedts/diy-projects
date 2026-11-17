import { expect, test } from '@playwright/test'

// D-0020: screenshot tests of /design in both colour schemes. Baselines come from CI's
// Linux runner, so the comparison is skipped elsewhere. CI runs with
// --update-snapshots=missing: a missing baseline is written (the test fails that once) and
// uploaded as the screenshot-baselines artifact; commit its files under
// e2e/design.spec.ts-snapshots/. To replace a baseline, delete it and let CI make a new one.

for (const colorScheme of ['light', 'dark'] as const) {
  test(`/design looks right in ${colorScheme}`, async ({ page }) => {
    test.skip(process.platform !== 'linux', 'screenshot baselines are made on Linux (CI)')
    await page.emulateMedia({ colorScheme })
    await page.goto('/design')
    await expect(page.getByRole('heading', { level: 1, name: 'Ontwerp' })).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot(`design-${colorScheme}.png`, { fullPage: true })
  })
}

test('/design renders the tokens and components', async ({ page }) => {
  await page.goto('/design')
  await expect(page.getByRole('heading', { level: 1, name: 'Ontwerp' })).toBeVisible()
  for (const label of ['idee', 'bezig', 'gepauzeerd', 'klaar']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
  }
})
