import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SyncStatus } from '../sync/engine'
import { OFFLINE_MESSAGE, pendingLabel, STORAGE_MESSAGE, SyncStatusBar, SyncStatusView, type SyncView } from './SyncStatus'

const synced: SyncStatus = {
  running: false,
  lastSuccessAt: '2026-11-17T09:30:00.000Z',
  lastError: null,
  lastErrorAt: null,
  needsSignIn: false,
  pushed: 0,
  pulled: 0,
  uploaded: 0,
  photoUpload: null,
  nextRetryAt: null,
}

function view(patch: Partial<SyncView> = {}): SyncView {
  return {
    status: synced,
    unsynced: 0,
    pendingPhotos: null,
    authState: 'signed-in',
    online: true,
    storagePersisted: true,
    ...patch,
  }
}

/** Renders inside a router, for the sign-in link. */
async function renderInRouter(ui: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => ui }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const result = render(<RouterProvider router={router} />)
  await act(() => router.load())
  return result
}

describe('pendingLabel', () => {
  it('counts changes and photos in Dutch', () => {
    expect(pendingLabel(0, null)).toBeNull()
    expect(pendingLabel(1, null)).toBe('1 wijziging niet gesynchroniseerd')
    expect(pendingLabel(3, 12)).toBe("3 wijzigingen, 12 foto's niet gesynchroniseerd")
    expect(pendingLabel(0, 1)).toBe('1 foto niet gesynchroniseerd')
  })
})

describe('SyncStatusView', () => {
  afterEach(cleanup)

  it('shows nothing when everything is synced', () => {
    const { container } = render(<SyncStatusView view={view()} onSyncNow={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the count and opens details with the last sync and "Nu synchroniseren"', () => {
    const onSyncNow = vi.fn()
    render(<SyncStatusView view={view({ unsynced: 3 })} onSyncNow={onSyncNow} />)
    const summary = screen.getByRole('button', { name: '3 wijzigingen niet gesynchroniseerd' })
    expect(summary).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Laatst gesynchroniseerd')).not.toBeInTheDocument()
    fireEvent.click(summary)
    expect(summary).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Laatst gesynchroniseerd').nextElementSibling).toHaveTextContent('2026')
    fireEvent.click(screen.getByRole('button', { name: 'Nu synchroniseren' }))
    expect(onSyncNow).toHaveBeenCalledOnce()
  })

  it('shows the last error in Dutch', () => {
    const status = { ...synced, lastError: 'Geen verbinding met de server.', lastErrorAt: '2026-11-17T10:00:00.000Z' }
    render(<SyncStatusView view={view({ status, unsynced: 2 })} onSyncNow={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Synchroniseren mislukt · 2 wijzigingen niet gesynchroniseerd' }))
    expect(screen.getByText('Laatste fout').nextElementSibling).toHaveTextContent('Geen verbinding met de server.')
  })

  it('says it is offline, and can\'t sync now', () => {
    render(<SyncStatusView view={view({ unsynced: 2, online: false })} onSyncNow={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: OFFLINE_MESSAGE }))
    expect(screen.getByRole('button', { name: 'Nu synchroniseren' })).toBeDisabled()
  })

  it('shows a running sync', () => {
    render(<SyncStatusView view={view({ unsynced: 1, status: { ...synced, running: true } })} onSyncNow={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: '1 wijziging niet gesynchroniseerd' }))
    expect(screen.getByRole('button', { name: 'Bezig met synchroniseren…' })).toBeDisabled()
  })

  it('warns when storage is not persistent, with how to fix it', () => {
    render(<SyncStatusView view={view({ storagePersisted: false })} onSyncNow={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: STORAGE_MESSAGE }))
    expect(screen.getByText(/Installeer de app/)).toBeInTheDocument()
  })

  it('links to the sign-in when it expired or is missing (D-0013)', async () => {
    for (const patch of [
      { authState: 'expired', status: { ...synced, needsSignIn: true } },
      { authState: 'signed-out' },
      { status: { ...synced, needsSignIn: true } },
    ] as Partial<SyncView>[]) {
      await renderInRouter(<SyncStatusView view={view({ unsynced: 1, ...patch })} onSyncNow={() => {}} />)
      const link = screen.getByRole('link', { name: 'Opnieuw inloggen om te synchroniseren' })
      expect(link).toHaveAttribute('href', '/account')
      expect(screen.getByText('1 wijziging niet gesynchroniseerd')).toBeInTheDocument()
      cleanup()
    }
  })
})

describe('SyncStatusBar', () => {
  afterEach(cleanup)

  it('renders nothing where sync is off (tests, dev, previews: D-0006)', () => {
    const { container } = render(<SyncStatusBar />)
    expect(container).toBeEmptyDOMElement()
  })
})
