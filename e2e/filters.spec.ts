import { expect, type Page, test } from '@playwright/test'

// T-0011: status and tag filters on the seeded demo data (D-0006).

const cards = (page: Page) => page.locator('section > ul > li h2')
const status = (page: Page, name: string) => page.getByRole('group', { name: 'Status' }).getByRole('button', { name })
const tag = (page: Page, name: string) => page.getByRole('group', { name: 'Tags' }).getByRole('button', { name })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(cards(page)).toHaveCount(4)
})

test('filters by a status', async ({ page }) => {
  await status(page, 'klaar').click()
  await expect(status(page, 'klaar')).toHaveAttribute('aria-pressed', 'true')
  await expect(cards(page)).toHaveText(['Badkamerplank'])
  // Statuses combine as "any of".
  await status(page, 'idee').click()
  await expect(cards(page)).toHaveCount(2)
  expect((await cards(page).allTextContents()).sort()).toEqual(['Badkamerplank', 'Fietsenrek voor de schuur'])
})

test('filters by a tag', async ({ page }) => {
  await tag(page, '#hout').click()
  await expect(cards(page)).toHaveCount(2)
  expect((await cards(page).allTextContents()).sort()).toEqual(['Badkamerplank', 'Tuinbank'])
  // Tags combine as "all of".
  await tag(page, '#tuin').click()
  await expect(cards(page)).toHaveText(['Tuinbank'])
})

test('combines status and tag, and keeps them after a reload', async ({ page }) => {
  await tag(page, '#hout').click()
  await status(page, 'bezig').click()
  await expect(cards(page)).toHaveText(['Tuinbank'])

  await page.reload()
  await expect(status(page, 'bezig')).toHaveAttribute('aria-pressed', 'true')
  await expect(tag(page, '#hout')).toHaveAttribute('aria-pressed', 'true')
  await expect(cards(page)).toHaveText(['Tuinbank'])
})

test('says so when nothing matches, and clears the filters', async ({ page }) => {
  await tag(page, '#metaal').click()
  await status(page, 'klaar').click()
  await expect(page.getByText('Geen projecten met deze filters.')).toBeVisible()
  await expect(cards(page)).toHaveCount(0)

  await page.getByRole('button', { name: 'Filters wissen' }).first().click()
  await expect(cards(page)).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Filters wissen' })).toHaveCount(0)
  expect(new URL(page.url()).search).toBe('')
})
