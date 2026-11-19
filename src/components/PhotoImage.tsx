import { useEffect, useState } from 'react'
import type { Photo } from '../db/db'
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

/** Shows a photo: the 2560 px copy, or its thumbnail for grids. */
export function PhotoImage({
  photo,
  alt,
  className,
  file = 'copy',
}: {
  photo: ShownPhoto
  alt: string
  className?: string
  file?: 'copy' | 'thumbnail'
}) {
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
