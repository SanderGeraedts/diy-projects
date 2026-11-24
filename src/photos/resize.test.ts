import { describe, expect, it } from 'vitest'
import { COPY_LONG_EDGE, fitLongEdge, scaleSteps, THUMBNAIL_LONG_EDGE } from './resize'

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
