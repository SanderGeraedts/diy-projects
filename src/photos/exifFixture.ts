// Test helper: builds an EXIF APP1 segment and splices it into a JPEG, so tests can use
// generated images instead of real photos (D-0006, D-0010). Not used by the app.

export interface ExifFields {
  /** "YYYY:MM:DD HH:MM:SS", as cameras write it. */
  dateTimeOriginal?: string
  /** EXIF orientation, 1–8. */
  orientation?: number
}

export function buildExifSegment(fields: ExifFields): Uint8Array {
  const ifd0: Array<[tag: number, type: number, count: number, value: number]> = []
  if (fields.orientation !== undefined) ifd0.push([0x0112, 3, 1, fields.orientation])
  const hasExifIfd = fields.dateTimeOriginal !== undefined
  const ifd0Size = 2 + (ifd0.length + (hasExifIfd ? 1 : 0)) * 12 + 4
  const exifIfdOffset = 8 + ifd0Size
  const exifIfdSize = hasExifIfd ? 2 + 12 + 4 : 0
  const dateOffset = exifIfdOffset + exifIfdSize
  const tiffSize = dateOffset + (hasExifIfd ? 20 : 0)

  const tiff = new Uint8Array(tiffSize)
  const view = new DataView(tiff.buffer)
  tiff.set([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]) // big-endian, IFD0 at 8

  let p = 8
  const entries = hasExifIfd ? [...ifd0, [0x8769, 4, 1, exifIfdOffset] as const] : ifd0
  view.setUint16(p, entries.length)
  p += 2
  for (const [tag, type, count, value] of entries) {
    view.setUint16(p, tag)
    view.setUint16(p + 2, type)
    view.setUint32(p + 4, count)
    if (type === 3) view.setUint16(p + 8, value)
    else view.setUint32(p + 8, value)
    p += 12
  }
  view.setUint32(p, 0)

  if (hasExifIfd) {
    p = exifIfdOffset
    view.setUint16(p, 1)
    view.setUint16(p + 2, 0x9003)
    view.setUint16(p + 4, 2)
    view.setUint32(p + 6, 20)
    view.setUint32(p + 10, dateOffset)
    view.setUint32(p + 14, 0)
    const text = new TextEncoder().encode(fields.dateTimeOriginal!.slice(0, 19))
    tiff.set(text, dateOffset) // trailing byte stays 0 (NUL terminator)
  }

  const header = new TextEncoder().encode('Exif\0\0')
  const length = 2 + header.length + tiff.length
  const segment = new Uint8Array(2 + length)
  segment.set([0xff, 0xe1, length >> 8, length & 0xff])
  segment.set(header, 4)
  segment.set(tiff, 4 + header.length)
  return segment
}

/** Inserts an EXIF segment right after the JPEG's SOI marker. */
export function withExif(jpeg: Uint8Array, fields: ExifFields): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Not a JPEG')
  const segment = buildExifSegment(fields)
  const out = new Uint8Array(jpeg.length + segment.length)
  out.set(jpeg.subarray(0, 2))
  out.set(segment, 2)
  out.set(jpeg.subarray(2), 2 + segment.length)
  return out
}

/** A minimal JPEG-shaped byte string (SOI + EOI): enough for EXIF parsing, not decodable. */
export const BARE_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
