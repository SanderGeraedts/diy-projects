import { useLayoutEffect } from 'react'
import type { Photo } from '../db/db'
import { CARD_WIDTH, cardCrop, fitLongEdge, OLD_THUMBNAIL_LONG_EDGE, THUMBNAIL_LONG_EDGE } from '../photos/resize'
import { placeUrl, type PublicPhoto, type Place } from '../public/source'

/** A photo as shown: stored on the device (the owner), or by address on the NAS (a visitor, T-0026). */
export type ShownPhoto = Photo | PublicPhoto

/**
 * Object URLs of stored photos (D-0040), shared by every image that shows the same file and
 * kept while that file is the same. Dexie hands out a new Blob object for the same stored
 * file on every query, so an address is keyed by the photo, which of its files, and what
 * tells two files apart: the Blob's size and type. A rebuilt thumbnail or a file taken over
 * from the NAS differs in size, so it gets a new address; a write to other fields or other
 * photos keeps it. An address is revoked once no mounted image has used it for a moment.
 *
 * D-0042: Chrome takes a larger srcset candidate whose address it has already loaded in the
 * page. So a card's or tile's srcset gets addresses of its own, kept also per place, `sizes`
 * and candidate set (`set`): never the address of a single-file image (the viewer,
 * `SinglePhoto`, the thumbnail alone), of another place, or of an earlier candidate set.
 */
interface CachedUrl {
  url: string
  /** Mounted images using it. */
  refs: number
  /** When a render last asked for it; it isn't revoked within `REVOKE_AFTER_MS` of that. */
  touched: number
}

const urls = new Map<string, CachedUrl>()

/** A stored photo's files shown by address: the copy, the thumbnail and the card image (T-0040). */
type StoredFile = 'copy' | 'thumbnail' | 'card'

/** How long an address no mounted image uses is kept, for a render that is about to commit. */
export const REVOKE_AFTER_MS = 2000

/**
 * The cache key of one of a stored photo's files; with `set`, the address a card's or tile's
 * srcset uses for it (D-0042): its place, `sizes` and candidate set.
 */
export function fileKey(photoId: string, file: StoredFile, blob: Blob, set?: string): string {
  const key = `${photoId}|${file}|${blob.size}|${blob.type}`
  return set === undefined ? key : `${key}|${set}`
}

function sweepLater(key: string) {
  setTimeout(() => {
    const entry = urls.get(key)
    if (!entry || entry.refs > 0) return
    const wait = entry.touched + REVOKE_AFTER_MS - Date.now()
    if (wait > 0) return sweepLater(key)
    urls.delete(key)
    URL.revokeObjectURL(entry.url)
  }, REVOKE_AFTER_MS)
}

/** The address for a file, made the first time it is asked for. Read during render. */
function peekUrl(key: string, blob: Blob): string {
  let entry = urls.get(key)
  if (!entry) {
    entry = { url: URL.createObjectURL(blob), refs: 0, touched: Date.now() }
    urls.set(key, entry)
    // A render that never commits leaves it unused: revoke it then.
    sweepLater(key)
  }
  entry.touched = Date.now()
  return entry.url
}

/**
 * The object URL of one of a stored photo's files, stable while the file is the same. Taken
 * in a layout effect, so an address an `<img>` was just given is counted before the one it
 * replaces can be revoked.
 */
function useStoredUrl(photoId: string, file: StoredFile, blob: Blob | undefined, set?: string): string | undefined {
  const key = blob ? fileKey(photoId, file, blob, set) : undefined
  const url = key && blob ? peekUrl(key, blob) : undefined
  useLayoutEffect(() => {
    if (!key) return
    const entry = urls.get(key)
    if (entry) entry.refs++
    return () => {
      const now = urls.get(key)
      if (!now) return
      now.refs--
      now.touched = Date.now()
      if (now.refs <= 0) sweepLater(key)
    }
  }, [key])
  return url
}

/** The address to show a photo's copy or thumbnail from; for a stored photo, an object URL. */
export function usePhotoUrl(photo: ShownPhoto, file: 'copy' | 'thumbnail', wanted = true): string | undefined {
  const remote = 'copyUrl' in photo ? (file === 'thumbnail' ? photo.thumbnailUrl : photo.copyUrl) : undefined
  const blob = 'copyUrl' in photo || !wanted ? undefined : file === 'thumbnail' ? photo.thumbnail : photo.blob
  const url = useStoredUrl(photo.id, file, blob)
  return remote ?? url
}

/**
 * The address of a photo's thumbnail or copy in a card's or tile's srcset (D-0042): for a
 * stored photo, an object URL of this place and candidate set (`set`); for a visitor, the
 * file's address with the place marker. Never the address `usePhotoUrl` gives.
 */
function useSrcsetUrl(photo: ShownPhoto, file: 'copy' | 'thumbnail', place: Place, set: string | undefined): string | undefined {
  const blob = 'copyUrl' in photo || set === undefined ? undefined : file === 'thumbnail' ? photo.thumbnail : photo.blob
  const url = useStoredUrl(photo.id, file, blob, set)
  if ('copyUrl' in photo) return placeUrl(file === 'thumbnail' ? photo.thumbnailUrl : photo.copyUrl, place)
  return url
}

/**
 * The thumbnail's width for its `srcset` label (D-0038): never more than it really has. On
 * the device: as measured (`thumbnailWidth`), or until then the smallest an older one can be.
 * A visitor can't tell an older thumbnail on the NAS from its record: the current size.
 */
export function thumbnailLabel(photo: ShownPhoto): number {
  if ('copyUrl' in photo) return fitLongEdge(photo.width, photo.height, THUMBNAIL_LONG_EDGE).width
  return photo.thumbnailWidth ?? fitLongEdge(photo.width, photo.height, OLD_THUMBNAIL_LONG_EDGE).width
}

/**
 * Whether a card or tile offers the 640×480 card image as its smallest candidate (T-0040,
 * D-0041). The owner: once the device made one and has measured the thumbnail (unmeasured,
 * D-0040 holds and the card image waits). A visitor: PocketBase's thumb of the thumbnail,
 * when the thumbnail is big enough for one; never in the demo visitor view (no `cardUrl`).
 * Never when the thumbnail is no wider than the card image: candidates are ordered by width.
 */
export function offersCard(photo: ShownPhoto): boolean {
  if ('copyUrl' in photo) {
    const thumbnail = fitLongEdge(photo.width, photo.height, THUMBNAIL_LONG_EDGE)
    return !!photo.cardUrl && cardCrop(thumbnail.width, thumbnail.height) !== null && thumbnail.width > CARD_WIDTH
  }
  return photo.card instanceof Blob && photo.cardWidth === CARD_WIDTH && photo.thumbnailWidth !== undefined && photo.thumbnailWidth > CARD_WIDTH
}

/** The card image's address, when offered (`offersCard`). */
function useCardUrl(photo: ShownPhoto, offered: boolean): string | undefined {
  const blob = offered && !('copyUrl' in photo) ? photo.card : undefined
  const url = useStoredUrl(photo.id, 'card', blob)
  if (!offered) return undefined
  return 'copyUrl' in photo ? photo.cardUrl : url
}

/**
 * Shows a photo. With `sizes` (cards and tiles, T-0037): the card image (T-0040, D-0041), the
 * thumbnail and the copy as `srcset` candidates, each labelled with its real width, so the
 * browser takes what the place needs; without a card image, the thumbnail and the copy; a
 * stored photo whose thumbnail isn't measured yet, the thumbnail alone (D-0040). Without
 * `sizes`: the one file asked for (the 2560 px copy by default). `place` names where a card or
 * tile is shown; each place's srcset has addresses of its own (D-0042).
 */
export function PhotoImage({
  photo,
  alt,
  className,
  file = 'copy',
  sizes,
  place = 'card',
}: {
  photo: ShownPhoto
  alt: string
  className?: string
  file?: 'copy' | 'thumbnail'
  /** The `sizes` for the place it is shown in; kept next to the layout that sets it. */
  sizes?: string
  /** Where an image with `sizes` is shown: a project card or a day tile (D-0042). */
  place?: Place
}) {
  const withSrcset = sizes !== undefined && photo.width > 0 && photo.height > 0 && ('copyUrl' in photo || !!photo.thumbnail)
  if (withSrcset) return <PhotoWithSrcset photo={photo} alt={alt} className={className} sizes={sizes} place={place} />
  return <SinglePhoto photo={photo} alt={alt} className={className} file={file} />
}

function SinglePhoto({ photo, alt, className, file }: { photo: ShownPhoto; alt: string; className?: string; file: 'copy' | 'thumbnail' }) {
  const url = usePhotoUrl(photo, file)
  if (!url) return null
  return (
    <img
      src={url}
      alt={alt}
      width={photo.width}
      height={photo.height}
      className={className}
      loading="lazy"
      data-photo-id={photo.id}
    />
  )
}

function PhotoWithSrcset({ photo, alt, className, sizes, place }: { photo: ShownPhoto; alt: string; className?: string; sizes: string; place: Place }) {
  // D-0040: a stored photo whose thumbnail this device hasn't measured is shown from its
  // thumbnail alone; the copy is never a candidate then (it made cards jagged).
  const measured = 'copyUrl' in photo || photo.thumbnailWidth !== undefined
  // T-0040: the card image only next to a measured thumbnail (offersCard).
  const withCard = measured && offersCard(photo)
  const label = thumbnailLabel(photo)
  // D-0042: the place and candidate set its thumbnail and copy addresses are kept for, so a
  // new set (the card image arrives, the thumbnail is measured) names addresses not loaded yet.
  const set = measured ? `${place}|${sizes}|${withCard ? `card ${CARD_WIDTH}w, ` : ''}thumbnail ${label}w, copy ${photo.width}w` : undefined
  const alone = usePhotoUrl(photo, 'thumbnail', !measured)
  const thumbnail = useSrcsetUrl(photo, 'thumbnail', place, set)
  const copy = useSrcsetUrl(photo, 'copy', place, set)
  const card = useCardUrl(photo, withCard)
  // Rendered once every address it names exists (T-0037), so a new srcset swaps a loaded
  // image for a loaded one.
  if (measured ? !thumbnail || !copy || (withCard && !card) : !alone) return null
  const candidates = [...(withCard ? [`${card} ${CARD_WIDTH}w`] : []), `${thumbnail} ${label}w`, `${copy} ${photo.width}w`]
  return (
    <img
      src={measured ? thumbnail : alone}
      srcSet={measured ? candidates.join(', ') : undefined}
      sizes={sizes}
      alt={alt}
      width={photo.width}
      height={photo.height}
      className={className}
      loading="lazy"
      data-photo-id={photo.id}
    />
  )
}
