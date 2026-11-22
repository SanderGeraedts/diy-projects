import type { ImportFailure } from './importQueue'

// T-0031 (D-0033): turns what was dropped on the owner's project page into the photos that go
// to startImport and the items that aren't added, each with a reason. Kept apart from the
// drag events (routes/DropPhotos.tsx) so it can be tested on its own.

/** One dropped item, read from the drop event while its DataTransfer is still readable. */
export interface DroppedItem {
  file: File
  isDirectory: boolean
}

export interface SplitDrop {
  /** Images, in the order dropped: handed to startImport as picked files are. */
  images: File[]
  /** Zip files, in the order dropped: unpacked by startZipImport (T-0032, D-0034). */
  zips: File[]
  /** Everything else, in the order dropped: listed in the summary as not added. */
  notAdded: ImportFailure[]
}

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|heic|heif|bmp|tiff?)$/i

/** An image by its type, or, when the browser gives no type, by its name. */
export function isImage(file: File): boolean {
  if (file.type !== '') return file.type.startsWith('image/')
  return IMAGE_EXTENSIONS.test(file.name)
}

export const NOT_A_PHOTO = 'is geen foto'
export const A_FOLDER = "is een map; sleep de foto's uit de map"

// --- Zip files (T-0032, D-0034) ---

/** A zip by its name (any case) or by the type browsers give one. */
export function isZip(file: File): boolean {
  return /\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed'
}

const ZIP_IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  gif: 'image/gif',
}

// Some Windows tools write `\` between folders instead of `/`.
const pathParts = (path: string) => path.split(/[\\/]/)

/** The image type for a name in a zip, by its extension; undefined when it isn't one D-0034 takes. */
export function zipImageType(path: string): string | undefined {
  const match = /\.([a-z]+)$/i.exec(path)
  return match ? ZIP_IMAGE_TYPES[match[1]!.toLowerCase()] : undefined
}

/**
 * True for an entry of a zip that is imported: an image by its extension, not a folder, not
 * under `__MACOSX/` and with no path part that starts with a dot (`._IMG_1.jpg`, `.thumbnails/`).
 */
export function isZipImage(path: string): boolean {
  if (path.endsWith('/') || path.endsWith('\\')) return false
  const parts = pathParts(path)
  if (parts[0] === '__MACOSX' || parts.some((p) => p.startsWith('.'))) return false
  return zipImageType(path) !== undefined
}

/** The last part of a path in a zip: the name the photo's File gets (no `/` in it). */
export function baseName(path: string): string {
  return pathParts(path).at(-1) ?? path
}

/** How the summary names a file from a zip: its path in the zip, "uit" and the zip's name. */
export const fromZip = (path: string, zipName: string) => `${path} uit ${zipName}`

export const TOO_LARGE = 'is groter dan 40 MB'
export const CANT_UNZIP = 'kon niet worden uitgepakt'
export const PARTLY_UNZIPPED = 'kon niet helemaal worden uitgepakt'
export const NO_PHOTOS = "bevat geen foto's"
export const CANT_LOAD_UNZIP = 'kan nu niet worden uitgepakt; probeer het later opnieuw'

/**
 * Splits dropped items into images, zip files and not-added items, keeping the order dropped.
 * A zip (T-0032) is unpacked later, in the import queue; what it holds is only known then.
 */
export function splitDrop(items: readonly DroppedItem[]): SplitDrop {
  const images: File[] = []
  const zips: File[] = []
  const notAdded: ImportFailure[] = []
  for (const { file, isDirectory } of items) {
    if (isDirectory) notAdded.push({ name: file.name, reason: A_FOLDER })
    else if (isZip(file)) zips.push(file)
    else if (isImage(file)) images.push(file)
    else notAdded.push({ name: file.name, reason: NOT_A_PHOTO })
  }
  return { images, zips, notAdded }
}

/** The part of a DataTransfer read here; a real one in the browser, a fake in unit tests. */
export interface DropData {
  readonly items?: ArrayLike<Pick<DataTransferItem, 'kind' | 'getAsFile'> & { webkitGetAsEntry?: () => { isDirectory: boolean } | null }>
  readonly files: ArrayLike<File>
}

/**
 * Reads the dropped files, in order, with whether each is a folder. Must run inside the drop
 * event: a DataTransfer's items can't be read after it. In Chromium a folder comes through as
 * a File with an empty type; only its entry tells it apart.
 */
export function readDrop(data: DropData): DroppedItem[] {
  const items = data.items ? Array.from(data.items) : []
  if (items.length === 0) return Array.from(data.files, (file) => ({ file, isDirectory: false }))
  const dropped: DroppedItem[] = []
  for (const item of items) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (!file) continue
    dropped.push({ file, isDirectory: item.webkitGetAsEntry?.()?.isDirectory ?? false })
  }
  return dropped
}
