// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { CARD_HEIGHT, CARD_THUMB, CARD_WIDTH, cardCrop, COPY_LONG_EDGE, fitLongEdge, scaleSteps, THUMBNAIL_LONG_EDGE } from './resize'

// D-0038: thumbnails are 1280 px; a downscale of more than 2x goes in halving steps.
describe('scaleSteps', () => {
  it('halves a 6000×4000 original once, then one last step to the 2560 px copy', () => {
    const target = fitLongEdge(6000, 4000, COPY_LONG_EDGE)
    expect(scaleSteps(6000, 4000, target)).toEqual([
      { width: 3000, height: 2000 },
      { width: 2560, height: 1707 },
    ])
  })

  it('halves a 50 MP original twice', () => {
    const target = fitLongEdge(8160, 6120, COPY_LONG_EDGE)
    const steps = scaleSteps(8160, 6120, target)
    expect(steps).toEqual([{ width: 4080, height: 3060 }, { width: 2560, height: 1920 }])
    for (let i = 1; i < steps.length; i++) expect(steps[i - 1]!.width / steps[i]!.width).toBeLessThanOrEqual(2)
  })

  it('makes the thumbnail from the copy in one step of exactly 2x', () => {
    expect(THUMBNAIL_LONG_EDGE).toBe(1280)
    expect(scaleSteps(2560, 1920, fitLongEdge(2560, 1920, THUMBNAIL_LONG_EDGE))).toEqual([{ width: 1280, height: 960 }])
  })

  it('has no step for an image already at its target', () => {
    expect(scaleSteps(400, 300, fitLongEdge(400, 300, THUMBNAIL_LONG_EDGE))).toEqual([])
  })

  it('never takes a step of more than 2x', () => {
    for (const [w, h] of [[12000, 9000], [5121, 100], [100, 9000], [2561, 2561]] as const) {
      const target = fitLongEdge(w, h, COPY_LONG_EDGE)
      let prev: { width: number; height: number } = { width: w, height: h }
      for (const step of scaleSteps(w, h, target)) {
        expect(prev.width / step.width).toBeLessThanOrEqual(2)
        expect(prev.height / step.height).toBeLessThanOrEqual(2.01)
        prev = step
      }
      expect(prev).toEqual(target)
    }
  })
})

// T-0040 (D-0041): the card image is the centre 4:3 crop, never enlarged.
describe('cardCrop', () => {
  it('is 640×480', () => {
    expect([CARD_WIDTH, CARD_HEIGHT, CARD_THUMB]).toEqual([640, 480, '640x480'])
  })

  it('takes the whole of a 4:3 copy', () => {
    expect(cardCrop(2560, 1920)).toEqual({ x: 0, y: 0, width: 2560, height: 1920 })
    expect(cardCrop(640, 480)).toEqual({ x: 0, y: 0, width: 640, height: 480 })
  })

  it('takes the full height of a wider copy, centred: round((source − crop) / 2)', () => {
    // 3:2 copy, 2560×1707: crop 2276×1707 (1707 × 4/3 = 2276), offset round(284 / 2) = 142.
    expect(cardCrop(2560, 1707)).toEqual({ x: 142, y: 0, width: 2276, height: 1707 })
    // A panorama: 853 × 4/3 = 1137.33, so 1137 wide.
    expect(cardCrop(2560, 853)).toEqual({ x: Math.round((2560 - 1137) / 2), y: 0, width: 1137, height: 853 })
  })

  it('takes the full width of a portrait copy, centred', () => {
    // 1920×2560: crop 1920×1440, offset (2560 − 1440) / 2 = 560.
    expect(cardCrop(1920, 2560)).toEqual({ x: 0, y: 560, width: 1920, height: 1440 })
    expect(cardCrop(1707, 2560)).toEqual({ x: 0, y: Math.round((2560 - 1280) / 2), width: 1707, height: 1280 })
  })

  it('is null when the 4:3 crop is smaller than 640×480: never enlarged', () => {
    expect(cardCrop(600, 450)).toBeNull()
    expect(cardCrop(2560, 470)).toBeNull()
    expect(cardCrop(630, 2560)).toBeNull()
  })

  it('never leaves the copy, and keeps 4:3 within a pixel', () => {
    for (let w = 640; w < 3000; w += 37)
      for (let h = 480; h < 3000; h += 41) {
        const c = cardCrop(w, h)!
        expect(c.x + c.width).toBeLessThanOrEqual(w)
        expect(c.y + c.height).toBeLessThanOrEqual(h)
        expect(Math.abs(c.width * 3 - c.height * 4)).toBeLessThanOrEqual(4)
      }
  })
})

// The backend's `thumbs` on photos.thumbnail must be the card size (D-0041).
describe('the card-image migration', () => {
  it('sets thumbs to `${CARD_WIDTH}x${CARD_HEIGHT}`, its only thumb size', () => {
    const dir = new URL('../../backend/pb_migrations/', import.meta.url)
    const file = readdirSync(dir).find((f) => f.endsWith('_card_thumbs.js'))
    expect(file).toBeDefined()
    const source = readFileSync(new URL(file!, dir), 'utf8')
    const values = [...source.matchAll(/thumbs\s*=\s*\[([^\]]*)\]/g)].map((m) => m[1]!.trim())
    // Up: the card size, alone (D-0041 guidance: no other sizes). Down: none.
    expect(values).toEqual([`"${CARD_WIDTH}x${CARD_HEIGHT}"`, ''])
  })
})
