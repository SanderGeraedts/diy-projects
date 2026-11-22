import { describe, expect, it } from 'vitest'
import {
  A_FOLDER,
  CANT_LOAD_UNZIP,
  CANT_UNZIP,
  NOT_A_PHOTO,
  NO_PHOTOS,
  PARTLY_UNZIPPED,
  TOO_LARGE,
  baseName,
  fromZip,
  isImage,
  isZipImage,
  readDrop,
  splitDrop,
  zipImageType,
  type DropData,
} from './drop'

// T-0031 (D-0033): what a drop on the owner's project page hands to startImport.

const file = (name: string, type: string) => new File([new Uint8Array(4)], name, { type })

describe('isImage', () => {
  it('goes by the type, or by the name when the type is empty', () => {
    expect(isImage(file('a.jpg', 'image/jpeg'))).toBe(true)
    expect(isImage(file('scan', 'image/png'))).toBe(true)
    expect(isImage(file('IMG_0001.HEIC', ''))).toBe(true)
    expect(isImage(file('notes.txt', 'text/plain'))).toBe(false)
    expect(isImage(file('plan.pdf', 'application/pdf'))).toBe(false)
    expect(isImage(file('fotos.zip', 'application/zip'))).toBe(false)
    expect(isImage(file('Tuin', ''))).toBe(false)
    // A type that says otherwise wins over the name.
    expect(isImage(file('fake.jpg', 'text/plain'))).toBe(false)
  })
})

describe('splitDrop', () => {
  it('passes images on in the order dropped and lists the rest, with a reason, in order', () => {
    const a = file('a.jpg', 'image/jpeg')
    const b = file('b.png', 'image/png')
    const c = file('c.heic', '')
    const result = splitDrop([
      { file: a, isDirectory: false },
      { file: file('notes.txt', 'text/plain'), isDirectory: false },
      { file: b, isDirectory: false },
      { file: file('Tuin', ''), isDirectory: true },
      { file: file('plan.pdf', 'application/pdf'), isDirectory: false },
      { file: c, isDirectory: false },
    ])
    expect(result.images).toEqual([a, b, c])
    expect(result.notAdded).toEqual([
      { name: 'notes.txt', reason: NOT_A_PHOTO },
      { name: 'Tuin', reason: A_FOLDER },
      { name: 'plan.pdf', reason: NOT_A_PHOTO },
    ])
    expect(NOT_A_PHOTO).toBe('is geen foto')
    expect(A_FOLDER).toBe("is een map; sleep de foto's uit de map")
  })

  it('treats a folder as a folder even when its name looks like a photo', () => {
    expect(splitDrop([{ file: file('oud.jpg', ''), isDirectory: true }])).toEqual({
      images: [],
      zips: [],
      notAdded: [{ name: 'oud.jpg', reason: A_FOLDER }],
    })
  })

  it('passes zip files on to be unpacked, in the order dropped (T-0032)', () => {
    const a = file('fotos.zip', 'application/zip')
    const b = file('Vakantie.ZIP', '')
    const c = file('export', 'application/x-zip-compressed')
    const photo = file('a.jpg', 'image/jpeg')
    expect(
      splitDrop([
        { file: a, isDirectory: false },
        { file: photo, isDirectory: false },
        { file: b, isDirectory: false },
        { file: c, isDirectory: false },
        { file: file('map.zip', ''), isDirectory: true },
      ]),
    ).toEqual({ images: [photo], zips: [a, b, c], notAdded: [{ name: 'map.zip', reason: A_FOLDER }] })
  })
})

describe('zip entries (T-0032)', () => {
  it('takes images by the extensions of D-0034, any case, and skips junk and folders', () => {
    for (const path of ['a.jpg', 'sub/b.JPEG', 'x.png', 'x.webp', 'x.HEIC', 'x.heif', 'x.avif', 'x.gif', 'a/b/c/d.jpg', 'win\\dag\\e.jpg'])
      expect(isZipImage(path), path).toBe(true)
    for (const path of ['notes.txt', 'inner.zip', 'x.bmp', 'x.tiff', 'Tuin/', '__MACOSX/a.jpg', '__MACOSX/._a.jpg', '._a.jpg', '.DS_Store', 'a/.thumbnails/t.jpg', 'Thumbs.db', 'jpg'])
      expect(isZipImage(path), path).toBe(false)
  })

  it('gives the image type of the extension and a name without folders', () => {
    expect(zipImageType('a/b.JPG')).toBe('image/jpeg')
    expect(zipImageType('b.heic')).toBe('image/heic')
    expect(zipImageType('b.txt')).toBeUndefined()
    expect(baseName('vakantie/dag 2/IMG_7.jpg')).toBe('IMG_7.jpg')
    expect(baseName('win\\IMG_7.jpg')).toBe('IMG_7.jpg')
    expect(baseName('IMG_7.jpg')).toBe('IMG_7.jpg')
  })

  it('names a file from a zip as "<pad> uit <zip>", and has the reasons of the design word for word', () => {
    expect(fromZip('vakantie/dag 2/IMG_7.jpg', 'fotos.zip')).toBe('vakantie/dag 2/IMG_7.jpg uit fotos.zip')
    expect(TOO_LARGE).toBe('is groter dan 40 MB')
    expect(CANT_UNZIP).toBe('kon niet worden uitgepakt')
    expect(PARTLY_UNZIPPED).toBe('kon niet helemaal worden uitgepakt')
    expect(NO_PHOTOS).toBe("bevat geen foto's")
    expect(CANT_LOAD_UNZIP).toBe('kan nu niet worden uitgepakt; probeer het later opnieuw')
  })
})

describe('readDrop', () => {
  const item = (f: File, isDirectory: boolean | null) => ({
    kind: 'file' as const,
    getAsFile: () => f,
    webkitGetAsEntry: () => (isDirectory === null ? null : { isDirectory }),
  })

  it('reads files in order and tells folders apart by their entry', () => {
    const a = file('a.jpg', 'image/jpeg')
    const tuin = file('Tuin', '')
    const b = file('b.jpg', 'image/jpeg')
    const data: DropData = {
      items: [item(a, false), { kind: 'string', getAsFile: () => null }, item(tuin, true), item(b, null)],
      files: [a, tuin, b],
    }
    expect(readDrop(data)).toEqual([
      { file: a, isDirectory: false },
      { file: tuin, isDirectory: true },
      { file: b, isDirectory: false },
    ])
  })

  it('falls back to the files when there are no items', () => {
    const a = file('a.jpg', 'image/jpeg')
    expect(readDrop({ files: [a] })).toEqual([{ file: a, isDirectory: false }])
  })
})
