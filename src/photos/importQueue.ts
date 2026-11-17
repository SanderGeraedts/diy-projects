import { db } from '../db/db'
import { addEntry, addPhotos, updateProject } from '../db/write'
import { findEntry } from '../routes/AddEntry'
import { startBusy } from '../sw/busy'
import { dateTaken, makeCopy, makeThumbnail, type DateTaken } from './index'

// T-0007: imports photos from the gallery into a project's entries (D-0003). The import runs
// here, outside any screen, so it keeps going when Sander leaves the project page; screens
// only read its progress through useImportStatus/subscribeImport. Photos are processed one
// at a time (the worker queue in ./index does one at a time too), each stored in its own
// write so a failed photo never takes the others with it. An app update waits while an
// import runs (T-0019).

export interface ImportFailure {
  name: string
  reason: string
}

export interface ImportStatus {
  projectId: string
  /** Photos picked, across every batch started for this project since the last dismiss. */
  total: number
  /** Photos handled so far, added or failed. */
  done: number
  added: number
  failed: ImportFailure[]
  /** Names of photos without an EXIF date, filed under the file's date (D-0003). */
  fromFileDate: string[]
  /** Set when the device may not have room for the photos (navigator.storage.estimate). */
  lowStorage: boolean
  running: boolean
}

/** What the import needs from the photo module and the browser; swapped out in unit tests. */
export interface ImportDeps {
  dateTaken: (file: File) => Promise<DateTaken>
  makeCopy: (file: Blob) => Promise<Blob>
  makeThumbnail: (copy: Blob) => Promise<Blob>
  imageSize: (blob: Blob) => Promise<{ width: number; height: number }>
  estimate: () => Promise<{ usage?: number; quota?: number } | undefined>
}

async function imageSize(blob: Blob) {
  const bitmap = await createImageBitmap(blob)
  try {
    return { width: bitmap.width, height: bitmap.height }
  } finally {
    bitmap.close()
  }
}

export const browserDeps: ImportDeps = {
  dateTaken,
  makeCopy,
  makeThumbnail,
  imageSize,
  estimate: async () => (typeof navigator !== 'undefined' ? navigator.storage?.estimate?.() : undefined),
}

// Room a photo takes on the device besides its original: the 2560 px copy (about 0.6–0.9 MB,
// D-0003) and its thumbnail.
const COPY_ALLOWANCE = 1024 * 1024

/** True when the free space the browser reports is less than the photos will take. */
export function storageIsShort(files: readonly Blob[], estimate: { usage?: number; quota?: number } | undefined) {
  if (!estimate?.quota) return false
  const needed = files.reduce((sum, f) => sum + f.size + COPY_ALLOWANCE, 0)
  return estimate.quota - (estimate.usage ?? 0) < needed
}

// --- Progress store ---

const statuses = new Map<string, ImportStatus>()
const listeners = new Set<() => void>()
let chain: Promise<void> = Promise.resolve()

function set(projectId: string, change: (s: ImportStatus) => ImportStatus) {
  const current = statuses.get(projectId)
  if (!current) return
  statuses.set(projectId, change(current))
  for (const listener of [...listeners]) listener()
}

export function getImportStatus(projectId: string): ImportStatus | undefined {
  return statuses.get(projectId)
}

export function subscribeImport(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Clears a finished import's summary. A running import can't be dismissed. */
export function dismissImport(projectId: string): void {
  if (statuses.get(projectId)?.running) return
  statuses.delete(projectId)
  for (const listener of [...listeners]) listener()
}

/**
 * Queues photos for import into a project and returns at once. Resolves the returned
 * promise when this batch is done. Batches run one after another.
 */
export function startImport(projectId: string, files: readonly File[], deps: ImportDeps = browserDeps): Promise<void> {
  const list = [...files]
  const previous = statuses.get(projectId)
  const base: ImportStatus =
    previous?.running
      ? previous
      : { projectId, total: 0, done: 0, added: 0, failed: [], fromFileDate: [], lowStorage: false, running: true }
  statuses.set(projectId, { ...base, total: base.total + list.length, running: true })
  for (const listener of [...listeners]) listener()

  const release = startBusy('de foto-import')
  const batch = chain.then(() => runBatch(projectId, list, deps)).finally(release)
  chain = batch.catch(() => undefined)
  return batch
}

async function runBatch(projectId: string, files: File[], deps: ImportDeps): Promise<void> {
  try {
    try {
      const estimate = await deps.estimate()
      if (storageIsShort(files, estimate)) set(projectId, (s) => ({ ...s, lowStorage: true }))
    } catch {
      // No estimate: import anyway; a photo that doesn't fit fails on its own.
    }
    for (const file of files) {
      try {
        const fromFile = await importOne(projectId, file, deps)
        set(projectId, (s) => ({
          ...s,
          done: s.done + 1,
          added: s.added + 1,
          fromFileDate: fromFile ? [...s.fromFileDate, file.name] : s.fromFileDate,
        }))
      } catch (error) {
        console.error(`Import of ${file.name} failed`, error)
        set(projectId, (s) => ({
          ...s,
          done: s.done + 1,
          failed: [...s.failed, { name: file.name, reason: reasonFor(error) }],
        }))
      }
    }
  } finally {
    const status = statuses.get(projectId)
    // Another batch for this project may be queued behind this one; it keeps `running`.
    if (status && status.done >= status.total) set(projectId, (s) => ({ ...s, running: false }))
  }
}

function reasonFor(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'geen ruimte meer op het toestel'
  return 'kon niet worden gelezen'
}

/** Imports one photo. Returns true when it was dated by the file instead of EXIF. */
async function importOne(projectId: string, file: File, deps: ImportDeps): Promise<boolean> {
  const taken = await deps.dateTaken(file)
  const copy = await deps.makeCopy(file)
  const thumbnail = await deps.makeThumbnail(copy)
  const { width, height } = await deps.imageSize(copy)

  // One entry per project per day taken (D-0003), created when the day has none yet.
  const date = taken.takenAt.slice(0, 10)
  const entry = (await findEntry(projectId, date)) ?? (await addEntry({ projectId, date }))
  const [photo] = await addPhotos(entry.id, [{ original: file, copy, thumbnail, takenAt: taken.takenAt, width, height }])

  // The first photo of a project without a cover becomes the cover.
  const project = await db.projects.get(projectId)
  if (project && !project.coverPhotoId) await updateProject(projectId, { coverPhotoId: photo!.id })
  return taken.source === 'lastModified'
}
