// Pure maths for the photo viewer's gestures (T-0008), kept apart so it can be unit tested.

export interface Size {
  width: number
  height: number
}

export interface Transform {
  scale: number
  x: number
  y: number
}

export const IDENTITY: Transform = { scale: 1, x: 0, y: 0 }

/** The size a photo is drawn at when it is fitted ("contain") into the stage. */
export function fitSize(photo: Size, stage: Size): Size {
  if (photo.width <= 0 || photo.height <= 0 || stage.width <= 0 || stage.height <= 0) {
    return { width: 0, height: 0 }
  }
  const ratio = Math.min(stage.width / photo.width, stage.height / photo.height)
  return { width: photo.width * ratio, height: photo.height * ratio }
}

/**
 * The deepest zoom: one pixel of the stored copy per CSS pixel, so zooming in goes up to the
 * copy's full resolution and no further. Never below 1.
 */
export function maxScale(photo: Size, stage: Size): number {
  const fitted = fitSize(photo, stage)
  if (fitted.width === 0) return 1
  return Math.max(1, photo.width / fitted.width)
}

/** Keeps a zoomed photo covering the stage: it can't be panned past its own edges. */
export function clampTransform(t: Transform, fitted: Size, stage: Size, max: number): Transform {
  const scale = Math.min(Math.max(t.scale, 1), max)
  const limitX = Math.max(0, (fitted.width * scale - stage.width) / 2)
  const limitY = Math.max(0, (fitted.height * scale - stage.height) / 2)
  return {
    scale,
    x: Math.min(Math.max(t.x, -limitX), limitX),
    y: Math.min(Math.max(t.y, -limitY), limitY),
  }
}

/**
 * Zooms to `scale` keeping the point `focus` (relative to the stage's centre) where it is on
 * screen, as a pinch or double-tap expects.
 */
export function zoomAt(t: Transform, scale: number, focus: { x: number; y: number }): Transform {
  const k = scale / t.scale
  return { scale, x: focus.x - (focus.x - t.x) * k, y: focus.y - (focus.y - t.y) * k }
}

export type SwipeResult = 'next' | 'previous' | 'close' | 'none'

/**
 * What a finished one-finger drag on an unzoomed photo means: a horizontal swipe of a fifth
 * of the stage (or a quick flick) changes photo, a downward one of a sixth closes.
 */
export function swipeResult(
  axis: 'x' | 'y' | null,
  delta: { x: number; y: number },
  velocity: { x: number; y: number },
  stage: Size,
): SwipeResult {
  const FLICK = 0.5 // px per ms
  if (axis === 'x') {
    if (delta.x <= -stage.width / 5 || (velocity.x <= -FLICK && delta.x < -20)) return 'next'
    if (delta.x >= stage.width / 5 || (velocity.x >= FLICK && delta.x > 20)) return 'previous'
  }
  if (axis === 'y') {
    if (delta.y >= stage.height / 6 || (velocity.y >= FLICK && delta.y > 20)) return 'close'
  }
  return 'none'
}

/** Which way a drag goes, once it has moved far enough to tell. */
export function dragAxis(delta: { x: number; y: number }, threshold = 10): 'x' | 'y' | null {
  if (Math.hypot(delta.x, delta.y) < threshold) return null
  return Math.abs(delta.x) >= Math.abs(delta.y) ? 'x' : 'y'
}
