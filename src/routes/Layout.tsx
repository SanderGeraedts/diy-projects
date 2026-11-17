import { Link, Outlet } from '@tanstack/react-router'
import { SearchLink } from '../components/SearchLink'
import { deployContext, syncConfig } from '../sync/config'

export function Layout() {
  return (
    <>
      <header className="sticky top-0 z-10 flex items-center justify-between bg-bg px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <Link to="/" className="inline-block text-xl font-semibold text-text no-underline">
          DIY projects
          <span aria-hidden="true" className="mt-0.5 block h-1 w-full bg-accent" />
        </Link>
        <SearchLink />
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
    </>
  )
}
