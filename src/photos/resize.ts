// Sizes fixed by D-0003: a 2560 px long-edge copy in WebP; a ~512 px thumbnail for grids.
export const COPY_LONG_EDGE = 2560
export const THUMBNAIL_LONG_EDGE = 512
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
