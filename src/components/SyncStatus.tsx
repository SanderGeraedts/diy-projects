import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useId, useState } from 'react'
import { REAUTH_MESSAGE, type AuthState } from '../auth/auth'
import { useAuthState } from '../auth/session'
import { db } from '../db/db'
import { countUnsynced, storagePersisted } from '../db/write'
import { syncEngine, syncNow, useSyncStatus } from '../sync/app'
import type { SyncEngine, SyncStatus } from '../sync/engine'
import { useOnline } from './useOnline'

// T-0018: the sync status under the header (D-0002). Shown only where sync runs, a
// production build with an address (D-0006); previews and dev keep the demo banner instead.
// It only reads: counts from src/db, state from the sync engine and the sign-in.

/** Everything the status shows. */
export interface SyncView {
  status: SyncStatus
  /** Outbox rows: changes the NAS hasn't confirmed (countUnsynced). */
  unsynced: number
  /** Photos with files still to upload; null until T-0017 provides the count. */
  pendingPhotos: number | null
  authState: AuthState
  online: boolean
  /** Whether the browser granted persistent storage; null while unknown. */
  storagePersisted: boolean | null
}

export const OFFLINE_MESSAGE = 'Offline – wijzigingen worden later gesynchroniseerd'
export const STORAGE_MESSAGE = 'Opslag niet beveiligd – installeer de app'

export function pendingLabel(unsynced: number, pendingPhotos: number | null): string | null {
  const parts: string[] = []
  if (unsynced > 0) parts.push(unsynced === 1 ? '1 wijziging' : `${unsynced} wijzigingen`)
  if (pendingPhotos) parts.push(pendingPhotos === 1 ? '1 foto' : `${pendingPhotos} foto's`)
  return parts.length ? `${parts.join(', ')} niet gesynchroniseerd` : null
}

const timeFormat = new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })

function formatTime(iso: string | null): string | null {
  return iso ? timeFormat.format(new Date(iso)) : null
}

type Summary = { kind: 'sign-in' } | { kind: 'text'; text: string }

/** The one line under the header, or null when there is nothing to say. */
export function summarize(view: SyncView): Summary | null {
  if (view.authState !== 'signed-in' || view.status.needsSignIn) return { kind: 'sign-in' }
  const pending = pendingLabel(view.unsynced, view.pendingPhotos)
  if (!view.online) return { kind: 'text', text: OFFLINE_MESSAGE }
  if (view.status.lastError) {
    return { kind: 'text', text: pending ? `Synchroniseren mislukt · ${pending}` : 'Synchroniseren mislukt' }
  }
  if (pending) return { kind: 'text', text: pending }
  if (view.storagePersisted === false) return { kind: 'text', text: STORAGE_MESSAGE }
  return null
}

const bar = 'm-0 flex flex-wrap items-center gap-x-3 bg-grey-lighter px-4 py-1.5 text-sm'
const action =
  'inline-block cursor-pointer border-0 bg-transparent p-0 text-left font-sans text-sm text-text underline decoration-accent decoration-2 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const button =
  'rounded-card border border-text bg-text px-4 py-2 font-semibold text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60'

function StorageWarning() {
  return (
    <p className="m-0">
      Deze browser mag de gegevens op dit apparaat wissen als er weinig ruimte is; wat nog niet
      gesynchroniseerd is, gaat dan verloren. Installeer de app (in Chrome: menu › App installeren)
      zodat de opslag bewaard blijft.
    </p>
  )
}

function Details({ view, onSyncNow }: { view: SyncView; onSyncNow: () => void }) {
  const { status } = view
  const pending = pendingLabel(view.unsynced, view.pendingPhotos)
  const errorAt = formatTime(status.lastErrorAt)
  return (
    <div className="space-y-3 border-b border-grey-light bg-bg px-4 py-3 text-sm">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        <dt className="text-grey">Status</dt>
        <dd className="m-0">{pending ?? 'Alles is gesynchroniseerd'}</dd>
        <dt className="text-grey">Laatst gesynchroniseerd</dt>
        <dd className="m-0">{formatTime(status.lastSuccessAt) ?? 'Nog niet op dit apparaat'}</dd>
        {status.lastError && !status.needsSignIn && (
          <>
            <dt className="text-grey">Laatste fout</dt>
            <dd className="m-0">
              {status.lastError}
              {errorAt && <span className="text-grey"> ({errorAt})</span>}
            </dd>
          </>
        )}
      </dl>
      {!view.online && <p className="m-0">{OFFLINE_MESSAGE}.</p>}
      {view.storagePersisted === false && <StorageWarning />}
      <button type="button" className={button} onClick={onSyncNow} disabled={status.running || !view.online}>
        {status.running ? 'Bezig met synchroniseren…' : 'Nu synchroniseren'}
      </button>
    </div>
  )
}

/** The status itself, without any wiring: what T-0018's tests render. */
export function SyncStatusView({ view, onSyncNow }: { view: SyncView; onSyncNow: () => void }) {
  const [open, setOpen] = useState(false)
  const detailsId = useId()
  const summary = summarize(view)
  if (!summary) return null

  if (summary.kind === 'sign-in') {
    const pending = pendingLabel(view.unsynced, view.pendingPhotos)
    return (
      <section aria-label="Synchronisatie" className={bar}>
        {pending && <span>{pending}</span>}
        <Link to="/account" className={action}>
          {REAUTH_MESSAGE}
        </Link>
      </section>
    )
  }

  return (
    <section aria-label="Synchronisatie">
      <p className={bar}>
        <button
          type="button"
          className={action}
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((o) => !o)}
        >
          {summary.text}
        </button>
      </p>
      <div id={detailsId} hidden={!open}>
        {open && <Details view={view} onSyncNow={onSyncNow} />}
      </div>
    </section>
  )
}

/** D-0002: the answer from `navigator.storage.persist()`, once main.tsx has it. */
function useStoragePersisted(): boolean | null {
  const [value, setValue] = useState(storagePersisted)
  useEffect(() => {
    if (value !== null) return
    const timer = setInterval(() => {
      if (storagePersisted !== null) {
        setValue(storagePersisted)
        clearInterval(timer)
      }
    }, 250)
    return () => clearInterval(timer)
  }, [value])
  return value
}

function LiveSyncStatus({ engine }: { engine: SyncEngine }) {
  const status = useSyncStatus(engine)!
  const unsynced = useLiveQuery(() => countUnsynced(db), [], 0)
  const authState = useAuthState()
  const online = useOnline()
  const persisted = useStoragePersisted()
  const view: SyncView = { status, unsynced, pendingPhotos: null, authState, online, storagePersisted: persisted }
  return <SyncStatusView view={view} onSyncNow={() => void syncNow()} />
}

/** For the layout: the live status where sync runs, nothing elsewhere (D-0006). */
export function SyncStatusBar() {
  return syncEngine ? <LiveSyncStatus engine={syncEngine} /> : null
}
