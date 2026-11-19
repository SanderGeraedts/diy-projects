import { useEffect, useState } from 'react'
import type { AuthState } from '../auth/auth'
import { auth, useAuthState } from '../auth/session'
import { syncConfig } from '../sync/config'
import { createDemoSource, createPocketBaseSource, UnreachableError, visitorClient, type PublicSource } from './source'

// T-0026 (D-0025): visitor mode. In production, whoever isn't signed in on this device is a
// visitor: the overview, project page, timeline and photo viewer read public projects online
// (./source.ts), with no create, edit or delete controls, and the app never opens Dexie, the
// outbox or sync for them. An expired sign-in is still the owner (D-0013: local data stays
// usable). Signing in switches to the owner's offline-first app.
//
// D-0006: previews and dev have no NAS and no sign-in. There `?bezoeker` turns on a visitor
// view of the seeded demo data (from memory), `?bezoeker=onbereikbaar` one whose NAS can't be
// reached, and `?bezoeker=uit` turns it off again; it lasts for the browser tab.

export type VisitorDemo = 'on' | 'unreachable' | null

const DEMO_KEY = 'diy-projects:visitor-demo'

function readDemo(): VisitorDemo {
  try {
    const param = new URLSearchParams(window.location.search).get('bezoeker')
    if (param === 'uit') sessionStorage.removeItem(DEMO_KEY)
    else if (param !== null) sessionStorage.setItem(DEMO_KEY, param === 'onbereikbaar' ? 'unreachable' : 'on')
    const stored = sessionStorage.getItem(DEMO_KEY)
    return stored === 'on' || stored === 'unreachable' ? stored : null
  } catch {
    return null
  }
}

/** Never in production: __DEPLOY_CONTEXT__ is replaced at build time, so this is dropped there. */
export const visitorDemo: VisitorDemo = __DEPLOY_CONTEXT__ !== 'production' ? readDemo() : null

export function isVisitor(syncEnabled: boolean, state: AuthState, demo: VisitorDemo = null): boolean {
  return demo !== null || (syncEnabled && state === 'signed-out')
}

/** Whether this device shows the visitor view right now (main.tsx, at start-up). */
export function isVisitorNow(): boolean {
  return isVisitor(syncConfig.enabled, auth ? auth.state() : 'signed-out', visitorDemo)
}

/** Whether to show the visitor view, re-rendering on sign-in and sign-out. */
export function useVisitor(): boolean {
  return isVisitor(syncConfig.enabled, useAuthState(), visitorDemo)
}

const unavailable: PublicSource = {
  overview: () => Promise.reject(new UnreachableError()),
  project: () => Promise.reject(new UnreachableError()),
}

let source: PublicSource | null = null

/** Where visitors read from: the NAS in production, the demo data in a preview or dev. */
export function publicSource(): PublicSource {
  source ??= visitorDemo
    ? createDemoSource(visitorDemo)
    : syncConfig.enabled
      ? createPocketBaseSource(visitorClient(syncConfig.url))
      : unavailable
  return source
}

export type Loaded<T> = { state: 'loading' } | { state: 'ready'; data: T } | { state: 'unreachable' }

/** Loads public data when a page opens (D-0025: visitors read online). */
export function usePublic<T>(load: (source: PublicSource) => Promise<T>, key: string): Loaded<T> {
  const [loaded, setLoaded] = useState<{ key: string; value: Loaded<T> }>({ key, value: { state: 'loading' } })
  useEffect(() => {
    let current = true
    load(publicSource()).then(
      (data) => current && setLoaded({ key, value: { state: 'ready', data } }),
      (err: unknown) => {
        if (!(err instanceof UnreachableError)) console.error(err)
        if (current) setLoaded({ key, value: { state: 'unreachable' } })
      },
    )
    return () => {
      current = false
    }
    // `key` stands for `load`'s inputs.
  }, [key])
  return loaded.key === key ? loaded.value : { state: 'loading' }
}
