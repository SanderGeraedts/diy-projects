// T-0026 (D-0025): visitor mode as production runs it. A production build with a PocketBase
// address and nobody signed in on this device; PocketBase is answered by a stubbed fetch with
// what its rules give a guest. Shows that visitors get no create, edit, delete, import or
// cover controls, and that the app never opens Dexie (so never the outbox) for them.
import { act, cleanup, render, screen, within } from '@testing-library/react'
import { RouterProvider } from '@tanstack/react-router'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('../sync/config', () => ({
  deployContext: 'production',
  syncConfig: { enabled: true, url: 'https://pb.test' },
  resolveSyncConfig: () => ({ enabled: true, url: 'https://pb.test' }),
}))

const T = '2026-11-16T12:00:00.000Z'
const RECORDS: Record<string, Record<string, unknown>[]> = {
  projects: [
    {
      id: 'p1',
      collectionId: 'pbc_projects',
      collectionName: 'projects',
      title: 'Tuinbank',
      description: 'Van overgebleven vlonderplanken.',
      status: 'in progress',
      tags: ['hout'],
      coverPhotoId: '',
      public: true,
      slug: 'tuinbank',
      oldSlugs: ['bank'],
      createdAt: T,
      updatedAt: T,
      deletedAt: '',
    },
  ],
  entries: [
    { id: 'e1', projectId: 'p1', date: '2026-10-04', note: 'Poten op lengte gezaagd.', createdAt: T, updatedAt: T, deletedAt: '' },
    { id: 'e2', projectId: 'p1', date: '2026-10-11', note: 'Frame gelijmd.', createdAt: T, updatedAt: T, deletedAt: '' },
  ],
  photos: [1, 2].map((i) => ({
    id: `f${i}`,
    collectionId: 'pbc_photos',
    collectionName: 'photos',
    projectId: 'p1',
    entryId: 'e1',
    takenAt: `2026-10-04T1${i}:00:00.000Z`,
    width: 4,
    height: 3,
    original: `IMG_000${i}.jpg`,
    copy: `copy_${i}.webp`,
    thumbnail: `thumbnail_${i}.webp`,
    createdAt: T,
    updatedAt: T,
    deletedAt: '',
  })),
}

const requests: { url: string; authorization: string | undefined }[] = []
let down = false

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** What PocketBase answers a guest: the stubbed records, or nothing at all when it's down. */
async function fakePocketBase(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(String(input))
  const headers = (init?.headers ?? {}) as Record<string, string>
  requests.push({ url: url.toString(), authorization: headers.Authorization ?? headers.authorization })
  if (down) throw new TypeError('Failed to fetch')
  const match = /^\/api\/collections\/(\w+)\/records(?:\/([^/]+))?$/.exec(url.pathname)
  if (!match) return respond(404, { status: 404, message: 'Not found.', data: {} })
  const [, collection, id] = match
  let items = RECORDS[collection!] ?? []
  if (id) {
    const record = items.find((r) => r.id === id)
    return record ? respond(200, record) : respond(404, { status: 404, message: 'Not found.', data: {} })
  }
  const filter = url.searchParams.get('filter') ?? ''
  const projectId = /projectId = '([^']*)'/.exec(filter)?.[1]
  if (projectId) items = items.filter((r) => r.projectId === projectId)
  // T-0027: a project by its slug, or an earlier one.
  // The SDK sends `slug = "x" || oldSlugs ~ "\"x\""` (the list holds "x", quotes included).
  const slug = /^slug = "([a-z0-9-]*)" \|\| oldSlugs ~ "\\"\1\\""$/.exec(filter)?.[1]
  if (slug) items = items.filter((r) => r.slug === slug || (r.oldSlugs as string[]).includes(slug))
  return respond(200, { page: 1, perPage: 1000, totalItems: -1, totalPages: -1, items })
}

vi.stubGlobal('fetch', vi.fn(fakePocketBase))
// jsdom has no ResizeObserver; the viewer measures its stage with one.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    disconnect() {}
  },
)
const openIndexedDb = vi.spyOn(indexedDB, 'open')

// After the mocks: the app's own modules, as production loads them.
const { router } = await import('../router')
const { db } = await import('../db/db')
const { useVisitor, isVisitorNow } = await import('./mode')
const dexieOpen = vi.spyOn(db, 'open')

async function show(path: string) {
  window.history.replaceState(null, '', path)
  render(<RouterProvider router={router} />)
  await act(() => router.load())
}

const main = () => screen.getByRole('main')

beforeAll(() => {
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  down = false
  // Never Dexie, never the outbox: IndexedDB isn't even opened.
  expect(openIndexedDb).not.toHaveBeenCalled()
  expect(dexieOpen).not.toHaveBeenCalled()
  expect(db.isOpen()).toBe(false)
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('visitor mode in production (T-0026)', () => {
  it('is on for nobody signed in', () => {
    expect(isVisitorNow()).toBe(true)
    function Probe() {
      return <p>{useVisitor() ? 'bezoeker' : 'eigenaar'}</p>
    }
    render(<Probe />)
    expect(screen.getByText('bezoeker')).toBeInTheDocument()
  })

  it('says the projects are unreachable when the NAS is down', async () => {
    down = true
    await show('/')
    expect(await within(main()).findByText('Projecten zijn nu niet bereikbaar.')).toBeInTheDocument()
  })

  it('shows public projects on the overview, read-only, with a sign-in link', async () => {
    await show('/')
    expect(await screen.findByRole('heading', { name: 'Tuinbank' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Nieuw project/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Zoeken' })).toBeNull()
    // T-0022: the bin is the owner's only.
    expect(screen.queryByRole('link', { name: 'Prullenbak' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Inloggen' })).toHaveAttribute('href', '/account')
    // The card's cover is the thumbnail, from the NAS by address.
    const cover = main().querySelector('img')!
    expect(cover.getAttribute('src')).toBe('https://pb.test/api/files/pbc_photos/f2/thumbnail_2.webp')
  })

  it('shows a project and its timeline without any edit, delete, import or add controls', async () => {
    await show('/projects/tuinbank')
    expect(await screen.findByRole('heading', { level: 1, name: 'Tuinbank' })).toBeInTheDocument()
    expect(screen.getByText('Poten op lengte gezaagd.')).toBeInTheDocument()
    // T-0027: addresses by slug, day and place, never an id.
    const hrefs = [...main().querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/', '/projects/tuinbank/2026-10-04/1', '/projects/tuinbank/2026-10-04/2'])
    expect(screen.getByText('Frame gelijmd.')).toBeInTheDocument()
    const dates = [...main().querySelectorAll('.timeline time')].map((t) => t.textContent)
    expect(dates).toEqual(['11 okt 2026', '4 okt 2026'])
    expect(within(main()).queryAllByRole('button')).toEqual([])
    for (const name of [/Bewerken/, /Notitie toevoegen/, /Foto's toevoegen/, /Verwijderen/, /bewerken/]) {
      expect(within(main()).queryByRole('link', { name })).toBeNull()
    }
    expect(main().querySelector('input, textarea, select, form')).toBeNull()
    const srcs = [...main().querySelectorAll('img')].map((i) => i.getAttribute('src'))
    // D-0031: a day's photos newest first (f2 was taken after f1).
    expect(srcs).toEqual([
      'https://pb.test/api/files/pbc_photos/f2/thumbnail_2.webp',
      'https://pb.test/api/files/pbc_photos/f1/thumbnail_1.webp',
    ])
  })

  it('opens a photo full screen without the cover and delete actions', async () => {
    await show('/projects/tuinbank/2026-10-04/1')
    const viewer = await screen.findByRole('dialog', { name: /Foto 1 van 2/ })
    expect(within(viewer).getByText('Poten op lengte gezaagd.')).toBeInTheDocument()
    expect(within(viewer).queryByRole('button', { name: /omslagfoto/ })).toBeNull()
    expect(within(viewer).queryByRole('button', { name: 'Verwijderen' })).toBeNull()
    expect(within(viewer).getByRole('button', { name: 'Sluiten' })).toBeInTheDocument()
    const current = viewer.querySelector('img[data-current]')!
    // D-0031: place 1 is the newest photo of the day.
    expect(current.getAttribute('src')).toBe('https://pb.test/api/files/pbc_photos/f2/copy_2.webp')
  })

  it('redirects an earlier slug to the current one, keeping the rest of the address (T-0027)', async () => {
    await show('/projects/bank/2026-10-04/2')
    expect(await screen.findByRole('dialog', { name: /Foto 2 van 2/ })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/projects/tuinbank/2026-10-04/2')
  })

  it('says a project that isn’t public isn’t there', async () => {
    await show('/projects/private-one')
    expect(await screen.findByRole('heading', { name: 'Project niet gevonden' })).toBeInTheDocument()
  })

  it.each(['/projects/new', '/projects/tuinbank/edit', '/projects/tuinbank/entries/new', '/zoeken', '/prullenbak'])(
    'has no owner page at %s',
    async (path) => {
      await show(path)
      expect(await screen.findByRole('heading', { name: 'Niet gevonden' })).toBeInTheDocument()
      expect(main().querySelector('input, textarea, select, form')).toBeNull()
      expect(within(main()).queryAllByRole('button')).toEqual([])
    },
  )

  it('never sends a sign-in, and never asks for an original', () => {
    expect(requests.length).toBeGreaterThan(0)
    for (const r of requests) {
      expect(r.authorization).toBeUndefined()
      expect(r.url).not.toMatch(/IMG_000|original|token=/)
    }
    // Every list asks only for what's shown: never the owner or the original's name.
    for (const r of requests.filter((x) => x.url.includes('fields='))) {
      const fields = new URL(r.url).searchParams.get('fields')!.split(',')
      expect(fields).not.toContain('original')
      expect(fields).not.toContain('owner')
    }
  })
})
