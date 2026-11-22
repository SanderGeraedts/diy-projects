import { describe, expect, it } from 'vitest'
import { A_FOLDER, NOT_A_PHOTO, isImage, readDrop, splitDrop, type DropData } from './drop'

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
      notAdded: [{ name: 'oud.jpg', reason: A_FOLDER }],
    })
  })

  it('lists a zip as not a photo until T-0032', () => {
    expect(splitDrop([{ file: file('fotos.zip', 'application/zip'), isDirectory: false }]).notAdded).toEqual([
      { name: 'fotos.zip', reason: NOT_A_PHOTO },
    ])
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
