import { describe, expect, it } from 'vitest'
import type { Project } from './db/db'
import { filterProjects, hasFilters, tagsInUse, toggle, validateOverviewSearch } from './filters'

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
    expect(ids(filterProjects(projects, {}))).toEqual(['shelf', 'bench', 'rack'])
  })

  it('never shows tombstoned projects', () => {
    expect(ids(filterProjects(projects, { status: ['done'] }))).toEqual(['shelf'])
    expect(ids(filterProjects(projects, { tag: ['oud'] }))).toEqual([])
  })

  it('combines statuses as any of', () => {
    expect(ids(filterProjects(projects, { status: ['idea', 'in progress'] }))).toEqual(['bench', 'rack'])
  })

  it('combines tags as all of', () => {
    expect(ids(filterProjects(projects, { tag: ['hout'] }))).toEqual(['shelf', 'bench'])
    expect(ids(filterProjects(projects, { tag: ['hout', 'tuin'] }))).toEqual(['bench'])
  })

  it('combines status and tag filters', () => {
    expect(ids(filterProjects(projects, { status: ['done'], tag: ['hout'] }))).toEqual(['shelf'])
    expect(ids(filterProjects(projects, { status: ['idea'], tag: ['hout'] }))).toEqual([])
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
