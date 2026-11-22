import { useEffect, useRef } from 'react'
import { readDrop, type DroppedItem } from '../photos/drop'

// T-0031 (D-0033): files dragged from the computer onto the app. FileDropGuard (in Layout)
// listens on the window for the whole app: a drag that carries files never makes the browser
// open them, anywhere. Only a page that registers a drop target (the owner's project page,
// through ImportPhotos) acts on a drop; everywhere else the cursor shows "not allowed".
//
// Only drags from outside the app count: dragging text, a link or a thumbnail from the page
// (Chromium marks an <img> drag as carrying a file too) starts with a dragstart on the window,
// and is ignored until its dragend or drop.

export interface FileDropTarget {
  /** The dropped files, in order, read while the drop event is still running. */
  onDrop: (items: DroppedItem[]) => void
  /** True while files from outside are dragged over the window (shows the overlay). */
  setOver: (over: boolean) => void
}

let target: FileDropTarget | null = null

const carriesFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')

/** Installs the app-wide drag listeners. Renders nothing. */
export function FileDropGuard() {
  useEffect(() => {
    // dragenter/dragleave are counted rather than trusted one by one: moving over the page's
    // own elements fires a leave for each enter, and the overlay mustn't flicker.
    let depth = 0
    let internal = false

    const reset = () => {
      depth = 0
      target?.setOver(false)
    }
    const onDragStart = () => {
      internal = true
    }
    const onDragEnd = () => {
      internal = false
      reset()
    }
    const onDragEnter = (e: DragEvent) => {
      if (internal || !carriesFiles(e)) return
      e.preventDefault()
      depth += 1
      target?.setOver(true)
    }
    const onDragLeave = (e: DragEvent) => {
      if (internal || !carriesFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) reset()
    }
    const onDragOver = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault() // the browser would otherwise open the file
      e.dataTransfer!.dropEffect = !internal && target ? 'copy' : 'none'
    }
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e)) return
      e.preventDefault()
      const fromInside = internal
      internal = false
      reset()
      if (fromInside || !target) return
      target.onDrop(readDrop(e.dataTransfer!))
    }

    const listeners = [
      ['dragstart', onDragStart],
      ['dragend', onDragEnd],
      ['dragenter', onDragEnter],
      ['dragleave', onDragLeave],
      ['dragover', onDragOver],
      ['drop', onDrop],
    ] as const
    // Capture: nothing inside the page can swallow a file drop before it's stopped here.
    for (const [type, listener] of listeners) window.addEventListener(type, listener as EventListener, true)
    return () => {
      for (const [type, listener] of listeners) window.removeEventListener(type, listener as EventListener, true)
    }
  }, [])
  return null
}

/** Makes the mounted page the app's drop target while it is mounted. */
export function useFileDropTarget(onDrop: FileDropTarget['onDrop'], setOver: FileDropTarget['setOver']) {
  const latest = useRef({ onDrop, setOver })
  useEffect(() => {
    latest.current = { onDrop, setOver }
  })
  useEffect(() => {
    const mine: FileDropTarget = {
      onDrop: (items) => latest.current.onDrop(items),
      setOver: (over) => latest.current.setOver(over),
    }
    target = mine
    return () => {
      if (target === mine) target = null
    }
  }, [])
}

/** Covers the viewport while files are dragged over the owner's project page. Purely visual. */
export function DropOverlay({ projectTitle }: { projectTitle: string }) {
  return (
    <div
      aria-hidden="true"
      data-testid="drop-overlay"
      className="fixed inset-0 z-30 flex items-center justify-center bg-panel p-4"
    >
      <div className="pointer-events-none w-full max-w-sm rounded-card border-2 border-dashed border-accent bg-bg p-5 text-center text-text">
        <p className="m-0 text-lg font-semibold">Laat los om foto's toe te voegen</p>
        <p className="mt-1 mb-0 break-words">aan {projectTitle}</p>
        <p className="mt-2 mb-0 text-sm text-grey">Ze komen bij de dag waarop ze zijn gemaakt.</p>
      </div>
    </div>
  )
}
