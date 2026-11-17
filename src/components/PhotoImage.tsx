import { useEffect, useState } from 'react'
import type { Photo } from '../db/db'

/** Shows a photo stored on the device: the 2560 px copy, or its thumbnail for grids. */
export function PhotoImage({
  photo,
  alt,
  className,
  file = 'copy',
}: {
  photo: Photo
  alt: string
  className?: string
  file?: 'copy' | 'thumbnail'
}) {
  const blob = file === 'thumbnail' ? photo.thumbnail : photo.blob
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  if (!url) return null
  return <img src={url} alt={alt} width={photo.width} height={photo.height} className={className} loading="lazy" />
}
