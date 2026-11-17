import { fitLongEdge, OUTPUT_TYPE } from './resize'

// Runs inside the worker: decode (EXIF orientation applied), scale down, encode as WebP.
// Reads the source Blob only; the original File is never modified (D-0003).
export async function encodeScaled(source: Blob, longEdge: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
  try {
    const { width, height } = fitLongEdge(bitmap.width, bitmap.height, longEdge)
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2D context on OffscreenCanvas')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await canvas.convertToBlob({ type: OUTPUT_TYPE, quality })
    if (blob.type !== OUTPUT_TYPE) throw new Error(`This browser can't encode ${OUTPUT_TYPE}`)
    return blob
  } finally {
    bitmap.close()
  }
}
