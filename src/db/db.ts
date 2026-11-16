import Dexie, { type EntityTable } from 'dexie'

// D-0004: a project has a title, description, status, tags and a cover photo, and a
// timeline of dated entries with photos and a note. D-0003: photos are kept on the device as
// a phone-sized copy.
//
// D-0007: once a version has shipped, change the schema only by adding a new version with
// an upgrade that keeps existing data.

export const PROJECT_STATUSES = ['idea', 'in progress', 'paused', 'done'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export interface Project {
  id: string
  title: string
  description: string
  status: ProjectStatus
  tags: string[]
  coverPhotoId?: string
  createdAt: string
  updatedAt: string
}

export interface Entry {
  id: string
  projectId: string
  /** The day the entry covers, YYYY-MM-DD. */
  date: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface Photo {
  id: string
  projectId: string
  entryId: string
  /** When the photo was taken (EXIF), ISO 8601. */
  takenAt: string
  blob: Blob
  width: number
  height: number
  createdAt: string
}

export type DiyDb = Dexie & {
  projects: EntityTable<Project, 'id'>
  entries: EntityTable<Entry, 'id'>
  photos: EntityTable<Photo, 'id'>
}

export function openDb(name = 'diy-projects'): DiyDb {
  const db = new Dexie(name) as DiyDb
  db.version(1).stores({
    projects: 'id, status, *tags, updatedAt',
    entries: 'id, projectId, [projectId+date]',
    photos: 'id, projectId, entryId',
  })
  return db
}

export const db = openDb()
