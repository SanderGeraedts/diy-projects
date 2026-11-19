import PocketBase, { BaseAuthStore, ClientResponseError } from 'pocketbase'
import type { Entry, Project } from '../db/db'
import { buildDemoData } from '../seed/demo'
import { downloadable } from '../sync/photos'
import { entryFromServer, projectFromServer, type ServerRecord } from '../sync/records'

// T-0026 (D-0025): what a visitor who isn't signed in reads. Online only, straight from
// PocketBase, nothing stored on the device: no Dexie, no outbox, no sync. PocketBase's rules
// decide what a visitor gets (deploy/nas/pb_migrations/1794931500_public_projects.js): public
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
  /** null when there's no such public project (private, tombstoned or never there). */
  project(id: string): Promise<PublicProject | null>
}

/** A visitor's timeline: newest entry first, photos by date taken, as the owner's (T-0005). */
export function visitorTimeline({ entries, photos }: Pick<PublicProject, 'entries' | 'photos'>) {
  return {
    entries: [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    photos: [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt)),
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
    getOne(id: string, options?: Record<string, unknown>): Promise<ServerRecord>
  }
  files: { getURL(record: { [key: string]: unknown }, filename: string): string }
  filter(raw: string, params?: Record<string, unknown>): string
}

/** Only what's shown; never `owner` or the original's file name. */
const PROJECT_FIELDS = 'id,title,description,status,tags,coverPhotoId,public,createdAt,updatedAt,deletedAt'
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

    project: (id) =>
      cached(`project:${id}`, async () => {
        let record: ServerRecord
        try {
          record = await client.collection('projects').getOne(id, { fields: PROJECT_FIELDS })
        } catch (err) {
          if (err instanceof ClientResponseError && err.status === 404) return null
          throw err
        }
        const project = projectFromServer(record)
        if (!shown(project)) return null
        const filter = client.filter('projectId = {:id} && deletedAt = ""', { id })
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
    async project(id) {
      const { projects, entries, photos } = await load()
      const project = projects.find((p) => p.id === id)
      if (!project) return null
      return { project, entries: entries.filter((e) => e.projectId === id), photos: photos.filter((p) => p.projectId === id) }
    },
  }
}
