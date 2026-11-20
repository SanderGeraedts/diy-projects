import { expect, test, type Page } from '@playwright/test'

// T-0004: create a project, edit its status and tags, reload and still see the changes;
// once online and once with the network off.

async function createAndEdit(page: Page, title: string, slug: string) {
  await page.getByRole('link', { name: 'Nieuw project' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Nieuw project' })).toBeVisible()

  // Title is required.
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('alert')).toHaveText('Geef het project een titel.')

  await page.getByLabel('Titel').fill(title)
  await page.getByLabel('Omschrijving').fill('Van steigerhout.')
  await page.getByLabel('Status').selectOption({ label: 'idee' })
  const tags = page.getByRole('textbox', { name: 'Tags', exact: true })
  await tags.fill('  Hout ')
  await tags.press('Enter')
  await tags.fill('Schuur,')
  await tags.fill('HOUT') // already chosen: kept once
  await tags.press('Enter')
  await expect(page.getByRole('list', { name: 'Gekozen tags' }).getByRole('listitem')).toHaveText([
    /hout/,
    /schuur/,
  ])
  // A tag already in use (from the demo data) is offered as a suggestion; typing filters.
  await tags.fill('tu')
  await page.getByRole('button', { name: 'Tag tuin toevoegen' }).click()
  await expect(tags).toHaveValue('')
  await page.getByRole('button', { name: 'Opslaan' }).click()

  // Saving opens the new project's page, at its slug (D-0029).
  await expect(page).toHaveURL(`/projects/${slug}`)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  const header = page.locator('article header')
  await expect(header.getByText('idee', { exact: true })).toBeVisible()
  await expect(header.getByRole('listitem')).toHaveText(['hout', 'schuur', 'tuin'])
  await expect(header.getByText('Van steigerhout.')).toBeVisible()

  // Edit: the same form, filled in.
  await page.getByRole('link', { name: 'Bewerken' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Project bewerken' })).toBeVisible()
  await expect(page.getByLabel('Titel')).toHaveValue(title)
  await expect(page.getByLabel('Status')).toHaveValue('idea')
  await page.getByLabel('Status').selectOption({ label: 'bezig' })
  await page.getByRole('button', { name: 'Tag schuur verwijderen' }).click()
  await page.getByRole('textbox', { name: 'Tags', exact: true }).fill('Werkbank') // typed, not yet added: still saved
  await page.getByRole('button', { name: 'Opslaan' }).click()

  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  const projectUrl = page.url()
  await page.reload()
  await expect(page).toHaveURL(projectUrl)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(header.getByText('bezig', { exact: true })).toBeVisible()
  await expect(header.getByRole('listitem')).toHaveText(['hout', 'tuin', 'werkbank'])

  // And on the overview.
  await page.getByRole('link', { name: 'Alle projecten' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

test('creates a project, edits its status and tags, and keeps them after a reload', async ({ page }) => {
  await page.goto('/')
  await createAndEdit(page, 'Werkbank', 'werkbank')
})

test('creates and edits a project offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker
  await context.setOffline(true)
  await createAndEdit(page, 'Schuurdeur', 'schuurdeur')
  expect(await page.evaluate(() => navigator.onLine)).toBe(false)
})

test('opens the edit form directly and cancels back to the project', async ({ page }) => {
  await page.goto('/projects/badkamerplank/edit')
  await expect(page.getByLabel('Titel')).toHaveValue('Badkamerplank')
  await page.getByRole('button', { name: 'Annuleren' }).click()
  await expect(page).toHaveURL(/\/projects\/badkamerplank$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Badkamerplank' })).toBeVisible()
})
