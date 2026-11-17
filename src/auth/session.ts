import PocketBase from 'pocketbase'
import { useSyncExternalStore } from 'react'
import { db } from '../db/db'
import { syncConfig } from '../sync/config'
import { createAuth, type Auth, type AuthState, type SyncNow } from './auth'

// The app's one PocketBase client and sign-in. Both exist only when sync is on: a
// production build with an address (D-0006). Previews, dev and tests get null and never
// show a sign-in.

let syncNowHook: SyncNow = async () => {}

/** T-0016 registers its sync here, so sign-out syncs before it clears the device (D-0013). */
export function setSyncNow(fn: SyncNow): void {
  syncNowHook = fn
}

/** The PocketBase client for sync (T-0016). Its auth store holds the token (LocalAuthStore). */
export const pb: PocketBase | null = syncConfig.enabled ? new PocketBase(syncConfig.url) : null

export const auth: Auth | null = pb ? createAuth({ client: pb, db, syncNow: () => syncNowHook() }) : null

const noop = () => () => {}
const signedOut = (): AuthState => 'signed-out'

/** The sign-in state, re-rendering on every change. `signed-out` when sync is off. */
export function useAuthState(target: Auth | null = auth): AuthState {
  return useSyncExternalStore(target ? target.subscribe : noop, target ? target.state : signedOut)
}
