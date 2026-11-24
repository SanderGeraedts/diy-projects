import type { DiyDb, Photo } from '../db/db'
import { CARD_WIDTH, fitLongEdge, THUMBNAIL_LONG_EDGE } from './resize'

// T-0037 (D-0038): each device brings its own older thumbnails (about 512 px, T-0006) up to
// the current size, from the copy it holds. In the background, one photo at a time through
// the photo worker's queue, so it never blocks the app or an import; nothing is shown
// (T-0037 Design). The state lives in Dexie (`thumbnailWidth`), so it carries on after a
// reload, and photos downloaded later are checked on the next pass.
//
// A rebuild writes the local `thumbnail` blob, `thumbnailWidth` and `thumbnailOnNas` only: no
// outbox row, no change to `uploads` or `updatedAt`, nothing sent to the NAS. The sync sends a
// rebuilt thumbnail over the NAS's older one later (T-0038, D-0039, src/sync/engine.ts).
//
// T-0040 (D-0041): the same pass makes each photo's 640×480 card image from its copy, for
// photos from before it and photos downloaded later. It writes `card` and `cardWidth` only:
// local, never synced, nothing to upload, nothing shown.

export interface RebuildDeps {
  db: DiyDb
  /** Decodes an image and returns its pixel size (the worker's `measureImage`). */
  measure: (image: Blob) => Promise<{ width: number; height: number }>
  /** Makes a thumbnail from a copy (the worker's `makeThumbnail`). */
  makeThumbnail: (copy: Blob) => Promise<Blob>
  /**
   * Makes the 640×480 card image from a copy (the worker's `makeCard`, T-0040, D-0041); null
   * when the copy is too small for one.
   */
  makeCard: (copy: Blob) => Promise<Blob | null>
}

export interface RebuildResult {
  /** Thumbnails measured and found big enough: only their width was recorded. */
  measured: number
  /** Thumbnails made again from the copy. */
  rebuilt: number
  /** Card images made (T-0040); a copy too small for one is recorded but not counted. */
  cards: number
  /** Photos that failed; left as they are and tried again on a later start. */
  failed: string[]
}

/**
 * True when the device hasn't measured this photo's thumbnail yet. A photo whose upload is
 * still pending is left until it is uploaded: its own upload sends the thumbnail it has.
 */
export function needsCheck(photo: Photo): boolean {
  return photo.thumbnailWidth === undefined && photo.uploads.thumbnail !== 'pending' && photo.uploads.copy !== 'pending'
}

/**
 * True when the device hasn't made this photo's card image yet (T-0040, D-0041). The card
 * image is local only, so a pending upload doesn't matter.
 */
export function needsCard(photo: Photo): boolean {
  return photo.cardWidth === undefined
}

const needsWork = (photo: Photo) => needsCheck(photo) || needsCard(photo)

/** The width a thumbnail of this photo's copy has at the current size. */
export function currentThumbnailWidth(photo: Pick<Photo, 'width' | 'height'>): number {
  return fitLongEdge(photo.width, photo.height, THUMBNAIL_LONG_EDGE).width
}

type ThumbnailChange = Pick<Photo, 'thumbnailWidth' | 'thumbnailOnNas'> & Partial<Pick<Photo, 'thumbnail'>>
type CardChange = Pick<Photo, 'cardWidth'> & Partial<Pick<Photo, 'card'>>

/** Measures a photo's thumbnail, and makes it again from the copy when it is of another size. */
async function checkThumbnail(deps: RebuildDeps, photo: Photo): Promise<ThumbnailChange> {
  const { width } = await deps.measure(photo.thumbnail)
  const wanted = photo.width > 0 && photo.height > 0 ? currentThumbnailWidth(photo) : width
  // Older thumbnails are smaller; a v1 photo's "thumbnail" is its copy (db.ts upgradeToV2).
  if (Math.abs(width - wanted) > 1) {
    const thumbnail = await deps.makeThumbnail(photo.blob)
    return { thumbnail, thumbnailWidth: (await deps.measure(thumbnail)).width, thumbnailOnNas: 'check' }
  }
  // Already of the current size: what the NAS has too (downloaded, or made at this size
  // and uploaded), so the sync needn't check it (T-0038).
  return { thumbnailWidth: width, thumbnailOnNas: 'done' }
}

/** Makes a photo's card image from its copy, or records that the copy is too small. */
async function makeCardImage(deps: RebuildDeps, photo: Photo): Promise<CardChange> {
  const card = await deps.makeCard(photo.blob)
  return card ? { card, cardWidth: CARD_WIDTH } : { cardWidth: 0 }
}

/**
 * Checks every photo whose thumbnail this device hasn't measured, or whose card image it hasn't
 * made, one at a time: a thumbnail of another width than one made now from the copy is made
 * again, and either way its width is recorded, so it isn't checked again; in the same step the
 * card image is made (T-0040), so a measured thumbnail and the card image arrive together.
 * `skip` holds photos to leave alone this time.
 */
export async function rebuildThumbnails(deps: RebuildDeps, skip: ReadonlySet<string> = new Set()): Promise<RebuildResult> {
  const { db } = deps
  const result: RebuildResult = { measured: 0, rebuilt: 0, cards: 0, failed: [] }
  const ids = (await db.photos.filter(needsWork).primaryKeys()).filter((id) => !skip.has(id))
  for (const id of ids) {
    const photo = await db.photos.get(id).catch(() => undefined)
    if (!photo || !needsWork(photo)) continue
    const errors: unknown[] = []
    let thumbnail: ThumbnailChange | null = null
    let card: CardChange | null = null
    if (needsCheck(photo)) thumbnail = await checkThumbnail(deps, photo).catch((e: unknown) => (errors.push(e), null))
    if (needsCard(photo)) card = await makeCardImage(deps, photo).catch((e: unknown) => (errors.push(e), null))
    try {
      const written = await db.transaction('rw', db.photos, async () => {
        const now = await db.photos.get(id)
        // Changed meanwhile (a sync took over other files)? Then check it again next time.
        if (!now || now.blob.size !== photo.blob.size) return { thumbnail: false, card: false }
        const writeThumbnail = !!thumbnail && needsCheck(now) && now.thumbnail.size === photo.thumbnail.size
        const writeCard = !!card && needsCard(now)
        if (writeThumbnail || writeCard)
          await db.photos.update(id, { ...(writeThumbnail ? thumbnail : {}), ...(writeCard ? card : {}) })
        return { thumbnail: writeThumbnail, card: writeCard }
      })
      if (written.thumbnail) {
        if (thumbnail!.thumbnail) result.rebuilt++
        else result.measured++
      }
      if (written.card && card!.card) result.cards++
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0) {
      // One line per photo; nothing shown (T-0037, T-0040 Design).
      console.warn(`thumbnails: photo ${id} not checked`, ...errors)
      result.failed.push(id)
    }
  }
  return result
}

/**
 * Runs `rebuildThumbnails` in the background whenever asked: one pass at a time, and one
 * more after it when asked again meanwhile (e.g. after a sync downloaded photos). A photo
 * that failed isn't tried again until the app starts again.
 */
export function createThumbnailChecker(deps: RebuildDeps) {
  const failed = new Set<string>()
  let running: Promise<void> | null = null
  let again = false

  async function loop() {
    do {
      again = false
      const result = await rebuildThumbnails(deps, failed)
      for (const id of result.failed) failed.add(id)
    } while (again)
  }

  return {
    /** Starts a pass, or queues one after the running pass. Resolves when all is checked. */
    check(): Promise<void> {
      if (running) {
        again = true
        return running
      }
      running = loop()
        .catch((error: unknown) => console.warn('thumbnails: check stopped', error))
        .finally(() => {
          running = null
        })
      return running
    },
  }
}
