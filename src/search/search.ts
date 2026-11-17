import type { Entry, Project } from '../db/db'

// T-0012, D-0004: search over project titles, descriptions, tags and entry notes, on the
// device's local copy, so it works offline. A small matcher of our own (no library):
// case- and accent-insensitive, matching whole words and word starts.

/** Lower case, accents dropped: "Café" → "cafe". */
export function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

const WORD = /[\p{L}\p{N}]+/gu

/** The normalized words of a text. */
export function words(text: string): string[] {
  return normalize(text).match(WORD) ?? []
}

/** The words of a query, each to be matched as a word or the start of one. Duplicates dropped. */
export function queryWords(query: string): string[] {
  return [...new Set(words(query))]
}

export type ProjectField = 'title' | 'description' | 'tags'

interface IndexedProject {
  project: Project
  fields: Record<ProjectField, string[]>
  /** All words of the project's fields together, for matching. */
  all: string[]
  entries: IndexedEntry[]
}

interface IndexedEntry {
  entry: Entry
  words: string[]
}

export interface SearchIndex {
  projects: IndexedProject[]
}

/**
 * Builds the index once per data change. Tombstoned projects and entries never match, and
 * neither do the entries of a tombstoned project (D-0014: deletes cascade).
 */
export function buildIndex(projects: Project[], entries: Entry[]): SearchIndex {
  const byId = new Map<string, IndexedProject>()
  for (const project of projects) {
    if (project.deletedAt !== null) continue
    const fields = {
      title: words(project.title),
      description: words(project.description),
      tags: project.tags.flatMap(words),
    }
    byId.set(project.id, {
      project,
      fields,
      all: [...fields.title, ...fields.description, ...fields.tags],
      entries: [],
    })
  }
  for (const entry of entries) {
    if (entry.deletedAt !== null) continue
    byId.get(entry.projectId)?.entries.push({ entry, words: words(entry.note) })
  }
  return { projects: [...byId.values()] }
}

function hasWordStart(haystack: string[], q: string): boolean {
  for (const w of haystack) if (w.startsWith(q)) return true
  return false
}

export interface ProjectResult {
  project: Project
  /** The project fields that match a query word; empty when only entries match. */
  fields: ProjectField[]
  /** Matching entries, newest first. */
  entries: Entry[]
}

/**
 * Finds projects and entries matching every word of the query (as a word or a word start).
 * A project matches when all words occur in its title, description and tags together. An
 * entry matches when all words occur in its note or its project's fields, at least one of
 * them in the note. Results are grouped by project: projects that match themselves first,
 * then by number of matching entries, then by title.
 */
export function search(index: SearchIndex, query: string): ProjectResult[] {
  const qs = queryWords(query)
  if (qs.length === 0) return []
  const results: ProjectResult[] = []
  for (const ip of index.projects) {
    const inProject = qs.map((q) => hasWordStart(ip.all, q))
    const projectMatches = inProject.every(Boolean)
    const entries: Entry[] = []
    for (const ie of ip.entries) {
      let inNote = false
      let all = true
      for (const [i, q] of qs.entries()) {
        if (hasWordStart(ie.words, q)) inNote = true
        else if (!inProject[i]) {
          all = false
          break
        }
      }
      if (all && inNote) entries.push(ie.entry)
    }
    if (!projectMatches && entries.length === 0) continue
    const fields = projectMatches
      ? (['title', 'description', 'tags'] as const).filter((f) => qs.some((q) => hasWordStart(ip.fields[f], q)))
      : []
    entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    results.push({ project: ip.project, fields, entries })
  }
  return results.sort(
    (a, b) =>
      Number(b.fields.length > 0) - Number(a.fields.length > 0) ||
      b.entries.length - a.entries.length ||
      a.project.title.localeCompare(b.project.title, 'nl'),
  )
}

export interface Segment {
  text: string
  match: boolean
}

/**
 * Splits a text into segments, marking the part of each word that a query word matches
 * (the whole word, or its start), so results can highlight it. Works on the original text,
 * accents and case kept.
 */
export function highlight(text: string, query: string): Segment[] {
  const qs = queryWords(query)
  const segments: Segment[] = []
  let last = 0
  const push = (t: string, match: boolean) => {
    if (!t) return
    const prev = segments[segments.length - 1]
    if (prev && prev.match === match) prev.text += t
    else segments.push({ text: t, match })
  }
  if (qs.length > 0) {
    for (const m of text.matchAll(/[\p{L}\p{N}\p{M}]+/gu)) {
      const word = m[0]
      const norm = normalize(word)
      const q = qs.filter((x) => norm.startsWith(x)).sort((a, b) => b.length - a.length)[0]
      if (!q) continue
      // Map the matched normalized length back to characters of the original word.
      let end = 0
      let len = 0
      for (const ch of word) {
        if (len >= q.length) break
        len += normalize(ch).length
        end += ch.length
      }
      // Keep combining marks that belong to the last matched character.
      while (end < word.length && /\p{M}/u.test(word.charAt(end))) end++
      const start = m.index
      push(text.slice(last, start), false)
      push(word.slice(0, end), true)
      last = start + end
    }
  }
  push(text.slice(last), false)
  return segments
}
