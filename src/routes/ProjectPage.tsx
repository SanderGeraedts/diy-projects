import { Link, useParams } from '@tanstack/react-router'
import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatDate } from '../components/format'
import { PhotoImage } from '../components/PhotoImage'
import { StatusBadge } from '../components/StatusBadge'
import { AccentHeading, Tags } from '../components/ui'
import { useScrollToHash } from '../components/useScrollToHash'
import { db } from '../db/db'
import { AddEntryLink } from './AddEntry'
import { EntryNote } from './EntryNote'
import { ImportPhotos } from './ImportPhotos'
import { EditProjectLink } from './ProjectLinks'

const backLink = 'mb-3 inline-block text-sm text-grey no-underline hover:text-text'

export function ProjectPage() {
  const { projectId } = useParams({ from: '/projects/$projectId' })
  const project = useLiveQuery(() => db.projects.get(projectId).then((p) => p ?? null), [projectId])
  const entries = useLiveQuery(
    () => db.entries.where('[projectId+date]').between([projectId, ''], [projectId, Dexie.maxKey]).reverse().toArray(),
    [projectId],
  )
  // T-0009: every photo, deleted ones (tombstones, D-0002) included, so an entry whose photos
  // were all deleted can say so. Only the live ones are shown.
  const allPhotos = useLiveQuery(() => db.photos.where('projectId').equals(projectId).sortBy('takenAt'), [projectId])
  const photos = allPhotos?.filter((ph) => ph.deletedAt === null)
  useScrollToHash(!!project && entries !== undefined)

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
      <ImportPhotos projectId={project.id} />
      <ol className="timeline m-0 mt-8 list-none p-0">
        {(entries ?? []).map((e) => {
          const entryPhotos = (photos ?? []).filter((ph) => ph.entryId === e.id)
          const allDeleted =
            entryPhotos.length === 0 && e.note === '' && (allPhotos ?? []).some((ph) => ph.entryId === e.id)
          return (
            <li key={e.id} id={`entry-${e.id}`} className="mb-8 scroll-mt-20">
              <AccentHeading level={2}>
                <time dateTime={e.date}>{formatDate(e.date)}</time>
              </AccentHeading>
              {allDeleted && <p className="mt-2 mb-0 text-grey italic">Geen foto's meer</p>}
              <EntryNote entry={e} />
              <div className="grid grid-cols-2 gap-2">
                {entryPhotos.map((ph) => (
                  <Link
                    key={ph.id}
                    to="/projects/$projectId/photos/$photoId"
                    params={{ projectId, photoId: ph.id }}
                    className="block"
                  >
                    <PhotoImage
                      photo={ph}
                      file="thumbnail"
                      alt={`${project.title}, ${formatDate(e.date)}`}
                      className="aspect-[4/3] h-auto w-full rounded-card object-cover"
                    />
                  </Link>
                ))}
              </div>
            </li>
          )
        })}
      </ol>
    </article>
  )
}
