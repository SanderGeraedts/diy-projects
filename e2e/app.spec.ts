import { expect, test } from '@playwright/test'

test('shows the seeded demo projects with sync off', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('status')).toContainText('Demo data')
  await expect(page.getByRole('heading', { name: 'Garden bench' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bathroom shelf' })).toBeVisible()
})

test('opens a project with its timeline, newest entry first', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: /Garden bench/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Garden bench' })).toBeVisible()
  const dates = await page.locator('.timeline time').allTextContents()
  expect(dates).toEqual(['2026-10-25', '2026-10-11', '2026-10-04'])
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
  await page.goto('/projects/demo-bathroom-shelf')
  await expect(page.getByRole('heading', { level: 1, name: 'Bathroom shelf' })).toBeVisible()
})

test('the bundle contains no Funnel (ts.net) address', async ({ page }) => {
  await page.goto('/')
  const scripts = await page.locator('script[src]').evaluateAll((els) => els.map((e) => (e as HTMLScriptElement).src))
  for (const src of scripts) {
    const body = await (await page.request.get(src)).text()
    expect(body).not.toContain('ts.net')
  }
})
