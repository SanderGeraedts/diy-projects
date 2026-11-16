// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GUARDED_PATHS, guardedChanges, isGuarded, onlyRaisesQuestions } from './guarded-paths.mjs'

describe('isGuarded', () => {
  it.each([
    'deploy/nas/Dockerfile',
    'deploy/nas/pb_migrations/1_init.js',
    'src/sync/engine.ts',
    'src/db/db.ts',
    'src/sw/register.ts',
    'src/auth/login.ts',
    'docs/decisions/D-0001-x.md',
    'AGENTS.md',
    'CLAUDE.md',
    '.github/workflows/ci.yml',
    '.github/CODEOWNERS',
  ])('guards %s', (p) => expect(isGuarded(p)).toBe(true))

  it.each([
    'src/routes/Overview.tsx',
    'src/seed/demo.ts',
    'src/database-helpers.ts',
    'src/syncing.ts',
    'docs/tasks/T-0002-x.md',
    'deploy/other/thing',
    'package.json',
    'netlify.toml',
    'docs/AGENTS.md',
  ])('lets %s through', (p) => expect(isGuarded(p)).toBe(false))
})

const Q_FILE = { filename: 'docs/decisions/Q-002-what-colour.md', status: 'added' }
const Q_LINE = '+- [Q-002 What colour should it be?](Q-002-what-colour.md): Pick one.'
/** @param {string} body */
const index = (body) => ({ filename: 'docs/decisions/index.md', status: 'modified', patch: `@@ -27,3 +27,4 @@\n ## Open questions\n${body}` })

describe('onlyRaisesQuestions (D-0012)', () => {
  it('accepts a new question file', () => expect(onlyRaisesQuestions(Q_FILE)).toBe(true))
  it('accepts a question line added to the index', () => expect(onlyRaisesQuestions(index(Q_LINE))).toBe(true))
  it('accepts replacing the placeholder with a question line', () =>
    expect(onlyRaisesQuestions(index(`-None yet.\n${Q_LINE}`))).toBe(true))

  it.each([
    ['a new decision file', { filename: 'docs/decisions/D-0099-x.md', status: 'added' }],
    ['an edited question', { ...Q_FILE, status: 'modified' }],
    ['a removed question', { ...Q_FILE, status: 'removed' }],
    ['a renamed question', { ...Q_FILE, status: 'renamed', previous_filename: 'docs/decisions/D-0001-x.md' }],
    ['a question outside docs/decisions', { filename: 'docs/decisions/sub/Q-002-x.md', status: 'added' }],
    ['a decision line in the index', index('+- [D-0099 Something](D-0099-x.md): Decided.')],
    ['a removed index line', index(`-- [D-0001 x](D-0001-x.md): y.\n${Q_LINE}`)],
    ['an index change without a diff', { filename: 'docs/decisions/index.md', status: 'modified' }],
    ['an index change that only removes', index('-None yet.')],
  ])('rejects %s', (_, f) => expect(onlyRaisesQuestions(f)).toBe(false))
})

describe('guardedChanges', () => {
  it('returns only the guarded paths', () => {
    expect(
      guardedChanges([
        { filename: 'src/routes/A.tsx', status: 'modified' },
        { filename: 'src/db/db.ts', status: 'modified' },
        { filename: 'AGENTS.md', status: 'modified' },
      ]),
    ).toEqual(['src/db/db.ts', 'AGENTS.md'])
  })

  it('counts the old name of a file moved out of a guarded folder', () => {
    expect(
      guardedChanges([{ filename: 'src/lib/db.ts', status: 'renamed', previous_filename: 'src/db/db.ts' }]),
    ).toEqual(['src/db/db.ts'])
  })

  it('lets a question-only PR through', () => {
    expect(guardedChanges([Q_FILE, index(Q_LINE), { filename: 'src/routes/A.tsx', status: 'modified' }])).toEqual([])
  })

  it('still guards a question PR that also changes a decision', () => {
    const decision = { filename: 'docs/decisions/D-0001-x.md', status: 'modified' }
    expect(guardedChanges([Q_FILE, index(Q_LINE), decision])).toEqual(['docs/decisions/D-0001-x.md'])
  })
})

describe('CODEOWNERS', () => {
  it('lists exactly the guarded paths', () => {
    const owners = readFileSync(new URL('../CODEOWNERS', import.meta.url), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => (l.split(/\s+/)[0] ?? '').replace(/^\//, ''))
    expect(owners.sort()).toEqual([...GUARDED_PATHS].sort())
  })
})
