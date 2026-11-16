import { Link, Outlet } from '@tanstack/react-router'
import { deployContext, syncConfig } from '../sync/config'

export function Layout() {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-title">
          DIY projects
        </Link>
      </header>
      {deployContext !== 'production' && (
        <p className="demo-banner" role="status">
          Demo data · sync is off ({deployContext})
        </p>
      )}
      {deployContext === 'production' && !syncConfig.enabled && (
        <p className="demo-banner" role="status">
          Offline only · {syncConfig.reason}
        </p>
      )}
      <main className="app-main">
        <Outlet />
      </main>
    </>
  )
}
