import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Photo } from '../db/db'
import type { PublicPhoto } from '../public/source'
import { PhotoImage, thumbnailLabel } from './PhotoImage'

// T-0037 (D-0038): cards and tiles offer the thumbnail and the copy, each labelled with its
// real width; never a width the thumbnail doesn't have.

afterEach(cleanup)

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

  it('has no srcset without sizes (the viewer and other single images)', async () => {
    render(<PhotoImage photo={visitor} alt="Foto" />)
    const img = screen.getByAltText('Foto')
    expect(img).not.toHaveAttribute('srcset')
    expect(img).toHaveAttribute('src', 'https://nas.invalid/copy.webp')
  })
})
