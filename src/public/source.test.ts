import { ClientResponseError } from 'pocketbase'
import { describe, expect, it, vi } from 'vitest'
import type { ServerRecord } from '../sync/records'
import { isVisitor } from './mode'
import { comparePhotos } from '../routes/paths'
import { CACHE_MS, createDemoSource, createPocketBaseSource, UnreachableError, visitorClient, visitorTimeline, type PublicClient, type PublicPhoto } from './source'

const T = '2026-11-16T12:00:00.000Z'

function project(id: string, extra: Record<string, unknown> = {}): ServerRecord {
  return { id, updated: T, title: id, description: '', status: 'idea', tags: [], public: true, slug: id, oldSlugs: [], createdAt: T, updatedAt: T, deletedAt: '', ...extra }
}

function photo(id: string, extra: Record<string, unknown> = {}): ServerRecord {
  return {
    id,
    updated: T,
    collectionName: 'photos',
    projectId: 'p1',
    entryId: 'e1',
    takenAt: T,
    width: 4,
    height: 3,
    copy: `copy_${id}.webp`,
    thumbnail: `thumb_${id}.webp`,
    createdAt: T,
    deletedAt: '',
    ...extra,
  }
}

function mockClient(records: Record<string, ServerRecord[]>) {
  // Like PocketBase: `slug = 'x' || oldSlugs ~ '"x"'` finds a project by its slug or an earlier one.
  const getFullList = vi.fn(async (name: string, options?: Record<string, unknown>) => {
    const bySlug = /^slug = '([^']*)'/.exec(String(options?.filter ?? ''))?.[1]
    const all = records[name] ?? []
    if (bySlug === undefined) return all
    return all.filter((r) => r.slug === bySlug || (Array.isArray(r.oldSlugs) && r.oldSlugs.includes(bySlug)))
  })
  const client: PublicClient = {
    collection: (name) => ({ getFullList: (options) => getFullList(name, options) }),
    files: {
      getURL: (record, filename, query) =>
        `https://pb.test/api/files/${String(record.collectionName)}/${String(record.id)}/${filename}${query?.thumb ? `?thumb=${query.thumb}` : ''}`,
    },
    filter: (raw, params) => raw.replace(/\{:(\w+)\}/g, (_, key: string) => `'${String(params?.[key])}'`),
  }
  return { client, getFullList }
}

describe('isVisitor (T-0026, D-0025)', () => {
  it('is a visitor only in a build that syncs, with nobody signed in', () => {
    expect(isVisitor(true, 'signed-out')).toBe(true)
    expect(isVisitor(true, 'signed-in')).toBe(false)
    // D-0013: an expired sign-in is still the owner; local data stays usable.
    expect(isVisitor(true, 'expired')).toBe(false)
    // D-0006: previews and dev are the owner's demo, unless the demo visitor view is asked for.
    expect(isVisitor(false, 'signed-out')).toBe(false)
    expect(isVisitor(false, 'signed-out', 'on')).toBe(true)
  })
})

describe('the visitor client', () => {
  it('never carries a sign-in', () => {
    localStorage.setItem('pocketbase_auth', JSON.stringify({ token: 'owner-token', record: { id: 'u1' } }))
    try {
      expect(visitorClient('https://pb.test').authStore.token).toBe('')
    } finally {
      localStorage.removeItem('pocketbase_auth')
    }
  })
})

describe('createPocketBaseSource', () => {
  it('shows public, live projects and the photos that have their copy and thumbnail, by address', async () => {
    const { client } = mockClient({
      projects: [project('p1'), project('p2', { public: false }), project('p3', { deletedAt: T })],
      photos: [photo('f1'), photo('f2', { copy: '' }), photo('f3', { deletedAt: T })],
    })
    const overview = await createPocketBaseSource(client).overview()
    expect(overview.projects.map((p) => p.id)).toEqual(['p1'])
    expect(overview.photos).toEqual([
      {
        id: 'f1',
        projectId: 'p1',
        entryId: 'e1',
        takenAt: T,
        createdAt: T,
        width: 4,
        height: 3,
        deletedAt: null,
        copyUrl: 'https://pb.test/api/files/photos/f1/copy_f1.webp',
        thumbnailUrl: 'https://pb.test/api/files/photos/f1/thumb_f1.webp',
        cardUrl: 'https://pb.test/api/files/photos/f1/thumb_f1.webp?thumb=640x480',
      },
    ])
  })

  it("gives each photo a card image: PocketBase's 640×480 thumb of the thumbnail (T-0040, D-0041)", async () => {
    // The real SDK's addresses, as a visitor's client makes them.
    const client = visitorClient('https://pb.test')
    const source = createPocketBaseSource({
      collection: (name) => ({ getFullList: async () => (name === 'photos' ? [photo('f1')] : [project('p1')]) }),
      files: client.files,
      filter: client.filter.bind(client),
    })
    const [shown] = (await source.overview()).photos
    expect(shown!.cardUrl).toBe(`${shown!.thumbnailUrl}?thumb=640x480`)
    expect(shown!.cardUrl).toMatch(/\?thumb=640x480$/)
  })

  it('asks only for the fields it shows, and for one project’s entries and photos', async () => {
    const { client, getFullList } = mockClient({ projects: [project('p1', { slug: 'bank' })] })
    await createPocketBaseSource(client).project('bank')
    const calls = getFullList.mock.calls.map(([name, options]) => [name, options?.filter, String(options?.fields)])
    expect(calls).toEqual([
      ['projects', `slug = 'bank' || oldSlugs ~ '"bank"'`, expect.not.stringMatching(/owner|oldSlugs/)],
      ['entries', `projectId = 'p1' && deletedAt = ""`, expect.not.stringMatching(/owner|original/)],
      ['photos', `projectId = 'p1' && deletedAt = ""`, expect.not.stringMatching(/owner|original/)],
    ])
  })

  it('gives null for a project PocketBase doesn’t show, or that isn’t public', async () => {
    const { client } = mockClient({ projects: [project('p2', { public: false })] })
    const source = createPocketBaseSource(client)
    expect(await source.project('nope')).toBeNull()
    expect(await source.project('p2')).toBeNull()
    expect(await source.project('Not a slug!')).toBeNull()
  })

  it('finds a project by an earlier slug, with its current one to redirect to (T-0027)', async () => {
    const { client } = mockClient({ projects: [project('p1', { slug: 'bank', oldSlugs: ['kast'] }), project('p2', { slug: 'kast-2' })] })
    const source = createPocketBaseSource(client)
    expect((await source.project('kast'))?.project).toMatchObject({ id: 'p1', slug: 'bank' })
    expect((await source.project('bank'))?.project).toMatchObject({ id: 'p1', slug: 'bank' })
    expect((await source.project('kast-2'))?.project).toMatchObject({ id: 'p2', slug: 'kast-2' })
  })

  it('turns any other failure into UnreachableError, and tries again next time', async () => {
    const { client, getFullList } = mockClient({ projects: [project('p1')] })
    getFullList.mockRejectedValueOnce(new ClientResponseError({ url: 'https://pb.test', status: 0 }))
    const source = createPocketBaseSource(client)
    await expect(source.overview()).rejects.toBeInstanceOf(UnreachableError)
    expect((await source.overview()).projects).toHaveLength(1)
  })

  it('reuses a load for a minute', async () => {
    let now = 0
    const { client, getFullList } = mockClient({ projects: [project('p1')] })
    const source = createPocketBaseSource(client, () => now)
    const projectLoads = () => getFullList.mock.calls.filter(([name]) => name === 'projects').length
    await source.project('p1')
    await source.project('p1')
    expect(projectLoads()).toBe(1)
    now = CACHE_MS
    await source.project('p1')
    expect(projectLoads()).toBe(2)
  })
})

describe('createDemoSource (D-0006)', () => {
  it('shows the seeded demo projects from memory', async () => {
    const { projects, photos } = await createDemoSource('on').overview()
    expect(projects.map((p) => p.title)).toContain('Tuinbank')
    expect(photos.every((p) => p.copyUrl.startsWith('blob:'))).toBe(true)
    // No PocketBase, so no card image (T-0040).
    expect(photos.some((p) => 'cardUrl' in p)).toBe(false)
    expect(await createDemoSource('on').project('nope')).toBeNull()
    expect((await createDemoSource('on').project('tuinbank'))?.project.title).toBe('Tuinbank')
  })

  it('stands in for an unreachable NAS', async () => {
    await expect(createDemoSource('unreachable').overview()).rejects.toBeInstanceOf(UnreachableError)
  })
})

describe('visitorTimeline (T-0029, D-0031)', () => {
  const shown = (id: string, takenAt: string, createdAt: string): PublicPhoto => ({
    id, projectId: 'p1', entryId: 'e1', takenAt, createdAt, width: 4, height: 3, deletedAt: null, copyUrl: '', thumbnailUrl: '',
  })

  it("puts a visitor's photos newest first, in comparePhotos' order, not by time taken alone", () => {
    const photos = [
      shown('x', '2026-10-04T09:00:00Z', '2026-10-04T13:00:00Z'),
      shown('b', '2026-10-04T10:00:00Z', '2026-10-04T11:00:00Z'),
      shown('z', '2026-10-04T10:00:00Z', '2026-10-04T12:00:00Z'),
      shown('a', '2026-10-04T10:00:00Z', '2026-10-04T11:00:00Z'),
      shown('w', '2026-10-04T11:00:00Z', '2026-10-04T10:00:00Z'),
    ]
    const ids = visitorTimeline({ entries: [], photos }).photos.map((p) => p.id)
    expect(ids).toEqual(['w', 'z', 'b', 'a', 'x'])
    expect(ids).toEqual([...photos].sort(comparePhotos).map((p) => p.id))
  })
})
