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
import { startSync, syncEngine } from './sync/app'
import { makeCard, makeThumbnail, measureImage } from './photos'
import { createThumbnailChecker } from './photos/rebuild'
import { deployContext } from './sync/config'
import './styles/app.css'

/** The owner's offline-first app: persistent storage and sync (D-0002). */
function startOwner() {
  // D-0002: unsynced items exist only on this device; ask the browser to keep them.
  void requestPersistentStorage()
  // T-0016: production only; previews and dev have no sync engine (D-0006).
  startSync()
  startThumbnailCheck()
}

/**
 * T-0037 (D-0038): brings this device's older thumbnails up to the current size, and makes the
 * card images it lacks (T-0040, D-0041), in the background and unseen; again after a sync run
 * that took photos over from the NAS.
 */
function startThumbnailCheck() {
  const checker = createThumbnailChecker({ db, measure: measureImage, makeThumbnail, makeCard })
  const engine = syncEngine
  // T-0038: a sync after each pass sends the rebuilt thumbnails to the NAS (D-0039).
  const check = () => void checker.check().then(() => engine?.syncSoon())
  // Out of the way of the first screen.
  setTimeout(check, 1000)
  let wasRunning = false
  engine?.subscribe(() => {
    const status = engine.getStatus()
    if (wasRunning && !status.running && status.pulled > 0) check()
    wasRunning = status.running
  })
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
