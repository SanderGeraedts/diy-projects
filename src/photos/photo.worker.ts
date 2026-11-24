/// <reference lib="webworker" />
import { encodeScaled, measure } from './encode'
import { COPY_LONG_EDGE, COPY_QUALITY, THUMBNAIL_LONG_EDGE, THUMBNAIL_QUALITY } from './resize'

export type PhotoJob = { id: number; kind: 'copy' | 'thumbnail' | 'size'; source: Blob }
export type PhotoResult =
  | { id: number; blob: Blob }
  | { id: number; size: { width: number; height: number } }
  | { id: number; error: string }

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (event: MessageEvent<PhotoJob>) => {
  const { id, kind, source } = event.data
  try {
    if (kind === 'size') {
      self.postMessage({ id, size: await measure(source) } satisfies PhotoResult)
      return
    }
    const blob =
      kind === 'copy'
        ? await encodeScaled(source, COPY_LONG_EDGE, COPY_QUALITY)
        : await encodeScaled(source, THUMBNAIL_LONG_EDGE, THUMBNAIL_QUALITY)
    self.postMessage({ id, blob } satisfies PhotoResult)
  } catch (error) {
    self.postMessage({ id, error: String(error) } satisfies PhotoResult)
  }
}
