import { expect, test, type Page } from '@playwright/test'

// T-0022 (D-0014): the bin ("Prullenbak") on the seeded demo data (D-0006). Previews and dev
// have no NAS, so "Definitief verwijderen" removes the demo data from this browser only; the
// NAS side is tested against a throwaway PocketBase in CI (deploy/nas/smoke-test.sh and
// src/sync/*.pocketbase.test.ts). Tuinbank has three entries: 4 okt (3 photos), 11 okt (2)
// and 25 okt (1).

const bench = 'demo-garden-bench'
const cards = (page: Page) => page.locator('section > ul > li h2')

async function deleteProject(page: Page, title: string) {
  await page.goto('/')
  await page.getByRole('heading', { name: title }).click()
  await page.getByRole('button', { name: 'Project verwijderen' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page).toHaveURL('/')
}

async function deleteEntry(page: Page, day: string) {
  await page.goto(`/projects/${bench}`)
  await page.getByRole('button', { name: `Notitie van ${day} verwijderen` }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
}

async function openBin(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: 'Prullenbak' }).click()
  await expect(page).toHaveURL('/prullenbak')
  await expect(page.getByRole('heading', { level: 1, name: 'Prullenbak' })).toBeVisible()
}

const items = (page: Page) => page.getByRole('main').getByRole('listitem')

test('the bin is empty to start with, and reached from the overview', async ({ page }) => {
  await openBin(page)
  await expect(page.getByText('De prullenbak is leeg.')).toBeVisible()
  await expect(items(page)).toHaveCount(0)
})

test('restores a deleted project with its entries and photos, and it stays after a reload', async ({ page }) => {
  await deleteProject(page, 'Tuinbank')
  await expect(cards(page)).toHaveCount(3)

  await openBin(page)
  await expect(items(page)).toHaveCount(1)
  const item = items(page).first()
  await expect(item.getByRole('heading', { name: "Project 'Tuinbank'" })).toBeVisible()
  await expect(item).toContainText("3 notities en 6 foto's")

  await item.getByRole('button', { name: "Project 'Tuinbank' terugzetten" }).click()
  await expect(page.getByRole('status').filter({ hasText: "Project 'Tuinbank' is teruggezet." })).toBeVisible()
  await expect(page.getByText('De prullenbak is leeg.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('De prullenbak is leeg.')).toBeVisible()
  await page.goto('/')
  await expect(cards(page)).toHaveCount(4)
  await page.goto(`/projects/${bench}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Tuinbank, 4 okt 2026' })).toHaveCount(3)
  await expect(page.getByRole('link', { name: 'Tuinbank, 11 okt 2026' })).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Tuinbank, 25 okt 2026' })).toHaveCount(1)
})

test('lists newest first; an entry deleted before its project stays in the bin when the project comes back', async ({
  page,
}) => {
  await deleteEntry(page, '25 okt 2026')
  await deleteProject(page, 'Badkamerplank')
  await openBin(page)
  await expect(items(page).getByRole('heading')).toHaveText(["Project 'Badkamerplank'", 'Notitie van 25 okt 2026'])
  await expect(items(page).nth(1)).toContainText('In Tuinbank')
  await expect(items(page).nth(1)).toContainText('1 foto')

  // Tuinbank too: its entry deleted earlier is part of it now, and not listed on its own.
  await deleteProject(page, 'Tuinbank')
  await openBin(page)
  await expect(items(page).getByRole('heading')).toHaveText(["Project 'Tuinbank'", "Project 'Badkamerplank'"])
  await expect(items(page).first()).toContainText("2 notities en 5 foto's")
  await items(page).first().getByRole('button', { name: /terugzetten/ }).click()
  await expect(items(page).getByRole('heading')).toHaveText(["Project 'Badkamerplank'", 'Notitie van 25 okt 2026'])
})

test('deletes an entry for good after asking, and it doesn’t come back after a reload', async ({ page }) => {
  await deleteEntry(page, '11 okt 2026')
  await openBin(page)
  const item = items(page).first()
  await expect(item.getByRole('heading', { name: 'Notitie van 11 okt 2026' })).toBeVisible()
  await expect(item).toContainText('In Tuinbank · Verwijderd op')
  await expect(item).toContainText("2 foto's")

  // Annuleren keeps it.
  await item.getByRole('button', { name: 'Notitie van 11 okt 2026 definitief verwijderen' }).click()
  const confirm = page.getByRole('alertdialog', {
    name: "Notitie van 11 okt 2026 definitief verwijderen, met 2 foto's? Dit kan niet ongedaan worden gemaakt.",
  })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Annuleren' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(items(page)).toHaveCount(1)

  await item.getByRole('button', { name: 'Notitie van 11 okt 2026 definitief verwijderen' }).click()
  await confirm.getByRole('button', { name: 'Definitief verwijderen' }).click()
  await expect(confirm).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Notitie van 11 okt 2026 is definitief verwijderd.' })).toBeVisible()
  await expect(page.getByText('De prullenbak is leeg.')).toBeVisible()

  await page.reload()
  await expect(page.getByText('De prullenbak is leeg.')).toBeVisible()
  await page.goto(`/projects/${bench}`)
  await expect(page.getByRole('link', { name: 'Tuinbank, 11 okt 2026' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Tuinbank, 4 okt 2026' })).toHaveCount(3)
  // Its photos are gone from this device, not just hidden.
  const ids = await page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('diy-projects')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const keys = open.result.transaction('photos').objectStore('photos').getAllKeys()
          keys.onsuccess = () => resolve(keys.result.map(String))
        }
      }),
  )
  expect(ids.filter((id) => id.startsWith(`${bench}-entry-2-`))).toEqual([])
  expect(ids.filter((id) => id.startsWith(`${bench}-entry-1-`))).toHaveLength(3)
})

test('a visitor has no bin and no link to it', async ({ page }) => {
  await page.goto('/?bezoeker')
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Prullenbak' })).toHaveCount(0)
  await page.goto('/prullenbak')
  await expect(page.getByRole('heading', { name: 'Niet gevonden' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('button')).toHaveCount(0)
})
