// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { Photo } from '../db/db'
import { confirmedFiles, downloadable, nextUpload, stepFiles, uploadBody, uploadProgress } from './photos'

function photo(changes: Partial<Photo> = {}): Photo {
  return {
    id: 'p1',
    projectId: 'pr',
    entryId: 'e',
    takenAt: '2026-11-16T09:00:00.000Z',
    blob: new Blob(['copy'], { type: 'image/webp' }),
    thumbnail: new Blob(['thumb'], { type: 'image/webp' }),
    original: new File(['orig'], 'IMG_0001.JPG', { type: 'image/jpeg' }),
    uploads: { original: 'pending', copy: 'pending', thumbnail: 'pending' },
    width: 4,
    height: 3,
    createdAt: '2026-11-17T10:00:00.000Z',
    updatedAt: '2026-11-17T10:00:00.000Z',
    deletedAt: null,
    ...changes,
  }
}

describe('photo file helpers (T-0017)', () => {
  it('uploads copy and thumbnail first, then the original, and nothing for a tombstone', () => {
    expect(nextUpload(photo())).toBe('copy+thumbnail')
    expect(nextUpload(photo({ uploads: { original: 'pending', copy: 'uploaded', thumbnail: 'pending' } }))).toBe(
      'copy+thumbnail',
    )
    expect(nextUpload(photo({ uploads: { original: 'pending', copy: 'uploaded', thumbnail: 'uploaded' } }))).toBe('original')
    expect(nextUpload(photo({ uploads: { original: 'uploaded', copy: 'uploaded', thumbnail: 'uploaded' } }))).toBeNull()
    expect(nextUpload(photo({ deletedAt: '2026-11-17T11:00:00.000Z' }))).toBeNull()
    expect(nextUpload(photo({ uploads: { original: 'none', copy: 'none', thumbnail: 'none' }, original: null }))).toBeNull()
  })

  it('sends only the pending files, the original under its own name and unchanged', async () => {
    const p = photo({ uploads: { original: 'pending', copy: 'uploaded', thumbnail: 'pending' } })
    expect(stepFiles(p, 'copy+thumbnail')).toEqual(['thumbnail'])
    const small = uploadBody(photo(), 'copy+thumbnail')
    expect([...small.keys()]).toEqual(['copy', 'thumbnail'])
    expect((small.get('copy') as File).name).toBe('copy.webp')
    const big = uploadBody(photo(), 'original')
    const original = big.get('original') as File
    expect(original.name).toBe('IMG_0001.JPG')
    expect(await original.text()).toBe('orig')
    expect((uploadBody(photo({ original: new Blob(['x']) }), 'original').get('original') as File).name).toBe('original.bin')
  })

  it('counts a file as confirmed only when the answer names it', () => {
    const stored = { id: 'p1', updated: '', copy: 'copy_ab12.webp', thumbnail: '' }
    expect(confirmedFiles(stored, ['copy', 'thumbnail'])).toEqual(['copy'])
  })

  it('downloads only live photos with both small files on the NAS', () => {
    expect(downloadable({ id: 'a', updated: '', copy: 'c.webp', thumbnail: 't.webp', deletedAt: '' })).toEqual({
      copy: 'c.webp',
      thumbnail: 't.webp',
    })
    expect(downloadable({ id: 'a', updated: '', copy: 'c.webp', thumbnail: '' })).toBeNull()
    expect(downloadable({ id: 'a', updated: '', copy: 'c', thumbnail: 't', deletedAt: '2026-11-17T11:00:00.000Z' })).toBeNull()
  })

  it('reports per-photo progress', () => {
    expect(uploadProgress(photo({ uploads: { original: 'pending', copy: 'uploaded', thumbnail: 'uploaded' } }))).toEqual({
      confirmed: 2,
      total: 3,
    })
    expect(uploadProgress(photo({ uploads: { original: 'none', copy: 'none', thumbnail: 'none' } }))).toEqual({
      confirmed: 0,
      total: 0,
    })
  })
})
