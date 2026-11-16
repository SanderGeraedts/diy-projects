// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GUARDED_PATHS, guardedChanges, isGuarded } from './guarded-paths.mjs'

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

describe('guardedChanges', () => {
  it('returns only the guarded paths and ignores blank lines', () => {
    expect(guardedChanges(['src/routes/A.tsx', '', 'src/db/db.ts', 'AGENTS.md '])).toEqual(['src/db/db.ts', 'AGENTS.md'])
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
