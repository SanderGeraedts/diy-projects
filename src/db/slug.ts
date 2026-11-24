// T-0027 (D-0029): a project's address is a slug made from its title, never its id.
//
// The same rules run in three places, which must agree:
// - here, on the device, when a project is made or renamed, and in the Dexie upgrade;
// - backend/pb_hooks/slug.js, which the NAS's hook (slugs.pb.js) uses to settle clashes;
// - backend/pb_migrations/1794931700_project_slugs.js, which gave existing projects theirs.
// src/db/slug.test.ts runs all three on the same titles.

/** The longest slug made from a title; a `-2` suffix may come on top. */
export const SLUG_MAX = 60

/** What an empty or reserved slug becomes. */
export const FALLBACK_SLUG = 'project'

/** Slugs that clash with a route under /projects/ (router.tsx). */
export const RESERVED_SLUGS: readonly string[] = ['new']

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** Whether `value` has a slug's form: ASCII letters and digits in runs joined by single hyphens. */
export function isSlug(value: unknown): value is string {
  return typeof value === 'string' && SLUG.test(value)
}

/**
 * A title's slug: NFD, marks stripped, lower case, every run of anything but ASCII letters
 * and digits one hyphen, no hyphen at either end, at most 60 characters cut at a hyphen.
 * Empty or reserved becomes "project". "Kast für Sanne" → "kast-fur-sanne".
 */
export function slugify(title: string): string {
  let slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length > SLUG_MAX) {
    const cut = slug.slice(0, SLUG_MAX + 1)
    const hyphen = cut.lastIndexOf('-')
    slug = hyphen > 0 ? cut.slice(0, hyphen) : slug.slice(0, SLUG_MAX)
    slug = slug.replace(/-+$/, '')
  }
  if (slug === '' || RESERVED_SLUGS.includes(slug)) return FALLBACK_SLUG
  return slug
}

/** `slug` if it isn't taken, else the first free of `base-2`, `base-3`, … */
export function uniqueSlug(slug: string, taken: ReadonlySet<string>, base = slug): string {
  if (!taken.has(slug)) return slug
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Whether `slug` is `base` itself or `base` with a clash suffix (`base-2`, `base-3`, …). */
export function hasBase(slug: string, base: string): boolean {
  if (slug === base) return true
  if (!slug.startsWith(`${base}-`)) return false
  return /^[1-9][0-9]*$/.test(slug.slice(base.length + 1))
}

/** What a project needs for a slug; the device's Project and the NAS's record both fit. */
export interface SlugRecord {
  id: string
  title: string
  createdAt: string
  slug?: string
  oldSlugs?: string[]
}

/** Every slug a project holds: its own and its earlier ones. */
export function slugsOf(p: Pick<SlugRecord, 'slug' | 'oldSlugs'>): string[] {
  return [...(p.slug ? [p.slug] : []), ...(p.oldSlugs ?? [])]
}

/**
 * Slugs for projects that have none yet (the Dexie upgrade to v5, and the NAS's migration),
 * by creation: `createdAt`, then id. A slug already held (current or earlier) is kept and
 * counts as taken. Returns the new slugs by project id.
 */
export function backfillSlugs(projects: readonly SlugRecord[]): Map<string, string> {
  const taken = new Set(projects.flatMap(slugsOf))
  const result = new Map<string, string>()
  const missing = projects
    .filter((p) => !p.slug)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const p of missing) {
    const slug = uniqueSlug(slugify(p.title), taken)
    taken.add(slug)
    result.set(p.id, slug)
  }
  return result
}

/**
 * The slug and earlier slugs a project gets for `title` (T-0027, D-0029):
 * - unchanged when the title still makes the same slug (`kast` or a clash form like `kast-2`);
 * - otherwise a new one, unique among `taken` (every other project's slugs, current and
 *   earlier), with the current slug kept in `oldSlugs` so its address still leads here. One of
 *   the project's own earlier slugs may come back.
 */
export function renamedSlugs(
  project: Pick<SlugRecord, 'slug' | 'oldSlugs'>,
  title: string,
  taken: ReadonlySet<string>,
): { slug: string; oldSlugs: string[] } {
  const base = slugify(title)
  const current = project.slug ?? ''
  const old = project.oldSlugs ?? []
  if (current && hasBase(current, base) && !taken.has(current)) return { slug: current, oldSlugs: old }
  const slug = uniqueSlug(base, taken)
  const oldSlugs = [...new Set([...old, ...(current ? [current] : [])])].filter((s) => s !== slug)
  return { slug, oldSlugs }
}
