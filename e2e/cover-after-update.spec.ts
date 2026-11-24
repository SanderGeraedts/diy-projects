import { expect, test, type Page } from '@playwright/test'
import { withExif } from '../src/photos/exifFixture'
import { downloadedPhoto } from '../src/sync/records'

// T-0039 (D-0040): an overview card shows its cover from the 1280 px thumbnail, never from
// the 2560 px copy: after a reload, while other photos are written, after a download from the
// NAS (thumbnail not measured yet) and during the rebuild of an older thumbnail. And a write
// to `photos` that doesn't touch the cover's files leaves the card's `src` and `srcset` as
// they are. Generated photos only (G-0019), on the preview build with demo data (D-0006).

const VIEWPORTS = [
  { name: 'laptop @1.5', width: 1280, height: 800, dpr: 1.5, mobile: false },
  { name: 'laptop @2', width: 1280, height: 800, dpr: 2, mobile: false },
  { name: 'fold @2.625', width: 840, height: 900, dpr: 2.625, mobile: true },
  { name: 'pixel @2.625', width: 412, height: 915, dpr: 2.625, mobile: true },
] as const

/** A JPEG with fine diagonal lines, drawn in the page's canvas: what shows jagged when shrunk. */
async function jpeg(page: Page, width: number, height: number): Promise<Uint8Array> {
  const bytes = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#f4efe6'
      ctx.fillRect(0, 0, w, h)
      ctx.strokeStyle = '#2a2a2a'
      ctx.lineWidth = 2
      ctx.beginPath()
      for (let x = -h; x < w; x += 12) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x + h, h)
      }
      ctx.stroke()
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    [width, height] as const,
  )
  return new Uint8Array(bytes)
}

/**
 * Runs before the app in every document: records each `load` of an overview card's `<img>`
 * (thumbnail = its `src`, copy = its second `srcset` candidate) and counts changes to the
 * `src` and `srcset` of each card image (to another value), by photo id.
 */
function recordCards() {
  type Load = { photoId: string; file: 'thumbnail' | 'copy' | 'other'; currentSrc: string }
  const w = window as unknown as { __loads: Load[]; __changes: Record<string, { src: number; srcset: number }> }
  w.__loads = []
  w.__changes = {}
  const isCard = (el: EventTarget | Node | null): el is HTMLImageElement =>
    el instanceof HTMLImageElement && !!el.closest('main a[href^="/projects/"]') && !!el.dataset.photoId
  document.addEventListener(
    'load',
    (event) => {
      const img = event.target
      if (!isCard(img)) return
      const candidates = img.srcset.split(', ').map((c) => c.split(' ')[0])
      const file = img.currentSrc === img.src ? 'thumbnail' : img.currentSrc === candidates[1] ? 'copy' : 'other'
      w.__loads.push({ photoId: img.dataset.photoId!, file, currentSrc: img.currentSrc })
    },
    true,
  )
  new MutationObserver((records) => {
    for (const r of records) {
      if (!isCard(r.target) || (r.attributeName !== 'src' && r.attributeName !== 'srcset')) continue
      // React sets `src` again with the same value when it mounts an image: not a change.
      if (r.oldValue === r.target.getAttribute(r.attributeName)) continue
      const id = r.target.dataset.photoId!
      const c = (w.__changes[id] ??= { src: 0, srcset: 0 })
      c[r.attributeName]++
    }
  }).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['src', 'srcset'] })
}

interface Log {
  loads: { photoId: string; file: 'thumbnail' | 'copy' | 'other'; currentSrc: string }[]
  changes: { src: number; srcset: number }
}

function cardLog(page: Page, id: string): Promise<Log> {
  return page.evaluate((photoId) => {
    const w = window as unknown as { __loads: Log['loads']; __changes: Record<string, Log['changes']> }
    return { loads: w.__loads.filter((l) => l.photoId === photoId), changes: w.__changes[photoId] ?? { src: 0, srcset: 0 } }
  }, id)
}

/** Opens the app's IndexedDB in the page and runs `body` on one photo record. */
function withPhoto<T>(page: Page, id: string, body: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    async ([photoId, source, extra]) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const open = indexedDB.open('diy-projects')
        open.onsuccess = () => resolve(open.result)
        open.onerror = () => reject(open.error)
      })
      const run = new Function('photo', 'arg', `return (async () => { ${source} })()`) as (
        photo: Record<string, unknown>,
        arg: unknown,
      ) => Promise<{ put?: Record<string, unknown>; result?: unknown; clearOutbox?: boolean }>
      const photo = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const req = db.transaction('photos').objectStore('photos').get(photoId)
        req.onsuccess = () => resolve(req.result as Record<string, unknown>)
        req.onerror = () => reject(req.error)
      })
      const out = await run(photo, extra)
      if (out.put) {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(['photos', 'outbox'], 'readwrite')
          tx.objectStore('photos').put(out.put)
          if (out.clearOutbox) tx.objectStore('outbox').clear()
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        })
      }
      db.close()
      return out.result
    },
    [id, body, arg] as const,
  ) as Promise<T>
}

/** The cover's stored `thumbnailWidth`, or null while unmeasured. */
const thumbnailWidth = (page: Page, id: string) =>
  withPhoto<number | null>(page, id, 'return { result: photo.thumbnailWidth ?? null }')

/** The card's image once loaded: which file it shows and that file's decoded width. */
async function shown(page: Page, id: string) {
  const img = page.locator(`main a[href^="/projects/"] img[data-photo-id="${id}"]`)
  await img.scrollIntoViewIfNeeded()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  return img.evaluate(async (el: HTMLImageElement) => {
    const candidates = el.srcset.split(', ').map((c) => c.split(' ')[0])
    const file = el.currentSrc === el.src ? 'thumbnail' : el.currentSrc === candidates[1] ? 'copy' : 'other'
    const bitmap = await createImageBitmap(await (await fetch(el.currentSrc)).blob())
    const width = bitmap.width
    bitmap.close()
    return { file, width }
  })
}

interface Row {
  viewport: string
  situation: string
  loaded: string
  width: number
  changes: string
}

test('a project cover stays on the thumbnail after a reload, writes, a download and a rebuild', async ({ page, context }) => {
  test.setTimeout(300_000)
  await context.addInitScript(recordCards)
  await page.goto('/')
  const photo = withExif(await jpeg(page, 4000, 3000), { dateTimeOriginal: '2026:11:20 10:00:00' })

  await page.getByRole('link', { name: 'Nieuw project' }).click()
  await page.getByLabel('Titel').fill('Kapstok')
  await page.getByRole('button', { name: 'Opslaan' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Kapstok' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({ name: 'lijnen.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(photo) })
  await expect(page.getByTestId('import-status')).toContainText('1 foto toegevoegd.', { timeout: 60_000 })

  // The cover's id, and its record as after a sync: everything uploaded, nothing in the outbox.
  const projectId = new URL(page.url()).pathname
  await page.goto('/')
  const cover = page.getByRole('link', { name: /Kapstok/ }).locator('img')
  await expect(cover).toBeAttached()
  const id = (await cover.getAttribute('data-photo-id'))!
  expect(projectId).toBeTruthy()
  await withPhoto(
    page,
    id,
    `photo.uploads = { original: 'uploaded', copy: 'uploaded', thumbnail: 'uploaded' }; return { put: photo, clearOutbox: true }`,
  )
  expect(await thumbnailWidth(page, id)).toBe(1280)

  const cdp = await context.newCDPSession(page)
  const rows: Row[] = []
  const row = (viewport: string, situation: string, log: Log, last: { file: string; width: number }) => {
    const files = [...new Set(log.loads.map((l) => l.file))]
    rows.push({
      viewport,
      situation,
      loaded: files.length ? files.join('+') : last.file,
      width: last.width,
      changes: `src ${log.changes.src}, srcset ${log.changes.srcset}`,
    })
  }

  let extra = 0
  for (const v of VIEWPORTS) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: v.dpr, mobile: v.mobile })

    // a. A reload of the overview.
    await page.goto('/')
    const a = await shown(page, id)
    row(v.name, 'a reload', await cardLog(page, id), a)

    // b. A write to photos from a second page while the overview stays open.
    const before = await cardLog(page, id)
    const other = await context.newPage()
    await other.goto('/')
    const title = `Schuur ${++extra}`
    await other.getByRole('link', { name: 'Nieuw project' }).click()
    await other.getByLabel('Titel').fill(title)
    await other.getByRole('button', { name: 'Opslaan' }).click()
    await expect(other.getByRole('heading', { level: 1, name: title })).toBeVisible()
    const small = withExif(await jpeg(other, 800, 600), { dateTimeOriginal: '2020:01:01 10:00:00' })
    await other.locator('input[type="file"]').setInputFiles({ name: 'schuur.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(small) })
    await expect(other.getByTestId('import-status')).toContainText('1 foto toegevoegd.', { timeout: 60_000 })
    await other.close()
    // The open overview has heard of it: the new project's card has its cover.
    await expect(page.getByRole('link', { name: new RegExp(title) }).locator('img')).toBeAttached()
    await page.waitForTimeout(500)
    const b = await shown(page, id)
    const afterB = await cardLog(page, id)
    row(v.name, 'b write elsewhere', {
      loads: afterB.loads.slice(before.loads.length),
      changes: { src: afterB.changes.src - before.changes.src, srcset: afterB.changes.srcset - before.changes.srcset },
    }, b)

    // c. Downloaded from the NAS: the record `downloadedPhoto` stores, with the same files.
    const server = await withPhoto<Record<string, unknown>>(
      page,
      id,
      `return { result: { id: photo.id, updated: photo.updatedAt, projectId: photo.projectId, entryId: photo.entryId, takenAt: photo.takenAt, width: photo.width, height: photo.height, createdAt: photo.createdAt, updatedAt: photo.updatedAt, deletedAt: photo.deletedAt ?? '' } }`,
    )
    const { blob: _copy, thumbnail: _thumbnail, ...fields } = downloadedPhoto(server as { id: string; updated: string }, new Blob(), new Blob())
    expect(fields).not.toHaveProperty('thumbnailWidth')
    expect(fields).not.toHaveProperty('thumbnailOnNas')
    expect(fields.uploads).toEqual({ original: 'none', copy: 'none', thumbnail: 'none' })
    await withPhoto(page, id, 'return { put: { ...arg, blob: photo.blob, thumbnail: photo.thumbnail } }', fields)
    expect(await thumbnailWidth(page, id)).toBeNull()
    await page.reload()
    await expect.poll(() => thumbnailWidth(page, id), { timeout: 30_000 }).toBe(1280)
    await page.waitForTimeout(500)
    const c = await shown(page, id)
    row(v.name, 'c downloaded', await cardLog(page, id), c)

    // d. An older (512 px) thumbnail, unmeasured, rebuilt in the background.
    await withPhoto(
      page,
      id,
      `const scale = 512 / Math.max(photo.width, photo.height)
       const bitmap = await createImageBitmap(photo.blob)
       const canvas = new OffscreenCanvas(Math.round(photo.width * scale), Math.round(photo.height * scale))
       canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
       photo.thumbnail = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
       delete photo.thumbnailWidth
       delete photo.thumbnailOnNas
       return { put: photo }`,
    )
    await page.reload()
    await expect.poll(() => thumbnailWidth(page, id), { timeout: 30_000 }).toBe(1280)
    await expect.poll(async () => (await shown(page, id)).width, { timeout: 10_000 }).toBe(1280)
    const d = await shown(page, id)
    row(v.name, 'd rebuilt', await cardLog(page, id), d)
  }

  const table = [
    'viewport     | situation         | file loaded | decoded width | attribute changes',
    ...rows.map((r) =>
      [r.viewport.padEnd(12), r.situation.padEnd(17), r.loaded.padEnd(11), String(r.width).padStart(13), r.changes].join(' | '),
    ),
  ].join('\n')
  console.log(table)
  await test.info().attach('covers', { body: table, contentType: 'text/plain' })

  expect(rows).toHaveLength(16)
  for (const r of rows) {
    const what = `${r.viewport} ${r.situation}`
    expect.soft(r.loaded, what).toBe('thumbnail')
    expect.soft(r.width, what).toBe(1280)
    if (r.situation.startsWith('b')) expect.soft(r.changes, what).toBe('src 0, srcset 0')
    if (r.situation.startsWith('d')) expect.soft(r.changes, what).toMatch(/^src 1, /)
  }
})
