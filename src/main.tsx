import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { db } from './db/db'
import { requestPersistentStorage } from './db/write'
import { auth } from './auth/session'
import { isVisitorNow } from './public/mode'
import { router } from './router'
import { seedIfEmpty } from './seed/demo'
import { registerServiceWorker } from './sw/register'
import { startSync } from './sync/app'
import { deployContext } from './sync/config'
import './styles/app.css'

/** The owner's offline-first app: persistent storage and sync (D-0002). */
function startOwner() {
  // D-0002: unsynced items exist only on this device; ask the browser to keep them.
  void requestPersistentStorage()
  // T-0016: production only; previews and dev have no sync engine (D-0006).
  startSync()
}

async function start() {
  if (isVisitorNow()) {
    // T-0026 (D-0025): a visitor reads public projects online. Nothing is stored, queued or
    // synced on this device, so Dexie stays closed, until the owner signs in here.
    const owner = auth
    const stop = owner?.subscribe(() => {
      if (owner.state() === 'signed-out') return
      stop?.()
      startOwner()
    })
  } else {
    // D-0006: everything but production starts with demo projects.
    if (deployContext !== 'production') await seedIfEmpty(db)
    startOwner()
  }
  registerServiceWorker()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

void start()
