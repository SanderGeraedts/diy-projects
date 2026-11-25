#!/usr/bin/env node
// D-0044 (T-0042): Netlify's `[build] ignore` command. Exit 0 skips the build, any other exit
// builds. It skips only when every path changed in the range D-0044 defines is docs-only, and
// builds on anything else or on any doubt. Node built-ins and git only: it runs before
// `pnpm install`. It reads no Netlify variable beyond CONTEXT, COMMIT_REF and CACHED_COMMIT_REF.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SKIP = 0
const BUILD = 1

/** Docs-only: under `docs/`, or a Markdown file at the repository root. */
export function isDocsOnlyPath(path) {
  return path.startsWith('docs/') || /^[^/]+\.md$/.test(path)
}

/** At least one path, and every one of them docs-only. */
export function isDocsOnlyChange(paths) {
  return paths.length > 0 && paths.every(isDocsOnlyPath)
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function tryGit(args, cwd) {
  try {
    return { ok: true, out: git(args, cwd) }
  } catch {
    return { ok: false, out: '' }
  }
}

function commitOf(ref, cwd) {
  const r = tryGit(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], cwd)
  return r.ok ? r.out.trim() : null
}

function fetchMain(cwd, extra = []) {
  return tryGit(['fetch', '--quiet', ...extra, 'origin', '+refs/heads/main:refs/remotes/origin/main'], cwd).ok
}

function previewBase(commit, cwd, log) {
  if (!commitOf('origin/main', cwd)) {
    log('origin/main is missing: fetching it')
    if (!fetchMain(cwd) || !commitOf('origin/main', cwd)) return null
  }
  let base = tryGit(['merge-base', 'origin/main', commit], cwd)
  if (!base.ok && tryGit(['rev-parse', '--is-shallow-repository'], cwd).out.trim() === 'true') {
    log('no merge base in a shallow clone: fetching the full history')
    fetchMain(cwd, ['--unshallow'])
    base = tryGit(['merge-base', 'origin/main', commit], cwd)
  }
  return base.ok ? base.out.trim() : null
}

/**
 * Decides for the repository in `cwd`. Returns { exit, reason }; `log` receives the lines
 * the deploy log shows.
 */
export function decide(env, cwd = process.cwd(), log = console.log) {
  const context = env.CONTEXT ?? ''
  const commitRef = env.COMMIT_REF ?? ''
  const cachedRef = env.CACHED_COMMIT_REF ?? ''
  log(`netlify-ignore: CONTEXT=${context || '(unset)'}`)
  log(`netlify-ignore: COMMIT_REF=${commitRef || '(unset)'}`)
  log(`netlify-ignore: CACHED_COMMIT_REF=${cachedRef || '(unset)'}`)
  const verdict = (exit, reason) => {
    log(`netlify-ignore: ${exit === SKIP ? 'skip' : 'build'} (${reason})`)
    return { exit, reason }
  }

  if (!commitRef) return verdict(BUILD, 'COMMIT_REF is unset')
  const commit = commitOf(commitRef, cwd)
  if (!commit) return verdict(BUILD, 'COMMIT_REF is not a known commit')

  let from
  if (context === 'deploy-preview') {
    from = previewBase(commit, cwd, log)
    if (!from) return verdict(BUILD, 'no merge base with origin/main')
  } else if (context === 'production') {
    if (!cachedRef) return verdict(BUILD, 'CACHED_COMMIT_REF is unset')
    const cached = commitOf(cachedRef, cwd)
    if (!cached) return verdict(BUILD, 'CACHED_COMMIT_REF is not a known commit')
    if (cached === commit) return verdict(BUILD, 'CACHED_COMMIT_REF equals COMMIT_REF')
    if (!tryGit(['merge-base', '--is-ancestor', cached, commit], cwd).ok) {
      return verdict(BUILD, 'CACHED_COMMIT_REF is not an ancestor of COMMIT_REF')
    }
    from = cached
  } else {
    return verdict(BUILD, `context ${context || '(unset)'} always builds`)
  }

  log(`netlify-ignore: range ${from}..${commit}`)
  const diff = tryGit(['diff', '--name-only', '--no-renames', '-z', from, commit], cwd)
  if (!diff.ok) return verdict(BUILD, 'git diff failed')
  const paths = diff.out.split('\0').filter(Boolean)
  log(`netlify-ignore: ${paths.length} changed path(s)`)
  for (const path of paths.slice(0, 50)) log(`  ${path}`)
  if (paths.length === 0) return verdict(BUILD, 'empty range')
  if (!isDocsOnlyChange(paths)) return verdict(BUILD, 'a changed path is not docs-only')
  return verdict(SKIP, 'docs-only change')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let exit = BUILD
  try {
    exit = decide(process.env).exit
  } catch (error) {
    console.log(`netlify-ignore: build (error: ${error instanceof Error ? error.message : error})`)
    exit = BUILD
  }
  process.exit(exit)
}
