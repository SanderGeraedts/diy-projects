import { PROJECT_STATUSES, type Project, type ProjectStatus } from './db/db'

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

/** Live projects matching the filters, newest update first. Tombstoned projects never show. */
export function filterProjects(projects: readonly Project[], filters: OverviewFilters): Project[] {
  const statuses = filters.status ?? []
  const tags = filters.tag ?? []
  return projects
    .filter((p) => p.deletedAt === null)
    .filter((p) => statuses.length === 0 || statuses.includes(p.status))
    .filter((p) => tags.every((t) => p.tags.includes(t)))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
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
