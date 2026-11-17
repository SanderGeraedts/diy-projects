// D-0017: a PR that touches any of these paths needs Sander's review; any other green PR
// merges itself. Exception: a PR whose only guarded changes raise new open questions.
// GUARDED_PATHS and .github/CODEOWNERS must stay the same (a test checks it); the question
// exception lives only here. Changing any of this is a guarded change: say so plainly in
// the PR.
//
// Usage: the PR's changed files on stdin as JSON lines, one per file, as GitHub's
// "list pull request files" API returns them ({filename, status, previous_filename, patch}).
// Prints the guarded paths that need review and exits 0; the caller decides from the output.

import { resolve } from 'node:path'

export const GUARDED_PATHS = [
  'deploy/nas/',
  'src/sync/',
  'src/db/',
  'src/sw/',
  'src/auth/',
  'docs/decisions/',
  'AGENTS.md',
  'CLAUDE.md',
  '.github/',
  '.claude/',
  '.githooks/',
]

const QUESTION_FILE = /^docs\/decisions\/Q-\d{3}-[a-z0-9-]+\.md$/
const DECISION_INDEX = 'docs/decisions/index.md'
const QUESTION_INDEX_LINE = /^\+- \[Q-\d{3} [^\]]+\]\(Q-\d{3}-[a-z0-9-]+\.md\): \S/
const PLACEHOLDER_REMOVAL = /^-(None yet\.|None\.)$/

/**
 * @typedef {{ filename: string, status: string, previous_filename?: string | null, patch?: string | null }} ChangedFile
 */

/**
 * True if the path is a guarded file or lies inside a guarded folder.
 * @param {string} path
 */
export function isGuarded(path) {
  const p = path.replaceAll('\\', '/').replace(/^\.?\//, '')
  return GUARDED_PATHS.some((g) => (g.endsWith('/') ? p.startsWith(g) : p === g))
}

/**
 * True if this change only raises a new open question (D-0017's exception).
 * @param {ChangedFile} file
 */
export function onlyRaisesQuestions(file) {
  if (file.previous_filename) return false
  if (file.status === 'added' && QUESTION_FILE.test(file.filename)) return true
  if (file.status !== 'modified' || file.filename !== DECISION_INDEX || !file.patch) return false
  const changed = file.patch
    .split('\n')
    .filter((l) => (l.startsWith('+') || l.startsWith('-')) && !l.startsWith('+++') && !l.startsWith('---'))
  const added = changed.filter((l) => l.startsWith('+'))
  return (
    added.length > 0 &&
    added.every((l) => QUESTION_INDEX_LINE.test(l)) &&
    changed.filter((l) => l.startsWith('-')).every((l) => PLACEHOLDER_REMOVAL.test(l))
  )
}

/**
 * The guarded paths among the changed files that need Sander's review.
 * @param {ChangedFile[]} files
 */
export function guardedChanges(files) {
  /** @type {string[]} */
  const out = []
  for (const f of files) {
    if (onlyRaisesQuestions(f)) continue
    if (isGuarded(f.filename)) out.push(f.filename)
    if (f.previous_filename && isGuarded(f.previous_filename)) out.push(f.previous_filename)
  }
  return [...new Set(out)]
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (d) => (input += d))
  process.stdin.on('end', () => {
    const files = input
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => /** @type {ChangedFile} */ (JSON.parse(l)))
    for (const p of guardedChanges(files)) console.log(p)
  })
}
