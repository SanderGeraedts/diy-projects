import { createRootRoute, createRoute, createRouter, lazyRouteComponent } from '@tanstack/react-router'
import { validateOverviewSearch } from './filters'
import { Layout } from './routes/Layout'
import { NotFound } from './routes/NotFound'
import { Overview } from './routes/Overview'
import { ProjectPage } from './routes/ProjectPage'
import { EditProjectPage, NewProjectPage } from './routes/ProjectForm'

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

const routeTree = rootRoute.addChildren([overviewRoute, projectRoute, newProjectRoute, editProjectRoute, ...designRoutes])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
