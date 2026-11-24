import { expect, test, type Page } from '@playwright/test'

// T-0030 (D-0032): the overview lists projects by their newest live photo, by time taken;
// projects without a photo come last, by last edit. On the seeded demo data (G-0019) every
// project has the same last edit, so only the photos set the order: Fietsenrek 1 nov 2026,
// Tuinbank 25 okt, Badkamerplank 16 aug, Zolderisolatie 20 jun.

const BY_NEWEST_PHOTO = ['Fietsenrek voor de schuur', 'Tuinbank', 'Badkamerplank', 'Zolderisolatie']

const cards = (page: Page) => page.locator('section > ul > li h2')
const tag = (page: Page, name: string) => page.getByRole('group', { name: 'Tags' }).getByRole('button', { name })

declare global {
  interface Window {
    __firstCards?: string[]
  }
}

/**
 * Records the card titles the first time any card is in the page, before any later render
 * could reorder them, so a test reads the order on first render (*Done when* 5).
 */
async function recordFirstRender(page: Page) {
  await page.addInitScript(() => {
    const read = () => [...document.querySelectorAll('section > ul > li h2')].map((h) => h.textContent ?? '')
    new MutationObserver((_, observer) => {
      const titles = read()
      if (titles.length === 0) return
      window.__firstCards = titles
      observer.disconnect()
    }).observe(document, { childList: true, subtree: true })
  })
}

const firstCards = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => window.__firstCards)).toBeDefined()
  return page.evaluate(() => window.__firstCards)
}

for (const [who, path] of [
  ['the owner', '/'],
  ['a visitor', '/?bezoeker'],
] as const) {
  test(`${who} sees the projects by newest photo, from the first render, and the tag filter keeps the order`, async ({
    page,
  }) => {
    await recordFirstRender(page)
    await page.goto(path)
    expect(await firstCards(page)).toEqual(BY_NEWEST_PHOTO)
    await expect(cards(page)).toHaveText(BY_NEWEST_PHOTO)

    await tag(page, '#hout').click()
    await expect(cards(page)).toHaveText(['Tuinbank', 'Badkamerplank'])
  })
}

test('editing a project leaves its place; deleting its only photo moves it last', async ({ page }) => {
  await page.goto('/')
  await expect(cards(page)).toHaveText(BY_NEWEST_PHOTO)

  // An edit no longer moves a project to the top.
  await page.getByRole('heading', { name: 'Zolderisolatie' }).click()
  await page.getByRole('link', { name: 'Bewerken' }).click()
  await page.getByLabel('Omschrijving').fill('Minerale wol tussen de sporen; de folie komt later.')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.locator('article header').getByText('de folie komt later.')).toBeVisible()
  await page.getByRole('link', { name: '← Alle projecten' }).click()
  await expect(cards(page)).toHaveText(BY_NEWEST_PHOTO)

  // Without a live photo, Fietsenrek goes after every project with one.
  const title = 'Fietsenrek voor de schuur'
  await page.getByRole('heading', { name: title }).click()
  await page.getByRole('link', { name: `${title}, 1 nov 2026` }).click()
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page).toHaveURL('/projects/fietsenrek-voor-de-schuur')
  await page.getByRole('link', { name: '← Alle projecten' }).click()
  await expect(cards(page)).toHaveText(['Tuinbank', 'Badkamerplank', 'Zolderisolatie', title])
})

test('a new project without photos shows after the demo projects', async ({ page }) => {
  await page.goto('/')
  await expect(cards(page)).toHaveText(BY_NEWEST_PHOTO)

  await page.getByRole('link', { name: 'Nieuw project' }).click()
  await page.getByLabel('Titel').fill('Werkbank')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Werkbank' })).toBeVisible()
  await page.getByRole('link', { name: '← Alle projecten' }).click()
  await expect(cards(page)).toHaveText([...BY_NEWEST_PHOTO, 'Werkbank'])
})
