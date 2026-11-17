import {
  db as defaultDb,
  PROJECT_STATUSES,
  type DiyDb,
  type Entry,
  type OutboxOp,
  type Photo,
  type PhotoFile,
  type Project,
  type ProjectStatus,
  type SyncedTable,
} from './db'

// The one write API every screen uses (T-0003). Each call validates its input, stamps
// `updatedAt`, and writes the record and its outbox row in one transaction (D-0002), so a
// write that fails leaves neither. Every change adds its own outbox row; rows are never
// collapsed or dropped here, only by the sync engine once the NAS confirms (D-0002).

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function fail(message: string): never {
  throw new ValidationError(message)
}

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

function checkTitle(title: unknown): string {
  if (typeof title !== 'string' || title.trim() === '') fail('A project needs a title.')
  return title.trim()
}

function checkStatus(status: unknown): ProjectStatus {
  if (!PROJECT_STATUSES.includes(status as ProjectStatus)) fail(`Unknown status: ${String(status)}`)
  return status as ProjectStatus
}

function checkTags(tags: unknown): string[] {
  if (!Array.isArray(tags) || !tags.every((t) => typeof t === 'string')) fail('Tags must be a list of text.')
  return [...new Set(tags.map((t: string) => t.trim()).filter((t) => t !== ''))]
}

function checkDate(date: unknown): string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)))
    fail(`Not a date (YYYY-MM-DD): ${String(date)}`)
  return date
}

function checkIsoTime(time: unknown, what: string): string {
  if (typeof time !== 'string' || Number.isNaN(Date.parse(time))) fail(`${what} is not a time: ${String(time)}`)
  return time
}

function checkText(text: unknown, what: string): string {
  if (typeof text !== 'string') fail(`${what} must be text.`)
  return text
}

async function queue(target: DiyDb, table: SyncedTable, recordId: string, op: OutboxOp, queuedAt: string) {
  await target.outbox.add({ table, recordId, op, queuedAt })
}

async function liveProject(target: DiyDb, id: string): Promise<Project> {
  const project = await target.projects.get(id)
  if (!project || project.deletedAt !== null) fail(`No project ${id}.`)
  return project
}

async function liveEntry(target: DiyDb, id: string): Promise<Entry> {
  const entry = await target.entries.get(id)
  if (!entry || entry.deletedAt !== null) fail(`No entry ${id}.`)
  return entry
}

// --- Projects ---

export interface NewProject {
  title: string
  description?: string
  status?: ProjectStatus
  tags?: string[]
}

export async function createProject(input: NewProject, target: DiyDb = defaultDb): Promise<Project> {
  const time = now()
  const project: Project = {
    id: newId(),
    title: checkTitle(input.title),
    description: checkText(input.description ?? '', 'The description'),
    status: checkStatus(input.status ?? 'idea'),
    tags: checkTags(input.tags ?? []),
    createdAt: time,
    updatedAt: time,
    deletedAt: null,
  }
  await target.transaction('rw', target.projects, target.outbox, async () => {
    await target.projects.add(project)
    await queue(target, 'projects', project.id, 'put', time)
  })
  return project
}

export type ProjectChanges = Partial<Pick<Project, 'title' | 'description' | 'status' | 'tags'>> & {
  /** A live photo of this project; `null` or `undefined` clears the chosen cover (T-0010). */
  coverPhotoId?: string | null
}

export async function updateProject(id: string, changes: ProjectChanges, target: DiyDb = defaultDb): Promise<Project> {
  const patch: Partial<Project> = {}
  if ('title' in changes) patch.title = checkTitle(changes.title)
  if ('description' in changes) patch.description = checkText(changes.description, 'The description')
  if ('status' in changes) patch.status = checkStatus(changes.status)
  if ('tags' in changes) patch.tags = checkTags(changes.tags)
  const clearCover = 'coverPhotoId' in changes && (changes.coverPhotoId === undefined || changes.coverPhotoId === null)
  if ('coverPhotoId' in changes && !clearCover) patch.coverPhotoId = checkText(changes.coverPhotoId, 'The cover photo')
  const time = now()
  return target.transaction('rw', target.projects, target.photos, target.outbox, async () => {
    const project = await liveProject(target, id)
    if (patch.coverPhotoId !== undefined) {
      const photo = await target.photos.get(patch.coverPhotoId)
      if (!photo || photo.deletedAt !== null || photo.projectId !== id) fail('The cover must be a photo of this project.')
    }
    const updated: Project = { ...project, ...patch, updatedAt: time }
    if (clearCover) delete updated.coverPhotoId
    await target.projects.put(updated)
    await queue(target, 'projects', id, 'put', time)
    return updated
  })
}

/**
 * Tombstones a project, its entries and their photos (D-0014), in one transaction with an
 * outbox row per tombstone (D-0002). Records already tombstoned keep their own delete time
 * and get no new row. Nothing is removed: the bin comes after v1 (T-0022).
 */
export async function deleteProject(id: string, target: DiyDb = defaultDb): Promise<void> {
  const time = now()
  await target.transaction('rw', target.projects, target.entries, target.photos, target.outbox, async () => {
    await liveProject(target, id)
    const photos = await target.photos.where('projectId').equals(id).toArray()
    for (const photo of photos) if (photo.deletedAt === null) await tombstone(target, 'photos', photo.id, time)
    const entries = await target.entries.where('projectId').equals(id).toArray()
    for (const entry of entries) if (entry.deletedAt === null) await tombstone(target, 'entries', entry.id, time)
    await tombstone(target, 'projects', id, time)
  })
}

/** Sets a record's tombstone and queues its delete. Call inside a transaction. */
async function tombstone(target: DiyDb, table: SyncedTable, id: string, time: string) {
  await target.table(table).update(id, { deletedAt: time, updatedAt: time })
  await queue(target, table, id, 'delete', time)
}

/**
 * Clears the project's chosen cover when it is one of the photos just deleted (T-0010), so
 * the card falls back to the newest remaining photo (T-0009). Call inside a transaction.
 */
async function clearCoverIfDeleted(target: DiyDb, projectId: string, photoIds: string[], time: string) {
  const project = await target.projects.get(projectId)
  if (!project || project.deletedAt !== null || !project.coverPhotoId) return
  if (!photoIds.includes(project.coverPhotoId)) return
  const updated: Project = { ...project, updatedAt: time }
  delete updated.coverPhotoId
  await target.projects.put(updated)
  await queue(target, 'projects', projectId, 'put', time)
}

// --- Entries ---

export interface NewEntry {
  projectId: string
  date: string
  note?: string
}

export async function addEntry(input: NewEntry, target: DiyDb = defaultDb): Promise<Entry> {
  const time = now()
  const entry: Entry = {
    id: newId(),
    projectId: checkText(input.projectId, 'The project'),
    date: checkDate(input.date),
    note: checkText(input.note ?? '', 'The note'),
    createdAt: time,
    updatedAt: time,
    deletedAt: null,
  }
  await target.transaction('rw', target.projects, target.entries, target.outbox, async () => {
    await liveProject(target, entry.projectId)
    await target.entries.add(entry)
    await queue(target, 'entries', entry.id, 'put', time)
  })
  return entry
}

export type EntryChanges = Partial<Pick<Entry, 'date' | 'note'>>

export async function updateEntry(id: string, changes: EntryChanges, target: DiyDb = defaultDb): Promise<Entry> {
  const patch: EntryChanges = {}
  if ('date' in changes) patch.date = checkDate(changes.date)
  if ('note' in changes) patch.note = checkText(changes.note, 'The note')
  const time = now()
  return target.transaction('rw', target.entries, target.outbox, async () => {
    const entry = await liveEntry(target, id)
    const updated: Entry = { ...entry, ...patch, updatedAt: time }
    await target.entries.put(updated)
    await queue(target, 'entries', id, 'put', time)
    return updated
  })
}

/**
 * Tombstones an entry and its photos (D-0014), in one transaction with an outbox row per
 * tombstone (D-0002). If one of the photos was the project's cover, the cover is cleared
 * too (one more project row). Nothing is removed: the bin comes after v1 (T-0022).
 */
export async function deleteEntry(id: string, target: DiyDb = defaultDb): Promise<void> {
  const time = now()
  await target.transaction('rw', target.projects, target.entries, target.photos, target.outbox, async () => {
    const entry = await liveEntry(target, id)
    const photos = (await target.photos.where('entryId').equals(id).toArray()).filter((p) => p.deletedAt === null)
    for (const photo of photos) await tombstone(target, 'photos', photo.id, time)
    await tombstone(target, 'entries', id, time)
    await clearCoverIfDeleted(
      target,
      entry.projectId,
      photos.map((p) => p.id),
      time,
    )
  })
}

// --- Photos (append-only, D-0002) ---

export interface NewPhoto {
  /** The original file, byte for byte (D-0003). Never re-encoded here. */
  original: Blob
  /** The 2560 px phone copy, made on this device (D-0003). */
  copy: Blob
  thumbnail: Blob
  takenAt: string
  width: number
  height: number
}

/** Adds photos to an entry. One outbox row per photo, all in one transaction. */
export async function addPhotos(entryId: string, inputs: NewPhoto[], target: DiyDb = defaultDb): Promise<Photo[]> {
  if (!Array.isArray(inputs) || inputs.length === 0) fail('No photos to add.')
  const time = now()
  const photos = inputs.map((input): Photo => {
    if (!(input.original instanceof Blob) || !(input.copy instanceof Blob) || !(input.thumbnail instanceof Blob))
      fail('A photo needs its original, copy and thumbnail.')
    if (!(input.width > 0) || !(input.height > 0)) fail('A photo needs its size.')
    return {
      id: newId(),
      projectId: '',
      entryId,
      takenAt: checkIsoTime(input.takenAt, 'The time taken'),
      blob: input.copy,
      thumbnail: input.thumbnail,
      original: input.original,
      uploads: { original: 'pending', copy: 'pending', thumbnail: 'pending' },
      width: input.width,
      height: input.height,
      createdAt: time,
      updatedAt: time,
      deletedAt: null,
    }
  })
  await target.transaction('rw', target.projects, target.entries, target.photos, target.outbox, async () => {
    const entry = await liveEntry(target, entryId)
    await liveProject(target, entry.projectId)
    for (const photo of photos) {
      photo.projectId = entry.projectId
      await target.photos.add(photo)
      await queue(target, 'photos', photo.id, 'put', time)
    }
  })
  return photos
}

/**
 * Tombstones a photo and queues the delete (D-0002, D-0014). The photo's blobs stay; only
 * the sync engine removes them, once the NAS has the tombstone. If it was the project's
 * cover, the cover is cleared too (T-0010).
 */
export async function deletePhoto(id: string, target: DiyDb = defaultDb): Promise<void> {
  const time = now()
  await target.transaction('rw', target.projects, target.photos, target.outbox, async () => {
    const photo = await target.photos.get(id)
    if (!photo) fail(`No photo ${id}.`)
    if (photo.deletedAt !== null) fail(`Photo ${id} is already deleted.`)
    await tombstone(target, 'photos', id, time)
    await clearCoverIfDeleted(target, photo.projectId, [id], time)
  })
}

/**
 * Records that the NAS confirmed one of a photo's files (for the sync engine, T-0016). This
 * is sync state, not a change, so it adds no outbox row and keeps `updatedAt`. The original
 * is dropped from the device only once all three files are confirmed (D-0003, D-0015).
 */
export async function markPhotoFileUploaded(id: string, file: PhotoFile, target: DiyDb = defaultDb): Promise<Photo> {
  return target.transaction('rw', target.photos, async () => {
    const photo = await target.photos.get(id)
    if (!photo) fail(`No photo ${id}.`)
    const uploads = { ...photo.uploads, [file]: 'uploaded' as const }
    const allConfirmed = Object.values(uploads).every((s) => s !== 'pending')
    const updated: Photo = { ...photo, uploads, original: allConfirmed ? null : photo.original }
    await target.photos.put(updated)
    return updated
  })
}

// --- Sync status (T-0018) ---

/** Changes on this device the NAS hasn't confirmed yet. */
export function countUnsynced(target: DiyDb = defaultDb): Promise<number> {
  return target.outbox.count()
}

/**
 * Asks the browser not to clear this site's storage (D-0002). Resolves to whether storage
 * is persistent; `false` where the API is missing. The result is kept in
 * `storagePersisted` for the sync status (T-0018).
 */
export let storagePersisted: boolean | null = null

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!storage?.persist) return (storagePersisted = false)
    storagePersisted = (await storage.persisted?.()) || (await storage.persist())
  } catch {
    storagePersisted = false
  }
  return storagePersisted
}
