import { describe, expect, it } from 'vitest'
import type { Project } from './db/db'
import { filterProjects, type OrderingPhoto, hasFilters, tagsInUse, toggle, validateOverviewSearch } from './filters'

function project(id: string, over: Partial<Project> = {}): Project {
  return {
    id,
    title: id,
    description: '',
    status: 'idea',
    tags: [],
    public: true,
    slug: id,
    oldSlugs: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    ...over,
  }
}

const projects = [
  project('bench', { status: 'in progress', tags: ['hout', 'tuin'], updatedAt: '2026-03-01T00:00:00.000Z' }),
  project('shelf', { status: 'done', tags: ['hout', 'badkamer'], updatedAt: '2026-04-01T00:00:00.000Z' }),
  project('rack', { status: 'idea', tags: ['metaal'], updatedAt: '2026-02-01T00:00:00.000Z' }),
  project('gone', { status: 'done', tags: ['hout', 'oud'], deletedAt: '2026-05-01T00:00:00.000Z' }),
]

const ids = (ps: Project[]) => ps.map((p) => p.id)

describe('filterProjects', () => {
  it('shows every live project, newest update first, without filters', () => {
    expect(ids(filterProjects(projects, {}, []))).toEqual(['shelf', 'bench', 'rack'])
  })

  it('never shows tombstoned projects', () => {
    expect(ids(filterProjects(projects, { status: ['done'] }, []))).toEqual(['shelf'])
    expect(ids(filterProjects(projects, { tag: ['oud'] }, []))).toEqual([])
  })

  it('combines statuses as any of', () => {
    expect(ids(filterProjects(projects, { status: ['idea', 'in progress'] }, []))).toEqual(['bench', 'rack'])
  })

  it('combines tags as all of', () => {
    expect(ids(filterProjects(projects, { tag: ['hout'] }, []))).toEqual(['shelf', 'bench'])
    expect(ids(filterProjects(projects, { tag: ['hout', 'tuin'] }, []))).toEqual(['bench'])
  })

  it('combines status and tag filters', () => {
    expect(ids(filterProjects(projects, { status: ['done'], tag: ['hout'] }, []))).toEqual(['shelf'])
    expect(ids(filterProjects(projects, { status: ['idea'], tag: ['hout'] }, []))).toEqual([])
  })
})

describe('the overview order (T-0030, D-0032)', () => {
  const photo = (projectId: string, takenAt: string, deletedAt: string | null = null): OrderingPhoto => ({
    projectId,
    takenAt,
    deletedAt,
  })
  const day = (date: string) => `${date}T12:00:00.000Z`

  const ordered = [
    project('A', { tags: ['ac'], updatedAt: day('2026-11-02') }),
    project('E', { updatedAt: day('2026-11-01') }),
    project('B', { updatedAt: day('2026-11-20') }),
    project('C', { tags: ['ac'], updatedAt: day('2026-11-21') }),
    project('D', { updatedAt: day('2026-11-10') }),
  ]
  const photos = [
    photo('A', '2026-11-01T10:00:00'),
    photo('E', '2026-11-01T10:00:00'),
    photo('B', '2026-10-25T09:00:00'),
    photo('B', '2026-09-01T09:00:00'),
    photo('D', '2026-12-01T09:00:00', '2026-12-02T00:00:00.000Z'),
    // A photo of another project counts for none of these.
    photo('other', '2027-01-01T09:00:00'),
  ]

  it('orders by the newest live photo, ties by last edit, projects without a live photo last', () => {
    // In any input order, the result is the same.
    expect(ids(filterProjects(ordered, {}, photos))).toEqual(['A', 'E', 'B', 'C', 'D'])
    expect(ids(filterProjects([...ordered].reverse(), {}, [...photos].reverse()))).toEqual(['A', 'E', 'B', 'C', 'D'])
  })

  it("doesn't count another project's photo for a project", () => {
    const withC = [...photos, photo('C', '2026-11-30T09:00:00')]
    expect(ids(filterProjects(ordered, {}, withC))).toEqual(['C', 'A', 'E', 'B', 'D'])
    // A newer photo of a project not in the list doesn't lift C, which has none, above B.
    expect(ids(filterProjects([ordered[3]!, ordered[2]!], {}, photos))).toEqual(['B', 'C'])
  })

  it('ties without photos on last edit, then id', () => {
    const same = [project('x'), project('z'), project('y')]
    expect(ids(filterProjects(same, {}, []))).toEqual(['z', 'y', 'x'])
  })

  it('keeps the order under a filter', () => {
    expect(ids(filterProjects(ordered, { tag: ['ac'] }, photos))).toEqual(['A', 'C'])
  })
})

describe('validateOverviewSearch', () => {
  it('keeps known statuses and tags', () => {
    expect(validateOverviewSearch({ status: ['done', 'idea'], tag: ['hout'] })).toEqual({
      status: ['done', 'idea'],
      tag: ['hout'],
    })
  })

  it('accepts single values', () => {
    expect(validateOverviewSearch({ status: 'paused', tag: 'tuin' })).toEqual({ status: ['paused'], tag: ['tuin'] })
  })

  it('drops unknown statuses, empty and non-string tags, and duplicates', () => {
    expect(validateOverviewSearch({ status: ['nope', 'done', 'done'], tag: ['', 3, 'hout', 'hout'] })).toEqual({
      status: ['done'],
      tag: ['hout'],
    })
    expect(validateOverviewSearch({ status: 'nope', other: 'x' })).toEqual({})
  })
})

describe('helpers', () => {
  it('lists tags of live projects, sorted', () => {
    expect(tagsInUse(projects)).toEqual(['badkamer', 'hout', 'metaal', 'tuin'])
  })

  it('toggles a value and drops an empty list', () => {
    expect(toggle(undefined, 'a')).toEqual(['a'])
    expect(toggle(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggle(['a'], 'a')).toBeUndefined()
  })

  it('knows whether any filter is active', () => {
    expect(hasFilters({})).toBe(false)
    expect(hasFilters({ tag: ['hout'] })).toBe(true)
  })
})
