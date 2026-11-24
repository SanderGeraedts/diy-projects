import { useLayoutEffect } from 'react'
import type { Photo } from '../db/db'
import { fitLongEdge, OLD_THUMBNAIL_LONG_EDGE, THUMBNAIL_LONG_EDGE } from '../photos/resize'
import type { PublicPhoto } from '../public/source'

/** A photo as shown: stored on the device (the owner), or by address on the NAS (a visitor, T-0026). */
export type ShownPhoto = Photo | PublicPhoto

/**
 * Object URLs of stored photos (D-0040), shared by every image that shows the same file and
 * kept while that file is the same. Dexie hands out a new Blob object for the same stored
 * file on every query, so an address is keyed by the photo, which of its files, and what
 * tells two files apart: the Blob's size and type. A rebuilt thumbnail or a file taken over
 * from the NAS differs in size, so it gets a new address; a write to other fields or other
 * photos keeps it. An address is revoked once no mounted image has used it for a moment.
 */
interface CachedUrl {
  url: string
  /** Mounted images using it. */
  refs: number
  /** When a render last asked for it; it isn't revoked within `REVOKE_AFTER_MS` of that. */
  touched: number
}

const urls = new Map<string, CachedUrl>()

/** How long an address no mounted image uses is kept, for a render that is about to commit. */
export const REVOKE_AFTER_MS = 2000

/** The cache key of one of a stored photo's files. */
export function fileKey(photoId: string, file: 'copy' | 'thumbnail', blob: Blob): string {
  return `${photoId}|${file}|${blob.size}|${blob.type}`
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
function useStoredUrl(photoId: string, file: 'copy' | 'thumbnail', blob: Blob | undefined): string | undefined {
  const key = blob ? fileKey(photoId, file, blob) : undefined
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
 * The thumbnail's width for its `srcset` label (D-0038): never more than it really has. On
 * the device: as measured (`thumbnailWidth`), or until then the smallest an older one can be.
 * A visitor can't tell an older thumbnail on the NAS from its record: the current size.
 */
export function thumbnailLabel(photo: ShownPhoto): number {
  if ('copyUrl' in photo) return fitLongEdge(photo.width, photo.height, THUMBNAIL_LONG_EDGE).width
  return photo.thumbnailWidth ?? fitLongEdge(photo.width, photo.height, OLD_THUMBNAIL_LONG_EDGE).width
}

/**
 * Shows a photo. With `sizes` (cards and tiles, T-0037): the thumbnail and the copy as
 * `srcset` candidates, each labelled with its real width, so the browser takes what the
 * place needs; a stored photo whose thumbnail isn't measured yet, the thumbnail alone
 * (D-0040). Without: the one file asked for (the 2560 px copy by default).
 */
export function PhotoImage({
  photo,
  alt,
  className,
  file = 'copy',
  sizes,
}: {
  photo: ShownPhoto
  alt: string
  className?: string
  file?: 'copy' | 'thumbnail'
  /** The `sizes` for the place it is shown in; kept next to the layout that sets it. */
  sizes?: string
}) {
  const withSrcset = sizes !== undefined && photo.width > 0 && photo.height > 0 && ('copyUrl' in photo || !!photo.thumbnail)
  if (withSrcset) return <PhotoWithSrcset photo={photo} alt={alt} className={className} sizes={sizes} />
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

function PhotoWithSrcset({ photo, alt, className, sizes }: { photo: ShownPhoto; alt: string; className?: string; sizes: string }) {
  // D-0040: a stored photo whose thumbnail this device hasn't measured is shown from its
  // thumbnail alone; the copy is never a candidate then (it made cards jagged).
  const measured = 'copyUrl' in photo || photo.thumbnailWidth !== undefined
  const thumbnail = usePhotoUrl(photo, 'thumbnail')
  const copy = usePhotoUrl(photo, 'copy', measured)
  if (!thumbnail || (measured && !copy)) return null
  return (
    <img
      src={thumbnail}
      srcSet={measured ? `${thumbnail} ${thumbnailLabel(photo)}w, ${copy} ${photo.width}w` : undefined}
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
