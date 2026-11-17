import { describe, expect, it } from 'vitest'
import type { Entry, Project } from '../db/db'
import { buildDemoData } from '../seed/demo'
import { buildIndex, highlight, normalize, search } from './search'

const T = '2026-11-01T00:00:00.000Z'

function project(id: string, title: string, extra: Partial<Project> = {}): Project {
  return {
    id,
    title,
    description: '',
    status: 'idea',
    tags: [],
    createdAt: T,
    updatedAt: T,
    deletedAt: null,
    ...extra,
  }
}

function entry(id: string, projectId: string, note: string, extra: Partial<Entry> = {}): Entry {
  return { id, projectId, date: '2026-11-01', note, createdAt: T, updatedAt: T, deletedAt: null, ...extra }
}

const ids = (results: ReturnType<typeof search>) => results.map((r) => r.project.id)

describe('normalize', () => {
  it('drops case and accents', () => {
    expect(normalize('Café Ñandú ÉÉN')).toBe('cafe nandu een')
  })
})

describe('search', () => {
  const projects = [
    project('shed', 'Fietsenrek voor de Schuur', { tags: ['metaal'] }),
    project('cafe', 'Café-tafel', { description: 'Eiken blad, geolied.' }),
    project('bench', 'Tuinbank', { tags: ['hout', 'tuin'] }),
  ]
  const entries = [
    entry('e1', 'bench', 'Eerste laag olie aangebracht.', { date: '2026-10-25' }),
    entry('e2', 'bench', 'Nog een laag olie.', { date: '2026-11-02' }),
    entry('e3', 'shed', 'Muur opgemeten.'),
  ]
  const index = buildIndex(projects, entries)

  it('is case-insensitive', () => {
    expect(ids(search(index, 'schuur'))).toEqual(['shed'])
    expect(ids(search(index, 'TUINBANK'))).toEqual(['bench'])
  })

  it('is accent-insensitive both ways', () => {
    expect(ids(search(index, 'cafe'))).toEqual(['cafe'])
    expect(ids(search(index, 'tâfél'))).toEqual(['cafe'])
  })

  it('matches whole words and word starts, not the middle of a word', () => {
    expect(ids(search(index, 'fiets'))).toEqual(['shed'])
    expect(ids(search(index, 'rek'))).toEqual([])
    expect(ids(search(index, 'bank'))).toEqual([])
  })

  it('searches descriptions and tags', () => {
    expect(ids(search(index, 'geolied'))).toEqual(['cafe'])
    expect(search(index, 'geolied')[0]!.fields).toEqual(['description'])
    expect(ids(search(index, 'metaal'))).toEqual(['shed'])
    expect(search(index, 'metaal')[0]!.fields).toEqual(['tags'])
  })

  it('finds entry notes, grouped by project, newest entry first', () => {
    const r = search(index, 'olie')[0]!
    expect(r.project.id).toBe('bench')
    expect(r.fields).toEqual([])
    expect(r.entries.map((e) => e.id)).toEqual(['e2', 'e1'])
  })

  it('needs every query word, from the note or its project', () => {
    expect(search(index, 'tuin olie')[0]!.entries.map((e) => e.id)).toEqual(['e2', 'e1'])
    expect(search(index, 'eerste olie')[0]!.entries.map((e) => e.id)).toEqual(['e1'])
    expect(search(index, 'olie metaal')).toEqual([])
  })

  it('returns nothing for an empty query', () => {
    expect(search(index, '  ')).toEqual([])
  })

  it('never matches tombstoned projects, entries, or entries of a tombstoned project', () => {
    const idx = buildIndex(
      [project('gone', 'Schuurdeur', { deletedAt: T }), project('live', 'Zolder')],
      [
        entry('g1', 'gone', 'Schuurdeur geschuurd'),
        entry('l1', 'live', 'Schuur opgeruimd', { deletedAt: T }),
        entry('l2', 'live', 'Isolatie besteld'),
      ],
    )
    expect(search(idx, 'schuur')).toEqual([])
    expect(search(idx, 'geschuurd')).toEqual([])
    expect(search(idx, 'isolatie')[0]!.entries.map((e) => e.id)).toEqual(['l2'])
  })

  it('finds a title word and a note word in the demo data', () => {
    const { projects: ps, entries: es } = buildDemoData()
    const idx = buildIndex(ps, es)
    expect(ids(search(idx, 'tuinbank'))).toEqual(['demo-garden-bench'])
    const r = search(idx, 'diamantboor')[0]!
    expect(r.project.id).toBe('demo-bathroom-shelf')
    expect(r.entries.map((e) => e.id)).toEqual(['demo-bathroom-shelf-entry-1'])
  })

  it('searches 100 projects and 2,000 entries in under 100 ms', () => {
    const vocab = 'hout schuur zolder tuin plank olie verf schroef lijm zaag boor tegel muur dak deur raam vloer kast bank rek'.split(' ')
    const pick = (n: number) => vocab[n % vocab.length]!
    const ps = Array.from({ length: 100 }, (_, i) =>
      project(`p${i}`, `Project ${pick(i)} ${i}`, {
        description: `Een beschrijving met ${pick(i * 3)} en ${pick(i * 7)}, en nog wat tekst over het werk.`,
        tags: [pick(i), pick(i + 5)],
      }),
    )
    const es = Array.from({ length: 2000 }, (_, i) =>
      entry(
        `e${i}`,
        `p${i % 100}`,
        `Vandaag ${pick(i)} en ${pick(i * 11)} gedaan. Daarna de ${pick(i * 13)} opgeruimd en de ${pick(i * 17)} besteld bij de bouwmarkt.`,
        { date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}` },
      ),
    )
    const queries = ['s', 'sc', 'sch', 'schu', 'schuur', 'schuur o', 'schuur olie']
    // One run: build the index, then type the query one keystroke at a time.
    const run = () => {
      const start = performance.now()
      const idx = buildIndex(ps, es)
      const results = queries.map((q) => search(idx, q))
      return { results, total: performance.now() - start }
    }
    // Warm up once (JIT), then take the best of five, so a busy CI runner doesn't fail the
    // budget on one slow moment; the budget itself is unchanged.
    run()
    const runs = Array.from({ length: 5 }, run)
    const best = Math.min(...runs.map((r) => r.total))
    expect(runs[0]!.results[4]!.length).toBeGreaterThan(0)
    expect(best / queries.length).toBeLessThan(100)
    // And the whole run, index build included, also fits one keystroke's budget.
    expect(best).toBeLessThan(100)
  })
})

describe('highlight', () => {
  it('marks the matched word starts, keeping case and accents', () => {
    expect(highlight('Café-tafel in de Schuur', 'cafe schu')).toEqual([
      { text: 'Café', match: true },
      { text: '-tafel in de ', match: false },
      { text: 'Schu', match: true },
      { text: 'ur', match: false },
    ])
  })

  it('handles decomposed accents', () => {
    const text = 'Café open'
    expect(highlight(text, 'cafe')).toEqual([
      { text: 'Café', match: true },
      { text: ' open', match: false },
    ])
  })

  it('returns the text unmarked without a match', () => {
    expect(highlight('Muur opgemeten.', 'olie')).toEqual([{ text: 'Muur opgemeten.', match: false }])
  })
})
