import { ClientResponseError } from 'pocketbase'
import type { BinKind } from '../db/write'

// T-0022 (D-0014): "Definitief verwijderen" asks the NAS to delete a bin item for good. It is
// the owner's DELETE of the tombstoned project or entry, on the paths the Funnel allowlist
// already has; backend/pb_hooks/bin.pb.js does the work on the NAS (files, history, a
// marker per record) in one transaction. The device never deletes files one by one.

/** The part of PocketBase's record API a purge needs (`pb` fits). */
export interface PurgeClient {
  collection(name: string): { delete(id: string, options?: Record<string, unknown>): Promise<boolean> }
}

export const COLLECTION: Record<BinKind, 'projects' | 'entries'> = { project: 'projects', entry: 'entries' }

/** Deletes a bin item for good on the NAS. Throws a ClientResponseError when it can't. */
export async function purgeOnNas(client: PurgeClient, kind: BinKind, id: string): Promise<void> {
  await client.collection(COLLECTION[kind]).delete(id, { requestKey: null })
}

/** What to tell Sander when a permanent delete didn't go through (Dutch, T-0002). */
export function purgeErrorMessage(err: unknown): string {
  if (err instanceof ClientResponseError) {
    if (err.isAbort || err.status === 0) return 'Geen verbinding met de server. Definitief verwijderen kan alleen online.'
    // bin.pb.js: the NAS still has it as live (the delete hasn't synced, or it was restored).
    if (err.status === 400) return 'De server heeft dit nog niet in de prullenbak. Synchroniseer en probeer het opnieuw.'
    if (err.status === 401 || err.status === 403 || err.status === 404)
      return 'De server weigerde het. Log opnieuw in en probeer het opnieuw.'
    if (err.status === 429) return 'De server krijgt te veel verzoeken; probeer het later opnieuw.'
  }
  return 'Definitief verwijderen is niet gelukt. Probeer het opnieuw.'
}
