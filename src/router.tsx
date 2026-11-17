import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { validateOverviewSearch } from './filters'
import { AddEntryPage } from './routes/AddEntry'
import { Layout } from './routes/Layout'
import { NotFound } from './routes/NotFound'
import { Overview } from './routes/Overview'
import { ProjectPage } from './routes/ProjectPage'
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
const newProjectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/new', component: NewProjectPage })
const editProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/edit',
  component: EditProjectPage,
})

// T-0005: add a note to a project's timeline.
const addEntryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/entries/new',
  component: AddEntryPage,
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
  component: SearchPage,
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
  ...designRoutes,
  ...accountRoutes,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
