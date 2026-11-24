import type { PhotoJob, PhotoResult } from './photo.worker'

export { dateTaken, type DateTaken } from './dateTaken'

// One worker, one photo at a time: jobs queue up so importing 30 large photos never decodes
// more than one at once (memory) and never blocks the main thread. Thumbnail rebuilds
// (T-0037, ./rebuild.ts) share the queue, one job at a time between the import's.
let worker: Worker | null = null
let nextId = 1
let queue: Promise<unknown> = Promise.resolve()

function getWorker(): Worker {
  worker ??= new Worker(new URL('./photo.worker.ts', import.meta.url), { type: 'module' })
  return worker
}

type Answer = Exclude<PhotoResult, { error: string }>

function run(kind: PhotoJob['kind'], source: Blob): Promise<Answer> {
  const job = queue.then(
    () =>
      new Promise<Answer>((resolve, reject) => {
        const w = getWorker()
        const id = nextId++
        const onMessage = (event: MessageEvent<PhotoResult>) => {
          if (event.data.id !== id) return
          w.removeEventListener('message', onMessage)
          if ('error' in event.data) reject(new Error(event.data.error))
          else resolve(event.data)
        }
        w.addEventListener('message', onMessage)
        // The Blob is passed by reference (structured clone); the original is never modified.
        w.postMessage({ id, kind, source } satisfies PhotoJob)
      }),
  )
  queue = job.catch(() => undefined)
  return job
}

async function blobOf(kind: 'copy' | 'thumbnail', source: Blob): Promise<Blob> {
  const answer = await run(kind, source)
  if (!('blob' in answer)) throw new Error(`The worker sent no ${kind}`)
  return answer.blob
}

/** The 2560 px long-edge WebP copy (D-0003), EXIF orientation applied, never upscaled. */
export function makeCopy(file: Blob): Promise<Blob> {
  return blobOf('copy', file)
}

/** The 1280 px long-edge WebP thumbnail for cards and grids (D-0038), derived from the copy. */
export function makeThumbnail(copy: Blob): Promise<Blob> {
  return blobOf('thumbnail', copy)
}

/**
 * The 640×480 card image (D-0041): the copy's centre 4:3 crop, WebP; null when the copy is too
 * small for one (never enlarged).
 */
export async function makeCard(copy: Blob): Promise<Blob | null> {
  const answer = await run('card', copy)
  if ('none' in answer) return null
  if (!('blob' in answer)) throw new Error('The worker sent no card image')
  return answer.blob
}

/** An image's pixel size, decoded in the worker. */
export async function measureImage(image: Blob): Promise<{ width: number; height: number }> {
  const answer = await run('size', image)
  if (!('size' in answer)) throw new Error('The worker sent no size')
  return answer.size
}
