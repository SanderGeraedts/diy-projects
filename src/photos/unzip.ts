import { Inflate } from 'fflate'
import { CANT_UNZIP, NO_PHOTOS, PARTLY_UNZIPPED, TOO_LARGE, baseName, isZipImage, zipImageType } from './drop'

// T-0032 (D-0035): reads a dropped zip file on the device and yields its images as Files, one
// at a time. Loaded only when a zip is dropped: the import queue imports this module with a
// dynamic import(), so fflate stays out of the startup bundle; the chunk is in the service
// worker's precache like every other .js file.
//
// Where the entries are: a dropped zip is a File, so it can be read at any offset. The zip's
// central directory, at its end, gives each entry's name, method, flags, sizes, CRC-32 and
// offset; each image is then read from its own slice of the File. Nothing is found by
// scanning for signatures, which a streaming reader must do for entries with a data
// descriptor (sizes after the data, as macOS's Compress writes them) and which cuts a photo
// whose bytes happen to look like one (sent back by the tester). A zip without a central
// directory (cut short) is walked by its local headers while they carry sizes, then reported
// as broken.
//
// What fflate does: inflating each deflated image (its streaming Inflate). Each image is
// checked against its size and CRC-32, so its bytes are the original (D-0015).
//
// Memory: an image is read in small pieces and held until it is complete and yielded; the next
// entry is read only once the consumer asks for more (the import, one photo at a time, sets the
// pace). Entries that aren't images are never read. An image stops being unpacked as soon as
// it passes the limit.

/** The NAS's limit on an original (T-0013): a larger image isn't added. */
export const MAX_ENTRY_BYTES = 40 * 1024 * 1024

// Bytes inflated at once. Inflating a piece can produce up to ~1000 times its size, so a small
// piece keeps one step from overshooting the limit by much.
const PIECE_BYTES = 16 * 1024

export type ZipItem =
  /** An image from the zip: its path in the zip, and a File named after its last part. */
  | { kind: 'image'; path: string; file: File }
  /** One image entry that isn't added, with the reason; the zip goes on. */
  | { kind: 'entry-failure'; path: string; reason: string }
  /** The zip itself, with the reason: unreadable, broken partway, or without images. Always last. */
  | { kind: 'zip-failure'; reason: string }

export interface ReadZipOptions {
  /** Largest image, unpacked, in bytes; MAX_ENTRY_BYTES unless a test lowers it. */
  limit?: number
  /** Called as the zip is read: how far into the zip, in bytes, and the zip's size. */
  onProgress?: (read: number, total: number) => void
}

// --- The zip format (PKWARE APPNOTE): only what reading entries needs ---

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_DIRECTORY = 0x06054b50
const ZIP64_END = 0x06064b50
const ZIP64_LOCATOR = 0x07064b50
const ZIP64_EXTRA = 0x0001
const FLAG_ENCRYPTED = 0x0001
const FLAG_DATA_DESCRIPTOR = 0x0008
const FLAG_UTF8 = 0x0800
const STORED = 0
const DEFLATED = 8
const MAX_U32 = 0xffffffff

interface Entry {
  name: string
  flags: number
  method: number
  crc: number
  compressedSize: number
  size: number
  /** Where its local header starts. */
  offset: number
}

class Broken extends Error {}

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength)
const u64 = (v: DataView, at: number) => Number(v.getBigUint64(at, true))

async function bytesAt(zip: Blob, start: number, end: number): Promise<Uint8Array> {
  if (start < 0 || end > zip.size || start > end) throw new Broken('outside the zip')
  return new Uint8Array(await zip.slice(start, end).arrayBuffer())
}

const utf8 = new TextDecoder('utf-8', { fatal: true })
/** UTF-8 when flagged or when it decodes as such (macOS doesn't flag it); else byte for byte. */
function decodeName(bytes: Uint8Array, flags: number): string {
  if (flags & FLAG_UTF8) return new TextDecoder().decode(bytes)
  try {
    return utf8.decode(bytes)
  } catch {
    return String.fromCharCode(...bytes)
  }
}

/** The ZIP64 values an extra field holds, in its fixed order, for the fields that are maxed out. */
function zip64Values(extra: Uint8Array, wanted: number): number[] {
  const v = view(extra)
  for (let at = 0; at + 4 <= extra.length; ) {
    const id = v.getUint16(at, true)
    const length = v.getUint16(at + 2, true)
    if (id === ZIP64_EXTRA) {
      const values: number[] = []
      for (let i = 0; i < wanted && at + 4 + i * 8 + 8 <= extra.length && i * 8 + 8 <= length; i++) values.push(u64(v, at + 4 + i * 8))
      return values
    }
    at += 4 + length
  }
  return []
}

/** The central directory's place and size, from the end records; null when the zip has none. */
async function findDirectory(zip: Blob): Promise<{ offset: number; size: number; count: number } | null> {
  const tailStart = Math.max(0, zip.size - (0xffff + 22))
  const tail = await bytesAt(zip, tailStart, zip.size)
  const tv = view(tail)
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tv.getUint32(i, true) !== END_OF_DIRECTORY) continue
    // The comment must run exactly to the end; otherwise these bytes are in the comment.
    if (i + 22 + tv.getUint16(i + 20, true) !== tail.length) continue
    let count = tv.getUint16(i + 10, true)
    let size = tv.getUint32(i + 12, true)
    let offset = tv.getUint32(i + 16, true)
    if (count === 0xffff || size === MAX_U32 || offset === MAX_U32) {
      const at = tailStart + i - 20
      const locator = await bytesAt(zip, at, at + 20)
      if (view(locator).getUint32(0, true) !== ZIP64_LOCATOR) throw new Broken('no ZIP64 locator')
      const end64At = u64(view(locator), 8)
      const end64 = view(await bytesAt(zip, end64At, end64At + 56))
      if (end64.getUint32(0, true) !== ZIP64_END) throw new Broken('no ZIP64 end')
      count = u64(end64, 32)
      size = u64(end64, 40)
      offset = u64(end64, 48)
    }
    if (offset + size > zip.size) throw new Broken('directory outside the zip')
    return { offset, size, count }
  }
  return null
}

/** Every entry in the central directory, in its order. */
async function readDirectory(zip: Blob, dir: { offset: number; size: number; count: number }): Promise<Entry[]> {
  const bytes = await bytesAt(zip, dir.offset, dir.offset + dir.size)
  const v = view(bytes)
  const entries: Entry[] = []
  let at = 0
  for (let n = 0; n < dir.count; n++) {
    if (at + 46 > bytes.length || v.getUint32(at, true) !== CENTRAL_HEADER) throw new Broken('bad directory')
    const flags = v.getUint16(at + 8, true)
    const nameLength = v.getUint16(at + 28, true)
    const extraLength = v.getUint16(at + 30, true)
    const commentLength = v.getUint16(at + 32, true)
    const end = at + 46 + nameLength + extraLength + commentLength
    if (end > bytes.length) throw new Broken('bad directory')
    let size = v.getUint32(at + 24, true)
    let compressedSize = v.getUint32(at + 20, true)
    let offset = v.getUint32(at + 42, true)
    const maxed = [size, compressedSize, offset].filter((x) => x === MAX_U32).length
    if (maxed > 0) {
      const values = zip64Values(bytes.subarray(at + 46 + nameLength, at + 46 + nameLength + extraLength), maxed)
      if (values.length < maxed) throw new Broken('bad ZIP64 extra')
      if (size === MAX_U32) size = values.shift()!
      if (compressedSize === MAX_U32) compressedSize = values.shift()!
      if (offset === MAX_U32) offset = values.shift()!
    }
    entries.push({
      name: decodeName(bytes.subarray(at + 46, at + 46 + nameLength), flags),
      flags,
      method: v.getUint16(at + 10, true),
      crc: v.getUint32(at + 16, true),
      compressedSize,
      size,
      offset,
    })
    at = end
  }
  return entries
}

/** Where an entry's data starts, from its local header (whose name and extra may differ in length). */
async function dataStart(zip: Blob, offset: number): Promise<number> {
  const header = view(await bytesAt(zip, offset, offset + 30))
  if (header.getUint32(0, true) !== LOCAL_HEADER) throw new Broken('no local header')
  return offset + 30 + header.getUint16(26, true) + header.getUint16(28, true)
}

/**
 * For a zip without a central directory (cut short): its entries from the local headers, in
 * order, as long as each header carries its sizes. Ends with Broken: the zip is damaged.
 */
async function* walkLocalHeaders(zip: Blob): AsyncGenerator<Entry> {
  let offset = 0
  for (;;) {
    const header = await bytesAt(zip, offset, offset + 30)
    const v = view(header)
    if (v.getUint32(0, true) !== LOCAL_HEADER) throw new Broken('no local header')
    const flags = v.getUint16(6, true)
    // Sizes after the data: where this entry ends can't be known without guessing.
    if (flags & FLAG_DATA_DESCRIPTOR) throw new Broken('data descriptor without a directory')
    const nameLength = v.getUint16(26, true)
    const extraLength = v.getUint16(28, true)
    const rest = await bytesAt(zip, offset + 30, offset + 30 + nameLength + extraLength)
    let compressedSize = v.getUint32(18, true)
    let size = v.getUint32(22, true)
    if (size === MAX_U32 || compressedSize === MAX_U32) {
      const values = zip64Values(rest.subarray(nameLength), 2)
      if (values.length < 2) throw new Broken('bad ZIP64 extra')
      ;[size, compressedSize] = values as [number, number]
    }
    yield {
      name: decodeName(rest.subarray(0, nameLength), flags),
      flags,
      method: v.getUint16(8, true),
      crc: v.getUint32(14, true),
      compressedSize,
      size,
      offset,
    }
    offset += 30 + nameLength + extraLength + compressedSize
  }
}

// --- CRC-32 (fflate 0.8 doesn't export its own) ---

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crcUpdate(crc: number, bytes: Uint8Array): number {
  let c = ~crc
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8)
  return ~c >>> 0
}

// --- Reading one image ---

type Outcome = { ok: true; parts: Uint8Array[] } | { ok: false; reason: string }

/**
 * Unpacks one image entry from its slice of the zip, checking its size and CRC-32. Stops as
 * soon as it passes the limit. Throws Broken when the entry isn't where the directory says.
 */
async function unpack(zip: Blob, entry: Entry, limit: number, progress: (at: number) => void): Promise<Outcome> {
  if (entry.flags & FLAG_ENCRYPTED) return { ok: false, reason: CANT_UNZIP }
  if (entry.method !== STORED && entry.method !== DEFLATED) return { ok: false, reason: CANT_UNZIP }
  if (entry.size > limit) return { ok: false, reason: TOO_LARGE }

  const start = await dataStart(zip, entry.offset)
  const end = start + entry.compressedSize
  if (end > zip.size) throw new Broken('entry outside the zip')

  const parts: Uint8Array[] = []
  let size = 0
  let crc = 0
  let failed: string | null = null
  const take = (data: Uint8Array) => {
    if (failed) return
    size += data.length
    if (size > limit) {
      failed = TOO_LARGE
      parts.length = 0
      return
    }
    if (data.length > 0) {
      crc = crcUpdate(crc, data)
      parts.push(data)
    }
  }
  const inflate = entry.method === DEFLATED ? new Inflate((data) => take(data)) : null

  const reader = zip.slice(start, end).stream().getReader()
  let at = start
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      for (let i = 0; i < value.length && !failed; i += PIECE_BYTES) {
        const piece = value.subarray(i, i + PIECE_BYTES)
        if (inflate) inflate.push(piece, false)
        else take(piece)
      }
      at += value.length
      progress(at)
      if (failed) break
    }
    if (!failed && inflate) inflate.push(new Uint8Array(0), true) // throws when the data ends early
  } catch (error) {
    if (error instanceof Broken) throw error
    return { ok: false, reason: CANT_UNZIP } // damaged deflate data, or the File can't be read
  } finally {
    void reader.cancel().catch(() => undefined)
  }
  if (failed) return { ok: false, reason: failed }
  if (size !== entry.size || crc !== entry.crc) return { ok: false, reason: CANT_UNZIP }
  return { ok: true, parts }
}

/**
 * Reads a zip one image at a time and yields its images in the order of its directory, then,
 * when something is wrong with the zip as a whole, one `zip-failure`. Never throws. Folders,
 * other files, `__MACOSX/`, dotfiles and zips inside the zip are skipped silently and never
 * read. An image without EXIF gets the zip's own date (D-0035).
 */
export async function* readZip(zip: File, { limit = MAX_ENTRY_BYTES, onProgress }: ReadZipOptions = {}): AsyncGenerator<ZipItem> {
  let reached = 0
  const progress = (at: number) => {
    if (at <= reached) return
    reached = at
    onProgress?.(at, zip.size)
  }

  let found = 0 // image entries met, whatever came of them
  let images = 0 // images yielded
  let broken = false
  try {
    const head = await bytesAt(zip, 0, Math.min(4, zip.size))
    const signature = head.length === 4 ? view(head).getUint32(0, true) : 0
    if (signature !== LOCAL_HEADER && signature !== END_OF_DIRECTORY) throw new Broken('not a zip')

    const dir = await findDirectory(zip)
    const entries: AsyncIterable<Entry> | Iterable<Entry> = dir ? await readDirectory(zip, dir) : walkLocalHeaders(zip)
    for await (const entry of entries) {
      const path = entry.name
      const type = isZipImage(path) ? zipImageType(path) : undefined
      if (!type) continue
      found++
      const outcome = await unpack(zip, entry, limit, progress)
      if (!outcome.ok) {
        yield { kind: 'entry-failure', path, reason: outcome.reason }
        continue
      }
      const file = new File(outcome.parts as BlobPart[], baseName(path), { type, lastModified: zip.lastModified })
      images++
      yield { kind: 'image', path, file }
    }
    if (!dir) broken = true // walked to the end of what's there; the directory is missing
  } catch {
    broken = true // Broken, or the File can't be read
  }
  progress(zip.size)

  if (broken) yield { kind: 'zip-failure', reason: images > 0 ? PARTLY_UNZIPPED : CANT_UNZIP }
  else if (found === 0) yield { kind: 'zip-failure', reason: NO_PHOTOS }
}
