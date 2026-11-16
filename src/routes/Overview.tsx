import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { PhotoImage } from '../components/PhotoImage'
import { StatusBadge } from '../components/StatusBadge'
import { db } from '../db/db'

export function Overview() {
  const projects = useLiveQuery(() => db.projects.orderBy('updatedAt').reverse().toArray(), [])
  const covers = useLiveQuery(async () => {
    const ids = (projects ?? []).flatMap((p) => (p.coverPhotoId ? [p.coverPhotoId] : []))
    const photos = await db.photos.bulkGet(ids)
    return new Map(photos.flatMap((p) => (p ? [[p.id, p] as const] : [])))
  }, [projects])

  if (!projects) return null
  if (projects.length === 0) return <p className="empty">No projects yet.</p>

  return (
    <section>
      <h1 className="visually-hidden">Projects</h1>
      <ul className="project-grid">
        {projects.map((p) => {
          const cover = p.coverPhotoId ? covers?.get(p.coverPhotoId) : undefined
          return (
            <li key={p.id}>
              <Link to="/projects/$projectId" params={{ projectId: p.id }} className="project-card">
                <div className="cover">{cover && <PhotoImage photo={cover} alt="" />}</div>
                <div className="project-card-body">
                  <h2>{p.title}</h2>
                  <StatusBadge status={p.status} />
                  <ul className="tags">
                    {p.tags.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
