import { useSyncExternalStore } from 'react'
import { auth, pb, setSyncNow } from '../auth/session'
import { db } from '../db/db'
import { removePurged, type BinKind } from '../db/write'
import { measureImage } from '../photos'
import { createSyncEngine, type SyncEngine, type SyncStatus } from './engine'
import { purgeOnNas } from './purge'

// The app's one sync engine (T-0016). It exists only when sync is on: a production build
// with an address (D-0006), where src/auth/session.ts makes the PocketBase client. Previews,
// dev and tests get null and never sync.

export const syncEngine: SyncEngine | null =
  pb && auth ? createSyncEngine({ db, client: pb, auth, measure: measureImage }) : null

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

/**
 * "Definitief verwijderen" (T-0022, D-0014). With sync on: sync first, so the delete is on the
 * NAS; ask the NAS to delete the item for good (./purge.ts); then remove it from this device
 * and sync, which brings the markers to the other devices' next pull. Throws when the NAS
 * refuses or can't be reached (see `purgeErrorMessage`); nothing changes here then.
 * Previews and dev have no NAS (D-0006): there it removes the demo data from this device only.
 */
export async function deleteForGood(kind: BinKind, id: string): Promise<void> {
  if (!syncEngine || !pb) {
    await removePurged(kind, id)
    return
  }
  await syncEngine.syncNow()
  await purgeOnNas(pb, kind, id)
  await removePurged(kind, id)
  void syncEngine.syncNow()
}

const noop = () => () => {}
const off = (): SyncStatus | null => null

/** The sync status for T-0018, re-rendering on every change. null when sync is off. */
export function useSyncStatus(engine: SyncEngine | null = syncEngine): SyncStatus | null {
  return useSyncExternalStore(engine ? engine.subscribe : noop, engine ? engine.getStatus : off)
}
