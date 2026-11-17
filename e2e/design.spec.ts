import { existsSync } from 'node:fs'
import { expect, test } from '@playwright/test'

// D-0011: screenshot tests of /design in both colour schemes. Baselines come from CI's
// Linux runner, so the comparison is skipped elsewhere. To (re)make them, run
// `pnpm exec playwright test e2e/design.spec.ts --update-snapshots` on Linux (in CI) and
// commit the files under e2e/design.spec.ts-snapshots/.

for (const colorScheme of ['light', 'dark'] as const) {
  test(`/design looks right in ${colorScheme}`, async ({ page }) => {
    test.skip(process.platform !== 'linux', 'screenshot baselines are made on Linux (CI)')
    // Until the first baselines are committed, only a run with --update-snapshots takes them.
    const baseline = test.info().snapshotPath(`design-${colorScheme}.png`)
    test.skip(
      !existsSync(baseline) && !['all', 'changed'].includes(test.info().config.updateSnapshots),
      'no baseline yet: run with --update-snapshots on Linux and commit the result',
    )
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
