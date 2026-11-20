import { describe, expect, it } from 'vitest'
import type { Entry, Project } from '../db/db'
import { binItemName, binItems, deletedOn, partsText, purgeQuestion } from './bin'

const T = '2026-11-10T09:00:00.000Z'
const project = (id: string, title: string, deletedAt: string | null): Project => ({
  id,
  title,
  description: '',
  status: 'idea',
  tags: [],
  public: true,
  slug: id,
  oldSlugs: [],
  createdAt: T,
  updatedAt: T,
  deletedAt,
})
const entry = (id: string, projectId: string, date: string, deletedAt: string | null): Entry => ({
  id,
  projectId,
  date,
  note: '',
  createdAt: T,
  updatedAt: T,
  deletedAt,
})
const photo = (projectId: string, entryId: string, deletedAt: string | null) => ({ projectId, entryId, deletedAt })

const A = '2026-11-17T10:00:00.000Z'
const B = '2026-11-18T10:00:00.000Z'
const C = '2026-11-19T10:00:00.000Z'

describe('binItems (T-0022)', () => {
  const projects = [project('bench', 'Tuinbank', B), project('shed', 'Schuur', null), project('kast', 'Kast', null)]
  const entries = [
    entry('b1', 'bench', '2026-10-04', B),
    entry('b2', 'bench', '2026-10-11', A), // deleted on its own, before the project
    entry('s1', 'shed', '2026-11-01', C),
    entry('s2', 'shed', '2026-11-02', null),
  ]
  const photos = [
    photo('bench', 'b1', B),
    photo('bench', 'b1', B),
    photo('bench', 'b1', A), // deleted on its own
    photo('bench', 'b2', A),
    photo('shed', 's1', C),
    photo('shed', 's2', null),
  ]

  it('lists deleted projects and deleted entries of live projects, newest first', () => {
    const items = binItems(projects, entries, photos)
    expect(items.map((i) => [i.kind, i.id])).toEqual([
      ['entry', 's1'],
      ['project', 'bench'],
    ])
  })

  it('counts what a restore brings back, and what a permanent delete removes', () => {
    const [shedEntry, bench] = binItems(projects, entries, photos)
    expect(bench).toMatchObject({ entries: 1, photos: 2, purge: { entries: 2, photos: 4 }, projectTitle: 'Tuinbank' })
    expect(shedEntry).toMatchObject({ projectId: 'shed', projectTitle: 'Schuur', date: '2026-11-01', entries: 0, photos: 1 })
    expect(shedEntry!.purge).toEqual({ entries: 0, photos: 1 })
  })

  it('lists an entry deleted on its own once its project is restored', () => {
    const restored = [project('bench', 'Tuinbank', null), ...projects.slice(1)]
    const back = <R extends { deletedAt: string | null }>(r: R): R => ({ ...r, deletedAt: r.deletedAt === B ? null : r.deletedAt })
    const items = binItems(restored, entries.map(back), photos.map(back))
    expect(items.map((i) => i.id)).toEqual(['s1', 'b2'])
    expect(items[1]).toMatchObject({ photos: 1 })
  })

  it('is empty when nothing is deleted', () => {
    expect(binItems([project('shed', 'Schuur', null)], [entry('s2', 'shed', '2026-11-02', null)], [])).toEqual([])
  })
})

describe('bin texts', () => {
  const [entryItem, projectItem] = binItems(
    [project('bench', 'Tuinbank', B), project('shed', 'Schuur', null)],
    [entry('b1', 'bench', '2026-10-04', B), entry('s1', 'shed', '2026-10-04', C)],
    [photo('bench', 'b1', B), photo('shed', 's1', C)],
  )

  it('names the item', () => {
    expect(binItemName(projectItem!)).toBe("Project 'Tuinbank'")
    expect(binItemName(entryItem!)).toBe('Notitie van 4 okt 2026')
  })

  it('says what goes with it, singular for one, leaving zero out', () => {
    expect(partsText({ entries: 3, photos: 14 })).toBe("3 notities en 14 foto's")
    expect(partsText({ entries: 1, photos: 1 })).toBe('1 notitie en 1 foto')
    expect(partsText({ entries: 0, photos: 2 })).toBe("2 foto's")
    expect(partsText({ entries: 0, photos: 0 })).toBe('')
  })

  it('asks before a permanent delete', () => {
    expect(purgeQuestion(projectItem!)).toBe(
      "Project 'Tuinbank' definitief verwijderen, met 1 notitie en 1 foto? Dit kan niet ongedaan worden gemaakt.",
    )
    expect(purgeQuestion({ ...entryItem!, purge: { entries: 0, photos: 0 } })).toBe(
      'Notitie van 4 okt 2026 definitief verwijderen? Dit kan niet ongedaan worden gemaakt.',
    )
  })

  it('gives the day of the delete', () => {
    expect(deletedOn({ ...projectItem!, deletedAt: '2026-11-18T12:00:00.000Z' })).toBe('18 nov 2026')
    expect(deletedOn({ ...projectItem!, deletedAt: 'nonsense' })).toBe('')
  })
})
