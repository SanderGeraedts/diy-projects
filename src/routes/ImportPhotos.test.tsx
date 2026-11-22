import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ImportStatus } from '../photos/importQueue'
import { ImportPhotos } from './ImportPhotos'

// T-0032: the import block while a zip is read, and the summary's lists. The status comes
// from the import queue (tested in photos/importQueue.test.ts); here it is set by hand.

let status: ImportStatus | undefined
vi.mock('../photos/importQueue', () => ({
  getImportStatus: () => status,
  subscribeImport: () => () => {},
  startImport: vi.fn(),
  startZipImport: vi.fn(),
  dismissImport: vi.fn(),
}))

const base: ImportStatus = {
  projectId: 'p1',
  total: 0,
  done: 0,
  added: 0,
  notAdded: [],
  failed: [],
  fromFileDate: [],
  lowStorage: false,
  zips: [],
  zipPercent: 0,
  running: true,
}

const block = () => screen.getByRole('status')

describe('ImportPhotos while a zip is read', () => {
  afterEach(() => {
    cleanup()
    status = undefined
  })

  it('shows only "<zip> uitpakken: N%" before the first photo is found, never "0 van 0"', () => {
    status = { ...base, zips: ['fotos.zip'], zipPercent: 40 }
    render(<ImportPhotos projectId="p1" projectTitle="Kast" />)
    expect(block()).toHaveTextContent(/^fotos\.zip uitpakken: 40%$/)
    expect(block()).not.toHaveTextContent('importeren')
    const line = screen.getByTestId('import-unzip')
    expect(line).toHaveClass('break-words', 'mt-0')
  })

  it('shows the zip line under the progress line, naming the zip being read', () => {
    status = { ...base, total: 3, done: 2, zips: ['fotos.zip', 'meer.zip'], zipPercent: 7 }
    render(<ImportPhotos projectId="p1" projectTitle="Kast" />)
    const lines = [...block().querySelectorAll('p')].map((p) => p.textContent)
    expect(lines).toEqual(["Foto's importeren: 2 van 3", 'fotos.zip uitpakken: 7%'])
    expect(screen.getByTestId('import-unzip')).toHaveClass('mt-1', 'break-words')
  })

  it('shows no zip line when no zip is read', () => {
    status = { ...base, total: 3, done: 1 }
    render(<ImportPhotos projectId="p1" projectTitle="Kast" />)
    expect(block()).toHaveTextContent(/^Foto's importeren: 1 van 3$/)
    expect(screen.queryByTestId('import-unzip')).toBeNull()
  })

  it('lists names from a zip in both lists of the summary, both wrapping long names', () => {
    status = {
      ...base,
      total: 2,
      done: 2,
      added: 2,
      running: false,
      notAdded: [{ name: 'vakantie/groot.jpg uit fotos.zip', reason: 'is groter dan 40 MB' }],
      fromFileDate: ['IMG_1.jpg uit fotos.zip'],
    }
    render(<ImportPhotos projectId="p1" projectTitle="Kast" />)
    expect(block()).toHaveTextContent("2 foto's toegevoegd.")
    expect(block()).toHaveTextContent('1 bestand niet toegevoegd:')
    const failed = screen.getByTestId('import-failed').querySelectorAll('li')
    expect([...failed].map((li) => li.textContent)).toEqual(['vakantie/groot.jpg uit fotos.zip: is groter dan 40 MB'])
    const fileDate = screen.getByTestId('import-file-date').querySelectorAll('li')
    expect([...fileDate].map((li) => li.textContent)).toEqual(['IMG_1.jpg uit fotos.zip'])
    for (const li of [...failed, ...fileDate]) expect(li).toHaveClass('break-words')
  })

  it('names zip files in the hint', () => {
    render(<ImportPhotos projectId="p1" projectTitle="Kast" />)
    expect(screen.getByTestId('drop-hint')).toHaveTextContent("of sleep foto's of zipbestanden naar deze pagina")
  })
})
