import { Link, Outlet } from '@tanstack/react-router'
import { auth, useAuthState } from '../auth/session'
import { SearchLink } from '../components/SearchLink'
import { UpdateBar } from '../components/UpdateBar'
import { deployContext, syncConfig } from '../sync/config'

const ACCOUNT_LINK = { 'signed-out': 'Inloggen', expired: 'Opnieuw inloggen', 'signed-in': 'Account' } as const

/** T-0015: only when sync is on (D-0006); previews and dev have no sign-in. */
function AccountLink() {
  const state = useAuthState()
  if (!auth) return null
  return (
    <Link to="/account" className="text-text underline decoration-accent decoration-2 underline-offset-4">
      {ACCOUNT_LINK[state]}
    </Link>
  )
}

export function Layout() {
  return (
    <>
      <header className="sticky top-0 z-10 flex items-start justify-between gap-4 bg-bg px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Link to="/" className="inline-block text-xl font-semibold text-text no-underline">
          DIY projects
          <span aria-hidden="true" className="mt-0.5 block h-1 w-full bg-accent" />
        </Link>
        <div className="flex items-center gap-4">
          <SearchLink />
          <AccountLink />
        </div>
      </header>
      {deployContext !== 'production' && (
        <p className="m-0 bg-grey-lighter px-4 py-1.5 text-sm" role="status">
          Demodata · synchronisatie staat uit ({deployContext})
        </p>
      )}
      {deployContext === 'production' && !syncConfig.enabled && (
        <p className="m-0 bg-grey-lighter px-4 py-1.5 text-sm" role="status">
          Alleen offline · {syncConfig.reason}
        </p>
      )}
      <main className="mx-auto max-w-5xl p-4">
        <Outlet />
      </main>
      <UpdateBar />
    </>
  )
}
