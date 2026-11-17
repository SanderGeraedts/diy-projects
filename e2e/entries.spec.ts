import { expect, test, type Page } from '@playwright/test'

// T-0005: add an entry, add a second note on the same day (it lands in the same entry),
// edit the note, and see the timeline newest first; once online and once offline.

async function addEditEntries(page: Page) {
  await page.goto('/projects/demo-garden-bench')
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
  const dates = page.locator('.timeline time')
  const entries = page.locator('.timeline > li')
  await expect(dates).toHaveText(['25 okt 2026', '11 okt 2026', '4 okt 2026'])

  // Add: the date is today by default; an empty note is refused.
  await page.getByRole('link', { name: 'Notitie toevoegen' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Notitie toevoegen' })).toBeVisible()
  const today = await page.evaluate(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  await expect(page.getByLabel('Datum')).toHaveValue(today)
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('alert')).toHaveText('Schrijf een notitie.')

  await page.getByLabel('Datum').fill('2026-10-18')
  await expect(page.getByTestId('existing-entry')).toHaveCount(0)
  await page.getByLabel('Notitie').fill('Zitting geschuurd.\nKorrel 120, dan 180.')
  await page.getByRole('button', { name: 'Opslaan' }).click()

  // Back on the project, the new entry sits between the older and newer ones.
  await expect(page).toHaveURL(/\/projects\/demo-garden-bench$/)
  await expect(dates).toHaveText(['25 okt 2026', '18 okt 2026', '11 okt 2026', '4 okt 2026'])
  const added = entries.nth(1)
  // Line breaks are kept.
  expect(await added.locator('p').first().innerText()).toBe('Zitting geschuurd.\nKorrel 120, dan 180.')

  // A second note on the same day opens that day's entry and lands in it.
  await page.getByRole('link', { name: 'Notitie toevoegen' }).click()
  await page.getByLabel('Datum').fill('2026-10-18')
  await expect(page.getByTestId('existing-entry')).toContainText('Zitting geschuurd.')
  await page.getByLabel('Notitie').fill('Randen afgerond.')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(dates).toHaveText(['25 okt 2026', '18 okt 2026', '11 okt 2026', '4 okt 2026'])
  expect(await added.locator('p').first().innerText()).toBe(
    'Zitting geschuurd.\nKorrel 120, dan 180.\n\nRanden afgerond.',
  )

  // A newer day goes on top.
  await page.getByRole('link', { name: 'Notitie toevoegen' }).click()
  await page.getByLabel('Datum').fill('2026-11-02')
  await page.getByLabel('Notitie').fill('Bank in de tuin gezet.')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(dates).toHaveText(['2 nov 2026', '25 okt 2026', '18 okt 2026', '11 okt 2026', '4 okt 2026'])

  // Edit a note in place; cancel keeps the old text.
  await page.getByRole('button', { name: 'Notitie van 18 okt 2026 bewerken' }).click()
  const editor = page.getByRole('textbox', { name: 'Notitie van 18 okt 2026' })
  await expect(editor).toHaveValue('Zitting geschuurd.\nKorrel 120, dan 180.\n\nRanden afgerond.')
  await editor.fill('Weggegooid')
  await page.getByRole('button', { name: 'Annuleren' }).click()
  await expect(entries.nth(2).locator('p').first()).toHaveText(/^Zitting geschuurd\./)
  await page.getByRole('button', { name: 'Notitie van 18 okt 2026 bewerken' }).click()
  await editor.fill('Zitting geschuurd tot 180.\nRanden afgerond.')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(editor).toHaveCount(0)

  // Kept after a reload.
  await page.reload()
  await expect(dates).toHaveText(['2 nov 2026', '25 okt 2026', '18 okt 2026', '11 okt 2026', '4 okt 2026'])
  expect(await entries.nth(2).locator('p').first().innerText()).toBe('Zitting geschuurd tot 180.\nRanden afgerond.')
}

test('adds entries, merges a second note on the same day, and edits a note', async ({ page }) => {
  await addEditEntries(page)
})

test('adds and edits entries offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker
  await context.setOffline(true)
  await addEditEntries(page)
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})
