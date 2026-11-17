import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// D-0011 checks, read straight from the token stylesheet and the component sources.

const css = readFileSync(join(__dirname, 'app.css'), 'utf8')

function tokens(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) out[m[1]!] = m[2]!
  return out
}

const light = tokens(css.slice(css.indexOf('@theme'), css.indexOf('@media (prefers-color-scheme: dark)')))
const dark = { ...light, ...tokens(css.slice(css.indexOf('@media (prefers-color-scheme: dark)'), css.indexOf('@layer base'))) }

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const PAIRS: [string, string][] = [
  ['text', 'bg'],
  ['text', 'grey-lighter'],
  ['grey', 'bg'],
  ['status-idea-text', 'status-idea-bg'],
  ['status-in-progress-text', 'status-in-progress-bg'],
  ['status-paused-text', 'status-paused-bg'],
  ['status-done-text', 'status-done-bg'],
]

describe('token contrast (4.5:1 or better)', () => {
  for (const [name, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    for (const [fg, bg] of PAIRS) {
      it(`${name}: ${fg} on ${bg}`, () => {
        expect(theme[fg], fg).toBeDefined()
        expect(theme[bg], bg).toBeDefined()
        expect(contrast(theme[fg]!, theme[bg]!)).toBeGreaterThanOrEqual(4.5)
      })
    }
  }
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return sourceFiles(p)
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

describe('components use tokens only', () => {
  const files = [...sourceFiles(join(__dirname, '../components')), ...sourceFiles(join(__dirname, '../routes'))]
  const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|\[(?:#|rgb|hsl)/i

  it('finds the sources', () => expect(files.length).toBeGreaterThan(3))
  for (const file of files) {
    it(`no raw colour values in ${file.replace(/.*src[\\/]/, 'src/')}`, () => {
      const lines = readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => RAW_COLOUR.test(l))
      expect(lines).toEqual([])
    })
  }
})
