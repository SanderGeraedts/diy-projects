import { useLocation, useRouter } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect } from 'react'
import { db, type Project } from '../db/db'
import { withSlug } from './paths'

// T-0027 (D-0029): the owner's pages find their project by the slug in the address, on the
// device. An earlier slug (oldSlugs) finds the project too; the page then redirects to its
// current address, replacing the old one in the history.

/**
 * The live project at `slug`, or the live project that had it before a rename; null when
 * there is none (or it's in the bin). Compare the result's slug with `slug` to redirect.
 */
export async function findProject(slug: string): Promise<Project | null> {
  const current = await db.projects.where('slug').equals(slug).first()
  if (current) return current.deletedAt === null ? current : null
  const moved = await db.projects.where('oldSlugs').equals(slug).toArray()
  return moved.find((p) => p.deletedAt === null) ?? null
}

/** `findProject`, live: undefined while loading. */
export function useProjectBySlug(slug: string): Project | null | undefined {
  return useLiveQuery(() => findProject(slug), [slug])
}

/** Replaces the address with the same one at the project's current slug (search and hash kept). */
export function SlugRedirect({ slug }: { slug: string }) {
  const router = useRouter()
  const location = useLocation()
  const href = `${withSlug(location.pathname, slug)}${location.searchStr}${location.hash ? `#${location.hash}` : ''}`
  useEffect(() => {
    router.history.replace(href)
  }, [router, href])
  return null
}
