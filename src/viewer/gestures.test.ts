import { describe, expect, it } from 'vitest'
import { clampTransform, dragAxis, fitSize, maxScale, swipeResult, zoomAt } from './gestures'

const copy = { width: 2560, height: 1920 }
// The open Pixel Fold's inner screen in CSS pixels, roughly.
const fold = { width: 841, height: 701 }

describe('fitSize', () => {
  it('fits a landscape photo to the stage width', () => {
    expect(fitSize({ width: 1600, height: 1200 }, { width: 400, height: 800 })).toEqual({ width: 400, height: 300 })
  })
  it('fits to the height when that is the tighter side', () => {
    expect(fitSize({ width: 1920, height: 2560 }, fold)).toEqual({ width: 525.75, height: 701 })
  })
})

describe('maxScale', () => {
  it('zooms up to one copy pixel per CSS pixel', () => {
    const fitted = fitSize(copy, fold)
    expect(maxScale(copy, fold)).toBeCloseTo(2560 / fitted.width)
  })
  it('never goes below 1 for a small photo', () => {
    expect(maxScale({ width: 100, height: 100 }, fold)).toBe(1)
  })
})

describe('clampTransform', () => {
  const stage = { width: 400, height: 800 }
  const fitted = { width: 400, height: 300 }
  it('keeps the scale between 1 and the maximum', () => {
    expect(clampTransform({ scale: 0.5, x: 0, y: 0 }, fitted, stage, 3).scale).toBe(1)
    expect(clampTransform({ scale: 9, x: 0, y: 0 }, fitted, stage, 3).scale).toBe(3)
  })
  it("doesn't pan past the photo's edges", () => {
    const t = clampTransform({ scale: 2, x: 1000, y: 1000 }, fitted, stage, 3)
    expect(t.x).toBe(200) // (400 * 2 - 400) / 2
    expect(t.y).toBe(0) // 600 tall in an 800 tall stage: no vertical room
  })
})

describe('zoomAt', () => {
  it('keeps the focus point in place', () => {
    const t = zoomAt({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 })
    // The point under the finger, (100, 50), maps to 100 = x + 100 * 2.
    expect(t).toEqual({ scale: 2, x: -100, y: -50 })
  })
})

describe('swipe', () => {
  const stage = { width: 400, height: 800 }
  const still = { x: 0, y: 0 }
  it('goes to the next photo on a left swipe and the previous on a right swipe', () => {
    expect(swipeResult('x', { x: -100, y: 5 }, still, stage)).toBe('next')
    expect(swipeResult('x', { x: 100, y: 5 }, still, stage)).toBe('previous')
  })
  it('takes a quick short flick too', () => {
    expect(swipeResult('x', { x: -30, y: 0 }, { x: -1, y: 0 }, stage)).toBe('next')
  })
  it('ignores a short slow drag', () => {
    expect(swipeResult('x', { x: -30, y: 0 }, still, stage)).toBe('none')
  })
  it('closes on a swipe down, not up', () => {
    expect(swipeResult('y', { x: 0, y: 200 }, still, stage)).toBe('close')
    expect(swipeResult('y', { x: 0, y: -200 }, still, stage)).toBe('none')
  })
  it('decides the axis once the finger has moved', () => {
    expect(dragAxis({ x: 3, y: 2 })).toBeNull()
    expect(dragAxis({ x: 30, y: 12 })).toBe('x')
    expect(dragAxis({ x: 5, y: 40 })).toBe('y')
  })
})
