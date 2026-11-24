import { expect, test, type Page } from '@playwright/test'

// T-0008: the full-screen photo viewer, on the seeded demo data (D-0006). Tuinbank's entry of
// 4 okt 2026 has three photos, shown newest first (D-0031): place 1 is photo-3, taken at 12:00.

// D-0029 (T-0027): the project's slug, the entry's day and the photo's place.
const project = '/projects/tuinbank'
const photo = (n: number) => `${project}/2026-10-04/${n}`

async function openFirstPhoto(page: Page) {
  await page.goto(project)
  await page.getByRole('link', { name: 'Tuinbank, 4 okt 2026' }).first().click()
  await expect(page).toHaveURL(photo(1))
}

/** The photo shown, decoded from the stored copy. */
function currentImage(page: Page) {
  return page.getByRole('dialog').locator('img[data-current]')
}

async function swipe(page: Page, dx: number, dy: number) {
  const box = (await page.getByTestId('photo-stage').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 10 })
  await page.mouse.up()
}

test('opens a photo full screen from the project, with its date and note', async ({ page }) => {
  await openFirstPhoto(page)
  const dialog = page.getByRole('dialog', { name: 'Foto 1 van 3, 4 okt 2026' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Poten en zitregels op lengte gezaagd.')).toBeVisible()
  await expect(currentImage(page)).toHaveAttribute('data-photo-id', 'demo-garden-bench-entry-1-photo-3')
  // Decoded and filling the screen's width.
  const img = await currentImage(page).evaluate((el: HTMLImageElement) => ({
    natural: el.naturalWidth,
    width: el.getBoundingClientRect().width,
  }))
  expect(img.natural).toBe(1600)
  expect(img.width).toBe(page.viewportSize()!.width)
})

test('swipes to the next and previous photo; back then closes the viewer', async ({ page }) => {
  await openFirstPhoto(page)
  await swipe(page, -200, 0)
  await expect(page).toHaveURL(photo(2))
  await expect(page.getByRole('dialog', { name: 'Foto 2 van 3, 4 okt 2026' })).toBeVisible()
  await swipe(page, -200, 0)
  await expect(page).toHaveURL(photo(3))
  // The last photo: a further swipe stays put.
  await swipe(page, -200, 0)
  await expect(page).toHaveURL(photo(3))
  await swipe(page, 200, 0)
  await expect(page).toHaveURL(photo(2))

  // Swiping replaced the URL, so one back closes the viewer.
  await page.goBack()
  await expect(page).toHaveURL(project)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
})

test('a reload reopens the viewer; swiping down or Sluiten closes it', async ({ page }) => {
  await openFirstPhoto(page)
  await page.reload()
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 3, 4 okt 2026' })).toBeVisible()
  await swipe(page, 0, 250)
  await expect(page).toHaveURL(project)

  await page.getByRole('link', { name: 'Tuinbank, 4 okt 2026' }).nth(1).click()
  await expect(page).toHaveURL(photo(2))
  await page.getByRole('button', { name: 'Sluiten' }).click()
  await expect(page).toHaveURL(project)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('double-tap zooms in and out', async ({ page }) => {
  await openFirstPhoto(page)
  const box = (await page.getByTestId('photo-stage').boundingBox())!
  const scale = () => currentImage(page).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a)
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(scale).toBeGreaterThan(1.5)
  // Zoomed in, a drag pans instead of changing photo.
  await swipe(page, -200, 0)
  await expect(page).toHaveURL(photo(1))
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2)
  await expect.poll(scale).toBe(1)
})

test('opens a photo offline', async ({ page, context }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the service worker
  await context.setOffline(true)

  await page.goto(photo(2))
  await expect(page.getByRole('dialog', { name: 'Foto 2 van 3, 4 okt 2026' })).toBeVisible()
  await expect
    .poll(() => currentImage(page).evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth))
    .toBe(1600)
  await swipe(page, -200, 0)
  await expect(page).toHaveURL(photo(3))
})

// T-0036 (D-0037): the viewer moves through all of the project's photos, across days, in the
// project page's order: 25 okt (1 photo), 11 okt (2), 4 okt (3). Counter and label stay per day.
const day = (date: string, n: number) => `${project}/${date}/${n}`

test('ArrowRight and ArrowLeft cross days, with that day’s label, note and counter', async ({ page }) => {
  await page.goto(day('2026-10-11', 2))
  await expect(page.getByRole('dialog', { name: 'Foto 2 van 2, 11 okt 2026' })).toBeVisible()
  await expect(page.getByTestId('photo-counter')).toHaveText('2 / 2')
  // The next photo waiting in the strip is 4 okt's first, with its own day's label.
  await expect(page.getByRole('img', { name: 'Foto 1 van 3, 4 okt 2026', includeHidden: true })).toHaveCount(1)

  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(day('2026-10-04', 1))
  const dialog = page.getByRole('dialog', { name: 'Foto 1 van 3, 4 okt 2026' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 2, name: '4 okt 2026' })).toBeVisible()
  await expect(dialog.getByText('Poten en zitregels op lengte gezaagd.')).toBeVisible()
  await expect(page.getByTestId('photo-counter')).toHaveText('1 / 3')
  await expect(currentImage(page)).toHaveAttribute('data-photo-id', 'demo-garden-bench-entry-1-photo-1')

  await page.goto(day('2026-10-11', 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 2, 11 okt 2026' })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page).toHaveURL(day('2026-10-25', 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 1, 25 okt 2026' })).toBeVisible()
  // A day with one photo still counts it, as the project has more.
  await expect(page.getByTestId('photo-counter')).toHaveText('1 / 1')
})

test('a swipe crosses days; the project’s first and last photo stay put', async ({ page }) => {
  await page.goto(day('2026-10-11', 2))
  await expect(page.getByRole('dialog', { name: 'Foto 2 van 2, 11 okt 2026' })).toBeVisible()
  await swipe(page, -200, 0)
  await expect(page).toHaveURL(day('2026-10-04', 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 3, 4 okt 2026' })).toBeVisible()

  // 4 okt's third photo is the project's last.
  await page.goto(day('2026-10-04', 3))
  await expect(page.getByRole('dialog', { name: 'Foto 3 van 3, 4 okt 2026' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await swipe(page, -200, 0)
  await page.waitForTimeout(400) // longer than the 200 ms slide a move would start
  await expect(page).toHaveURL(day('2026-10-04', 3))
  await expect(page.getByRole('dialog', { name: 'Foto 3 van 3, 4 okt 2026' })).toBeVisible()

  // 25 okt's photo is the project's first.
  await page.goto(day('2026-10-25', 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 1, 25 okt 2026' })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await swipe(page, 200, 0)
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(day('2026-10-25', 1))
})

test('after crossing days, one back closes the viewer', async ({ page }) => {
  await page.goto(project)
  await page.getByRole('link', { name: 'Tuinbank, 25 okt 2026' }).click()
  await expect(page).toHaveURL(day('2026-10-25', 1))
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(day('2026-10-11', 1))
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(day('2026-10-11', 2))
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(day('2026-10-04', 1))

  await page.goBack()
  await expect(page).toHaveURL(project)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
})

async function deleteShown(page: Page) {
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click()
}

test('a day whose photos were all deleted is skipped', async ({ page }) => {
  await page.goto(day('2026-10-11', 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 2, 11 okt 2026' })).toBeVisible()
  await deleteShown(page)
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 1, 11 okt 2026' })).toBeVisible()
  await expect(page).toHaveURL(day('2026-10-11', 1))
  // 11 okt's last photo: next is 4 okt's first.
  await deleteShown(page)
  await expect(page).toHaveURL(day('2026-10-04', 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 3, 4 okt 2026' })).toBeVisible()

  await page.goto(day('2026-10-25', 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 1, 25 okt 2026' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page).toHaveURL(day('2026-10-04', 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 3, 4 okt 2026' })).toBeVisible()
})

test('deleting a day’s only photo shows the next day’s first', async ({ page }) => {
  await page.goto(day('2026-10-25', 1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 1, 25 okt 2026' })).toBeVisible()
  await deleteShown(page)
  await expect(page).toHaveURL(day('2026-10-11', 1))
  const dialog = page.getByRole('dialog', { name: 'Foto 1 van 2, 11 okt 2026' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { level: 2, name: '11 okt 2026' })).toBeVisible()
  await expect(page.getByTestId('photo-counter')).toHaveText('1 / 2')
})

test('a project with one photo shows no counter', async ({ page }) => {
  await page.goto('/projects/fietsenrek-voor-de-schuur/2026-11-01/1')
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 1, 1 nov 2026' })).toBeVisible()
  await expect(page.getByTestId('photo-counter')).toHaveCount(0)
})
