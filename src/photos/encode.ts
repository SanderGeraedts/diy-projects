import { CARD_HEIGHT, CARD_WIDTH, cardCrop, fitLongEdge, OUTPUT_TYPE, scaleSteps } from './resize'

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

/**
 * The card image (D-0041): the centre 4:3 crop of a copy (`cardCrop`), scaled to 640×480 in
 * the same halving steps as `encodeScaled`. Null when the copy's crop is smaller than that: a
 * card image is never enlarged. The copy carries no EXIF orientation (it is a WebP this app
 * made), so it is decoded as stored.
 */
export async function encodeCard(copy: Blob, quality: number): Promise<Blob | null> {
  const bitmap = await createImageBitmap(copy)
  let current: ImageBitmap | OffscreenCanvas = bitmap
  try {
    const crop = cardCrop(bitmap.width, bitmap.height)
    if (!crop) return null
    const target = { width: CARD_WIDTH, height: CARD_HEIGHT }
    const steps = scaleSteps(crop.width, crop.height, target)
    if (steps.length === 0) steps.push(target)
    let source = crop
    for (const step of steps) {
      const canvas = new OffscreenCanvas(step.width, step.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('No 2D context on OffscreenCanvas')
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      // The first step takes the crop out of the copy; later steps scale the whole canvas.
      ctx.drawImage(current, source.x, source.y, source.width, source.height, 0, 0, step.width, step.height)
      if (current !== bitmap) release(current)
      current = canvas
      source = { x: 0, y: 0, width: step.width, height: step.height }
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
