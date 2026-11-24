// @vitest-environment node
// Node, not jsdom: jsdom Blobs do not survive fake-indexeddb's structured clone.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb, type DiyDb, type Photo } from '../db/db'
import { toServer } from '../sync/records'
import { createThumbnailChecker, rebuildThumbnails, type RebuildDeps } from './rebuild'
import { cardCrop, fitLongEdge, THUMBNAIL_LONG_EDGE } from './resize'

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
  // As the worker's encodeCard: 640×480, or null when the copy's 4:3 crop is smaller.
  const makeCard = vi.fn(async (copy: Blob): Promise<Blob | null> => {
    const { width, height } = await measure(copy)
    return cardCrop(width, height) ? image(640, 480) : null
  })
  return { measure, makeThumbnail, makeCard }
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

    expect(result).toEqual({ measured: 0, rebuilt: 1, cards: 1, failed: [] })
    const after = (await db.photos.get('old'))!
    expect(await after.thumbnail.text()).toBe('1280x960')
    expect(after.thumbnailWidth).toBe(1280)
    // T-0038: the sync is to check the NAS's thumbnail and send this one over an older one.
    expect(after.thumbnailOnNas).toBe('check')
    expect(after.uploads).toEqual(old.uploads)
    expect(after.updatedAt).toBe(old.updatedAt)
    expect(await db.outbox.count()).toBe(0)
  })

  it('leaves a photo whose copy is 512 px or smaller alone, and does not check it again', async () => {
    const small = photo('small', { width: 400, height: 300 }, { width: 400, height: 300 })
    const { db, deps, worker } = await setup([small])

    expect(await rebuildThumbnails(deps)).toEqual({ measured: 1, rebuilt: 0, cards: 0, failed: [] })
    expect(worker.makeThumbnail).not.toHaveBeenCalled()
    const after = (await db.photos.get('small'))!
    expect(after.thumbnailWidth).toBe(400)
    expect(await after.thumbnail.text()).toBe('400x300')
    expect(after.updatedAt).toBe(small.updatedAt)

    // The next start: nothing left to check.
    worker.measure.mockClear()
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 0, rebuilt: 0, cards: 0, failed: [] })
    expect(worker.measure).not.toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(0)
  })

  it('only records the width of a thumbnail that already has the current size', async () => {
    const { db, deps, worker } = await setup([photo('new', { width: 1920, height: 2560 }, { width: 960, height: 1280 })])
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 1, rebuilt: 0, cards: 1, failed: [] })
    expect(worker.makeThumbnail).not.toHaveBeenCalled()
    expect((await db.photos.get('new'))!.thumbnailWidth).toBe(960)
    // T-0038: what the NAS has too, so the sync never checks it.
    expect((await db.photos.get('new'))!.thumbnailOnNas).toBe('done')
  })

  it('rebuilds a v1 photo whose thumbnail is its copy', async () => {
    const { db, deps } = await setup([photo('v1', { width: 2560, height: 1920 }, { width: 2560, height: 1920 })])
    expect((await rebuildThumbnails(deps)).rebuilt).toBe(1)
    expect((await db.photos.get('v1'))!.thumbnailWidth).toBe(1280)
  })

  it('leaves a photo with a pending upload until it is uploaded: its own upload sends its thumbnail', async () => {
    const pending = photo('pending', { width: 2560, height: 1920 }, { width: 512, height: 384 }, {
      uploads: { original: 'pending', copy: 'pending', thumbnail: 'pending' },
      cardWidth: 0,
    })
    const { db, deps, worker } = await setup([pending])
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 0, rebuilt: 0, cards: 0, failed: [] })
    expect(worker.measure).not.toHaveBeenCalled()
    expect(await (await db.photos.get('pending'))!.thumbnail.text()).toBe('512x384')
  })

  it('checks a photo downloaded later on the next pass', async () => {
    const { db, deps } = await setup([])
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 0, rebuilt: 0, cards: 0, failed: [] })
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

// T-0040 (D-0041): the same pass makes each photo's 640×480 card image, locally only.
describe('card images', () => {
  it('makes a card image for a photo without one: no outbox row, uploads and updatedAt unchanged, thumbnail measured in the same step', async () => {
    const before = photo('a', { width: 2560, height: 1920 }, { width: 1280, height: 960 })
    const { db, deps } = await setup([before])

    expect(await rebuildThumbnails(deps)).toEqual({ measured: 1, rebuilt: 0, cards: 1, failed: [] })
    const after = (await db.photos.get('a'))!
    expect(await after.card!.text()).toBe('640x480')
    expect(after.cardWidth).toBe(640)
    expect(after.thumbnailWidth).toBe(1280)
    expect(after.uploads).toEqual(before.uploads)
    expect(after.updatedAt).toBe(before.updatedAt)
    expect(await db.outbox.count()).toBe(0)
  })

  it('makes it for a photo whose upload is pending too, without touching its thumbnail', async () => {
    const pending = photo('p', { width: 2560, height: 1920 }, { width: 512, height: 384 }, {
      uploads: { original: 'pending', copy: 'pending', thumbnail: 'pending' },
    })
    const { db, deps, worker } = await setup([pending])
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 0, rebuilt: 0, cards: 1, failed: [] })
    expect(worker.makeThumbnail).not.toHaveBeenCalled()
    const after = (await db.photos.get('p'))!
    expect(after.cardWidth).toBe(640)
    expect(after.thumbnailWidth).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })

  it('gives a 600×450 copy no card image, and does not try it again on the next start', async () => {
    const { db, deps, worker } = await setup([photo('small', { width: 600, height: 450 }, { width: 600, height: 450 })])
    expect(await rebuildThumbnails(deps)).toEqual({ measured: 1, rebuilt: 0, cards: 0, failed: [] })
    const after = (await db.photos.get('small'))!
    expect(after.card).toBeUndefined()
    expect(after.cardWidth).toBe(0)

    // A new start (a new checker): nothing to do for it.
    worker.makeCard.mockClear()
    await createThumbnailChecker(deps).check()
    expect(worker.makeCard).not.toHaveBeenCalled()
    expect(await db.outbox.count()).toBe(0)
  })

  it('logs a throwing encoder once and does not loop; the photo is tried again on the next start', async () => {
    const { db, deps, worker } = await setup([photo('bad', { width: 2560, height: 1920 }, { width: 1280, height: 960 })])
    worker.makeCard.mockRejectedValue(new Error('no encoder'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const checker = createThumbnailChecker(deps)

    await Promise.all([checker.check(), checker.check(), checker.check()])
    await checker.check()
    expect(worker.makeCard).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    const after = (await db.photos.get('bad'))!
    expect(after.cardWidth).toBeUndefined()
    // The thumbnail's measure still counts: it isn't measured again.
    expect(after.thumbnailWidth).toBe(1280)

    // The next start tries the card image again.
    worker.makeCard.mockResolvedValue(image(640, 480))
    await createThumbnailChecker(deps).check()
    expect((await db.photos.get('bad'))!.cardWidth).toBe(640)
    warn.mockRestore()
  })

  it('makes a card image for a photo downloaded later, on the next pass', async () => {
    const { db, deps } = await setup([])
    await db.photos.add(photo('downloaded', { width: 1920, height: 2560 }, { width: 960, height: 1280 }, {
      uploads: { original: 'none', copy: 'none', thumbnail: 'none' },
    }))
    expect((await rebuildThumbnails(deps)).cards).toBe(1)
    expect((await db.photos.get('downloaded'))!.cardWidth).toBe(640)
  })

  it('never sends the card image or its width to the NAS', () => {
    const sent = toServer('photos', photo('x', { width: 2560, height: 1920 }, { width: 1280, height: 960 }, { card: image(640, 480), cardWidth: 640 }))
    expect(Object.keys(sent)).not.toContain('card')
    expect(Object.keys(sent)).not.toContain('cardWidth')
    expect(JSON.stringify(sent)).not.toMatch(/card/i)
  })
})
