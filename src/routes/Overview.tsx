import { Link, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClearFilters, Filters } from '../components/Filters'
import { pickCover } from '../components/cover'
import { ProjectCard } from '../components/ui'
import { db, type Photo, type Project } from '../db/db'
import { filterProjects, tagsInUse, type OverviewFilters } from '../filters'
import { usePublic, useVisitor } from '../public/mode'
import type { PublicPhoto } from '../public/source'
import { Unreachable } from '../public/ui'
import { BinLink } from './Bin'
import { NewProjectLink } from './ProjectLinks'

/** T-0026: the owner's overview from the device, a visitor's from the NAS (D-0025). */
export function Overview() {
  return useVisitor() ? <VisitorOverview /> : <OwnerOverview />
}

function OwnerOverview() {
  const filters = useSearch({ from: '/' })
  // T-0030 (D-0032): the projects and their photos in one query, so the cards render once,
  // already in order by newest photo. The photos also give the covers (T-0009).
  const loaded = useLiveQuery(async () => {
    const all = await db.projects.toArray()
    const photos = await db.photos
      .where('projectId')
      .anyOf(all.map((p) => p.id))
      .toArray()
    return { all, photos }
  }, [])

  if (!loaded) return null
  return <OverviewView all={loaded.all} photos={loaded.photos} filters={filters} readOnly={false} />
}

function VisitorOverview() {
  const filters = useSearch({ from: '/' })
  const loaded = usePublic((source) => source.overview(), 'overview')
  if (loaded.state === 'loading') return null
  if (loaded.state === 'unreachable') return <Unreachable />
  const { projects, photos } = loaded.data
  return <OverviewView all={projects} photos={photos} filters={filters} readOnly />
}

function OverviewView({
  all,
  photos,
  filters,
  readOnly,
}: {
  all: Project[]
  /** The projects' photos, tombstones included: for the order (D-0032) and the covers (T-0009). */
  photos: readonly (Photo | PublicPhoto)[]
  filters: OverviewFilters
  /** A visitor: no create controls (T-0026). */
  readOnly: boolean
}) {
  const projects = filterProjects(all, filters, photos)
  if (!all.some((p) => p.deletedAt === null))
    return (
      <section>
        <p className="text-grey italic">Nog geen projecten.</p>
        {!readOnly && <NewProjectLink />}
        {!readOnly && <BinLink />}
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
            <Link to="/projects/$slug" params={{ slug: p.slug }} className="block text-text no-underline">
              <ProjectCard project={p} cover={pickCover(p, photos)} coverFile={readOnly ? 'thumbnail' : 'copy'} />
            </Link>
          </li>
        ))}
      </ul>
      {/* T-0022: the bin, the owner's only. */}
      {!readOnly && <BinLink />}
    </section>
  )
}
