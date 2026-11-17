import { useSyncExternalStore } from 'react'
import { auth, pb, setSyncNow } from '../auth/session'
import { db } from '../db/db'
import { createSyncEngine, type SyncEngine, type SyncStatus } from './engine'

// The app's one sync engine (T-0016). It exists only when sync is on: a production build
// with an address (D-0006), where src/auth/session.ts makes the PocketBase client. Previews,
// dev and tests get null and never sync.

export const syncEngine: SyncEngine | null =
  pb && auth ? createSyncEngine({ db, client: pb, auth }) : null

// D-0013: sign-out syncs first.
if (syncEngine) setSyncNow(syncEngine.syncNow)

/** Starts syncing on its own (at start-up, online, in view, after changes). No-op when off. */
export function startSync(): void {
  syncEngine?.start()
}

/** "Nu synchroniseren" (T-0018). Resolves when the run is over; never rejects. */
export function syncNow(): Promise<void> {
  return syncEngine ? syncEngine.syncNow() : Promise.resolve()
}

const noop = () => () => {}
const off = (): SyncStatus | null => null

/** The sync status for T-0018, re-rendering on every change. null when sync is off. */
export function useSyncStatus(engine: SyncEngine | null = syncEngine): SyncStatus | null {
  return useSyncExternalStore(engine ? engine.subscribe : noop, engine ? engine.getStatus : off)
}
