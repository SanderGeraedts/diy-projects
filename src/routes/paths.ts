import type { Entry } from '../db/db'

// T-0027 (D-0029): addresses hold no ids. A project is /projects/<slug>; an entry is named by
// its date, as the hash of its project's page ("#" and the date) and as the first part of a
// photo's address; a photo is /projects/<slug>/<day>/<n>, its 1-based place among its entry's
// photos in the order they're shown: newest first (D-0031), so place 1 is the newest.
//
// A project has one live entry per date: adding a note or importing photos on a day that has
// an entry adds to it (AddEntry.tsx, photos/importQueue.ts). Two devices that were offline can
// still each add one for the same day, and a restore from the bin can bring one back next to
// a newer one. Then the day's entries are told apart by creation: the first is `2026-10-04`,
// the next `2026-10-04-2`, and so on.

const DAY = /^(\d{4}-\d{2}-\d{2})(?:-([1-9]\d*))?$/

type DatedEntry = Pick<Entry, 'id' | 'date' | 'createdAt'>

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** The day segment of each entry (by id), among one project's live entries. */
export function entryDays(entries: readonly DatedEntry[]): Map<string, string> {
  const byDate = new Map<string, DatedEntry[]>()
  for (const e of entries) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])
  const days = new Map<string, string>()
  for (const [date, list] of byDate) {
    list.sort((a, b) => cmp(a.createdAt, b.createdAt) || cmp(a.id, b.id))
    list.forEach((e, i) => days.set(e.id, i === 0 ? date : `${date}-${i + 1}`))
  }
  return days
}

/** The entry a day segment names, among one project's live entries; undefined when none. */
export function entryForDay<E extends DatedEntry>(entries: readonly E[], day: string): E | undefined {
  if (!DAY.test(day)) return undefined
  const days = entryDays(entries)
  return entries.find((e) => days.get(e.id) === day)
}

/**
 * The order an entry's photos are shown and numbered in (D-0031): newest first, like the days.
 * Latest time taken first; then the one added last; then by id, descending.
 */
export function comparePhotos(
  a: { takenAt: string; createdAt: string; id: string },
  b: { takenAt: string; createdAt: string; id: string },
): number {
  return cmp(b.takenAt, a.takenAt) || cmp(b.createdAt, a.createdAt) || cmp(b.id, a.id)
}

/** A photo's place segment: 1-based, as a string. */
export const photoNumber = (index: number) => String(index + 1)

/** The 0-based index a place segment names, or -1 when it isn't one. */
export function photoIndex(n: string): number {
  return /^[1-9]\d*$/.test(n) ? Number(n) - 1 : -1
}

/**
 * The same address for a project now at `slug`: the slug segment of `pathname`
 * (/projects/<old>/…) replaced, the rest kept.
 */
export function withSlug(pathname: string, slug: string): string {
  return pathname.replace(/^\/projects\/[^/]+/, `/projects/${encodeURIComponent(slug)}`)
}
