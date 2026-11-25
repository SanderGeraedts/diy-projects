// @vitest-environment node
// T-0042 (D-0044): runs scripts/netlify-ignore.mjs in throwaway git repositories, the way
// Netlify runs it, and checks its exit code (0 skips the build, 1 builds).
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { isDocsOnlyChange, isDocsOnlyPath } from './netlify-ignore.mjs'

const script = resolve(dirname(fileURLToPath(import.meta.url)), 'netlify-ignore.mjs')
const root = mkdtempSync(join(tmpdir(), 'netlify-ignore-'))
let count = 0

// Each case makes its own repositories and runs git several times: slow on Windows.
vi.setConfig({ testTimeout: 60_000 })

afterAll(() => rmSync(root, { recursive: true, force: true }))

function git(cwd, ...args) {
  return execFileSync(
    'git',
    ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim()
}

function write(cwd, path, text = `${path} ${++count}\n`) {
  mkdirSync(dirname(join(cwd, path)), { recursive: true })
  writeFileSync(join(cwd, path), text)
}

function commit(cwd, paths, message = 'change') {
  for (const path of paths) write(cwd, path)
  git(cwd, 'add', '-A')
  git(cwd, 'commit', '--quiet', '-m', message)
  return git(cwd, 'rev-parse', 'HEAD')
}

/** A repository with a `main` commit, `origin/main` pointing at it, and a branch `pr`. */
function repo() {
  const cwd = join(root, `r${++count}`)
  mkdirSync(cwd)
  git(cwd, 'init', '--quiet', '-b', 'main')
  const main = commit(cwd, ['src/main.ts', 'docs/tasks/T-0001.md', 'docs/a.md', 'README.md', 'LICENSE'], 'main')
  git(cwd, 'update-ref', 'refs/remotes/origin/main', main)
  git(cwd, 'checkout', '--quiet', '-b', 'pr')
  return { cwd, main }
}

function run(cwd, env) {
  const clean = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !['CONTEXT', 'COMMIT_REF', 'CACHED_COMMIT_REF'].includes(key)),
  )
  for (const [key, value] of Object.entries(env)) if (value !== undefined) clean[key] = value
  const result = spawnSync(process.execPath, [script], { cwd, env: clean, encoding: 'utf8' })
  return { exit: result.status, log: result.stdout }
}

function preview(paths) {
  const { cwd } = repo()
  const head = commit(cwd, paths)
  return run(cwd, { CONTEXT: 'deploy-preview', COMMIT_REF: head, CACHED_COMMIT_REF: head })
}

describe('the docs-only path rule', () => {
  it('accepts docs/ and root Markdown only', () => {
    expect(isDocsOnlyPath('docs/tasks/T-0042.md')).toBe(true)
    expect(isDocsOnlyPath('docs/img/x.png')).toBe(true)
    expect(isDocsOnlyPath('README.md')).toBe(true)
    expect(isDocsOnlyPath('src/notes.md')).toBe(false)
    expect(isDocsOnlyPath('docsx/a.md')).toBe(false)
    expect(isDocsOnlyPath('LICENSE')).toBe(false)
    expect(isDocsOnlyChange([])).toBe(false)
  })
})

describe('netlify-ignore, deploy preview', () => {
  it('skips when only docs/tasks and docs/decisions changed, with equal refs', () => {
    const result = preview(['docs/tasks/T-0002.md', 'docs/decisions/D-0001.md'])
    expect(result.exit, result.log).toBe(0)
    expect(result.log).toMatch(/skip/)
  })

  it('skips when only root Markdown and docs files changed', () => {
    const result = preview(['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs/lessons.md', 'docs/deploy/netlify.md'])
    expect(result.exit, result.log).toBe(0)
  })

  it('builds on an empty range', () => {
    const { cwd, main } = repo()
    const result = run(cwd, { CONTEXT: 'deploy-preview', COMMIT_REF: main, CACHED_COMMIT_REF: main })
    expect(result.exit, result.log).toBe(1)
    expect(result.log).toMatch(/empty range/)
  })

  it('builds when src/ changed', () => {
    expect(preview(['src/x.ts']).exit).toBe(1)
  })

  it('builds when docs/ and src/ both changed', () => {
    expect(preview(['docs/b.md', 'src/x.ts']).exit).toBe(1)
  })

  for (const path of [
    'deploy/nas/README.md',
    '.claude/agents/x.md',
    'src/notes.md',
    'public/x.md',
    'e2e/x.md',
    'backend/x.md',
    'netlify.toml',
    'scripts/netlify-ignore.mjs',
    'vite.config.ts',
    'package.json',
    'pnpm-lock.yaml',
    'LICENSE',
  ]) {
    it(`builds when ${path} changed`, () => {
      expect(preview([path]).exit).toBe(1)
    })
  }

  it('builds on a rename from docs/ to src/', () => {
    const { cwd } = repo()
    git(cwd, 'mv', 'docs/a.md', 'src/a.md')
    git(cwd, 'commit', '--quiet', '-m', 'rename')
    const head = git(cwd, 'rev-parse', 'HEAD')
    const result = run(cwd, { CONTEXT: 'deploy-preview', COMMIT_REF: head, CACHED_COMMIT_REF: head })
    expect(result.exit, result.log).toBe(1)
    expect(result.log).toContain('src/a.md')
  })

  it('builds on a deleted src/ file', () => {
    const { cwd } = repo()
    unlinkSync(join(cwd, 'src/main.ts'))
    const head = commit(cwd, [], 'delete')
    const result = run(cwd, { CONTEXT: 'deploy-preview', COMMIT_REF: head, CACHED_COMMIT_REF: head })
    expect(result.exit, result.log).toBe(1)
  })

  it('ignores CACHED_COMMIT_REF: a code commit then a docs-only commit builds', () => {
    const { cwd } = repo()
    const code = commit(cwd, ['src/x.ts'])
    const head = commit(cwd, ['docs/b.md'])
    const result = run(cwd, { CONTEXT: 'deploy-preview', COMMIT_REF: head, CACHED_COMMIT_REF: code })
    expect(result.exit, result.log).toBe(1)
  })

  function cloneWithoutOriginMain(paths) {
    const { cwd: source } = repo()
    git(source, 'checkout', '--quiet', 'main')
    const remote = join(root, `remote${++count}.git`)
    git(root, 'clone', '--quiet', '--bare', source, remote)
    const cwd = join(root, `clone${++count}`)
    git(root, 'clone', '--quiet', '--single-branch', '--branch', 'main', remote, cwd)
    git(cwd, 'checkout', '--quiet', '-b', 'pr')
    const head = commit(cwd, paths)
    git(cwd, 'update-ref', '-d', 'refs/remotes/origin/main')
    git(cwd, 'branch', '--quiet', '-D', 'main')
    return { cwd, head }
  }

  it('fetches a missing origin/main and skips a docs-only change against the merge base', () => {
    const { cwd, head } = cloneWithoutOriginMain(['docs/b.md'])
    const result = run(cwd, { CONTEXT: 'deploy-preview', COMMIT_REF: head, CACHED_COMMIT_REF: head })
    expect(result.exit, result.log).toBe(0)
    expect(result.log).toMatch(/fetching/)
  })

  it('fetches a missing origin/main and builds a code change against the merge base', () => {
    const { cwd, head } = cloneWithoutOriginMain(['src/x.ts'])
    const result = run(cwd, { CONTEXT: 'deploy-preview', COMMIT_REF: head, CACHED_COMMIT_REF: head })
    expect(result.exit, result.log).toBe(1)
  })

  it('builds when origin/main is missing and cannot be fetched', () => {
    const { cwd } = repo()
    const head = commit(cwd, ['docs/b.md'])
    git(cwd, 'update-ref', '-d', 'refs/remotes/origin/main')
    git(cwd, 'branch', '--quiet', '-D', 'main')
    const result = run(cwd, { CONTEXT: 'deploy-preview', COMMIT_REF: head, CACHED_COMMIT_REF: head })
    expect(result.exit, result.log).toBe(1)
    expect(result.log).toMatch(/no merge base/)
  })
})

describe('netlify-ignore, production', () => {
  function production(paths) {
    const { cwd, main } = repo()
    git(cwd, 'checkout', '--quiet', 'main')
    const head = commit(cwd, paths)
    return { cwd, main, head }
  }

  it('skips a docs-only commit after the cached one', () => {
    const { cwd, main, head } = production(['docs/tasks/T-0002.md'])
    const result = run(cwd, { CONTEXT: 'production', COMMIT_REF: head, CACHED_COMMIT_REF: main })
    expect(result.exit, result.log).toBe(0)
  })

  it('builds a code commit after the cached one', () => {
    const { cwd, main, head } = production(['src/x.ts'])
    expect(run(cwd, { CONTEXT: 'production', COMMIT_REF: head, CACHED_COMMIT_REF: main }).exit).toBe(1)
  })

  for (const [name, cached] of [
    ['equal to COMMIT_REF', 'head'],
    ['unset', undefined],
    ['an unknown sha', '0123456789abcdef0123456789abcdef01234567'],
  ]) {
    it(`builds when CACHED_COMMIT_REF is ${name}`, () => {
      const { cwd, head } = production(['docs/b.md'])
      const result = run(cwd, {
        CONTEXT: 'production',
        COMMIT_REF: head,
        CACHED_COMMIT_REF: cached === 'head' ? head : cached,
      })
      expect(result.exit, result.log).toBe(1)
    })
  }

  it('builds when CACHED_COMMIT_REF is not an ancestor of COMMIT_REF', () => {
    const { cwd, head } = production(['docs/b.md'])
    git(cwd, 'checkout', '--quiet', 'pr')
    const other = commit(cwd, ['docs/c.md'])
    const result = run(cwd, { CONTEXT: 'production', COMMIT_REF: head, CACHED_COMMIT_REF: other })
    expect(result.exit, result.log).toBe(1)
  })
})

describe('netlify-ignore, other contexts', () => {
  for (const context of ['branch-deploy', undefined]) {
    it(`builds a docs-only change when CONTEXT is ${context ?? 'unset'}`, () => {
      const { cwd, main } = repo()
      const head = commit(cwd, ['docs/b.md'])
      expect(run(cwd, { CONTEXT: context, COMMIT_REF: head, CACHED_COMMIT_REF: main }).exit).toBe(1)
    })
  }

  it('builds when COMMIT_REF is unset', () => {
    const { cwd, main } = repo()
    commit(cwd, ['docs/b.md'])
    const result = run(cwd, { CONTEXT: 'deploy-preview', CACHED_COMMIT_REF: main })
    expect(result.exit, result.log).toBe(1)
    expect(result.log).toMatch(/COMMIT_REF is unset/)
  })
})
