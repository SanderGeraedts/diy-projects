import { Link, useParams } from '@tanstack/react-router'
import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatDate } from '../components/format'
import { PhotoImage } from '../components/PhotoImage'
import { StatusBadge } from '../components/StatusBadge'
import { AccentHeading, Tags } from '../components/ui'
import { db } from '../db/db'
import { AddEntryLink } from './AddEntry'
import { EntryNote } from './EntryNote'
import { EditProjectLink } from './ProjectLinks'

const backLink = 'mb-3 inline-block text-sm text-grey no-underline hover:text-text'

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
        <AccentHeading>Project niet gevonden</AccentHeading>
        <p>
          <Link to="/" className={backLink}>
            ← Alle projecten
          </Link>
        </p>
      </section>
    )
  }

  return (
    <article>
      <Link to="/" className={backLink}>
        ← Alle projecten
      </Link>
      <header>
        <div className="flex items-start justify-between gap-3">
          <AccentHeading>{project.title}</AccentHeading>
          <EditProjectLink projectId={project.id} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-grey italic">
          <StatusBadge status={project.status} />
          <Tags tags={project.tags} />
        </div>
        <p className="mt-3">{project.description}</p>
      </header>
      <AddEntryLink projectId={project.id} />
      <ol className="timeline m-0 mt-8 list-none p-0">
        {(entries ?? []).map((e) => (
          <li key={e.id} className="mb-8">
            <AccentHeading level={2}>
              <time dateTime={e.date}>{formatDate(e.date)}</time>
            </AccentHeading>
            <EntryNote entry={e} />
            <div className="grid grid-cols-2 gap-2">
              {(photos ?? [])
                .filter((ph) => ph.entryId === e.id)
                .map((ph) => (
                  <PhotoImage
                    key={ph.id}
                    photo={ph}
                    alt={`${project.title}, ${formatDate(e.date)}`}
                    className="aspect-[4/3] h-auto w-full rounded-card object-cover"
                  />
                ))}
            </div>
          </li>
        ))}
      </ol>
    </article>
  )
}
