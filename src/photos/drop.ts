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

/**
 * Splits dropped items into images and not-added items, keeping the order dropped.
 *
 * T-0032 plugs zip files in here: a zip becomes a source of images and of not-added items
 * with their own reasons. Until then a zip is "is geen foto", like any other non-image.
 */
export function splitDrop(items: readonly DroppedItem[]): SplitDrop {
  const images: File[] = []
  const notAdded: ImportFailure[] = []
  for (const { file, isDirectory } of items) {
    if (isDirectory) notAdded.push({ name: file.name, reason: A_FOLDER })
    else if (isImage(file)) images.push(file)
    else notAdded.push({ name: file.name, reason: NOT_A_PHOTO })
  }
  return { images, notAdded }
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
