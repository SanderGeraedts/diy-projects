import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { pickCover } from '../components/cover'
import { ProjectCard } from '../components/ui'
import { db } from '../db/db'
import { NewProjectLink } from './ProjectLinks'

export function Overview() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
  // T-0009: the chosen cover, or the newest remaining photo once it is deleted.
  const covers = useLiveQuery(async () => {
    const list = projects ?? []
    const photos = await db.photos
      .where('projectId')
      .anyOf(list.map((p) => p.id))
      .toArray()
    return new Map(list.map((p) => [p.id, pickCover(p, photos)] as const))
  }, [projects])

  if (!projects) return null
  if (projects.length === 0)
    return (
      <section>
        <p className="text-grey italic">Nog geen projecten.</p>
        <NewProjectLink />
      </section>
    )

  return (
    <section>
      <h1 className="sr-only">Projecten</h1>
      <NewProjectLink />
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4 p-0">
        {projects.map((p) => (
          <li key={p.id}>
            <Link to="/projects/$projectId" params={{ projectId: p.id }} className="block text-text no-underline">
              <ProjectCard project={p} cover={covers?.get(p.id)} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
