import { useEffect, useState } from 'react'
import type { Photo } from '../db/db'
import { fitLongEdge, OLD_THUMBNAIL_LONG_EDGE, THUMBNAIL_LONG_EDGE } from '../photos/resize'
import type { PublicPhoto } from '../public/source'

/** A photo as shown: stored on the device (the owner), or by address on the NAS (a visitor, T-0026). */
export type ShownPhoto = Photo | PublicPhoto

/** The address to show a photo's copy or thumbnail from; for a stored photo, an object URL. */
export function usePhotoUrl(photo: ShownPhoto, file: 'copy' | 'thumbnail'): string | undefined {
  const remote = 'copyUrl' in photo ? (file === 'thumbnail' ? photo.thumbnailUrl : photo.copyUrl) : undefined
  const blob = 'copyUrl' in photo ? undefined : file === 'thumbnail' ? photo.thumbnail : photo.blob
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    if (!blob) return
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return remote ?? url
}

interface Sources {
  thumbnail: string
  copy: string
}

/**
 * Both addresses of a photo at once (T-0037), so the `<img>` is rendered once with its
 * `srcset` complete and the browser makes one choice. For a stored photo, object URLs made
 * and revoked together; undefined until they are made.
 */
function usePhotoSources(photo: ShownPhoto): Sources | undefined {
  const thumbnailBlob = 'copyUrl' in photo ? undefined : photo.thumbnail
  const copyBlob = 'copyUrl' in photo ? undefined : photo.blob
  const [urls, setUrls] = useState<Sources>()
  useEffect(() => {
    if (!thumbnailBlob || !copyBlob) return
    const thumbnail = URL.createObjectURL(thumbnailBlob)
    const copy = URL.createObjectURL(copyBlob)
    setUrls({ thumbnail, copy })
    return () => {
      URL.revokeObjectURL(thumbnail)
      URL.revokeObjectURL(copy)
    }
  }, [thumbnailBlob, copyBlob])
  if ('copyUrl' in photo) return { thumbnail: photo.thumbnailUrl, copy: photo.copyUrl }
  return urls
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
 * place needs. Without: the one file asked for (the 2560 px copy by default).
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
  const sources = usePhotoSources(photo)
  if (!sources) return null
  return (
    <img
      src={sources.thumbnail}
      srcSet={`${sources.thumbnail} ${thumbnailLabel(photo)}w, ${sources.copy} ${photo.width}w`}
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
