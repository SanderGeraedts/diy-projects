import { expect, test, type Page } from '@playwright/test'

// T-0029 (D-0031): a day's photos are shown newest first, for the owner and for a visitor, and
// a photo's place in its address and the viewer's next/previous follow that order. On the
// seeded demo data (D-0006, G-0019): Tuinbank's entry of 4 okt 2026 has three photos, taken at
// 10:00, 11:00 and 12:00. The photos are told apart by their time taken (`data-taken-at`).

const project = '/projects/tuinbank'
const photo = (n: number) => `${project}/2026-10-04/${n}`
const at = (hour: number) => `2026-10-04T${hour}:00:00.000Z`

/** The times taken of the day's thumbnails, in the order shown. */
const dayTimes = (page: Page) =>
  page.locator('[id="2026-10-04"] a[data-taken-at]').evaluateAll((links) => links.map((a) => a.getAttribute('data-taken-at')))

const currentImage = (page: Page) => page.getByRole('dialog').locator('img[data-current]')
// On a phone the ‹ › buttons are there but hidden (they only show with a mouse), so they are
// looked up hidden or not: a count of 0 means the viewer didn't render one.
const navButton = (page: Page, name: 'Vorige foto' | 'Volgende foto') =>
  page.getByRole('button', { name, includeHidden: true })
const counter = (page: Page, text: string) => page.getByRole('dialog').getByText(text, { exact: true })

async function swipe(page: Page, dx: number) {
  const box = (await page.getByTestId('photo-stage').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y, { steps: 10 })
  await page.mouse.up()
}

/** Presses a key that should do nothing, and checks the address stays. */
async function pressAndStay(page: Page, key: string, url: string) {
  await page.keyboard.press(key)
  await page.waitForTimeout(500) // longer than the viewer's slide (200 ms)
  await expect(page).toHaveURL(url)
}

for (const who of ['owner', 'visitor'] as const) {
  test(`${who}: a day's photos run newest first, and the viewer follows the page`, async ({ page }) => {
    await page.goto(who === 'visitor' ? `${project}?bezoeker` : project)
    await expect(page.getByRole('heading', { level: 1, name: 'Tuinbank' })).toBeVisible()
    if (who === 'visitor') await expect(page.getByRole('link', { name: /Notitie toevoegen/ })).toHaveCount(0)

    // The page: newest top-left, oldest last.
    await expect.poll(() => dayTimes(page)).toEqual([at(12), at(11), at(10)])

    // The first one shown is place 1, the 12:00 photo.
    await page.locator('[id="2026-10-04"] a[data-taken-at]').first().click()
    await expect(page).toHaveURL(photo(1))
    await expect(page.getByRole('dialog', { name: 'Foto 1 van 3, 4 okt 2026' })).toBeVisible()
    await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(12))
    await expect(counter(page, '1 / 3')).toBeVisible()
    // Place 1 is the day's newest: nothing of 4 okt before it. Since D-0037 (T-0036) previous
    // crosses to the day above on the page, 11 okt's last photo, and next comes back here.
    await expect(navButton(page, 'Vorige foto')).toHaveCount(1)
    await expect(navButton(page, 'Volgende foto')).toHaveCount(1)
    await page.keyboard.press('ArrowLeft')
    await expect(page).toHaveURL(`${project}/2026-10-11/2`)
    await expect(page.getByRole('dialog', { name: 'Foto 2 van 2, 11 okt 2026' })).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(photo(1))
    await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(12))

    // Next goes to the older photo.
    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(photo(2))
    await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(11))
    await expect(counter(page, '2 / 3')).toBeVisible()
    await expect(navButton(page, 'Vorige foto')).toHaveCount(1)
    await expect(navButton(page, 'Volgende foto')).toHaveCount(1)

    await page.keyboard.press('ArrowRight')
    await expect(page).toHaveURL(photo(3))
    await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(10))
    await expect(counter(page, '3 / 3')).toBeVisible()
    // The last place is the oldest: nothing after it.
    await expect(navButton(page, 'Volgende foto')).toHaveCount(0)
    await pressAndStay(page, 'ArrowRight', photo(3))

    // Previous goes back to the newer one.
    await page.keyboard.press('ArrowLeft')
    await expect(page).toHaveURL(photo(2))
    await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(11))

    // A swipe left is "next" too: the older photo.
    await swipe(page, -200)
    await expect(page).toHaveURL(photo(3))
    await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(10))
    await swipe(page, 200)
    await expect(page).toHaveURL(photo(2))
    await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(11))
  })
}

async function deleteCurrent(page: Page) {
  await page.getByRole('button', { name: 'Verwijderen' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Verwijderen' }).click()
}

test('owner: deleting the newest photo shows the next older one in its place', async ({ page }) => {
  await page.goto(photo(1))
  await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(12))

  await deleteCurrent(page)
  await expect(page).toHaveURL(photo(1))
  await expect(page.getByRole('dialog', { name: 'Foto 1 van 2, 4 okt 2026' })).toBeVisible()
  await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(11))
  await expect(counter(page, '1 / 2')).toBeVisible()

  await page.getByRole('button', { name: 'Sluiten' }).click()
  await expect(page).toHaveURL(project)
  await expect.poll(() => dayTimes(page)).toEqual([at(11), at(10)])
})

test('owner: deleting the oldest photo shows the one shown before it', async ({ page }) => {
  await page.goto(photo(3))
  await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(10))

  await deleteCurrent(page)
  await expect(page).toHaveURL(photo(2))
  await expect(page.getByRole('dialog', { name: 'Foto 2 van 2, 4 okt 2026' })).toBeVisible()
  await expect(currentImage(page)).toHaveAttribute('data-taken-at', at(11))
  await expect(counter(page, '2 / 2')).toBeVisible()

  await page.getByRole('button', { name: 'Sluiten' }).click()
  await expect(page).toHaveURL(project)
  // The remaining photos, newest top-left.
  await expect.poll(() => dayTimes(page)).toEqual([at(12), at(11)])
})
