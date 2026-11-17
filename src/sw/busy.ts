// Work that an app update must not interrupt (T-0019): a photo import (T-0007) or a sync
// (T-0016). Such work calls startBusy() when it starts and the returned release function
// when it ends, also when it fails:
//
//   const done = startBusy('de foto-import')
//   try { ... } finally { done() }
//
// The update waits until nothing is busy, and shows the reasons while it waits. A reason is
// a short Dutch phrase that reads well in "bijwerken zodra … klaar is".

type Listener = () => void

const active = new Map<number, string>()
const listeners = new Set<Listener>()
let nextId = 0
let reasons: readonly string[] = []

function changed(): void {
  reasons = [...new Set(active.values())]
  for (const listener of [...listeners]) listener()
}

/** Marks work as running until the returned function is called. Calling it twice is harmless. */
export function startBusy(reason: string): () => void {
  const id = nextId++
  active.set(id, reason)
  changed()
  let released = false
  return () => {
    if (released) return
    released = true
    active.delete(id)
    changed()
  }
}

export function isBusy(): boolean {
  return active.size > 0
}

/** The distinct reasons of the running work, oldest first. Stable between changes. */
export function busyReasons(): readonly string[] {
  return reasons
}

/** Calls `listener` whenever work starts or ends. Returns an unsubscribe function. */
export function subscribeBusy(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Resolves once nothing is busy (at once if nothing is). */
export function whenIdle(): Promise<void> {
  if (!isBusy()) return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = subscribeBusy(() => {
      if (isBusy()) return
      unsubscribe()
      resolve()
    })
  })
}
