import { PROJECT_STATUSES, type Photo, type Project, type ProjectStatus } from './db/db'

// T-0011 (D-0004): the overview filters by status and tag. The filters live in the URL search
// params so back, reload and a home-screen shortcut keep them. Statuses combine as "any of",
// tags as "all of".

export interface OverviewFilters {
  status?: ProjectStatus[]
  tag?: string[]
}

function isStatus(value: unknown): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly unknown[]).includes(value)
}

/** Accepts an array or a single value, as a hand-written URL may give either. */
function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return value === undefined || value === null || value === '' ? [] : [value]
}

/** `validateSearch` for the overview route: keeps known statuses and non-empty tags, drops the rest. */
export function validateOverviewSearch(search: Record<string, unknown>): OverviewFilters {
  const status = [...new Set(asList(search.status).filter(isStatus))]
  const tag = [...new Set(asList(search.tag).filter((t): t is string => typeof t === 'string' && t !== ''))]
  return {
    ...(status.length > 0 ? { status } : {}),
    ...(tag.length > 0 ? { tag } : {}),
  }
}

export function hasFilters(filters: OverviewFilters): boolean {
  return (filters.status?.length ?? 0) > 0 || (filters.tag?.length ?? 0) > 0
}

/** What ordering the overview needs of a photo: a stored one or a visitor's (T-0030). */
export type OrderingPhoto = Pick<Photo, 'projectId' | 'takenAt'> & { deletedAt: string | null }

/**
 * T-0030 (D-0032): the overview's order, the only place projects are sorted for display. By
 * each project's newest live photo (latest `takenAt`, compared as text), newest first; ties by
 * `updatedAt`, then id, descending. Projects without a live photo come last, by `updatedAt`,
 * then id, descending.
 */
function orderProjects<P extends Project>(projects: readonly P[], photos: readonly OrderingPhoto[]): P[] {
  const newest = new Map<string, string>()
  for (const photo of photos) {
    if (photo.deletedAt !== null) continue
    const current = newest.get(photo.projectId)
    if (current === undefined || photo.takenAt > current) newest.set(photo.projectId, photo.takenAt)
  }
  return [...projects].sort((a, b) => {
    const ta = newest.get(a.id)
    const tb = newest.get(b.id)
    if (ta !== tb) {
      if (ta === undefined) return 1
      if (tb === undefined) return -1
      return tb.localeCompare(ta)
    }
    return b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id)
  })
}

/** Live projects matching the filters, in the overview's order. Tombstoned projects never show. */
export function filterProjects(
  projects: readonly Project[],
  filters: OverviewFilters,
  photos: readonly OrderingPhoto[],
): Project[] {
  const statuses = filters.status ?? []
  const tags = filters.tag ?? []
  return orderProjects(
    projects
      .filter((p) => p.deletedAt === null)
      .filter((p) => statuses.length === 0 || statuses.includes(p.status))
      .filter((p) => tags.every((t) => p.tags.includes(t))),
    photos,
  )
}

/** The tags used by live projects, sorted for display. */
export function tagsInUse(projects: readonly Project[]): string[] {
  const tags = new Set(projects.filter((p) => p.deletedAt === null).flatMap((p) => p.tags))
  return [...tags].sort((a, b) => a.localeCompare(b, 'nl'))
}

/** Adds the value if absent, removes it if present; returns undefined for an empty list. */
export function toggle<T>(list: readonly T[] | undefined, value: T): T[] | undefined {
  const current = list ?? []
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return next.length > 0 ? next : undefined
}
