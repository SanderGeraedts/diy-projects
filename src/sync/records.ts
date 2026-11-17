import { PROJECT_STATUSES, type Entry, type Photo, type Project, type ProjectStatus, type SyncedTable } from '../db/db'

// T-0016: how a local record (src/db/db.ts) maps to its PocketBase record
// (deploy/nas/pb_migrations/). A record keeps the id its device gave it (a UUID), on the NAS
// too, so projectId, entryId and coverPhotoId mean the same everywhere. On the NAS an empty
// text field is "", locally it's null (deletedAt) or absent (coverPhotoId).
//
// Photo *files* are T-0017: here a photo is only its record (place, time, size, tombstone).

/** A record as PocketBase returns it. `updated` is the server's own change time. */
export interface ServerRecord {
  id: string
  updated: string
  [field: string]: unknown
}

export type LocalRecord = Project | Entry | Photo

/** The order collections are pulled in, so a project arrives before its entries and photos. */
export const SYNCED_TABLES: readonly SyncedTable[] = ['projects', 'entries', 'photos']

const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const number = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
const orNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)

/** The fields sent to PocketBase for a local record; never `owner` (added on create only). */
export function toServer(table: SyncedTable, record: LocalRecord): Record<string, unknown> {
  const common = { createdAt: record.createdAt, updatedAt: record.updatedAt, deletedAt: record.deletedAt ?? '' }
  switch (table) {
    case 'projects': {
      const p = record as Project
      return {
        title: p.title,
        description: p.description,
        status: p.status,
        tags: p.tags,
        coverPhotoId: p.coverPhotoId ?? '',
        ...common,
      }
    }
    case 'entries': {
      const e = record as Entry
      return { projectId: e.projectId, date: e.date, note: e.note, ...common }
    }
    case 'photos': {
      const f = record as Photo
      return {
        projectId: f.projectId,
        entryId: f.entryId,
        takenAt: f.takenAt,
        width: f.width,
        height: f.height,
        ...common,
      }
    }
  }
}

export function projectFromServer(r: ServerRecord): Project {
  const status = PROJECT_STATUSES.includes(r.status as ProjectStatus) ? (r.status as ProjectStatus) : 'idea'
  const project: Project = {
    id: r.id,
    title: text(r.title),
    description: text(r.description),
    status,
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string') : [],
    createdAt: text(r.createdAt),
    updatedAt: text(r.updatedAt),
    deletedAt: orNull(r.deletedAt),
  }
  const cover = orNull(r.coverPhotoId)
  if (cover) project.coverPhotoId = cover
  return project
}

export function entryFromServer(r: ServerRecord): Entry {
  return {
    id: r.id,
    projectId: text(r.projectId),
    date: text(r.date),
    note: text(r.note),
    createdAt: text(r.createdAt),
    updatedAt: text(r.updatedAt),
    deletedAt: orNull(r.deletedAt),
  }
}

/**
 * A pulled photo record laid over the local photo: its files (copy, thumbnail, original)
 * and upload state stay as they are on this device.
 */
export function photoFromServer(r: ServerRecord, local: Photo): Photo {
  return {
    ...local,
    projectId: text(r.projectId),
    entryId: text(r.entryId),
    takenAt: text(r.takenAt),
    width: number(r.width) || local.width,
    height: number(r.height) || local.height,
    createdAt: text(r.createdAt),
    updatedAt: text(r.updatedAt),
    deletedAt: orNull(r.deletedAt),
  }
}

/**
 * Last-write-wins (D-0002): true when `incoming` was edited strictly later than `local`.
 * An equal time is the same version (a record coming back after its own push).
 */
export function isNewer(incoming: string, local: string): boolean {
  const a = Date.parse(incoming)
  const b = Date.parse(local)
  if (Number.isNaN(a)) return false
  if (Number.isNaN(b)) return true
  return a > b
}

/**
 * The local record a server record becomes, or null when it can't be stored here yet: a
 * photo this device doesn't have has no files to show until T-0017 downloads them.
 */
export function fromServer(table: SyncedTable, r: ServerRecord, local: LocalRecord | undefined): LocalRecord | null {
  switch (table) {
    case 'projects':
      return projectFromServer(r)
    case 'entries':
      return entryFromServer(r)
    case 'photos':
      return local ? photoFromServer(r, local as Photo) : null
  }
}
