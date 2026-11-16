// D-0009: a PR that touches any of these paths needs Sander's review; any other green PR
// merges itself. This list and .github/CODEOWNERS must stay the same (a test checks it).
// Changing either is a guarded change: say so plainly in the PR.
//
// Usage: list changed paths on stdin, one per line. Prints the guarded ones and exits 0;
// the caller decides from the output.

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
]

/**
 * True if the path is a guarded file or lies inside a guarded folder.
 * @param {string} path
 */
export function isGuarded(path) {
  const p = path.replaceAll('\\', '/').replace(/^\.?\//, '')
  return GUARDED_PATHS.some((g) => (g.endsWith('/') ? p.startsWith(g) : p === g))
}

/**
 * The guarded paths among the changed ones.
 * @param {string[]} paths
 */
export function guardedChanges(paths) {
  return paths.map((p) => p.trim()).filter((p) => p && isGuarded(p))
}

if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (d) => (input += d))
  process.stdin.on('end', () => {
    for (const p of guardedChanges(input.split('\n'))) console.log(p)
  })
}
