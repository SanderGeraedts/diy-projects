import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ProjectCard } from '../components/ui'
import { db } from '../db/db'

export function Overview() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
  const covers = useLiveQuery(async () => {
    const ids = (projects ?? []).flatMap((p) => (p.coverPhotoId ? [p.coverPhotoId] : []))
    const photos = await db.photos.bulkGet(ids)
    return new Map(photos.flatMap((p) => (p ? [[p.id, p] as const] : [])))
  }, [projects])

  if (!projects) return null
  if (projects.length === 0) return <p className="text-grey italic">Nog geen projecten.</p>

  return (
    <section>
      <h1 className="sr-only">Projecten</h1>
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
