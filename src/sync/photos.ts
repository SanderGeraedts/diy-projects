import { ClientResponseError } from 'pocketbase'
import type { Photo, PhotoFile } from '../db/db'
import type { ServerRecord } from './records'

// T-0017: the parts of photo-file sync that don't need the engine's state (D-0003, D-0015).
//
// - The adding device uploads each photo's 2560 px copy and its thumbnail first (one request),
//   then the original, byte for byte, as its own request. A file counts as uploaded only when
//   PocketBase's answer names it. The original is dropped from the device only once all three
//   are confirmed (`markPhotoFileUploaded` in src/db/write.ts).
// - Other devices download the copy and the thumbnail, never the original. The NAS does no
//   image processing; PocketBase's thumbnails are not used.
// - The files are protected (deploy/nas/pb_migrations/): a download needs a short-lived file
//   token in the URL (`/api/files/…?token=`), the Funnel path for files (D-0005).

/** One upload request: the two small files together, or the original. */
export type UploadStep = 'copy+thumbnail' | 'original'

/** The order uploads go in: every photo's small files first, so other devices see it soon. */
export const UPLOAD_STEPS: readonly UploadStep[] = ['copy+thumbnail', 'original']

/** The part of PocketBase's file API sync uses (`pb.files` fits). */
export interface FileApi {
  getToken(options?: Record<string, unknown>): Promise<string>
  getURL(record: { [key: string]: unknown }, filename: string, queryParams?: Record<string, unknown>): string
}

/** Fetches one file; throws a ClientResponseError (status 0 offline) when it can't. */
export type FetchFile = (url: string) => Promise<Blob>

export const fetchFile: FetchFile = async (url) => {
  let response: Response
  try {
    response = await fetch(url)
  } catch (err) {
    throw new ClientResponseError({ url, status: 0, originalError: err })
  }
  if (!response.ok) throw new ClientResponseError({ url, status: response.status })
  return response.blob()
}

/** What this photo still needs to upload next, or null (nothing, or tombstoned: D-0014). */
export function nextUpload(photo: Photo): UploadStep | null {
  if (photo.deletedAt !== null) return null
  if (photo.uploads.copy === 'pending' || photo.uploads.thumbnail === 'pending') return 'copy+thumbnail'
  if (photo.uploads.original === 'pending' && photo.original) return 'original'
  return null
}

/** The files one step sends for this photo. */
export function stepFiles(photo: Photo, step: UploadStep): PhotoFile[] {
  if (step === 'original') return ['original']
  return (['copy', 'thumbnail'] as const).filter((f) => photo.uploads[f] === 'pending')
}

/** Per photo: how many of its files the NAS has confirmed, for progress (T-0018). */
export function uploadProgress(photo: Photo): { confirmed: number; total: number } {
  const states = Object.values(photo.uploads)
  const total = states.filter((s) => s !== 'none').length
  return { confirmed: states.filter((s) => s === 'uploaded').length, total }
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/gif': 'gif',
}

function fileName(blob: Blob, base: string): string {
  const name = typeof File !== 'undefined' && blob instanceof File ? blob.name : ''
  if (name) return name
  return `${base}.${EXTENSIONS[blob.type] ?? 'bin'}`
}

/** The multipart body of one upload. The Blobs go as they are: never re-encoded (D-0003). */
export function uploadBody(photo: Photo, step: UploadStep): FormData {
  const form = new FormData()
  for (const file of stepFiles(photo, step)) {
    const blob = file === 'original' ? photo.original! : file === 'copy' ? photo.blob : photo.thumbnail
    form.append(file, blob, fileName(blob, file === 'original' ? 'original' : file))
  }
  return form
}

/** The files PocketBase's answer shows as stored. */
export function confirmedFiles(stored: ServerRecord, files: readonly PhotoFile[]): PhotoFile[] {
  return files.filter((f) => typeof stored[f] === 'string' && stored[f] !== '')
}

/** A photo record from the NAS that this device should download: alive, copy and thumbnail there. */
export function downloadable(remote: ServerRecord): { copy: string; thumbnail: string } | null {
  if (typeof remote.deletedAt === 'string' && remote.deletedAt !== '') return null
  const copy = typeof remote.copy === 'string' ? remote.copy : ''
  const thumbnail = typeof remote.thumbnail === 'string' ? remote.thumbnail : ''
  return copy && thumbnail ? { copy, thumbnail } : null
}
