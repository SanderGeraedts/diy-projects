import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { Layout } from './routes/Layout'
import { NotFound } from './routes/NotFound'
import { Overview } from './routes/Overview'
import { ProjectPage } from './routes/ProjectPage'
import { syncConfig } from './sync/config'

const rootRoute = createRootRoute({ component: Layout, notFoundComponent: NotFound })

const overviewRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: Overview })

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: ProjectPage,
})

// D-0020: /design exists in every build but production. __DEPLOY_CONTEXT__ is replaced at
// build time, so in production this branch and the page's chunk are dropped.
const designRoutes =
  __DEPLOY_CONTEXT__ !== 'production'
    ? [
        createRoute({
          getParentRoute: () => rootRoute,
          path: '/design',
          component: lazyRouteComponent(() => import('./routes/DesignPage'), 'DesignPage'),
        }),
        // T-0018: the sync status with a stubbed engine, for e2e tests (sync is production-only).
        createRoute({
          getParentRoute: () => rootRoute,
          path: '/design/sync-status',
          component: lazyRouteComponent(() => import('./routes/SyncStatusFixture'), 'SyncStatusFixture'),
        }),
      ]
    : []

// T-0015: sign-in exists only when sync is on, a production build with an address (D-0006).
const accountRoutes = syncConfig.enabled
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/account',
        component: lazyRouteComponent(() => import('./routes/AccountPage'), 'AccountPage'),
      }),
    ]
  : []

const routeTree = rootRoute.addChildren([overviewRoute, projectRoute, ...designRoutes, ...accountRoutes])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
