import { Link, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ClearFilters, Filters } from '../components/Filters'
import { ProjectCard } from '../components/ui'
import { db } from '../db/db'
import { filterProjects, tagsInUse } from '../filters'

export function Overview() {
  const filters = useSearch({ from: '/' })
  const all = useLiveQuery(() => db.projects.toArray(), [])
  const projects = all && filterProjects(all, filters)
  const covers = useLiveQuery(async () => {
    const ids = (all ?? []).flatMap((p) => (p.coverPhotoId ? [p.coverPhotoId] : []))
    const photos = await db.photos.bulkGet(ids)
    return new Map(photos.flatMap((p) => (p ? [[p.id, p] as const] : [])))
  }, [all])

  if (!all || !projects) return null
  if (filterProjects(all, {}).length === 0) return <p className="text-grey italic">Nog geen projecten.</p>

  return (
    <section>
      <h1 className="sr-only">Projecten</h1>
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
              <ProjectCard project={p} cover={p.coverPhotoId ? covers?.get(p.coverPhotoId) : undefined} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
