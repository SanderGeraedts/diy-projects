// @vitest-environment node
// T-0027 (D-0029): slugs, and that the app, the NAS's hook and the NAS's migration make the
// same ones.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { openDb, type DiyDb } from './db'
import { backfillSlugs, hasBase, isSlug, renamedSlugs, slugify, uniqueSlug } from './slug'
import { createProject, deleteProject, updateProject } from './write'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')

/** deploy/nas/pb_hooks/slug.js, loaded as PocketBase's require() does (CommonJS). */
function nasSlug() {
  const module = { exports: {} as Record<string, unknown> }
  new Function('module', 'exports', read('deploy/nas/pb_hooks/slug.js'))(module, module.exports)
  return module.exports as {
    slugify(title: string): string
    settle(
      incoming: { title: string; slug?: string; oldSlugs?: unknown },
      stored: { slug: string; oldSlugs: unknown } | null,
      others: { slug: string; oldSlugs: unknown }[],
    ): { slug: string; oldSlugs: string[] }
  }
}

/** The frozen slugify in the NAS's backfill migration. */
function migrationSlugify(): (title: string) => string {
  const source = read('deploy/nas/pb_migrations/1794931700_project_slugs.js')
  const body = /\/\/ --- slugify \(frozen\) ---\n([\s\S]*?)\/\/ --- end slugify ---/.exec(source)?.[1]
  if (!body) throw new Error('no slugify in the migration')
  return new Function(`${body}; return slugify`)() as (title: string) => string
}

const TITLES: [string, string][] = [
  ['Kast für Sanne', 'kast-fur-sanne'],
  ['Tuinbank', 'tuinbank'],
  ['Fietsenrek voor de schuur', 'fietsenrek-voor-de-schuur'],
  ['  Crème brûlée -- tafel!  ', 'creme-brulee-tafel'],
  ['Ærø & Øresund', 'r-resund'],
  ['İstanbul ŞEHİR', 'istanbul-sehir'],
  ['Straße 12b', 'stra-e-12b'],
  ['', 'project'],
  ['!!!', 'project'],
  ['🪚 🔨', 'project'],
  ['new', 'project'],
  ['New', 'project'],
  ['news', 'news'],
  ['Nieuw', 'nieuw'],
  ['2026', '2026'],
  [
    'Een heel lange titel voor een project dat nooit lijkt af te komen maar toch',
    'een-heel-lange-titel-voor-een-project-dat-nooit-lijkt-af-te',
  ],
  ['a'.repeat(70), 'a'.repeat(60)],
  [`${'b'.repeat(59)} c`, 'b'.repeat(59)],
  [`${'b'.repeat(60)} c`, 'b'.repeat(60)],
  [`x ${'b'.repeat(70)}`, 'x'],
]

describe('slugify', () => {
  it.each(TITLES)('%j → %s', (title, slug) => {
    expect(slugify(title)).toBe(slug)
    expect(isSlug(slugify(title))).toBe(true)
    expect(slugify(title).length).toBeLessThanOrEqual(60)
  })

  it('gives the same slugs as the NAS hook and the NAS migration', () => {
    const hook = nasSlug().slugify
    const migration = migrationSlugify()
    for (const [title] of TITLES) {
      expect(hook(title)).toBe(slugify(title))
      expect(migration(title)).toBe(slugify(title))
    }
  })
})

describe('uniqueness', () => {
  it('adds -2, -3 to a taken slug', () => {
    expect(uniqueSlug('kast', new Set())).toBe('kast')
    expect(uniqueSlug('kast', new Set(['kast']))).toBe('kast-2')
    expect(uniqueSlug('kast', new Set(['kast', 'kast-2']))).toBe('kast-3')
    expect(uniqueSlug('kast-2', new Set(['kast', 'kast-2']), 'kast')).toBe('kast-3')
  })

  it('knows a clash form from a title that ends in a number', () => {
    expect(hasBase('kast-2', 'kast')).toBe(true)
    expect(hasBase('kast-fur-sanne', 'kast')).toBe(false)
    expect(hasBase('kast-02', 'kast')).toBe(false)
  })

  it('backfills by creation: createdAt, then id; held slugs stay and count as taken', () => {
    const slugs = backfillSlugs([
      { id: 'b', title: 'Kast', createdAt: '2026-01-02' },
      { id: 'a', title: 'Kast', createdAt: '2026-01-02' },
      { id: 'c', title: 'Kast', createdAt: '2026-01-01' },
      { id: 'd', title: 'Bank', createdAt: '2026-01-01', slug: 'bank', oldSlugs: ['kast-4'] },
      { id: 'e', title: 'Kast', createdAt: '2026-01-03' },
    ])
    expect(Object.fromEntries(slugs)).toEqual({ c: 'kast', a: 'kast-2', b: 'kast-3', e: 'kast-5' })
  })

  it('keeps the slug when a new title makes the same one, else moves the old one to oldSlugs', () => {
    expect(renamedSlugs({ slug: 'kast-2', oldSlugs: [] }, 'KAST', new Set(['kast']))).toEqual({ slug: 'kast-2', oldSlugs: [] })
    expect(renamedSlugs({ slug: 'kast', oldSlugs: ['oud'] }, 'Bank', new Set())).toEqual({ slug: 'bank', oldSlugs: ['oud', 'kast'] })
    // Back to an earlier name: its slug comes back out of oldSlugs.
    expect(renamedSlugs({ slug: 'bank', oldSlugs: ['kast'] }, 'Kast', new Set())).toEqual({ slug: 'kast', oldSlugs: ['bank'] })
    expect(renamedSlugs({ slug: 'kast', oldSlugs: [] }, 'Bank', new Set(['bank']))).toEqual({ slug: 'bank-2', oldSlugs: ['kast'] })
  })
})

describe('the NAS settles a slug (pb_hooks/slug.js)', () => {
  const { settle } = nasSlug()

  it('keeps a free slug and gives a taken one the next free suffix of its title', () => {
    expect(settle({ title: 'Kast', slug: 'kast' }, null, [])).toEqual({ slug: 'kast', oldSlugs: [] })
    expect(settle({ title: 'Kast', slug: 'kast' }, null, [{ slug: 'kast', oldSlugs: [] }])).toEqual({ slug: 'kast-2', oldSlugs: [] })
    // Both devices picked kast-2 next to their own kast: the second becomes kast-3, not kast-2-2.
    const others = [
      { slug: 'kast', oldSlugs: [] },
      { slug: 'kast-2', oldSlugs: [] },
    ]
    expect(settle({ title: 'Kast', slug: 'kast-2' }, null, others).slug).toBe('kast-3')
    // A title that itself ends in a number keeps it.
    expect(settle({ title: 'Plan 2', slug: 'plan-2' }, null, [{ slug: 'plan-2', oldSlugs: [] }]).slug).toBe('plan-2-2')
  })

  it('counts earlier slugs of other projects as taken', () => {
    expect(settle({ title: 'Kast', slug: 'kast' }, null, [{ slug: 'bank', oldSlugs: ['kast'] }]).slug).toBe('kast-2')
  })

  it('keeps the stored slug in oldSlugs on a rename, also when the device sent none', () => {
    expect(settle({ title: 'Bank', slug: 'bank', oldSlugs: [] }, { slug: 'kast', oldSlugs: '["oud"]' }, [])).toEqual({
      slug: 'bank',
      oldSlugs: ['oud', 'kast'],
    })
  })

  it('makes a slug from the title for a device that sends none (an app from before T-0027)', () => {
    expect(settle({ title: 'Zolder trap' }, null, [])).toEqual({ slug: 'zolder-trap', oldSlugs: [] })
  })
})

describe('the write API (T-0027)', () => {
  let db: DiyDb | undefined
  let n = 0
  const fresh = () => (db = openDb(`slug-test-${++n}`))
  afterEach(async () => {
    await db?.delete()
    db = undefined
  })

  it('gives a new project a slug unique on this device, tombstoned projects included', async () => {
    const d = fresh()
    expect((await createProject({ title: 'Kast für Sanne' }, d)).slug).toBe('kast-fur-sanne')
    const first = await createProject({ title: 'Kast' }, d)
    expect(first.slug).toBe('kast')
    await deleteProject(first.id, d)
    expect((await createProject({ title: 'kast' }, d)).slug).toBe('kast-2')
    expect((await createProject({ title: 'new' }, d)).slug).toBe('project')
  })

  it('renames: a new slug, the old one in oldSlugs and never given to another project', async () => {
    const d = fresh()
    const p = await createProject({ title: 'Kast' }, d)
    const renamed = await updateProject(p.id, { title: 'Bank' }, d)
    expect(renamed).toMatchObject({ slug: 'bank', oldSlugs: ['kast'] })
    expect(await d.projects.get(p.id)).toMatchObject({ slug: 'bank', oldSlugs: ['kast'] })
    expect((await createProject({ title: 'Kast' }, d)).slug).toBe('kast-2')
    // Other edits leave the slug alone.
    expect(await updateProject(p.id, { description: 'Eiken' }, d)).toMatchObject({ slug: 'bank', oldSlugs: ['kast'] })
    // Every change goes to the outbox, slug and all.
    expect(await d.outbox.count()).toBe(4)
  })
})
