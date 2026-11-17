import { describe, expect, it } from 'vitest'
import { dateTaken } from './dateTaken'
import { BARE_JPEG, withExif } from './exifFixture'
import { fitLongEdge } from './resize'

const jpeg = (bytes: Uint8Array, lastModified = 0) =>
  new File([bytes as BlobPart], 'photo.jpg', { type: 'image/jpeg', lastModified })

describe('dateTaken', () => {
  it('reads EXIF DateTimeOriginal as a local date and time', async () => {
    const file = jpeg(withExif(BARE_JPEG, { dateTimeOriginal: '2026:10:04 14:30:05', orientation: 6 }))
    expect(await dateTaken(file)).toEqual({ takenAt: '2026-10-04T14:30:05', source: 'exif' })
  })

  it('falls back to the last-modified date, flagged, without EXIF', async () => {
    const lastModified = new Date(2026, 9, 11, 9, 5, 7).getTime()
    expect(await dateTaken(jpeg(BARE_JPEG, lastModified))).toEqual({
      takenAt: '2026-10-11T09:05:07',
      source: 'lastModified',
    })
  })

  it('falls back when EXIF has no DateTimeOriginal', async () => {
    const lastModified = new Date(2026, 0, 2, 3, 4, 5).getTime()
    const file = jpeg(withExif(BARE_JPEG, { orientation: 1 }), lastModified)
    expect(await dateTaken(file)).toEqual({ takenAt: '2026-01-02T03:04:05', source: 'lastModified' })
  })

  it('falls back for a file that is not an image', async () => {
    const file = new File(['hello'], 'notes.txt', { lastModified: new Date(2026, 4, 6, 7, 8, 9).getTime() })
    expect(await dateTaken(file)).toEqual({ takenAt: '2026-05-06T07:08:09', source: 'lastModified' })
  })
})

describe('fitLongEdge', () => {
  it('scales the long edge to the target', () => {
    expect(fitLongEdge(6000, 4000, 2560)).toEqual({ width: 2560, height: 1707 })
    expect(fitLongEdge(4000, 6000, 2560)).toEqual({ width: 1707, height: 2560 })
  })
  it('never upscales', () => {
    expect(fitLongEdge(1200, 800, 2560)).toEqual({ width: 1200, height: 800 })
  })
})
