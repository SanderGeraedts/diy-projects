import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { db } from './db/db'
import { requestPersistentStorage } from './db/write'
import { router } from './router'
import { seedIfEmpty } from './seed/demo'
import { registerServiceWorker } from './sw/register'
import { deployContext } from './sync/config'
import './styles.css'

async function start() {
  // D-0002: unsynced items exist only on this device; ask the browser to keep them.
  void requestPersistentStorage()
  // D-0006: everything but production starts with demo projects.
  if (deployContext !== 'production') await seedIfEmpty(db)
  registerServiceWorker()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

void start()
