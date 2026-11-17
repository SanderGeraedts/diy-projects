import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { db } from './db/db'
import { requestPersistentStorage } from './db/write'
import { router } from './router'
import { seedIfEmpty } from './seed/demo'
import { registerServiceWorker } from './sw/register'
import { startSync } from './sync/app'
import { deployContext } from './sync/config'
import './styles/app.css'

async function start() {
  // D-0002: unsynced items exist only on this device; ask the browser to keep them.
  void requestPersistentStorage()
  // D-0006: everything but production starts with demo projects.
  if (deployContext !== 'production') await seedIfEmpty(db)
  registerServiceWorker()
  // T-0016: production only; previews and dev have no sync engine (D-0006).
  startSync()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

void start()
