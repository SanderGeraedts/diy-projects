import { describe, expect, it } from 'vitest'
import { comparePhotos, entryDays, entryForDay, photoIndex, photoNumber, withSlug } from './paths'

// T-0027 (D-0029, D-0031): an entry's day and a photo's place, the parts of addresses that replace ids.

const entry = (id: string, date: string, createdAt = '2026-01-01T00:00:00.000Z') => ({ id, date, createdAt })

describe('entry days', () => {
  it('is the date, with -2, -3 for later entries of the same date, by creation', () => {
    const entries = [
      entry('b', '2026-10-04', '2026-10-05T00:00:00.000Z'),
      entry('a', '2026-10-04', '2026-10-04T00:00:00.000Z'),
      entry('c', '2026-10-11'),
      entry('d', '2026-10-04', '2026-10-05T00:00:00.000Z'),
    ]
    expect(Object.fromEntries(entryDays(entries))).toEqual({
      a: '2026-10-04',
      b: '2026-10-04-2',
      d: '2026-10-04-3',
      c: '2026-10-11',
    })
    expect(entryForDay(entries, '2026-10-04-2')?.id).toBe('b')
    expect(entryForDay(entries, '2026-10-11')?.id).toBe('c')
    expect(entryForDay(entries, '2026-10-12')).toBeUndefined()
    expect(entryForDay(entries, 'entry-a')).toBeUndefined()
  })
})

describe('photo places', () => {
  it('are 1-based, in the order photos are shown: newest first by taken, then added, then id (D-0031)', () => {
    const photos = [
      { id: 'x', takenAt: '2026-10-04T09:00:00Z', createdAt: '2026-10-04T13:00:00Z' },
      { id: 'y', takenAt: '2026-10-04T10:00:00Z', createdAt: '2026-10-04T11:00:00Z' },
      { id: 'z', takenAt: '2026-10-04T10:00:00Z', createdAt: '2026-10-04T12:00:00Z' },
    ]
    expect([...photos].sort(comparePhotos).map((p) => p.id)).toEqual(['z', 'y', 'x'])
    // Ties on both times: by id, descending.
    const tied = ['a', 'c', 'b'].map((id) => ({ id, takenAt: '2026-10-04T10:00:00Z', createdAt: '2026-10-04T11:00:00Z' }))
    expect(tied.sort(comparePhotos).map((p) => p.id)).toEqual(['c', 'b', 'a'])
    expect(photoNumber(0)).toBe('1')
    expect(photoIndex('1')).toBe(0)
    expect(photoIndex('12')).toBe(11)
    for (const bad of ['0', '01', '-1', 'x', '']) expect(photoIndex(bad)).toBe(-1)
  })
})

describe('withSlug', () => {
  it('swaps the slug and keeps the rest of the address', () => {
    expect(withSlug('/projects/kast', 'bank')).toBe('/projects/bank')
    expect(withSlug('/projects/kast/2026-10-04/2', 'bank')).toBe('/projects/bank/2026-10-04/2')
    expect(withSlug('/projects/kast/edit', 'bank')).toBe('/projects/bank/edit')
  })
})
