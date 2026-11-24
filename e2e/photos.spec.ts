import { expect, test } from '@playwright/test'
import { createServer, type ViteDevServer } from 'vite'

// T-0006: the photo module isn't wired into a screen yet (that's T-0007), so this test runs
// it from a Vite dev server of its own and drives it in the browser. The fixture is generated
// in the page: no real photos (D-0006, D-0010).

const PORT = Number(process.env.PHOTOS_E2E_PORT ?? 5199)
let server: ViteDevServer

test.beforeAll(async () => {
  server = await createServer({
    server: { port: PORT, strictPort: true },
    optimizeDeps: { include: ['exifr'] },
    logLevel: 'error',
  })
  await server.listen()
})

test.afterAll(async () => {
  await server?.close()
})

test('makes a 2560 px WebP copy and a 1280 px thumbnail of a 6000×4000 JPEG, original untouched', async ({ page }) => {
  test.setTimeout(60_000)
  // A plain module URL, not the app, so nothing navigates while the test runs.
  await page.goto(`http://localhost:${PORT}/src/photos/resize.ts`)

  const result = await page.evaluate(async () => {
    const photos = await import(/* @vite-ignore */ '/src/photos/index.ts' as string)
    const fixture = await import(/* @vite-ignore */ '/src/photos/exifFixture.ts' as string)

    // 6000×4000 landscape: left half red, right half blue.
    const canvas = document.createElement('canvas')
    canvas.width = 6000
    canvas.height = 4000
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ff0000'
    ctx.fillRect(0, 0, 3000, 4000)
    ctx.fillStyle = '#0000ff'
    ctx.fillRect(3000, 0, 3000, 4000)
    const plain = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9))
    // EXIF orientation 6: display rotated 90° clockwise, so red ends up on top, portrait.
    const bytes: Uint8Array = fixture.withExif(new Uint8Array(await plain.arrayBuffer()), {
      orientation: 6,
      dateTimeOriginal: '2026:10:04 14:30:05',
    })
    const original = new File([bytes as BlobPart], 'IMG_0001.jpg', { type: 'image/jpeg' })
    const before = new Uint8Array(await original.arrayBuffer())

    const copy: Blob = await photos.makeCopy(original)
    const thumbnail: Blob = await photos.makeThumbnail(copy)
    const taken = await photos.dateTaken(original)

    const after = new Uint8Array(await original.arrayBuffer())
    const unchanged = before.length === after.length && before.every((b, i) => b === after[i])

    const decode = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'none' })
      const c = new OffscreenCanvas(bitmap.width, bitmap.height)
      const cx = c.getContext('2d')!
      cx.drawImage(bitmap, 0, 0)
      const at = (x: number, y: number) => Array.from(cx.getImageData(x, y, 1, 1).data.slice(0, 3))
      return {
        width: bitmap.width,
        height: bitmap.height,
        top: at(Math.floor(bitmap.width / 2), 10),
        bottom: at(Math.floor(bitmap.width / 2), bitmap.height - 10),
      }
    }

    return {
      copyType: copy.type,
      copySize: copy.size,
      copy: await decode(copy),
      thumbnailType: thumbnail.type,
      thumbnail: await decode(thumbnail),
      taken,
      unchanged,
      originalSize: original.size,
      fixtureSize: bytes.length,
    }
  })

  expect(result.copyType).toBe('image/webp')
  expect(result.copy.width).toBe(1707)
  expect(result.copy.height).toBe(2560)
  // Orientation honoured: red (left of the stored image) is now on top.
  expect(result.copy.top[0]).toBeGreaterThan(200)
  expect(result.copy.top[2]).toBeLessThan(60)
  expect(result.copy.bottom[2]).toBeGreaterThan(200)
  expect(result.copy.bottom[0]).toBeLessThan(60)

  expect(result.thumbnailType).toBe('image/webp')
  // D-0038 (T-0037): 1280 px on the long edge, half the copy.
  expect(Math.max(result.thumbnail.width, result.thumbnail.height)).toBe(1280)
  expect(result.thumbnail.height).toBeGreaterThan(result.thumbnail.width)

  expect(result.taken).toEqual({ takenAt: '2026-10-04T14:30:05', source: 'exif' })
  expect(result.unchanged).toBe(true)
  expect(result.originalSize).toBe(result.fixtureSize)
})

// T-0037 (D-0038): 1 px black and white stripes are the worst case for a downscale. Done in
// halving steps, every step averages whole pairs of stripes: the copy and the thumbnail come
// out a uniform grey, with no moiré bands.
test('stripes come out a uniform grey in the copy and the thumbnail, no aliasing', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto(`http://localhost:${PORT}/src/photos/resize.ts`)

  const result = await page.evaluate(async () => {
    const photos = await import(/* @vite-ignore */ '/src/photos/index.ts' as string)
    const canvas = new OffscreenCanvas(6000, 4000)
    const ctx = canvas.getContext('2d')!
    const data = ctx.createImageData(6000, 4000)
    for (let y = 0; y < 4000; y++) {
      for (let x = 0; x < 6000; x++) {
        const i = (y * 6000 + x) * 4
        const v = x % 2 === 0 ? 0 : 255
        data.data[i] = v
        data.data[i + 1] = v
        data.data[i + 2] = v
        data.data[i + 3] = 255
      }
    }
    ctx.putImageData(data, 0, 0)
    const original = await canvas.convertToBlob({ type: 'image/png' }) // lossless

    const copy: Blob = await photos.makeCopy(original)
    const thumbnail: Blob = await photos.makeThumbnail(copy)

    /** Width, height and the standard deviation of the luminance over the middle half. */
    const stats = async (blob: Blob) => {
      const bitmap = await createImageBitmap(blob)
      const { width, height } = bitmap
      const c = new OffscreenCanvas(width, height)
      const cx = c.getContext('2d')!
      cx.drawImage(bitmap, 0, 0)
      const x0 = Math.floor(width / 4)
      const y0 = Math.floor(height / 4)
      const pixels = cx.getImageData(x0, y0, Math.floor(width / 2), Math.floor(height / 2)).data
      let sum = 0
      let sumSq = 0
      const n = pixels.length / 4
      for (let i = 0; i < pixels.length; i += 4) {
        const l = 0.2126 * pixels[i]! + 0.7152 * pixels[i + 1]! + 0.0722 * pixels[i + 2]!
        sum += l
        sumSq += l * l
      }
      const mean = sum / n
      return { type: blob.type, width, height, mean, sd: Math.sqrt(Math.max(0, sumSq / n - mean * mean)) }
    }
    return { copy: await stats(copy), thumbnail: await stats(thumbnail) }
  })

  console.log(`stripes: copy ${JSON.stringify(result.copy)}, thumbnail ${JSON.stringify(result.thumbnail)}`)
  expect(result.copy.type).toBe('image/webp')
  expect(result.copy.width).toBe(2560)
  expect(result.thumbnail.type).toBe('image/webp')
  expect(Math.max(result.thumbnail.width, result.thumbnail.height)).toBe(1280)
  expect(result.copy.sd).toBeLessThan(10)
  expect(result.thumbnail.sd).toBeLessThan(10)
})
