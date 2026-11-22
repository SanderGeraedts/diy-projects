import { db } from '../db/db'
import { addEntry, addPhotos, updateProject } from '../db/write'
import { findEntry } from '../routes/AddEntry'
import { startBusy } from '../sw/busy'
import { CANT_LOAD_UNZIP, CANT_UNZIP, fromZip } from './drop'
import { dateTaken, makeCopy, makeThumbnail, type DateTaken } from './index'
import type { readZip } from './unzip'

// T-0007: imports photos from the gallery into a project's entries (D-0003). The import runs
// here, outside any screen, so it keeps going when Sander leaves the project page; screens
// only read its progress through useImportStatus/subscribeImport. Photos are processed one
// at a time (the worker queue in ./index does one at a time too), each stored in its own
// write so a failed photo never takes the others with it. An app update waits while an
// import runs (T-0019).
// T-0032 (D-0034): a dropped zip is read here too, one image at a time; each image joins the
// running import as it comes out, and the import counts as running until every zip is read.

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
  /**
   * Dropped items that were never photos (or folders), known before the import runs (T-0031,
   * D-0033). Listed in the summary before `failed`; not counted in `total` or `done`.
   */
  notAdded: ImportFailure[]
  failed: ImportFailure[]
  /** Names of photos without an EXIF date, filed under the file's date (D-0003). */
  fromFileDate: string[]
  /** Set when the device may not have room for the photos (navigator.storage.estimate). */
  lowStorage: boolean
  /** Names of the zips dropped and not yet read to their end; the first is being read (T-0032). */
  zips: string[]
  /** How much of the first zip has been read, a whole percent from 0 to 100. */
  zipPercent: number
  /** True until every photo is handled and every zip is read; the summary shows after. */
  running: boolean
}

/** What the import needs from the photo module and the browser; swapped out in unit tests. */
export interface ImportDeps {
  dateTaken: (file: File) => Promise<DateTaken>
  makeCopy: (file: Blob) => Promise<Blob>
  makeThumbnail: (copy: Blob) => Promise<Blob>
  imageSize: (blob: Blob) => Promise<{ width: number; height: number }>
  estimate: () => Promise<{ usage?: number; quota?: number } | undefined>
  /** Loads the zip reader (fflate) on first use: a dynamic import, out of the startup bundle. */
  loadUnzip: () => Promise<{ readZip: typeof readZip }>
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
  loadUnzip: () => import('./unzip'),
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
 *
 * `notAdded` are dropped items that aren't photos (T-0031): they join the summary at once.
 * A batch with only those has nothing to import and goes straight to the summary.
 */
export function startImport(
  projectId: string,
  files: readonly File[],
  deps: ImportDeps = browserDeps,
  notAdded: readonly ImportFailure[] = [],
): Promise<void> {
  const list = [...files]
  const previous = statuses.get(projectId)
  const base = previous?.running ? previous : fresh(projectId)
  const running = list.length > 0 || isRunning(base)
  statuses.set(projectId, { ...base, total: base.total + list.length, notAdded: [...base.notAdded, ...notAdded], running })
  for (const listener of [...listeners]) listener()
  if (list.length === 0) return previous?.running ? chain : Promise.resolve()

  return enqueue(() => runBatch(projectId, list, deps))
}

/**
 * Queues dropped zip files (T-0032) for a project and returns at once; resolves when they
 * are read and their images imported. The zips are read one after another, after the work
 * already queued. `limit` is the largest image taken from a zip, in bytes; tests lower it.
 */
export function startZipImport(
  projectId: string,
  zips: readonly File[],
  deps: ImportDeps = browserDeps,
  limit?: number,
): Promise<void> {
  const list = [...zips]
  if (list.length === 0) return Promise.resolve()
  const previous = statuses.get(projectId)
  const base = previous?.running ? previous : fresh(projectId)
  statuses.set(projectId, { ...base, zips: [...base.zips, ...list.map((z) => z.name)], running: true })
  for (const listener of [...listeners]) listener()

  return Promise.all(list.map((zip) => enqueue(() => runZip(projectId, zip, deps, limit)))).then(() => undefined)
}

const fresh = (projectId: string): ImportStatus => ({
  projectId,
  total: 0,
  done: 0,
  added: 0,
  notAdded: [],
  failed: [],
  fromFileDate: [],
  lowStorage: false,
  zips: [],
  zipPercent: 0,
  running: true,
})

const isRunning = (s: ImportStatus) => s.done < s.total || s.zips.length > 0

/** Runs work after everything queued before it; an app update waits for it (T-0019). */
function enqueue(work: () => Promise<void>): Promise<void> {
  const release = startBusy('de foto-import')
  const batch = chain.then(work).finally(release)
  chain = batch.catch(() => undefined)
  return batch
}

/** Ends the import once nothing is left: no photo waiting, no zip to read. */
function finishIfIdle(projectId: string) {
  const status = statuses.get(projectId)
  // Another batch or zip for this project may be queued behind this one; it keeps `running`.
  if (status && !isRunning(status)) set(projectId, (s) => ({ ...s, running: false }))
}

async function warnIfShort(projectId: string, files: readonly Blob[], deps: ImportDeps) {
  try {
    const estimate = await deps.estimate()
    if (storageIsShort(files, estimate)) set(projectId, (s) => ({ ...s, lowStorage: true }))
  } catch {
    // No estimate: import anyway; a photo that doesn't fit fails on its own.
  }
}

async function runBatch(projectId: string, files: File[], deps: ImportDeps): Promise<void> {
  try {
    await warnIfShort(projectId, files, deps)
    for (const file of files) await importAndCount(projectId, file, file.name, deps)
  } finally {
    finishIfIdle(projectId)
  }
}

/** Imports one photo and records the outcome under `label`, the name the summary shows. */
async function importAndCount(projectId: string, file: File, label: string, deps: ImportDeps): Promise<void> {
  try {
    const fromFile = await importOne(projectId, file, deps)
    set(projectId, (s) => ({
      ...s,
      done: s.done + 1,
      added: s.added + 1,
      fromFileDate: fromFile ? [...s.fromFileDate, label] : s.fromFileDate,
    }))
  } catch (error) {
    console.error(`Import of ${label} failed`, error)
    set(projectId, (s) => ({
      ...s,
      done: s.done + 1,
      failed: [...s.failed, { name: label, reason: reasonFor(error) }],
    }))
  }
}

/**
 * Reads one zip and imports its images as they come out, one at a time: the next image is
 * unpacked only after this one is stored. Each image joins `total` when it is found. Lines
 * about the zip and its entries join `notAdded` in the order they are found.
 */
async function runZip(projectId: string, zip: File, deps: ImportDeps, limit: number | undefined): Promise<void> {
  const notAdded = (name: string, reason: string) =>
    set(projectId, (s) => ({ ...s, notAdded: [...s.notAdded, { name, reason }] }))
  try {
    // Photos hardly compress, so what comes out of a zip is at least as big as the zip.
    await warnIfShort(projectId, [zip], deps)
    let unzip: Awaited<ReturnType<ImportDeps['loadUnzip']>>
    try {
      unzip = await deps.loadUnzip()
    } catch (error) {
      console.error('Loading the zip reader failed', error)
      notAdded(zip.name, CANT_LOAD_UNZIP)
      return
    }
    const onProgress = (read: number, size: number) => {
      const percent = size > 0 ? Math.min(100, Math.floor((read * 100) / size)) : 100
      if (percent !== statuses.get(projectId)?.zipPercent) set(projectId, (s) => ({ ...s, zipPercent: percent }))
    }
    try {
      for await (const item of unzip.readZip(zip, { limit, onProgress })) {
        if (item.kind === 'image') {
          set(projectId, (s) => ({ ...s, total: s.total + 1 }))
          await importAndCount(projectId, item.file, fromZip(item.path, zip.name), deps)
        } else if (item.kind === 'entry-failure') notAdded(fromZip(item.path, zip.name), item.reason)
        else notAdded(zip.name, item.reason)
      }
    } catch (error) {
      // readZip reports a bad zip itself; this is a bug, not the zip. Keep the summary honest.
      console.error(`Reading ${zip.name} failed`, error)
      notAdded(zip.name, CANT_UNZIP)
    }
  } finally {
    set(projectId, (s) => ({ ...s, zips: s.zips.slice(1), zipPercent: 0 }))
    finishIfIdle(projectId)
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
