import { Unzip, UnzipInflate, UnzipPassThrough, type AsyncFlateStreamHandler, type UnzipDecoder, type UnzipDecoderConstructor } from 'fflate'
import { CANT_UNZIP, NO_PHOTOS, PARTLY_UNZIPPED, TOO_LARGE, baseName, isZipImage, zipImageType } from './drop'

// T-0032 (D-0034): reads a dropped zip file on the device with fflate's streaming Unzip, one
// entry at a time, and yields its images as Files. Loaded only when a zip is dropped: the
// import queue imports this module with a dynamic import(), so fflate stays out of the
// startup bundle; the chunk is in the service worker's precache like every other .js file.
//
// Memory: the zip is fed in small pieces from file.stream(); an image is held until it is
// complete and yielded, and the next piece is read only once the consumer asks for more
// (so the import, one photo at a time, sets the pace). An image stops being unpacked as soon
// as it passes the limit. Entries that aren't imported are still fed to a decoder that drops
// their bytes: fflate otherwise keeps an entry nobody started in memory.

/** The NAS's limit on an original (T-0013): a larger image isn't added. */
export const MAX_ENTRY_BYTES = 40 * 1024 * 1024

// Bytes pushed to fflate at once. Inflating a piece can produce up to ~1000 times its size,
// so a small piece keeps one push from overshooting the limit by much.
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
  /** Called after each piece of the zip read: bytes read so far and the zip's size. */
  onProgress?: (read: number, total: number) => void
}

const LOCAL_HEADER = 0x04034b50
const END_OF_DIRECTORY = 0x06054b50
const u32 = (b: Uint8Array, i: number) => (b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16) | (b[i + 3]! << 24)) >>> 0

/**
 * A decoder per compression method that only does work for the entry being imported. The
 * entry decided on just before fflate creates the decoder (`wanted`); the others are fed to
 * it and dropped. A wanted entry whose method fflate can't decode (AES encryption uses 99)
 * fails on its first piece.
 */
function gates() {
  const state = { wanted: false, last: null as null | { stop: () => void } }
  const make = (compression: number, Inner: UnzipDecoderConstructor | null): UnzipDecoderConstructor =>
    class Gate implements UnzipDecoder {
      static compression = compression
      ondata!: AsyncFlateStreamHandler
      private inner: UnzipDecoder | null = null
      private unsupported = false
      constructor(name: string, size?: number, originalSize?: number) {
        state.last = this
        if (!state.wanted) return
        if (!Inner) {
          this.unsupported = true
          return
        }
        this.inner = new Inner(name, size, originalSize)
        this.inner.ondata = (err, data, final) => this.ondata(err, data, final)
      }
      push(chunk: Uint8Array, final: boolean) {
        if (this.inner) this.inner.push(chunk, final)
        else if (this.unsupported) {
          this.unsupported = false
          this.ondata(new Error(`unsupported compression ${compression}`) as never, null as never, final)
        }
      }
      stop() {
        this.inner = null
        this.unsupported = false
      }
    }
  const decoders: UnzipDecoderConstructor[] = []
  for (let c = 0; c < 256; c++) decoders.push(make(c, c === 0 ? UnzipPassThrough : c === 8 ? UnzipInflate : null))
  return { state, decoders }
}

/** True when the zip's end-of-central-directory record is there: a zip cut short has none. */
async function hasEnd(zip: Blob): Promise<boolean> {
  const tail = new Uint8Array(await zip.slice(Math.max(0, zip.size - (0xffff + 22))).arrayBuffer())
  for (let i = tail.length - 22; i >= 0; i--) if (u32(tail, i) === END_OF_DIRECTORY) return true
  return false
}

/**
 * Reads a zip one entry at a time and yields its images in the order they are in the zip,
 * then, when something is wrong with the zip as a whole, one `zip-failure`. Never throws.
 * Folders, other files, `__MACOSX/`, dotfiles and zips inside the zip are skipped silently.
 * An image without EXIF gets the zip's own date: fflate's streaming Unzip doesn't give an
 * entry's modification time (D-0034).
 */
export async function* readZip(zip: File, { limit = MAX_ENTRY_BYTES, onProgress }: ReadZipOptions = {}): AsyncGenerator<ZipItem> {
  let head: Uint8Array
  try {
    head = new Uint8Array(await zip.slice(0, 4).arrayBuffer())
  } catch {
    yield { kind: 'zip-failure', reason: CANT_UNZIP }
    return
  }
  if (head.length < 4 || (u32(head, 0) !== LOCAL_HEADER && u32(head, 0) !== END_OF_DIRECTORY)) {
    yield { kind: 'zip-failure', reason: CANT_UNZIP }
    return
  }

  const ready: ZipItem[] = []
  let found = 0 // image entries met, whatever came of them
  let images = 0 // images yielded
  const { state, decoders } = gates()

  const unzip = new Unzip((entry) => {
    const path = entry.name
    const type = isZipImage(path) ? zipImageType(path) : undefined
    const skip = (item?: ZipItem) => {
      if (item) ready.push(item)
      state.wanted = false
      entry.ondata = () => {}
      try {
        entry.start()
      } catch {
        // A compression method beyond the ones registered: fflate can't skip it either.
      }
    }
    if (!type) return skip()
    found++
    if (entry.originalSize !== undefined && entry.originalSize > limit) return skip({ kind: 'entry-failure', path, reason: TOO_LARGE })

    const parts: Uint8Array[] = []
    let size = 0
    let settled = false
    const settle = (item: ZipItem) => {
      settled = true
      parts.length = 0
      gate?.stop()
      ready.push(item)
    }
    entry.ondata = (err, data, final) => {
      if (settled) return
      if (err) return settle({ kind: 'entry-failure', path, reason: CANT_UNZIP })
      size += data.length
      if (size > limit) return settle({ kind: 'entry-failure', path, reason: TOO_LARGE })
      if (data.length > 0) parts.push(data)
      if (!final) return
      const file = new File(parts as BlobPart[], baseName(path), { type, lastModified: zip.lastModified })
      images++
      settle({ kind: 'image', path, file })
    }
    state.wanted = true
    state.last = null
    let gate: { stop: () => void } | null = null
    try {
      entry.start()
      gate = state.last
    } catch {
      settle({ kind: 'entry-failure', path, reason: CANT_UNZIP })
    }
  })
  for (const decoder of decoders) unzip.register(decoder)

  let broken = false
  const reader = zip.stream().getReader()
  try {
    let read = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        unzip.push(new Uint8Array(0), true) // throws when the zip ends inside an entry
        while (ready.length > 0) yield ready.shift()!
        break
      }
      for (let i = 0; i < value.length; i += PIECE_BYTES) {
        unzip.push(value.subarray(i, i + PIECE_BYTES))
        // Hand each finished entry on before reading further: the consumer sets the pace.
        while (ready.length > 0) yield ready.shift()!
      }
      read += value.length
      onProgress?.(read, zip.size)
    }
  } catch {
    broken = true
    while (ready.length > 0) yield ready.shift()!
  } finally {
    void reader.cancel().catch(() => undefined)
  }

  if (!broken) broken = !(await hasEnd(zip).catch(() => false))
  if (broken) yield { kind: 'zip-failure', reason: images > 0 ? PARTLY_UNZIPPED : CANT_UNZIP }
  else if (found === 0) yield { kind: 'zip-failure', reason: NO_PHOTOS }
}
