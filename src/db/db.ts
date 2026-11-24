import Dexie, { type EntityTable, type Transaction } from 'dexie'
import { backfillSlugs } from './slug'

// D-0004: a project has a title, description, status, tags and a cover photo, and a
// timeline of dated entries with photos and a note. D-0003: photos are kept on the device as
// a phone-sized copy.
//
// D-0007: once a version has shipped, change the schema only by adding a new version with
// an upgrade that keeps existing data.
//
// D-0002: every record carries `updatedAt` (last-write-wins) and `deletedAt` (a tombstone,
// null while alive). Changes are written through `write.ts`, which adds an outbox row in the
// same transaction. Reads stay plain Dexie queries; filter out `deletedAt !== null`.

export const PROJECT_STATUSES = ['idea', 'in progress', 'paused', 'done'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export interface Project {
  id: string
  title: string
  description: string
  status: ProjectStatus
  tags: string[]
  coverPhotoId?: string
  /**
   * Shown to visitors who aren't signed in (D-0025, T-0026). On by default, for new projects
   * and for the ones that existed before v4.
   */
  public: boolean
  /**
   * The project's address, /projects/<slug> (D-0029, T-0027): made from the title, unique
   * among this owner's projects. The NAS settles clashes (backend/pb_hooks/slugs.pb.js).
   */
  slug: string
  /** Slugs it had before a rename; their addresses redirect here (D-0029). */
  oldSlugs: string[]
  createdAt: string
  /** ISO time of the last edit, used for last-write-wins (D-0002). */
  updatedAt: string
  /** Tombstone: ISO time of the delete, null while alive (D-0002, D-0014). */
  deletedAt: string | null
}

export interface Entry {
  id: string
  projectId: string
  /** The day the entry covers, YYYY-MM-DD. */
  date: string
  note: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/**
 * Upload state of one of a photo's files (D-0015).
 * - `pending`: still to be uploaded by this device.
 * - `uploaded`: the NAS confirmed it.
 * - `none`: this device has nothing to upload for it (a photo from before v2, a demo photo,
 *   or a photo another device added).
 */
export type FileUploadState = 'pending' | 'uploaded' | 'none'

export interface PhotoUploads {
  original: FileUploadState
  copy: FileUploadState
  thumbnail: FileUploadState
}

export type PhotoFile = keyof PhotoUploads

export interface Photo {
  id: string
  projectId: string
  entryId: string
  /** When the photo was taken (EXIF), ISO 8601. */
  takenAt: string
  /** The 2560 px phone copy (D-0003). */
  blob: Blob
  /** The thumbnail for cards and grids, derived from the copy (D-0003, D-0015, D-0038). */
  thumbnail: Blob
  /**
   * The thumbnail's real width in pixels, once this device knows it (T-0037, D-0038): set at
   * import, and by the background check (src/photos/rebuild.ts) for older and downloaded
   * thumbnails. Local only: never synced (src/sync/records.ts lists the fields it sends), and
   * no schema change, as it isn't indexed. Absent means not measured yet.
   */
  thumbnailWidth?: number
  /** The original, byte for byte, until the NAS confirms all three files (D-0003, D-0015). */
  original: Blob | null
  uploads: PhotoUploads
  width: number
  height: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export type SyncedTable = 'projects' | 'entries' | 'photos'
export type OutboxOp = 'put' | 'delete'

/** One local change not yet confirmed by the NAS (D-0002). */
export interface OutboxItem {
  /** Auto-increment: the order changes were made in. */
  id?: number
  table: SyncedTable
  recordId: string
  op: OutboxOp
  queuedAt: string
}

/**
 * The sync engine's own state on this device (T-0016): pull cursors, the last successful
 * sync. Not a record: never synced, never in the outbox. Cleared with the local copy on
 * sign-out, so the next sign-in pulls everything again.
 */
export interface SyncStateRow {
  key: string
  value: string
}

export type DiyDb = Dexie & {
  projects: EntityTable<Project, 'id'>
  entries: EntityTable<Entry, 'id'>
  photos: EntityTable<Photo, 'id'>
  outbox: EntityTable<OutboxItem, 'id'>
  syncState: EntityTable<SyncStateRow, 'key'>
}

/** The v1 schema, as shipped. Kept so older databases can be upgraded (D-0007). */
export const SCHEMA_V1 = {
  projects: 'id, status, *tags, updatedAt',
  entries: 'id, projectId, [projectId+date]',
  photos: 'id, projectId, entryId',
} as const

export const SCHEMA_V2 = {
  projects: 'id, status, *tags, updatedAt',
  entries: 'id, projectId, [projectId+date], updatedAt',
  photos: 'id, projectId, entryId, updatedAt',
  outbox: '++id, [table+recordId]',
} as const

/** v3 (T-0016) adds the sync engine's state; nothing else changes, so no upgrade step. */
export const SCHEMA_V3 = {
  ...SCHEMA_V2,
  syncState: 'key',
} as const

/** v4 (T-0026) adds `public` to projects; no new index, so the stores stay as in v3. */
export const SCHEMA_V4 = SCHEMA_V3

/** v5 (T-0027) adds `slug` and `oldSlugs` to projects, both indexed to find a project by address. */
export const SCHEMA_V5 = {
  ...SCHEMA_V4,
  projects: 'id, status, *tags, updatedAt, slug, *oldSlugs',
} as const

/** v1 → v2: add tombstones, `updatedAt` on photos, and the photo file fields. Keeps all data. */
export async function upgradeToV2(tx: Transaction): Promise<void> {
  await tx
    .table('projects')
    .toCollection()
    .modify((p: Partial<Project>) => {
      if (p.deletedAt === undefined) p.deletedAt = null
    })
  await tx
    .table('entries')
    .toCollection()
    .modify((e: Partial<Entry>) => {
      if (e.deletedAt === undefined) e.deletedAt = null
    })
  await tx
    .table('photos')
    .toCollection()
    .modify((p: Partial<Photo>) => {
      if (p.updatedAt === undefined) p.updatedAt = p.createdAt
      if (p.deletedAt === undefined) p.deletedAt = null
      // v1 kept only the phone copy; the thumbnail is the copy until one is derived.
      if (p.thumbnail === undefined && p.blob) p.thumbnail = p.blob
      if (p.original === undefined) p.original = null
      // v1 had no sync, so there is no original to upload. Whether v1 photos should be
      // queued for upload is an open point (see T-0003 log); for now nothing is queued.
      if (p.uploads === undefined) p.uploads = { original: 'none', copy: 'none', thumbnail: 'none' }
    })
}

/**
 * v3 → v4: every existing project becomes public (D-0025: the switch is on by default, also
 * for the projects that exist when it ships). Keeps all data and adds no outbox rows: the
 * NAS's own migration sets the same value on its records.
 */
export async function upgradeToV4(tx: Transaction): Promise<void> {
  await tx
    .table('projects')
    .toCollection()
    .modify((p: Partial<Project>) => {
      if (p.public === undefined) p.public = true
    })
}

/**
 * v4 → v5: every project gets a slug from its title (D-0029), by creation, the same way the
 * NAS's migration does (backend/pb_migrations/1794931700_project_slugs.js). Keeps all data
 * and adds no outbox rows: the slugs are this device's until the NAS's arrive. The NAS's
 * migration moves `updated` on every project, so the next pull brings them, and the sync
 * engine takes a project's slug and oldSlugs from the NAS whatever `updatedAt` says
 * (src/sync/engine.ts). So a device and the NAS end up with the same slugs.
 */
export async function upgradeToV5(tx: Transaction): Promise<void> {
  const table = tx.table('projects')
  const projects = (await table.toArray()) as Partial<Project>[]
  const slugs = backfillSlugs(
    projects.map((p) => ({
      id: String(p.id),
      title: p.title ?? '',
      createdAt: p.createdAt ?? '',
      slug: p.slug,
      oldSlugs: p.oldSlugs,
    })),
  )
  await table.toCollection().modify((p: Partial<Project>) => {
    if (!p.slug) p.slug = slugs.get(String(p.id)) ?? ''
    if (!Array.isArray(p.oldSlugs)) p.oldSlugs = []
  })
}

export function openDb(name = 'diy-projects'): DiyDb {
  const db = new Dexie(name) as DiyDb
  db.version(1).stores(SCHEMA_V1)
  db.version(2).stores(SCHEMA_V2).upgrade(upgradeToV2)
  db.version(3).stores(SCHEMA_V3)
  db.version(4).stores(SCHEMA_V4).upgrade(upgradeToV4)
  db.version(5).stores(SCHEMA_V5).upgrade(upgradeToV5)
  return db
}

export const db = openDb()
