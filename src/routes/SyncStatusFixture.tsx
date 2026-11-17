import { useState } from 'react'
import type { AuthState } from '../auth/auth'
import { SyncStatusView, type SyncView } from '../components/SyncStatus'
import { AccentHeading } from '../components/ui'
import { useOnline } from '../components/useOnline'
import type { SyncStatus } from '../sync/engine'

// T-0018: the sync status with a stubbed sync engine, for e2e tests. Sync runs only in
// production (D-0006), so the e2e build has no engine; this page feeds the real component a
// made-up status instead. Left out of production builds, like /design (see router.tsx).
// Pick a state with ?state=synced|pending|error|expired|storage. Offline is real: the
// page follows the browser's connection, so a test goes offline to see it.

export const FIXTURE_STATES = ['synced', 'pending', 'error', 'expired', 'storage'] as const
export type FixtureState = (typeof FIXTURE_STATES)[number]

const LAST_SUCCESS = '2026-11-17T09:30:00.000Z'

const synced: SyncStatus = {
  running: false,
  lastSuccessAt: LAST_SUCCESS,
  lastError: null,
  lastErrorAt: null,
  needsSignIn: false,
  pushed: 0,
  pulled: 0,
  nextRetryAt: null,
}

type Stub = { status: SyncStatus; unsynced: number; authState: AuthState; storagePersisted: boolean }

const STUBS: Record<FixtureState, Stub> = {
  synced: { status: synced, unsynced: 0, authState: 'signed-in', storagePersisted: true },
  pending: { status: synced, unsynced: 3, authState: 'signed-in', storagePersisted: true },
  error: {
    status: { ...synced, lastError: 'Geen verbinding met de server.', lastErrorAt: '2026-11-17T10:00:00.000Z' },
    unsynced: 2,
    authState: 'signed-in',
    storagePersisted: true,
  },
  expired: {
    status: { ...synced, needsSignIn: true, lastError: 'Opnieuw inloggen om te synchroniseren' },
    unsynced: 1,
    authState: 'expired',
    storagePersisted: true,
  },
  storage: { status: synced, unsynced: 0, authState: 'signed-in', storagePersisted: false },
}

function stateFromUrl(): FixtureState {
  const value = new URLSearchParams(window.location.search).get('state')
  return (FIXTURE_STATES as readonly string[]).includes(value ?? '') ? (value as FixtureState) : 'synced'
}

export function SyncStatusFixture() {
  const [stub, setStub] = useState<Stub>(() => STUBS[stateFromUrl()])
  const online = useOnline()

  // "Nu synchroniseren": a short run that succeeds and clears the outbox.
  function syncNow() {
    setStub((s) => ({ ...s, status: { ...s.status, running: true } }))
    setTimeout(() => {
      setStub((s) => ({
        ...s,
        unsynced: 0,
        status: { ...s.status, running: false, lastError: null, lastErrorAt: null, lastSuccessAt: new Date().toISOString() },
      }))
    }, 300)
  }

  const view: SyncView = { ...stub, pendingPhotos: null, online }
  return (
    <article className="space-y-4">
      <AccentHeading>Synchronisatiestatus</AccentHeading>
      <p className="m-0 text-grey italic">Testpagina met een nagebootste synchronisatie.</p>
      <div className="border border-grey-light">
        <SyncStatusView view={view} onSyncNow={syncNow} />
      </div>
    </article>
  )
}
