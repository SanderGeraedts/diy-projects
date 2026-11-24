import { fitLongEdge, OUTPUT_TYPE, scaleSteps } from './resize'

// Runs inside the worker: decode (EXIF orientation applied), scale down, encode as WebP.
// Reads the source Blob only; the original File is never modified (D-0003).
// D-0038: a downscale of more than 2x goes in halving steps, each one drawImage with
// high-quality smoothing, so fine detail averages out instead of aliasing.
export async function encodeScaled(source: Blob, longEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  let current: ImageBitmap | OffscreenCanvas = bitmap
  try {
    const target = fitLongEdge(bitmap.width, bitmap.height, longEdge)
    const steps = scaleSteps(bitmap.width, bitmap.height, target)
    if (steps.length === 0) steps.push(target) // already that size: still encoded as WebP
    for (const step of steps) {
      const canvas = new OffscreenCanvas(step.width, step.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No 2D context on OffscreenCanvas')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(current, 0, 0, step.width, step.height)
      if (current !== bitmap) release(current)
      current = canvas
    }
    const blob = await (current as OffscreenCanvas).convertToBlob({ type: OUTPUT_TYPE, quality })
    if (blob.type !== OUTPUT_TYPE) throw new Error(`This browser can't encode ${OUTPUT_TYPE}`)
    return blob
  } finally {
    if (current !== bitmap) release(current)
    bitmap.close()
  }
}

/** The pixel size of an image as stored (thumbnails carry no EXIF orientation). */
export async function measure(source: Blob): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(source)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

/** Frees an intermediate step's pixels at once rather than waiting for the collector. */
function release(image: ImageBitmap | OffscreenCanvas) {
  if (image instanceof OffscreenCanvas) {
    image.width = 0
    image.height = 0
  } else image.close()
}
