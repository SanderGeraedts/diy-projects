import type { PhotoJob, PhotoResult } from './photo.worker'

export { dateTaken, type DateTaken } from './dateTaken'

// One worker, one photo at a time: jobs queue up so importing 30 large photos never decodes
// more than one at once (memory) and never blocks the main thread.
let worker: Worker | null = null
let nextId = 1
let queue: Promise<unknown> = Promise.resolve()

function getWorker(): Worker {
  worker ??= new Worker(new URL('./photo.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

function run(kind: PhotoJob['kind'], source: Blob): Promise<Blob> {
  const job = queue.then(
    () =>
      new Promise<Blob>((resolve, reject) => {
        const w = getWorker()
        const id = nextId++
        const onMessage = (event: MessageEvent<PhotoResult>) => {
          if (event.data.id !== id) return
          w.removeEventListener('message', onMessage)
          if ('error' in event.data) reject(new Error(event.data.error))
          else resolve(event.data.blob)
        }
        w.addEventListener('message', onMessage)
        // The Blob is passed by reference (structured clone); the original is never modified.
        w.postMessage({ id, kind, source } satisfies PhotoJob)
      }),
  )
  queue = job.catch(() => undefined)
  return job
}

/** The 2560 px long-edge WebP copy (D-0003), EXIF orientation applied, never upscaled. */
export function makeCopy(file: Blob): Promise<Blob> {
  return run('copy', file)
}

/** A ~512 px WebP thumbnail for grids, derived from the copy. */
export function makeThumbnail(copy: Blob): Promise<Blob> {
  return run('thumbnail', copy)
}
