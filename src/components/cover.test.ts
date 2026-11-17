import { describe, expect, it } from 'vitest'
import type { Photo } from '../db/db'
import { pickCover } from './cover'

const blob = new Blob([])

function photo(id: string, takenAt: string, extra: Partial<Photo> = {}): Photo {
  return {
    id,
    projectId: 'p1',
    entryId: 'e1',
    takenAt,
    blob,
    thumbnail: blob,
    original: null,
    uploads: { original: 'none', copy: 'none', thumbnail: 'none' },
    width: 4,
    height: 3,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deletedAt: null,
    ...extra,
  }
}

const deletedAt = '2026-11-02T00:00:00.000Z'
const old = photo('old', '2026-10-01T10:00:00.000Z')
const mid = photo('mid', '2026-10-05T10:00:00.000Z')
const newest = photo('newest', '2026-10-09T10:00:00.000Z')

describe('pickCover', () => {
  it('shows the chosen cover while it is alive', () => {
    expect(pickCover({ id: 'p1', coverPhotoId: 'old' }, [old, mid, newest])?.id).toBe('old')
  })

  it('falls back to the newest remaining photo once the cover is deleted', () => {
    expect(pickCover({ id: 'p1', coverPhotoId: 'old' }, [{ ...old, deletedAt }, mid, newest])?.id).toBe('newest')
  })

  it('skips deleted photos in the fallback', () => {
    expect(pickCover({ id: 'p1', coverPhotoId: 'gone' }, [old, mid, { ...newest, deletedAt }])?.id).toBe('mid')
  })

  it('uses the newest photo when no cover was chosen', () => {
    expect(pickCover({ id: 'p1' }, [mid, newest, old])?.id).toBe('newest')
  })

  it('breaks a tie on date taken by when the photo was added', () => {
    const a = photo('a', '2026-10-01T10:00:00.000Z', { createdAt: '2026-11-01T00:00:00.000Z' })
    const b = photo('b', '2026-10-01T10:00:00.000Z', { createdAt: '2026-11-03T00:00:00.000Z' })
    expect(pickCover({ id: 'p1' }, [a, b])?.id).toBe('b')
  })

  it('ignores photos of other projects', () => {
    const other = photo('other', '2027-01-01T10:00:00.000Z', { projectId: 'p2' })
    expect(pickCover({ id: 'p1', coverPhotoId: 'other' }, [old, other])?.id).toBe('old')
  })

  it('is nothing when no photos are left, so the card shows the no-photo tile', () => {
    expect(pickCover({ id: 'p1', coverPhotoId: 'old' }, [{ ...old, deletedAt }])).toBeUndefined()
  })
})
