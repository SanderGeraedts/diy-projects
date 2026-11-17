import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { expect, test } from '@playwright/test'
import { build } from 'vite'

// T-0019: build the app twice with a different build id, serve the first, swap in the
// second, and take the update from the bar. Its own server, so the swap doesn't touch the
// preview server the other tests use.

const PORT = 4183
const ORIGIN = `http://localhost:${PORT}`
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

let dir: string
let root: string
let server: Server

async function buildInto(outDir: string, buildId: string) {
  const previous = process.env.BUILD_ID
  process.env.BUILD_ID = buildId
  try {
    await build({ logLevel: 'error', build: { outDir, emptyOutDir: true } })
  } finally {
    if (previous === undefined) delete process.env.BUILD_ID
    else process.env.BUILD_ID = previous
  }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  dir = mkdtempSync(join(tmpdir(), 'diy-update-'))
  await buildInto(join(dir, 'a'), 'e2e-a')
  await buildInto(join(dir, 'b'), 'e2e-b')
  root = join(dir, 'a')
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', ORIGIN).pathname)).replace(/^[/\\]+/, '')
    let file = join(root, path)
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html')
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    res.end(readFileSync(file))
  })
  await new Promise<void>((resolve) => server.listen(PORT, resolve))
})

test.afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve))
  if (dir) rmSync(dir, { recursive: true, force: true })
})

test('offers a new version and switches to it on a tap, keeping local data', async ({ page }) => {
  const buildId = () => page.locator('meta[name="build-id"]').getAttribute('content')

  await page.goto(`${ORIGIN}/`)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload() // now controlled by the first version's service worker
  expect(await buildId()).toBe('e2e-a')
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toBeVisible()

  // Local data the new version must keep: a project written straight into IndexedDB.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('diy-projects')
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    const now = new Date().toISOString()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite')
      tx.objectStore('projects').put({
        id: 'e2e-update',
        title: 'Lokaal project',
        description: '',
        status: 'idea',
        tags: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })

  // Deploy the second version; the app finds it on its next check.
  root = join(dir, 'b')
  await expect(page.getByText('Nieuwe versie beschikbaar')).toBeHidden()
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update())
  await expect(page.getByText('Nieuwe versie beschikbaar')).toBeVisible()
  expect(await buildId()).toBe('e2e-a')

  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Bijwerken' }).click()])

  await expect.poll(buildId).toBe('e2e-b')
  await expect(page.getByText('Nieuwe versie beschikbaar')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Lokaal project' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tuinbank' })).toBeVisible()
})
