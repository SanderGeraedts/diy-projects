import PocketBase, { BaseAuthStore } from 'pocketbase'
import type { Entry, Project } from '../db/db'
import { isSlug } from '../db/slug'
import { compareEntries, comparePhotos } from '../routes/paths'
import { CARD_THUMB } from '../photos/resize'
import { buildDemoData } from '../seed/demo'
import { downloadable } from '../sync/photos'
import { entryFromServer, projectFromServer, type ServerRecord } from '../sync/records'

// T-0026 (D-0025): what a visitor who isn't signed in reads. Online only, straight from
// PocketBase, nothing stored on the device: no Dexie, no outbox, no sync. PocketBase's rules
// decide what a visitor gets (backend/pb_migrations/1794931500_public_projects.js): public
// projects that aren't tombstoned, their live entries and photo records, and those photos'
// copies and thumbnails, never an original. The filters here only keep requests small; they
// are not the boundary.

/** A photo as a visitor sees it: the 2560 px copy and the thumbnail by address (D-0015). */
export interface PublicPhoto {
  id: string
  projectId: string
  entryId: string
  takenAt: string
  createdAt: string
  width: number
  height: number
  deletedAt: null
  copyUrl: string
  thumbnailUrl: string
  /**
   * The card image (T-0040, D-0041): PocketBase's 640×480 thumb of the thumbnail,
   * `<thumbnailUrl>?thumb=640x480`. Absent in the demo visitor view, which has no PocketBase.
   */
  cardUrl?: string
}

export interface PublicOverview {
  projects: Project[]
  photos: PublicPhoto[]
}

export interface PublicProject {
  project: Project
  entries: Entry[]
  photos: PublicPhoto[]
}

export interface PublicSource {
  overview(): Promise<PublicOverview>
  /**
   * The public project at `slug`, or the one that had it before a rename (T-0027, D-0029):
   * its `project.slug` then differs, and the page redirects. null when there's no such public
   * project (private, tombstoned or never there).
   */
  project(slug: string): Promise<PublicProject | null>
}

/**
 * A visitor's timeline: entries in the page's order (compareEntries, T-0036), photos newest
 * first (D-0031), as the owner's (T-0005).
 */
export function visitorTimeline({ entries, photos }: Pick<PublicProject, 'entries' | 'photos'>) {
  return {
    entries: [...entries].sort(compareEntries),
    photos: [...photos].sort(comparePhotos),
  }
}

/** The NAS couldn't be reached, or answered with an error: "Projecten zijn nu niet bereikbaar." */
export class UnreachableError extends Error {
  constructor(cause?: unknown) {
    super('public projects are unreachable', { cause })
    this.name = 'UnreachableError'
  }
}

/** The part of the PocketBase client a visitor uses; the real client fits, and so does a mock. */
export interface PublicClient {
  collection(name: string): {
    getFullList(options?: Record<string, unknown>): Promise<ServerRecord[]>
  }
  files: { getURL(record: { [key: string]: unknown }, filename: string, queryParams?: { thumb?: string }): string }
  filter(raw: string, params?: Record<string, unknown>): string
}

/**
 * Only what's shown; never `owner` or the original's file name. Not `oldSlugs` either: a
 * project found with a slug other than its own was found by an earlier one.
 */
const PROJECT_FIELDS = 'id,title,description,status,tags,coverPhotoId,public,slug,createdAt,updatedAt,deletedAt'
const ENTRY_FIELDS = 'id,projectId,date,note,createdAt,updatedAt,deletedAt'
const PHOTO_FIELDS =
  'id,collectionId,collectionName,projectId,entryId,takenAt,createdAt,width,height,copy,thumbnail,deletedAt'

/** How long a loaded project is reused, e.g. between the timeline and the photo viewer. */
export const CACHE_MS = 60_000

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** A visitor's PocketBase client: in-memory auth store, so it never carries a sign-in. */
export function visitorClient(url: string): PocketBase {
  const client = new PocketBase(url, new BaseAuthStore())
  client.autoCancellation(false)
  return client
}

export function createPocketBaseSource(client: PublicClient, now: () => number = Date.now): PublicSource {
  const cache = new Map<string, { at: number; value: Promise<unknown> }>()

  /** Reuses a load for CACHE_MS; a failed load is forgotten at once, so a retry asks again. */
  function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = cache.get(key)
    if (hit && now() - hit.at < CACHE_MS) return hit.value as Promise<T>
    const value = load().catch((err: unknown) => {
      cache.delete(key)
      throw err instanceof UnreachableError ? err : new UnreachableError(err)
    })
    cache.set(key, { at: now(), value })
    return value
  }

  function photo(r: ServerRecord): PublicPhoto | null {
    const files = downloadable(r) // alive, with its copy and thumbnail on the NAS
    if (!files) return null
    return {
      id: r.id,
      projectId: text(r.projectId),
      entryId: text(r.entryId),
      takenAt: text(r.takenAt),
      createdAt: text(r.createdAt),
      width: number(r.width),
      height: number(r.height),
      deletedAt: null,
      copyUrl: client.files.getURL(r, files.copy),
      thumbnailUrl: client.files.getURL(r, files.thumbnail),
      cardUrl: client.files.getURL(r, files.thumbnail, { thumb: CARD_THUMB }),
    }
  }

  const shown = (p: Project) => p.public && p.deletedAt === null
  const photos = (records: ServerRecord[]) => records.map(photo).filter((p): p is PublicPhoto => p !== null)

  return {
    overview: () =>
      cached('overview', async () => {
        const [projects, photoRecords] = await Promise.all([
          client.collection('projects').getFullList({ filter: 'deletedAt = ""', fields: PROJECT_FIELDS }),
          client.collection('photos').getFullList({ filter: 'deletedAt = ""', fields: PHOTO_FIELDS }),
        ])
        return { projects: projects.map(projectFromServer).filter(shown), photos: photos(photoRecords) }
      }),

    project: (slug) =>
      cached(`project:${slug}`, async () => {
        if (!isSlug(slug)) return null
        // T-0027: by its slug, or an earlier one (a JSON list on the NAS, matched as "slug").
        const records = await client.collection('projects').getFullList({
          filter: client.filter('slug = {:slug} || oldSlugs ~ {:quoted}', { slug, quoted: `"${slug}"` }),
          fields: PROJECT_FIELDS,
        })
        const record = records.find((r) => r.slug === slug) ?? records[0]
        if (!record) return null
        const project = projectFromServer(record)
        if (!shown(project)) return null
        const filter = client.filter('projectId = {:id} && deletedAt = ""', { id: project.id })
        const [entries, photoRecords] = await Promise.all([
          client.collection('entries').getFullList({ filter, fields: ENTRY_FIELDS }),
          client.collection('photos').getFullList({ filter, fields: PHOTO_FIELDS }),
        ])
        return {
          project,
          entries: entries.map(entryFromServer).filter((e) => e.deletedAt === null),
          photos: photos(photoRecords),
        }
      }),
  }
}

/**
 * D-0006: previews and dev have no NAS; their visitor view (`?bezoeker`) shows the seeded
 * demo data from memory instead, never from Dexie. `unreachable` stands in for a NAS that
 * can't be reached.
 */
export function createDemoSource(mode: 'on' | 'unreachable'): PublicSource {
  let data: PublicOverview & { entries: Entry[] } | null = null
  const load = async () => {
    if (mode === 'unreachable') throw new UnreachableError()
    if (!data) {
      const demo = buildDemoData()
      data = {
        projects: demo.projects,
        entries: demo.entries,
        photos: demo.photos.map((p): PublicPhoto => {
          const url = URL.createObjectURL(p.blob)
          const { id, projectId, entryId, takenAt, createdAt, width, height } = p
          return { id, projectId, entryId, takenAt, createdAt, width, height, deletedAt: null, copyUrl: url, thumbnailUrl: url }
        }),
      }
    }
    return data
  }
  return {
    async overview() {
      const { projects, photos } = await load()
      return { projects, photos }
    },
    async project(slug) {
      const { projects, entries, photos } = await load()
      const project = projects.find((p) => p.slug === slug) ?? projects.find((p) => p.oldSlugs.includes(slug))
      if (!project) return null
      const id = project.id
      return { project, entries: entries.filter((e) => e.projectId === id), photos: photos.filter((p) => p.projectId === id) }
    },
  }
}
