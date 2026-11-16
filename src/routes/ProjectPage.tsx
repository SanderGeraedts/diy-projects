import { Link, useParams } from '@tanstack/react-router'
import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { PhotoImage } from '../components/PhotoImage'
import { StatusBadge } from '../components/StatusBadge'
import { db } from '../db/db'

export function ProjectPage() {
  const { projectId } = useParams({ from: '/projects/$projectId' })
  const project = useLiveQuery(() => db.projects.get(projectId).then((p) => p ?? null), [projectId])
  const entries = useLiveQuery(
    () => db.entries.where('[projectId+date]').between([projectId, ''], [projectId, Dexie.maxKey]).reverse().toArray(),
    [projectId],
  )
  const photos = useLiveQuery(() => db.photos.where('projectId').equals(projectId).sortBy('takenAt'), [projectId])

  if (project === undefined) return null
  if (project === null) {
    return (
      <section>
        <h1>Project not found</h1>
        <Link to="/">Back to all projects</Link>
      </section>
    )
  }

  return (
    <article>
      <Link to="/" className="back">
        ← All projects
      </Link>
      <h1>{project.title}</h1>
      <div className="project-meta">
        <StatusBadge status={project.status} />
        <ul className="tags">
          {project.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      <p>{project.description}</p>
      <ol className="timeline">
        {(entries ?? []).map((e) => (
          <li key={e.id}>
            <h2>
              <time dateTime={e.date}>{e.date}</time>
            </h2>
            <p>{e.note}</p>
            <div className="entry-photos">
              {(photos ?? [])
                .filter((ph) => ph.entryId === e.id)
                .map((ph) => (
                  <PhotoImage key={ph.id} photo={ph} alt={`${project.title}, ${e.date}`} />
                ))}
            </div>
          </li>
        ))}
      </ol>
    </article>
  )
}
