import { describe, expect, it } from 'vitest'
import { normalizeTags, suggestTags } from './tags'

describe('normalizeTags', () => {
  it('trims, lower-cases and de-duplicates, keeping the first order', () => {
    expect(normalizeTags(['  Hout ', 'tuin', 'HOUT', '', '  '])).toEqual(['hout', 'tuin'])
  })

  it('splits on commas', () => {
    expect(normalizeTags(['Hout, Tuin,,badkamer', 'tuin'])).toEqual(['hout', 'tuin', 'badkamer'])
  })
})

describe('suggestTags', () => {
  const inUse = ['tuin', 'hout', 'Badkamer', 'hout', 'houtbewerking']

  it('offers tags in use that are not chosen, alphabetically', () => {
    expect(suggestTags(inUse, ['tuin'], '')).toEqual(['badkamer', 'hout', 'houtbewerking'])
  })

  it('filters by what is typed, and leaves out an exact match', () => {
    expect(suggestTags(inUse, [], ' Ho')).toEqual(['hout', 'houtbewerking'])
    expect(suggestTags(inUse, [], 'hout')).toEqual(['houtbewerking'])
  })

  it('caps the list', () => {
    expect(suggestTags(inUse, [], '', 2)).toEqual(['badkamer', 'hout'])
  })
})
