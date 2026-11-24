// Sizes fixed by D-0003 and D-0038: a 2560 px long-edge copy in WebP; a 1280 px thumbnail for
// cards and grids, derived from the copy.
export const COPY_LONG_EDGE = 2560
export const THUMBNAIL_LONG_EDGE = 1280
/**
 * The thumbnail's long edge before D-0038 (T-0006). Until a device has measured a photo's
 * thumbnail, it labels it with this, the smallest it can be, so the browser never takes it
 * for more pixels than it has (D-0038 guidance).
 */
export const OLD_THUMBNAIL_LONG_EDGE = 512
export const COPY_QUALITY = 0.85
export const THUMBNAIL_QUALITY = 0.8
export const OUTPUT_TYPE = 'image/webp'

/** Scales to fit the long edge, never upscaling a smaller image. */
export function fitLongEdge(width: number, height: number, longEdge: number) {
  const scale = Math.min(1, longEdge / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * The sizes a downscale passes through (D-0038): while the image is more than twice the
 * target, halve it; then one last step of at most 2x to the target. The last entry is the
 * target. Empty when the image already has the target's size.
 */
export function scaleSteps(width: number, height: number, target: { width: number; height: number }) {
  const steps: { width: number; height: number }[] = []
  let w = width
  let h = height
  while (w > 2 * target.width || h > 2 * target.height) {
    w = Math.max(target.width, Math.round(w / 2))
    h = Math.max(target.height, Math.round(h / 2))
    steps.push({ width: w, height: h })
  }
  if (w !== target.width || h !== target.height) steps.push(target)
  return steps
}
