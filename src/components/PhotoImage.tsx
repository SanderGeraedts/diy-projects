import { useEffect, useState } from 'react'
import type { Photo } from '../db/db'

/** Shows a photo stored on the device. */
export function PhotoImage({ photo, alt, className }: { photo: Photo; alt: string; className?: string }) {
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photo.blob])
  if (!url) return null
  return <img src={url} alt={alt} width={photo.width} height={photo.height} className={className} loading="lazy" />
}
