import { ClientResponseError } from 'pocketbase'
import { REAUTH_MESSAGE } from '../auth/auth'
import type { DiyDb, OutboxItem, SyncedTable } from '../db/db'
import { startBusy } from '../sw/busy'
import { fromServer, isNewer, SYNCED_TABLES, toServer, type LocalRecord, type ServerRecord } from './records'

// T-0016: the sync engine (D-0002). PocketBase on the NAS is the master; each run
//
// 1. pushes the outbox in order. A row is removed only after PocketBase has confirmed the
//    record state that includes it (D-0002); a failure keeps every row and the run retries
//    with backoff. Rows for one record are sent as one push of its current state, at the
//    place of its oldest row, so a project still goes up before its entries.
// 2. pulls what changed on the NAS since this device's cursor (PocketBase's `updated`) and
//    applies it with last-write-wins by `updatedAt`. A record with a change still in the
//    outbox is left alone: its push settles it.
// 3. renews the sign-in (D-0013).
//
// Last-write-wins itself is decided on the NAS (deploy/nas/pb_hooks/last_write_wins.pb.js):
// a push older than the stored record is kept in `history` and answered with the stored
// record, which this device then takes over. A newer push overwrites, and the NAS keeps the
// overwritten version in `history` (history.pb.js). So nothing is lost silently either way.
//
// One run at a time, across tabs (Web Locks). A refused sign-in (401/403) pauses sync and
// keeps the outbox (D-0013). Photo files are T-0017; photos sync here as records only.

/** The part of PocketBase's record API sync uses; the real client fits, and so does a fake. */
export interface RecordApi {
  getList(page: number, perPage: number, options?: Record<string, unknown>): Promise<{ items: ServerRecord[] }>
  create(body: Record<string, unknown>, options?: Record<string, unknown>): Promise<ServerRecord>
  update(id: string, body: Record<string, unknown>, options?: Record<string, unknown>): Promise<ServerRecord>
}

export interface SyncClient {
  authStore: { record: { id: string } | null }
  collection(name: string): RecordApi
}

/** The part of src/auth sync needs (T-0015's `Auth` fits). */
export interface SyncAuth {
  state(): 'signed-out' | 'signed-in' | 'expired'
  markExpired(): void
  refreshAfterSync(): Promise<unknown>
  subscribe?(listener: () => void): () => void
}

/** Runs `fn` while holding the one sync lock (across tabs in the browser). */
export type SyncLock = <T>(fn: () => Promise<T>) => Promise<T>

/** What T-0018 shows. Times are ISO strings. */
export interface SyncStatus {
  running: boolean
  /** The end of the last run that pushed and pulled without an error. */
  lastSuccessAt: string | null
  /** The last run's error in plain Dutch, null after a successful run. */
  lastError: string | null
  lastErrorAt: string | null
  /** The sign-in stopped the last run: sync waits until Sander signs in again (D-0013). */
  needsSignIn: boolean
  /** Outbox rows the NAS confirmed in the last run. */
  pushed: number
  /** Records the last run took over from the NAS. */
  pulled: number
  /** When the engine tries again after a failure, if it will. */
  nextRetryAt: string | null
}

export interface SyncEngineOptions {
  db: DiyDb
  client: SyncClient
  auth: SyncAuth
  lock?: SyncLock
  /** T-0019's busy registry, so an app update waits for a running sync. */
  busy?: (reason: string) => () => void
  /** Wait after a local change before syncing it (ms). */
  debounceMs?: number
  /** Backoff after a failed run: base doubles per failure up to max (ms). */
  retryBaseMs?: number
  retryMaxMs?: number
  /** Records per pull request. */
  pageSize?: number
}

export const BUSY_REASON = 'de synchronisatie'
export const LOCK_NAME = 'diy-projects-sync'

/**
 * Pull overlap: each pull starts this far before the cursor, so a record that the NAS saved
 * with an earlier `updated` but committed after a later one is still seen. Applying a
 * record twice changes nothing (last-write-wins on equal times keeps it).
 */
export const PULL_OVERLAP_MS = 60_000

const EPOCH_KEY = 'epoch'
const LAST_SUCCESS_KEY = 'lastSuccessAt'
const cursorKey = (table: SyncedTable) => `cursor:${table}`

/** The sync state was cleared under a running sync (sign-out): stop without writing. */
class Cancelled extends Error {
  constructor() {
    super('sync cancelled: the local copy was cleared')
  }
}

/** The sign-in was found refused after the fact (see `run`). */
class SignInRefused extends Error {
  constructor() {
    super('sync paused: the sign-in was refused')
  }
}

/** The NAS refused the sign-in: pause, keep the outbox (D-0013). */
function isAuthError(err: unknown): boolean {
  return err instanceof ClientResponseError && (err.status === 401 || err.status === 403)
}

/** What a request without a valid sign-in gets from owner-only rules. */
function mayBeSignedOut(err: unknown): boolean {
  return err instanceof ClientResponseError && (err.status === 400 || err.status === 404)
}

function errorMessage(err: unknown): string {
  if (err instanceof ClientResponseError) {
    if (err.isAbort || err.status === 0) return 'Geen verbinding met de server.'
    if (err.status === 429) return 'De server krijgt te veel verzoeken; later opnieuw.'
    if (err.status >= 500) return `De server gaf een fout (${err.status}); later opnieuw.`
    return `De server weigerde een wijziging (${err.status}).`
  }
  return 'Synchroniseren is mislukt.'
}

/** PocketBase writes `updated` as "2026-11-17 10:00:00.123Z". */
function shiftServerTime(time: string, ms: number): string {
  const parsed = Date.parse(time.replace(' ', 'T'))
  if (Number.isNaN(parsed)) return time
  return new Date(parsed + ms).toISOString().replace('T', ' ')
}

/** A PocketBase filter string literal. */
const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** One run at a time in this tab (where Web Locks are missing, e.g. in tests). */
function inTabLock(): SyncLock {
  let tail: Promise<unknown> = Promise.resolve()
  return <T>(fn: () => Promise<T>) => {
    const result = tail.then(fn, fn)
    tail = result.catch(() => {})
    return result
  }
}

/** Web Locks: one sync across all tabs of the app; falls back to one per tab. */
export function defaultLock(): SyncLock {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks?.request) return inTabLock()
  return <T>(fn: () => Promise<T>) => locks.request(LOCK_NAME, () => fn()) as Promise<T>
}

export function createSyncEngine(options: SyncEngineOptions) {
  const { db, client, auth } = options
  const lock = options.lock ?? defaultLock()
  const busy = options.busy ?? startBusy
  const debounceMs = options.debounceMs ?? 2_000
  const retryBaseMs = options.retryBaseMs ?? 5_000
  const retryMaxMs = options.retryMaxMs ?? 5 * 60_000
  const pageSize = options.pageSize ?? 200
  const requestOptions = { requestKey: null } // never let the SDK auto-cancel a sync request

  let status: SyncStatus = {
    running: false,
    lastSuccessAt: null,
    lastError: null,
    lastErrorAt: null,
    needsSignIn: false,
    pushed: 0,
    pulled: 0,
    nextRetryAt: null,
  }
  const listeners = new Set<() => void>()
  function update(patch: Partial<SyncStatus>) {
    status = { ...status, ...patch }
    for (const listener of [...listeners]) listener()
  }

  let failures = 0
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let debounceTimer: ReturnType<typeof setTimeout> | undefined

  // --- State on this device ---

  /** Marks this copy of the database, so a run notices when sign-out clears it. */
  async function ensureEpoch(): Promise<string> {
    return db.transaction('rw', db.syncState, async () => {
      const row = await db.syncState.get(EPOCH_KEY)
      if (row) return row.value
      const value = crypto.randomUUID()
      await db.syncState.put({ key: EPOCH_KEY, value })
      return value
    })
  }

  /** Inside a write transaction: stop if the local copy was cleared since the run began. */
  async function checkEpoch(epoch: string): Promise<void> {
    if ((await db.syncState.get(EPOCH_KEY))?.value !== epoch) throw new Cancelled()
  }

  // --- Push ---

  /** Create or update one record on the NAS under its own id; returns the stored record. */
  async function upsert(table: SyncedTable, record: LocalRecord): Promise<ServerRecord> {
    const api = client.collection(table)
    const body = toServer(table, record)
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await api.update(record.id, body, requestOptions)
      } catch (err) {
        if (!(err instanceof ClientResponseError && err.status === 404)) throw err
      }
      const owner = client.authStore.record?.id
      if (!owner) throw new ClientResponseError({ status: 401 })
      try {
        return await api.create({ id: record.id, owner, ...body }, requestOptions)
      } catch (err) {
        // 400 here can mean another push created it in between: update it instead.
        if (!(err instanceof ClientResponseError && err.status === 400)) throw err
        if (attempt === 1) throw err
      }
    }
    throw new Error('unreachable')
  }

  /** Pushes the outbox in order. Returns the rows confirmed; throws on the first failure. */
  async function push(epoch: string, counts: { pushed: number }): Promise<void> {
    for (;;) {
      const head = await db.outbox.orderBy('id').first()
      if (!head) return
      const table = db.table<LocalRecord, string>(head.table)
      // The record and every row for it, read together: the state pushed includes them all.
      const { rows, record } = await db.transaction('r', db.outbox, table, async () => ({
        rows: await db.outbox.where('[table+recordId]').equals([head.table, head.recordId]).toArray(),
        record: await table.get(head.recordId),
      }))
      const rowIds = rows.map((row: OutboxItem) => row.id!)

      if (!record) {
        // Records are never removed locally except with the outbox (sign-out), so a row
        // without its record has nothing to send. Drop it rather than block the queue.
        console.warn(`sync: outbox row for missing ${head.table}/${head.recordId} dropped`)
        await db.transaction('rw', db.outbox, db.syncState, async () => {
          await checkEpoch(epoch)
          await db.outbox.bulkDelete(rowIds)
        })
        continue
      }

      const stored = await upsert(head.table, record)

      // Confirmed: remove exactly the rows this push covered, and take over the NAS's
      // version if it won (an older push, kept in history on the NAS).
      await db.transaction('rw', db.outbox, table, db.syncState, async () => {
        await checkEpoch(epoch)
        await db.outbox.bulkDelete(rowIds)
        const local = await table.get(head.recordId)
        if (local && isNewer(String(stored.updatedAt ?? ''), local.updatedAt)) {
          const next = fromServer(head.table, stored, local)
          if (next) await table.put(next)
        }
      })
      counts.pushed += rowIds.length
    }
  }

  // --- Pull ---

  async function pullTable(tableName: SyncedTable, epoch: string, counts: { pulled: number }): Promise<void> {
    const api = client.collection(tableName)
    const table = db.table<LocalRecord, string>(tableName)
    const cursor = (await db.syncState.get(cursorKey(tableName)))?.value ?? ''
    // Keyset paging on (updated, id): stable while records change during the pull.
    let after: { updated: string; id: string } | null = null
    const since = cursor ? shiftServerTime(cursor, -PULL_OVERLAP_MS) : ''
    for (;;) {
      let filter = since ? `updated >= ${quote(since)}` : ''
      if (after) {
        filter = `(updated > ${quote(after.updated)} || (updated = ${quote(after.updated)} && id > ${quote(after.id)}))`
      }
      const page = await api.getList(1, pageSize, { filter, sort: 'updated,id', skipTotal: true, ...requestOptions })
      const items = page.items
      if (items.length === 0) return

      await db.transaction('rw', db.outbox, table, db.syncState, async () => {
        await checkEpoch(epoch)
        for (const remote of items) {
          const pending = await db.outbox.where('[table+recordId]').equals([tableName, remote.id]).count()
          if (pending > 0) continue // the push settles it
          const local = await table.get(remote.id)
          if (local && !isNewer(String(remote.updatedAt ?? ''), local.updatedAt)) continue
          const next = fromServer(tableName, remote, local)
          if (!next) continue // a photo without files here yet (T-0017)
          await table.put(next)
          counts.pulled++
        }
        const last = items[items.length - 1]!
        if (last.updated > cursor) await db.syncState.put({ key: cursorKey(tableName), value: last.updated })
      })
      const last = items[items.length - 1]!
      after = { updated: last.updated, id: last.id }
      if (items.length < pageSize) return
    }
  }

  // --- A run ---

  function scheduleRetry() {
    clearTimeout(retryTimer)
    const delay = Math.min(retryMaxMs, retryBaseMs * 2 ** Math.min(failures - 1, 16))
    update({ nextRetryAt: new Date(Date.now() + delay).toISOString() })
    retryTimer = setTimeout(() => void syncNow(), delay)
  }

  async function run(): Promise<void> {
    clearTimeout(retryTimer)
    update({ nextRetryAt: null })
    const state = auth.state()
    if (state !== 'signed-in') {
      // Nothing to do until Sander signs in (again); the outbox waits (D-0013).
      update({ needsSignIn: state === 'expired', lastError: state === 'expired' ? REAUTH_MESSAGE : null })
      return
    }

    const release = busy(BUSY_REASON)
    update({ running: true })
    const counts = { pushed: 0, pulled: 0 }
    let error: unknown = null
    try {
      const epoch = await ensureEpoch()
      try {
        await push(epoch, counts)
      } catch (err) {
        if (err instanceof Cancelled || isAuthError(err)) throw err
        error = err // still pull: records with a change in the outbox are left alone
      }
      for (const table of SYNCED_TABLES) {
        try {
          await pullTable(table, epoch, counts)
        } catch (err) {
          if (err instanceof Cancelled || isAuthError(err)) throw err
          error ??= err
        }
      }
      if (error) {
        // PocketBase treats a refused token as no sign-in at all: a push then comes back as
        // 404/400, not 401. Ask the sign-in itself before calling it a refused change.
        if (mayBeSignedOut(error)) await auth.refreshAfterSync()
        if (auth.state() !== 'signed-in') throw new SignInRefused()
        throw error
      }

      // D-0013: every successful sync renews the 90-day sign-in. It also tells a run that
      // went through as a guest (nothing pushed, nothing visible) from a real one.
      await auth.refreshAfterSync()
      if (auth.state() !== 'signed-in') throw new SignInRefused()

      const now = new Date().toISOString()
      await db.transaction('rw', db.syncState, async () => {
        await checkEpoch(epoch)
        await db.syncState.put({ key: LAST_SUCCESS_KEY, value: now })
      })
      failures = 0
      update({ lastSuccessAt: now, lastError: null, lastErrorAt: null, needsSignIn: false, ...counts })
    } catch (err) {
      if (err instanceof Cancelled) {
        update({ ...counts })
      } else if (isAuthError(err) || err instanceof SignInRefused) {
        auth.markExpired()
        update({ needsSignIn: true, lastError: REAUTH_MESSAGE, lastErrorAt: new Date().toISOString(), ...counts })
      } else {
        console.warn('sync failed', err)
        failures++
        update({ lastError: errorMessage(err), lastErrorAt: new Date().toISOString(), ...counts })
        scheduleRetry()
      }
    } finally {
      update({ running: false })
      release()
    }
  }

  // One run at a time: a call while one runs gets one follow-up run, shared by every caller.
  let current: Promise<void> | null = null
  let queued: Promise<void> | null = null

  /** Runs a sync now (or right after the running one). Never rejects; see `getStatus()`. */
  function syncNow(): Promise<void> {
    if (!current) {
      current = lock(run)
        .catch((err) => console.warn('sync failed', err))
        .finally(() => {
          current = null
        })
      return current
    }
    queued ??= current.then(() => {
      queued = null
      return syncNow()
    })
    return queued
  }

  /** Sync a little after a local change, so a burst of edits goes up in one run. */
  function syncSoon(): void {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => void syncNow(), debounceMs)
  }

  const stops: (() => void)[] = []

  /**
   * Starts syncing on its own (D-0002, T-0016): now, when the app comes back online or into
   * view, after a sign-in, and shortly after each local change. Returns `stop`.
   */
  function start(): () => void {
    const on = (target: EventTarget, type: string, fn: () => void) => {
      target.addEventListener(type, fn)
      stops.push(() => target.removeEventListener(type, fn))
    }
    if (typeof window !== 'undefined') on(window, 'online', () => void syncNow())
    if (typeof document !== 'undefined') {
      on(document, 'visibilitychange', () => {
        if (document.visibilityState === 'visible') void syncNow()
      })
    }
    if (auth.subscribe) {
      let was = auth.state()
      stops.push(
        auth.subscribe(() => {
          const now = auth.state()
          if (now === 'signed-in' && was !== 'signed-in') void syncNow()
          was = now
        }),
      )
    }
    // Every write adds an outbox row in the same transaction (src/db/write.ts).
    const onOutbox = () => syncSoon()
    db.outbox.hook('creating', onOutbox)
    stops.push(() => db.outbox.hook('creating').unsubscribe(onOutbox))

    void loadStatus().then(() => syncNow())
    return stop
  }

  /** Stops the automatic runs and pending retries. A running sync finishes. */
  function stop(): void {
    for (const fn of stops.splice(0)) fn()
    clearTimeout(retryTimer)
    clearTimeout(debounceTimer)
  }

  async function loadStatus(): Promise<void> {
    const row = await db.syncState.get(LAST_SUCCESS_KEY)
    if (row && !status.lastSuccessAt) update({ lastSuccessAt: row.value })
  }

  return {
    syncNow,
    syncSoon,
    start,
    stop,
    getStatus: (): SyncStatus => status,
    /** Calls `listener` on every status change. Returns the unsubscribe. */
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export type SyncEngine = ReturnType<typeof createSyncEngine>
