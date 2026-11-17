import { ClientResponseError, type AuthRecord, type BaseAuthStore } from 'pocketbase'
import type { DiyDb } from '../db/db'
import { clearLocalData, countUnsynced } from '../db/write'

// D-0013: Sander signs in with email and password against PocketBase's `users` collection.
// The token is kept the way the SDK keeps it (its auth store; LocalAuthStore in the browser)
// and renewed after every successful sync. An expired or revoked sign-in only pauses sync:
// nothing here ever blocks reading or editing local data, and nothing here touches the
// outbox except sign-out, which syncs first and asks again when anything is unsynced.

/**
 * - `signed-out`: no sign-in on this device.
 * - `signed-in`: a token that hasn't expired and that the NAS last accepted.
 * - `expired`: there was a sign-in, but its token ran out or the NAS refused it (password
 *   changed). Sync pauses until Sander signs in again (T-0018 shows why).
 */
export type AuthState = 'signed-out' | 'signed-in' | 'expired'

/** What the sync status shows while sync is paused for the sign-in (D-0013, T-0018). */
export const REAUTH_MESSAGE = 'Opnieuw inloggen om te synchroniseren'

export const AUTH_COLLECTION = 'users'

/** The part of the PocketBase client auth needs; the real client fits, and so does a mock. */
export interface AuthClient {
  authStore: BaseAuthStore
  collection(name: string): {
    authWithPassword(email: string, password: string): Promise<unknown>
    authRefresh(): Promise<unknown>
  }
}

/** Runs one sync round (T-0016). Sign-out calls it first; until T-0016 it does nothing. */
export type SyncNow = () => Promise<void>

export type SignInResult = { ok: true } | { ok: false; message: string }

export type SignOutResult = 'signed-out' | 'cancelled'

/** Asked when changes are still unsynced after the sync attempt; resolve true to sign out anyway. */
export type ConfirmUnsynced = (unsynced: number) => boolean | Promise<boolean>

export function authStateOf(store: BaseAuthStore): AuthState {
  if (store.isValid) return 'signed-in'
  if (store.token || store.record) return 'expired'
  return 'signed-out'
}

/** The NAS refused the token itself, as opposed to being unreachable. */
function isRejected(err: unknown): boolean {
  return err instanceof ClientResponseError && (err.status === 401 || err.status === 403)
}

/** Dutch, shown under the sign-in form (D-0020). */
export function signInMessage(err: unknown): string {
  if (err instanceof ClientResponseError) {
    if (err.isAbort) return 'Inloggen is afgebroken. Probeer het opnieuw.'
    if (err.status === 0) return 'Geen verbinding met de server. Probeer het later opnieuw.'
    if (err.status === 400 || err.status === 401 || err.status === 403) return 'E-mailadres of wachtwoord klopt niet.'
    if (err.status === 429) return 'Te veel pogingen. Wacht even en probeer het opnieuw.'
  }
  return 'Inloggen is mislukt. Probeer het later opnieuw.'
}

export interface AuthOptions {
  client: AuthClient
  db: DiyDb
  /** T-0016 passes its sync; until then sign-out has nothing to sync. */
  syncNow?: SyncNow
}

export function createAuth({ client, db, syncNow = async () => {} }: AuthOptions) {
  const store = client.authStore
  const users = () => client.collection(AUTH_COLLECTION)

  // The SDK clears its auth store itself on any 401. Remember the account so a refused token
  // reads as `expired` (sync paused), not as never signed in.
  let lastRecord: AuthRecord = store.record
  store.onChange((_token, record) => {
    if (record) lastRecord = record
  })

  /** Keeps the account (for the email field) but drops the refused token: state `expired`. */
  function markExpired() {
    store.save('', store.record ?? lastRecord)
  }

  return {
    state: (): AuthState => authStateOf(store),

    /** The signed-in (or expired) account, to prefill the email field. */
    record: (): AuthRecord => store.record,

    /** Calls `listener` on every sign-in, refresh, expiry and sign-out. Returns the unsubscribe. */
    subscribe(listener: () => void): () => void {
      return store.onChange(() => listener())
    },

    async signIn(email: string, password: string): Promise<SignInResult> {
      try {
        await users().authWithPassword(email.trim(), password)
        return { ok: true }
      } catch (err) {
        return { ok: false, message: signInMessage(err) }
      }
    },

    /**
     * For T-0016 to call after each successful sync: renews the 90-day token (D-0013).
     * A refused token makes the state `expired`; an unreachable NAS changes nothing. Never
     * throws, never touches local data.
     */
    async refreshAfterSync(): Promise<AuthState> {
      if (authStateOf(store) !== 'signed-in') return authStateOf(store)
      try {
        await users().authRefresh()
      } catch (err) {
        if (isRejected(err)) markExpired()
      }
      return authStateOf(store)
    },

    /**
     * For T-0016 to call when the NAS refuses a sync request with 401/403 (the SDK will
     * already have cleared its store on a 401): sync pauses and the outbox stays (D-0013).
     */
    markExpired,

    /** Unsynced changes on this device, for the sign-out warning. */
    unsynced: (): Promise<number> => countUnsynced(db),

    /**
     * D-0013: try to sync; if anything is still unsynced, ask `confirmUnsynced` with the
     * count and stop unless it says yes; then clear the local copy and the token.
     */
    async signOut(confirmUnsynced: ConfirmUnsynced): Promise<SignOutResult> {
      try {
        await syncNow()
      } catch {
        // Offline or the NAS refused: whatever is left is counted below.
      }
      const unsynced = await countUnsynced(db)
      if (unsynced > 0 && !(await confirmUnsynced(unsynced))) return 'cancelled'
      await clearLocalData(db)
      lastRecord = null
      store.clear()
      return 'signed-out'
    },
  }
}

export type Auth = ReturnType<typeof createAuth>
