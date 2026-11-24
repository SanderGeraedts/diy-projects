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
/**
 * The card image (D-0041): a centre 4:3 crop of the copy at 640×480, for the overview's cards
 * and the project page's tiles (both 4:3, `object-cover`). The visitor's PocketBase thumb and
 * the backend migration's `thumbs` value are built from these; never write the numbers
 * elsewhere.
 */
export const CARD_WIDTH = 640
export const CARD_HEIGHT = 480
/** PocketBase's thumb size for the card image (`?thumb=`, and the migration's `thumbs`). */
export const CARD_THUMB = `${CARD_WIDTH}x${CARD_HEIGHT}`
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

/**
 * The card image's crop of an image (D-0041, T-0040 Design): the largest 4:3 area (full width
 * or full height), centred in both directions with the offset `round((source − crop) / 2)`.
 * Null when that area is smaller than the card image: a card image is never enlarged.
 */
export function cardCrop(width: number, height: number): { x: number; y: number; width: number; height: number } | null {
  const ratio = CARD_WIDTH / CARD_HEIGHT
  // Wider than 4:3: full height; otherwise full width. Rounding never exceeds the source.
  const cropWidth = width * CARD_HEIGHT >= height * CARD_WIDTH ? Math.round(height * ratio) : width
  const cropHeight = cropWidth === width ? Math.min(height, Math.round(width / ratio)) : height
  if (cropWidth < CARD_WIDTH || cropHeight < CARD_HEIGHT) return null
  return {
    x: Math.round((width - cropWidth) / 2),
    y: Math.round((height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight,
  }
}
