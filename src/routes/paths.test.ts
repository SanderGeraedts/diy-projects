import { describe, expect, it } from 'vitest'
import {
  compareEntries,
  comparePhotos,
  entryDays,
  entryForDay,
  photoIndex,
  photoNumber,
  photoSequence,
  projectTimeline,
  withSlug,
} from './paths'

// T-0027 (D-0029): an entry's day and a photo's place, the parts of addresses that replace ids.

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
  it('are 1-based, in the order photos are shown: taken, then added, then id', () => {
    const photos = [
      { id: 'z', takenAt: '2026-10-04T10:00:00Z', createdAt: '2026-10-04T12:00:00Z' },
      { id: 'y', takenAt: '2026-10-04T10:00:00Z', createdAt: '2026-10-04T11:00:00Z' },
      { id: 'x', takenAt: '2026-10-04T09:00:00Z', createdAt: '2026-10-04T13:00:00Z' },
    ]
    expect([...photos].sort(comparePhotos).map((p) => p.id)).toEqual(['x', 'y', 'z'])
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

// T-0029 (D-0031): the project page and the viewer share one order.
describe('the project timeline and the viewer sequence', () => {
  const e = (id: string, date: string, createdAt: string, deletedAt: string | null = null) => ({
    id,
    date,
    createdAt,
    deletedAt,
  })
  const p = (id: string, entryId: string, takenAt: string, deletedAt: string | null = null) => ({
    id,
    entryId,
    takenAt,
    createdAt: takenAt,
    deletedAt,
  })
  const entries = [
    e('e-oct04', '2026-10-04', '2026-10-04T20:00:00Z'),
    e('e-oct25', '2026-10-25', '2026-10-25T20:00:00Z'),
    e('e-oct11', '2026-10-11', '2026-10-11T20:00:00Z'),
    e('e-note', '2026-10-18', '2026-10-18T20:00:00Z'), // note only
    e('e-gone', '2026-10-20', '2026-10-20T20:00:00Z'), // every photo deleted
    e('e-deleted', '2026-10-30', '2026-10-30T20:00:00Z', '2026-10-31T00:00:00Z'),
    // A second entry on 4 okt, made later (an offline device): its day is 2026-10-04-2.
    e('e-oct04-later', '2026-10-04', '2026-10-05T08:00:00Z'),
  ]
  const photos = [
    p('oct04-b', 'e-oct04', '2026-10-04T11:00:00Z'),
    p('oct04-a', 'e-oct04', '2026-10-04T10:00:00Z'),
    p('oct04-c', 'e-oct04', '2026-10-04T12:00:00Z'),
    p('oct11-2', 'e-oct11', '2026-10-11T12:00:00Z'),
    p('oct11-1', 'e-oct11', '2026-10-11T10:00:00Z'),
    p('oct11-x', 'e-oct11', '2026-10-11T11:00:00Z', '2026-10-12T00:00:00Z'),
    p('oct20-x', 'e-gone', '2026-10-20T10:00:00Z', '2026-10-21T00:00:00Z'),
    p('oct25-1', 'e-oct25', '2026-10-25T10:00:00Z'),
    p('oct30-1', 'e-deleted', '2026-10-30T10:00:00Z'),
    p('oct04-later-1', 'e-oct04-later', '2026-10-05T09:00:00Z'),
  ]

  it('lists live entries newest first, equal dates by id descending, each with its day and live photos', () => {
    const timeline = projectTimeline(entries, photos)
    expect(timeline.map((t) => [t.entry.id, t.day, t.photos.map((ph) => ph.id)])).toEqual([
      ['e-oct25', '2026-10-25', ['oct25-1']],
      ['e-gone', '2026-10-20', []],
      ['e-note', '2026-10-18', []],
      ['e-oct11', '2026-10-11', ['oct11-1', 'oct11-2']],
      ['e-oct04-later', '2026-10-04-2', ['oct04-later-1']],
      ['e-oct04', '2026-10-04', ['oct04-a', 'oct04-b', 'oct04-c']],
    ])
    expect(compareEntries({ id: 'a', date: '2026-10-04' }, { id: 'b', date: '2026-10-04' })).toBeGreaterThan(0)
  })

  it('runs through the photos in page order, skipping days without live photos, with each day and place', () => {
    const sequence = photoSequence(entries, photos)
    expect(sequence.map((s) => `${s.day}/${s.index + 1} of ${s.count}: ${s.photo.id}`)).toEqual([
      '2026-10-25/1 of 1: oct25-1',
      '2026-10-11/1 of 2: oct11-1',
      '2026-10-11/2 of 2: oct11-2',
      '2026-10-04-2/1 of 1: oct04-later-1',
      '2026-10-04/1 of 3: oct04-a',
      '2026-10-04/2 of 3: oct04-b',
      '2026-10-04/3 of 3: oct04-c',
    ])
    // Its days are the addresses' days: the same entry a day segment names.
    for (const s of sequence) expect(entryForDay(entries.filter((x) => !x.deletedAt), s.day)?.id).toBe(s.entry.id)
  })

  it('is empty for a project without live photos', () => {
    expect(photoSequence([e('n', '2026-10-01', '2026-10-01T00:00:00Z')], [])).toEqual([])
  })
})
