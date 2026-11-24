import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Photo } from '../db/db'
import type { PublicPhoto } from '../public/source'
import { offersCard, PhotoImage, REVOKE_AFTER_MS, thumbnailLabel } from './PhotoImage'

// T-0037 (D-0038): cards and tiles offer the thumbnail and the copy, each labelled with its
// real width; never a width the thumbnail doesn't have.

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const SIZES = 'auto, (min-width: 1024px) 492px, calc((100vw - 40px) / 2)'

const owned = (extra: Partial<Photo> = {}): Photo => ({
  id: 'p1',
  projectId: 'x',
  entryId: 'e',
  takenAt: '2026-01-01T10:00:00',
  blob: new Blob(['copy']),
  thumbnail: new Blob(['thumbnail']),
  original: null,
  uploads: { original: 'none', copy: 'none', thumbnail: 'none' },
  width: 2560,
  height: 1920,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...extra,
})

const visitor: PublicPhoto = {
  id: 'v1',
  projectId: 'x',
  entryId: 'e',
  takenAt: '2026-01-01T10:00:00',
  createdAt: '',
  width: 1920,
  height: 2560,
  deletedAt: null,
  copyUrl: 'https://nas.invalid/copy.webp',
  thumbnailUrl: 'https://nas.invalid/thumb.webp',
}

describe('thumbnailLabel', () => {
  it('labels an unmeasured thumbnail on the device with the smallest it can be (512 px)', () => {
    expect(thumbnailLabel(owned())).toBe(512)
  })
  it('labels a measured thumbnail with its width', () => {
    expect(thumbnailLabel(owned({ thumbnailWidth: 1280 }))).toBe(1280)
  })
  it('labels a visitor’s thumbnail by the photo’s size at the current thumbnail size', () => {
    expect(thumbnailLabel(visitor)).toBe(960)
  })
})

describe('PhotoImage with sizes', () => {
  it('gives a visitor the thumbnail and the copy addresses in its srcset', () => {
    render(<PhotoImage photo={visitor} alt="Foto" sizes={SIZES} />)
    const img = screen.getByAltText('Foto')
    expect(img).toHaveAttribute('srcset', 'https://nas.invalid/thumb.webp 960w, https://nas.invalid/copy.webp 1920w')
    expect(img).toHaveAttribute('sizes', SIZES)
    expect(img).toHaveAttribute('src', 'https://nas.invalid/thumb.webp')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(img).toHaveAttribute('width', '1920')
  })

  it('renders the owner’s image once both object URLs exist, labelled by real width', async () => {
    render(<PhotoImage photo={owned({ thumbnailWidth: 1280 })} alt="Foto" sizes={SIZES} />)
    const img = await waitFor(() => screen.getByAltText('Foto'))
    expect(img.getAttribute('srcset')).toMatch(/^blob:\S+ 1280w, blob:\S+ 2560w$/)
    expect(img.getAttribute('src')).toBe(img.getAttribute('srcset')!.split(' ')[0])
  })

  it('shows a stored photo whose thumbnail isn’t measured from the thumbnail alone (D-0040)', () => {
    const created = vi.spyOn(URL, 'createObjectURL')
    const photo = owned({ id: 'unmeasured' })
    render(<PhotoImage photo={photo} alt="Foto" sizes={SIZES} />)
    const img = screen.getByAltText('Foto')
    expect(img).not.toHaveAttribute('srcset')
    expect(img.getAttribute('src')).toMatch(/^blob:/)
    expect(created.mock.calls.map(([blob]) => blob)).toEqual([photo.thumbnail])
  })

  it('has no srcset without sizes (the viewer and other single images)', async () => {
    render(<PhotoImage photo={visitor} alt="Foto" />)
    const img = screen.getByAltText('Foto')
    expect(img).not.toHaveAttribute('srcset')
    expect(img).toHaveAttribute('src', 'https://nas.invalid/copy.webp')
  })
})

// T-0039 (D-0040): a stored photo's addresses stay the same while its files are the same.
describe('object URLs of stored photos', () => {
  const sources = (img: HTMLElement) => {
    const [thumbnail, , copy] = img.getAttribute('srcset')!.split(/,? /)
    expect(img.getAttribute('src')).toBe(thumbnail)
    return { thumbnail, copy }
  }

  it('keeps both addresses when the same files come back as new Blob objects', () => {
    const photo = owned({ id: 'same', thumbnailWidth: 1280 })
    const { rerender } = render(<PhotoImage photo={photo} alt="Foto" sizes={SIZES} />)
    const before = sources(screen.getByAltText('Foto'))
    rerender(
      <PhotoImage
        photo={{ ...photo, blob: new Blob(['copy']), thumbnail: new Blob(['thumbnail']), thumbnailOnNas: 'done' }}
        alt="Foto"
        sizes={SIZES}
      />,
    )
    expect(sources(screen.getByAltText('Foto'))).toEqual(before)
  })

  it('keeps the thumbnail’s address when it gets measured', () => {
    const photo = owned({ id: 'measured-later' })
    const { rerender } = render(<PhotoImage photo={photo} alt="Foto" sizes={SIZES} />)
    const src = screen.getByAltText('Foto').getAttribute('src')
    rerender(<PhotoImage photo={{ ...photo, thumbnail: new Blob(['thumbnail']), thumbnailWidth: 1280 }} alt="Foto" sizes={SIZES} />)
    expect(sources(screen.getByAltText('Foto')).thumbnail).toBe(src)
  })

  it('changes only the thumbnail’s address for a new thumbnail file, and revokes the old one once the image left it', () => {
    vi.useFakeTimers()
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      // Never while an image still shows it.
      expect(document.querySelector(`img[src="${url}"], img[srcset*="${url}"]`)).toBeNull()
    })
    const photo = owned({ id: 'rebuilt', thumbnailWidth: 512 })
    const { rerender } = render(<PhotoImage photo={photo} alt="Foto" sizes={SIZES} />)
    const before = sources(screen.getByAltText('Foto'))
    rerender(
      <PhotoImage photo={{ ...photo, blob: new Blob(['copy']), thumbnail: new Blob(['a rebuilt thumbnail']), thumbnailWidth: 1280 }} alt="Foto" sizes={SIZES} />,
    )
    const after = sources(screen.getByAltText('Foto'))
    expect(after.copy).toBe(before.copy)
    expect(after.thumbnail).not.toBe(before.thumbnail)
    vi.advanceTimersByTime(REVOKE_AFTER_MS * 3)
    expect(revoked.mock.calls.map(([url]) => url)).toEqual([before.thumbnail])
  })

  it('revokes an address when the last image using it unmounts, not before', () => {
    vi.useFakeTimers()
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      expect(document.querySelector(`img[src="${url}"], img[srcset*="${url}"]`)).toBeNull()
    })
    const photo = owned({ id: 'shared', thumbnailWidth: 1280 })
    const card = render(<PhotoImage photo={photo} alt="Kaart" sizes={SIZES} />)
    const tile = render(<PhotoImage photo={{ ...photo, blob: new Blob(['copy']), thumbnail: new Blob(['thumbnail']) }} alt="Tegel" sizes={SIZES} />)
    const shared = sources(screen.getByAltText('Kaart'))
    expect(sources(screen.getByAltText('Tegel'))).toEqual(shared)

    card.unmount()
    vi.advanceTimersByTime(REVOKE_AFTER_MS * 3)
    expect(revoked).not.toHaveBeenCalled()

    tile.unmount()
    vi.advanceTimersByTime(REVOKE_AFTER_MS * 3)
    expect(revoked.mock.calls.map(([url]) => url).sort()).toEqual([shared.copy, shared.thumbnail].sort())
  })

  it('shares the viewer’s address of the copy with the tile', () => {
    const photo = owned({ id: 'viewer', thumbnailWidth: 1280 })
    render(<PhotoImage photo={photo} alt="Tegel" sizes={SIZES} />)
    render(<PhotoImage photo={{ ...photo, blob: new Blob(['copy']) }} alt="Groot" />)
    expect(screen.getByAltText('Groot').getAttribute('src')).toBe(sources(screen.getByAltText('Tegel')).copy)
  })
})

// T-0040 (D-0041): the 640×480 card image as the smallest candidate, owner and visitor.
describe('the card image in srcset', () => {
  const card = new Blob(['card image'], { type: 'image/webp' })
  const withVisitorCard: PublicPhoto = { ...visitor, cardUrl: 'https://nas.invalid/thumb.webp?thumb=640x480' }

  it('gives a visitor the card image, the thumbnail and the copy', () => {
    render(<PhotoImage photo={withVisitorCard} alt="Foto" sizes={SIZES} />)
    expect(screen.getByAltText('Foto')).toHaveAttribute(
      'srcset',
      'https://nas.invalid/thumb.webp?thumb=640x480 640w, https://nas.invalid/thumb.webp 960w, https://nas.invalid/copy.webp 1920w',
    )
    expect(screen.getByAltText('Foto')).toHaveAttribute('src', 'https://nas.invalid/thumb.webp')
  })

  it('gives a demo visitor photo (no cardUrl) no card candidate', () => {
    expect(offersCard(visitor)).toBe(false)
    render(<PhotoImage photo={visitor} alt="Foto" sizes={SIZES} />)
    expect(screen.getByAltText('Foto').getAttribute('srcset')).not.toMatch(/640w/)
  })

  it('offers a visitor no card image of a thumbnail too small for one', () => {
    const small: PublicPhoto = { ...withVisitorCard, width: 600, height: 450 }
    expect(offersCard(small)).toBe(false)
    render(<PhotoImage photo={small} alt="Foto" sizes={SIZES} />)
    expect(screen.getByAltText('Foto')).toHaveAttribute('srcset', 'https://nas.invalid/thumb.webp 600w, https://nas.invalid/copy.webp 600w')
  })

  it('gives the owner card 640w, thumbnail and copy once the card image is made and the thumbnail measured', () => {
    render(<PhotoImage photo={owned({ id: 'carded', thumbnailWidth: 1280, card, cardWidth: 640 })} alt="Foto" sizes={SIZES} />)
    const img = screen.getByAltText('Foto')
    expect(img.getAttribute('srcset')).toMatch(/^blob:\S+ 640w, blob:\S+ 1280w, blob:\S+ 2560w$/)
    // The fallback src stays the thumbnail.
    expect(img.getAttribute('src')).toBe(img.getAttribute('srcset')!.split(', ')[1]!.split(' ')[0])
  })

  it('without a card image: the thumbnail and the copy (D-0040)', () => {
    render(<PhotoImage photo={owned({ id: 'no-card', thumbnailWidth: 1280 })} alt="Foto" sizes={SIZES} />)
    expect(screen.getByAltText('Foto').getAttribute('srcset')).toMatch(/^blob:\S+ 1280w, blob:\S+ 2560w$/)
  })

  it('with a copy too small for a card image (cardWidth 0): the thumbnail and the copy', () => {
    render(<PhotoImage photo={owned({ id: 'too-small', width: 600, height: 450, thumbnailWidth: 600, cardWidth: 0 })} alt="Foto" sizes={SIZES} />)
    expect(screen.getByAltText('Foto').getAttribute('srcset')).toMatch(/^blob:\S+ 600w, blob:\S+ 600w$/)
  })

  it('with a card image but an unmeasured thumbnail: the thumbnail alone, no object URL for the card image (D-0040)', () => {
    const created = vi.spyOn(URL, 'createObjectURL')
    const photo = owned({ id: 'card-unmeasured', card, cardWidth: 640 })
    render(<PhotoImage photo={photo} alt="Foto" sizes={SIZES} />)
    const img = screen.getByAltText('Foto')
    expect(img).not.toHaveAttribute('srcset')
    expect(created.mock.calls.map(([blob]) => blob)).toEqual([photo.thumbnail])
  })

  it('keeps the thumbnail’s and the copy’s addresses when the card image arrives, and the same image element', () => {
    const photo = owned({ id: 'card-arrives', thumbnailWidth: 1280 })
    const { rerender } = render(<PhotoImage photo={photo} alt="Foto" sizes={SIZES} />)
    const img = screen.getByAltText('Foto')
    const [thumbnail, copy] = img.getAttribute('srcset')!.split(', ').map((c) => c.split(' ')[0])
    rerender(
      <PhotoImage
        photo={{ ...photo, blob: new Blob(['copy']), thumbnail: new Blob(['thumbnail']), card, cardWidth: 640 }}
        alt="Foto"
        sizes={SIZES}
      />,
    )
    const after = screen.getByAltText('Foto')
    expect(after).toBe(img)
    const candidates = after.getAttribute('srcset')!.split(', ').map((c) => c.split(' '))
    expect(candidates.map(([, w]) => w)).toEqual(['640w', '1280w', '2560w'])
    expect(candidates[0]![0]).toMatch(/^blob:/)
    expect([candidates[1]![0], candidates[2]![0]]).toEqual([thumbnail, copy])
    expect(after.getAttribute('src')).toBe(thumbnail)
  })
})
