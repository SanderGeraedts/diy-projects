import exifr from 'exifr'

export interface DateTaken {
  /** Local date and time, "YYYY-MM-DDTHH:mm:ss", without a time zone (D-0003). */
  takenAt: string
  /** 'exif' from DateTimeOriginal; 'lastModified' when the photo has no EXIF date. */
  source: 'exif' | 'lastModified'
}

// EXIF sits at the start of the file; reading 256 KB is plenty and keeps 10+ MB photos cheap.
const EXIF_HEAD_BYTES = 256 * 1024

const EXIF_DATE = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/

export async function dateTaken(file: File): Promise<DateTaken> {
  const fromExif = await readExifDate(file)
  if (fromExif) return { takenAt: fromExif, source: 'exif' }
  return { takenAt: localDateTime(new Date(file.lastModified)), source: 'lastModified' }
}

async function readExifDate(file: Blob): Promise<string | null> {
  try {
    const head = new Uint8Array(await file.slice(0, EXIF_HEAD_BYTES).arrayBuffer())
    const tags = (await exifr.parse(head, {
      pick: ['DateTimeOriginal'],
      reviveValues: false,
    })) as { DateTimeOriginal?: string } | undefined
    const match = tags?.DateTimeOriginal ? EXIF_DATE.exec(tags.DateTimeOriginal) : null
    if (!match) return null
    const [, y, mo, d, h, mi, s] = match
    return `${y}-${mo}-${d}T${h}:${mi}:${s}`
  } catch {
    return null
  }
}

function localDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}
