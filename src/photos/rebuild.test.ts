// @vitest-environment node
// Node, not jsdom: jsdom Blobs do not survive fake-indexeddb's structured clone.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb, type DiyDb, type Photo } from '../db/db'
import { toServer } from '../sync/records'
import { createThumbnailChecker, rebuildThumbnails, type RebuildDeps } from './rebuild'
import { fitLongEdge, THUMBNAIL_LONG_EDGE } from './resize'

// T-0037 (D-0038): each device rebuilds its older thumbnails from its copy, locally only.
// The worker is faked: an "image" here is a Blob whose text is its size, "WxH".

let db: DiyDb | undefined
let counter = 0

afterEach(async () => {
  await db?.delete()
  db = undefined
})

const image = (width: number, height: number) => new Blob([`${width}x${height}`], { type: 'image/webp' })

function fakeWorker() {
  const measure = vi.fn(async (blob: Blob) => {
    const [width, height] = (await blob.text()).split('x').map(Number)
    return { width: width!, height: height! }
  })
  const makeThumbnail = vi.fn(async (copy: Blob) => {
    const { width, height } = await measure(copy)
    const size = fitLongEdge(width, height, THUMBNAIL_LONG_EDGE)
    return image(size.width, size.height)
  })
  return { measure, makeThumbnail }
}

function photo(id: string, copy: { width: number; height: number }, thumbnail: { width: number; height: number }, extra: Partial<Photo> = {}): Photo {
  return {
    id,
    projectId: 'p1',
    entryId: 'e1',
    takenAt: '2026-01-01T10:00:00',
    blob: image(copy.width, copy.height),
    thumbnail: image(thumbnail.width, thumbnail.height),
    original: null,
    uploads: { original: 'uploaded', copy: 'uploaded', thumbnail: 'uploaded' },
    width: copy.width,
    height: copy.height,
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-02T10:00:00.000Z',
    deletedAt: null,
    ...extra,
  }
}

async function setup(photos: Photo[]) {
  db = openDb(`rebuild-test-${++counter}`)
  await db.photos.bulkAdd(photos)
  const worker = fakeWorker()
  const deps: RebuildDeps = { db, ...worker }
  return { db, deps, worker }
}

describe('rebuildThumbnails', () => {
  it('rebuilds a 512 px thumbnail to 1280 px, locally: no outbox row, uploads and updatedAt unchanged', async () => {
    const old = photo('old', { width: 2560, height: 1920 }, { width: 512, height: 384 })
    const { db, deps } = await setup([old])

    const result = await rebuildThumbnails(deps)

    expect(result).toEqual({ measured: 0, rebuilt: 1, failed: [] })
    const after = (await db.photos.get('old'))!
    expect(await after.thumbnail.text()).toBe('1280x960')
    expect(after.thumbnailWidth).toBe(1280)
    expect(after.uploads).toEqual(old.uploads)
    expect(after.updatedAt).toBe(old.updatedAt)
    expect(await db.outbox.count()).toBe(0)
  })

  it('leaves a photo whose copy is 512 px or smaller alone, and does not check it again', async () => {
    const small = photo('small', { width: 400, height: 300 }, { width: 400, height: 300 })
    const { db, deps, worker } = await setup([small])

    expect(await rebuildThumbnails(deps)).toEqual({ measured: 1, rebuilt: 0, failed: [] })
    expect(worker.makeThumbnail).not.toHaveBeenCalled()
    const after = (await db.photos.get('small'))!
    expect(after.thumbnailWidth).toBe(400)
    expect(await after.thumbnail.text()).toBe('400x300')
    expect(after.updatedAt).toBe(small.updatedAt)

    // The next start: nothing left to check.
    worker.measure.mockClear()
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 0, rebuilt: 0, failed: [] })
    expect(worker.measure).not.toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(0)
  })

  it('only records the width of a thumbnail that already has the current size', async () => {
    const { db, deps, worker } = await setup([photo('new', { width: 1920, height: 2560 }, { width: 960, height: 1280 })])
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 1, rebuilt: 0, failed: [] })
    expect(worker.makeThumbnail).not.toHaveBeenCalled()
    expect((await db.photos.get('new'))!.thumbnailWidth).toBe(960)
  })

  it('rebuilds a v1 photo whose thumbnail is its copy', async () => {
    const { db, deps } = await setup([photo('v1', { width: 2560, height: 1920 }, { width: 2560, height: 1920 })])
    expect((await rebuildThumbnails(deps)).rebuilt).toBe(1)
    expect((await db.photos.get('v1'))!.thumbnailWidth).toBe(1280)
  })

  it('leaves a photo with a pending upload until it is uploaded, so no rebuilt thumbnail goes to the NAS', async () => {
    const pending = photo('pending', { width: 2560, height: 1920 }, { width: 512, height: 384 }, {
      uploads: { original: 'pending', copy: 'pending', thumbnail: 'pending' },
    })
    const { db, deps, worker } = await setup([pending])
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 0, rebuilt: 0, failed: [] })
    expect(worker.measure).not.toHaveBeenCalled()
    expect(await (await db.photos.get('pending'))!.thumbnail.text()).toBe('512x384')
  })

  it('checks a photo downloaded later on the next pass', async () => {
    const { db, deps } = await setup([])
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 0, rebuilt: 0, failed: [] })
    // As src/sync/records.ts downloadedPhoto stores it: no thumbnailWidth, nothing to upload.
    await db.photos.add(photo('downloaded', { width: 2560, height: 1707 }, { width: 512, height: 341 }, {
      uploads: { original: 'none', copy: 'none', thumbnail: 'none' },
    }))
    expect((await rebuildThumbnails(deps)).rebuilt).toBe(1)
    expect((await db.photos.get('downloaded'))!.thumbnailWidth).toBe(1280)
  })

  it('keeps the old thumbnail when a rebuild fails, and the checker does not retry it until the next start', async () => {
    const { db, deps, worker } = await setup([photo('bad', { width: 2560, height: 1920 }, { width: 512, height: 384 })])
    worker.makeThumbnail.mockRejectedValue(new Error('cannot decode'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const checker = createThumbnailChecker(deps)

    await checker.check()
    expect(warn).toHaveBeenCalledTimes(1)
    const after = (await db.photos.get('bad'))!
    expect(await after.thumbnail.text()).toBe('512x384')
    expect(after.thumbnailWidth).toBeUndefined()

    worker.measure.mockClear()
    await checker.check()
    expect(worker.measure).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('never sends thumbnailWidth to the NAS', () => {
    const sent = toServer('photos', photo('x', { width: 2560, height: 1920 }, { width: 1280, height: 960 }, { thumbnailWidth: 1280 }))
    expect(Object.keys(sent)).not.toContain('thumbnailWidth')
    expect(Object.keys(sent)).not.toContain('thumbnail')
  })
})
