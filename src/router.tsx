import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { validateOverviewSearch } from './filters'
import { AddEntryPage } from './routes/AddEntry'
import { BinPage } from './routes/Bin'
import { Layout } from './routes/Layout'
import { NotFound } from './routes/NotFound'
import { Overview } from './routes/Overview'
import { ProjectPage } from './routes/ProjectPage'
import { ownerOnly } from './public/ui'
import { syncConfig } from './sync/config'
import { EditProjectPage, NewProjectPage } from './routes/ProjectForm'
import { SearchPage, validateSearchParams } from './routes/SearchPage'
import { PhotoViewer } from './viewer/PhotoViewer'

const rootRoute = createRootRoute({ component: Layout, notFoundComponent: NotFound })

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Overview,
  validateSearch: validateOverviewSearch,
})

const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: ProjectPage,
})

// T-0004: the project form. A static segment outranks $projectId, so /projects/new is the form.
// T-0026: pages that write, and search over the device's copy, are the owner's only; a
// visitor gets "Niet gevonden" (D-0025).
const newProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/new',
  component: ownerOnly(NewProjectPage),
})
const editProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/edit',
  component: ownerOnly(EditProjectPage),
})

// T-0005: add a note to a project's timeline.
const addEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/entries/new',
  component: ownerOnly(AddEntryPage),
})

// T-0008: the full-screen photo viewer has its own URL, so back closes it and reload reopens it.
const photoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/photos/$photoId',
  component: PhotoViewer,
})

const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/zoeken',
  validateSearch: validateSearchParams,
  component: ownerOnly(SearchPage),
})

// T-0022 (D-0014): the bin, the owner's only; a visitor gets "Niet gevonden".
const binRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/prullenbak',
  component: ownerOnly(BinPage),
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

const routeTree = rootRoute.addChildren([
  overviewRoute,
  projectRoute,
  newProjectRoute,
  editProjectRoute,
  addEntryRoute,
  photoRoute,
  searchRoute,
  binRoute,
  ...designRoutes,
  ...accountRoutes,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
