import { ClientResponseError } from 'pocketbase'
import { describe, expect, it, vi } from 'vitest'
import type { ServerRecord } from '../sync/records'
import { isVisitor } from './mode'
import { CACHE_MS, createDemoSource, createPocketBaseSource, UnreachableError, visitorClient, type PublicClient } from './source'

const T = '2026-11-16T12:00:00.000Z'

function project(id: string, extra: Record<string, unknown> = {}): ServerRecord {
  return { id, updated: T, title: id, description: '', status: 'idea', tags: [], public: true, createdAt: T, updatedAt: T, deletedAt: '', ...extra }
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
  const getFullList = vi.fn(async (name: string, _options?: Record<string, unknown>) => records[name] ?? [])
  const getOne = vi.fn(async (name: string, id: string) => {
    const found = (records[name] ?? []).find((r) => r.id === id)
    if (!found) throw new ClientResponseError({ url: 'https://pb.test', status: 404, response: {} })
    return found
  })
  const client: PublicClient = {
    collection: (name) => ({
      getFullList: (options) => getFullList(name, options),
      getOne: (id) => getOne(name, id),
    }),
    files: { getURL: (record, filename) => `https://pb.test/api/files/${String(record.collectionName)}/${String(record.id)}/${filename}` },
    filter: (raw, params) => raw.replace('{:id}', `'${String(params?.id)}'`),
  }
  return { client, getFullList, getOne }
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
      },
    ])
  })

  it('asks only for the fields it shows, and for one project’s entries and photos', async () => {
    const { client, getFullList } = mockClient({ projects: [project('p1')] })
    await createPocketBaseSource(client).project('p1')
    const calls = getFullList.mock.calls.map(([name, options]) => [name, options?.filter, String(options?.fields)])
    expect(calls).toEqual([
      ['entries', `projectId = 'p1' && deletedAt = ""`, expect.not.stringMatching(/owner|original/)],
      ['photos', `projectId = 'p1' && deletedAt = ""`, expect.not.stringMatching(/owner|original/)],
    ])
  })

  it('gives null for a project PocketBase doesn’t show (404), or that isn’t public', async () => {
    const { client } = mockClient({ projects: [project('p2', { public: false })] })
    const source = createPocketBaseSource(client)
    expect(await source.project('nope')).toBeNull()
    expect(await source.project('p2')).toBeNull()
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
    const { client, getOne } = mockClient({ projects: [project('p1')] })
    const source = createPocketBaseSource(client, () => now)
    await source.project('p1')
    await source.project('p1')
    expect(getOne).toHaveBeenCalledTimes(1)
    now = CACHE_MS
    await source.project('p1')
    expect(getOne).toHaveBeenCalledTimes(2)
  })
})

describe('createDemoSource (D-0006)', () => {
  it('shows the seeded demo projects from memory', async () => {
    const { projects, photos } = await createDemoSource('on').overview()
    expect(projects.map((p) => p.title)).toContain('Tuinbank')
    expect(photos.every((p) => p.copyUrl.startsWith('blob:'))).toBe(true)
    expect(await createDemoSource('on').project('nope')).toBeNull()
  })

  it('stands in for an unreachable NAS', async () => {
    await expect(createDemoSource('unreachable').overview()).rejects.toBeInstanceOf(UnreachableError)
  })
})
