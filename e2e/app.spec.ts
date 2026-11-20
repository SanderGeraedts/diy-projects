import { expect, test } from '@playwright/test'

test('shows the seeded demo projects with sync off', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('Demodata')
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Badkamerplank' })).toBeVisible()
})

test('has no sign-in outside production (D-0006, T-0015)', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toBeVisible()
  await expect(page.getByRole('link', { name: /inloggen|account/i })).toHaveCount(0)
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: 'Niet gevonden' })).toBeVisible()
  await expect(page.getByLabel('Wachtwoord')).toHaveCount(0)
})

test('opens a project with its timeline, newest entry first', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Tuinbank/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
  const dates = await page.locator('.timeline time').allTextContents()
  expect(dates).toEqual(['25 okt 2026', '11 okt 2026', '4 okt 2026'])
})

test('is installable: manifest with icons, and an active service worker', async ({ page }) => {
  await page.goto('/')
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref).toBeTruthy()
  const manifest = await (await page.request.get(manifestHref!)).json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  )
  const active = await page.evaluate(async () => !!(await navigator.serviceWorker.ready).active)
  expect(active).toBe(true)
})

test('opens offline once loaded', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker
  await context.setOffline(true)
  await page.goto('/projects/badkamerplank')
  await expect(page.getByRole('heading', { level: 1, name: 'Badkamerplank' })).toBeVisible()
  // D-0011: Poppins comes from the precache, so it is in use with the network off.
  const poppins = await page.evaluate(async () => {
    await document.fonts.ready
    return ['400 1em Poppins', '600 1em Poppins', 'italic 400 1em Poppins'].map((f) => document.fonts.check(f))
  })
  expect(poppins).toEqual([true, true, true])
  const family = await page.locator('h1').first().evaluate((el) => getComputedStyle(el).fontFamily)
  expect(family).toMatch(/^"?Poppins/)
})

test('the bundle contains no Funnel (ts.net) address', async ({ page }) => {
  await page.goto('/')
  const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src))
  for (const src of scripts) {
    const body = await (await page.request.get(src)).text()
    expect(body).not.toContain('ts.net')
  }
})
