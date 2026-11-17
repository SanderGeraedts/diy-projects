import { useSyncExternalStore } from 'react'
import { busyReasons, isBusy, subscribeBusy, whenIdle } from './busy'

// T-0019: a new version waits (registerType 'prompt') until the app takes it. The app offers
// it in a bar; "Bijwerken" activates it and reloads, but never while an import or sync runs
// (see busy.ts).

export type UpdateState =
  | { status: 'none' }
  /** A new version is waiting. */
  | { status: 'available' }
  /** "Bijwerken" was tapped; it waits for the running work in `reasons`. */
  | { status: 'waiting'; reasons: readonly string[] }
  /** The new version is being activated; the page reloads when it has taken over. */
  | { status: 'updating' }

export interface AppUpdate {
  getState(): UpdateState
  subscribe(listener: () => void): () => void
  /** Called by the service worker registration when a new version is waiting. */
  offer(activate: () => Promise<void>): void
  /** Takes the waiting version once nothing is busy. */
  apply(): Promise<void>
}

export function createAppUpdate(): AppUpdate {
  let state: UpdateState = { status: 'none' }
  let activate: (() => Promise<void>) | null = null
  const listeners = new Set<() => void>()

  const set = (next: UpdateState) => {
    state = next
    for (const listener of [...listeners]) listener()
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    offer(fn) {
      activate = fn
      if (state.status === 'none') set({ status: 'available' })
    },
    async apply() {
      if (state.status !== 'available' || !activate) return
      if (isBusy()) {
        set({ status: 'waiting', reasons: busyReasons() })
        const unsubscribe = subscribeBusy(() => {
          if (isBusy()) set({ status: 'waiting', reasons: busyReasons() })
        })
        await whenIdle()
        unsubscribe()
      }
      set({ status: 'updating' })
      try {
        await activate()
      } catch {
        // Activation failed; offer it again rather than leave a stuck bar.
        set({ status: 'available' })
      }
    },
  }
}

/** The app's one update state, fed by register.ts. */
export const appUpdate = createAppUpdate()

export function useAppUpdate(): { state: UpdateState; apply: () => void } {
  const state = useSyncExternalStore(appUpdate.subscribe, appUpdate.getState)
  return { state, apply: () => void appUpdate.apply() }
}

export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/**
 * Checks for a new version whenever the app comes into view, at most once per `intervalMs`.
 * Registration itself counts as a check. A failed check (offline) waits for the next
 * interval too. Returns a function that stops watching.
 */
export function watchForUpdates({
  check,
  intervalMs = UPDATE_CHECK_INTERVAL_MS,
  now = Date.now,
  doc = document,
}: {
  check: () => Promise<unknown>
  intervalMs?: number
  now?: () => number
  doc?: Document
}): () => void {
  let lastCheck = now()
  const onVisibility = () => {
    if (doc.visibilityState !== 'visible') return
    if (now() - lastCheck < intervalMs) return
    lastCheck = now()
    check().catch(() => {})
  }
  doc.addEventListener('visibilitychange', onVisibility)
  return () => doc.removeEventListener('visibilitychange', onVisibility)
}
