import { Link, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClearFilters, Filters } from '../components/Filters'
import { pickCover } from '../components/cover'
import type { ShownPhoto } from '../components/PhotoImage'
import { ProjectCard } from '../components/ui'
import { db, type Project } from '../db/db'
import { filterProjects, tagsInUse, type OverviewFilters } from '../filters'
import { usePublic, useVisitor } from '../public/mode'
import { Unreachable } from '../public/ui'
import { NewProjectLink } from './ProjectLinks'

/** T-0026: the owner's overview from the device, a visitor's from the NAS (D-0025). */
export function Overview() {
  return useVisitor() ? <VisitorOverview /> : <OwnerOverview />
}

function OwnerOverview() {
  const filters = useSearch({ from: '/' })
  const all = useLiveQuery(() => db.projects.toArray(), [])
  // T-0009: the chosen cover, or the newest remaining photo once it is deleted.
  const covers = useLiveQuery(async () => {
    const list = all ?? []
    const photos = await db.photos
      .where('projectId')
      .anyOf(list.map((p) => p.id))
      .toArray()
    return new Map(list.map((p) => [p.id, pickCover(p, photos)] as const))
  }, [all])

  if (!all) return null
  return <OverviewView all={all} covers={covers} filters={filters} readOnly={false} />
}

function VisitorOverview() {
  const filters = useSearch({ from: '/' })
  const loaded = usePublic((source) => source.overview(), 'overview')
  if (loaded.state === 'loading') return null
  if (loaded.state === 'unreachable') return <Unreachable />
  const { projects, photos } = loaded.data
  const covers = new Map(projects.map((p) => [p.id, pickCover(p, photos)] as const))
  return <OverviewView all={projects} covers={covers} filters={filters} readOnly />
}

function OverviewView({
  all,
  covers,
  filters,
  readOnly,
}: {
  all: Project[]
  covers: Map<string, ShownPhoto | undefined> | undefined
  filters: OverviewFilters
  /** A visitor: no create controls (T-0026). */
  readOnly: boolean
}) {
  const projects = filterProjects(all, filters)
  if (filterProjects(all, {}).length === 0)
    return (
      <section>
        <p className="text-grey italic">Nog geen projecten.</p>
        {!readOnly && <NewProjectLink />}
      </section>
    )

  return (
    <section>
      <h1 className="sr-only">Projecten</h1>
      {!readOnly && <NewProjectLink />}
      <Filters filters={filters} tags={tagsInUse(all)} />
      {projects.length === 0 && (
        <p className="text-grey italic">
          Geen projecten met deze filters. <ClearFilters />
        </p>
      )}
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4 p-0">
        {projects.map((p) => (
          <li key={p.id}>
            <Link to="/projects/$projectId" params={{ projectId: p.id }} className="block text-text no-underline">
              <ProjectCard project={p} cover={covers?.get(p.id)} coverFile={readOnly ? 'thumbnail' : 'copy'} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
