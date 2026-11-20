import { Link, useParams } from '@tanstack/react-router'
import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatDate } from '../components/format'
import { PhotoImage, type ShownPhoto } from '../components/PhotoImage'
import { StatusBadge } from '../components/StatusBadge'
import { AccentHeading, Tags } from '../components/ui'
import { useScrollToHash } from '../components/useScrollToHash'
import { db, type Entry, type Project } from '../db/db'
import { usePublic, useVisitor } from '../public/mode'
import { visitorTimeline } from '../public/source'
import { Unreachable } from '../public/ui'
import { AddEntryLink } from './AddEntry'
import { DeleteEntryButton, DeleteProjectButton } from './Delete'
import { EntryNote } from './EntryNote'
import { ImportPhotos } from './ImportPhotos'
import { entryDays, comparePhotos, photoNumber } from './paths'
import { SlugRedirect, useProjectBySlug } from './projectBySlug'
import { EditProjectLink } from './ProjectLinks'

const backLink = 'mb-3 inline-block text-sm text-grey no-underline hover:text-text'

/** T-0026: the owner's project from the device, a visitor's from the NAS (D-0025). */
export function ProjectPage() {
  return useVisitor() ? <VisitorProjectPage /> : <OwnerProjectPage />
}

function OwnerProjectPage() {
  const { slug } = useParams({ from: '/projects/$slug' })
  // T-0010: a deleted project (a tombstone, D-0014) and its deleted entries don't show.
  // T-0027: found by its slug, or an earlier one, which redirects (D-0029).
  const project = useProjectBySlug(slug)
  const projectId = project?.id ?? ''
  const entries = useLiveQuery(
    () =>
      db.entries
        .where('[projectId+date]')
        .between([projectId, ''], [projectId, Dexie.maxKey])
        .reverse()
        .filter((e) => e.deletedAt === null)
        .toArray(),
    [projectId],
  )
  // T-0009: every photo, deleted ones (tombstones, D-0002) included, so an entry whose photos
  // were all deleted can say so. Only the live ones are shown.
  const allPhotos = useLiveQuery(() => db.photos.where('projectId').equals(projectId).toArray(), [projectId])
  useScrollToHash(!!project && project.slug === slug && entries !== undefined)

  if (project === undefined) return null
  if (project === null) return <ProjectNotFound />
  if (project.slug !== slug) return <SlugRedirect slug={project.slug} />
  return <ProjectView project={project} entries={entries} allPhotos={allPhotos} readOnly={false} />
}

function VisitorProjectPage() {
  const { slug } = useParams({ from: '/projects/$slug' })
  const loaded = usePublic((source) => source.project(slug), `project:${slug}`)
  const ready = loaded.state === 'ready' && loaded.data !== null && loaded.data.project.slug === slug
  useScrollToHash(ready)

  if (loaded.state === 'loading') return null
  if (loaded.state === 'unreachable') return <Unreachable />
  if (loaded.data === null) return <ProjectNotFound />
  if (loaded.data.project.slug !== slug) return <SlugRedirect slug={loaded.data.project.slug} />
  const { entries, photos } = visitorTimeline(loaded.data)
  return <ProjectView project={loaded.data.project} entries={entries} allPhotos={photos} readOnly />
}

function ProjectNotFound() {
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

function ProjectView({
  project,
  entries,
  allPhotos,
  readOnly,
}: {
  project: Project
  /** Live entries, newest first. */
  entries: Entry[] | undefined
  /** By date taken; for the owner, deleted ones included. */
  allPhotos: ShownPhoto[] | undefined
  /** A visitor: no create, edit, import, cover or delete controls (T-0026). */
  readOnly: boolean
}) {
  const photos = allPhotos?.filter((ph) => ph.deletedAt === null).sort(comparePhotos)
  // T-0027: an entry is named by its day, in its anchor and its photos' addresses (D-0029).
  const days = entryDays(entries ?? [])
  return (
    <article>
      <Link to="/" className={backLink}>
        ← Alle projecten
      </Link>
      <header>
        <div className="flex items-start justify-between gap-3">
          <AccentHeading>{project.title}</AccentHeading>
          {!readOnly && <EditProjectLink slug={project.slug} />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-grey italic">
          <StatusBadge status={project.status} />
          <Tags tags={project.tags} />
        </div>
        <p className="mt-3">{project.description}</p>
      </header>
      {!readOnly && <AddEntryLink slug={project.slug} />}
      {!readOnly && <ImportPhotos projectId={project.id} />}
      <ol className="timeline m-0 mt-8 list-none p-0">
        {(entries ?? []).map((e) => {
          const entryPhotos = (photos ?? []).filter((ph) => ph.entryId === e.id)
          const allDeleted =
            entryPhotos.length === 0 && e.note === '' && (allPhotos ?? []).some((ph) => ph.entryId === e.id)
          const day = days.get(e.id) ?? e.date
          return (
            <li key={e.id} id={day} className="mb-8 scroll-mt-20">
              <AccentHeading level={2}>
                <time dateTime={e.date}>{formatDate(e.date)}</time>
              </AccentHeading>
              {allDeleted && <p className="mt-2 mb-0 text-grey italic">Geen foto's meer</p>}
              {readOnly ? (
                <div className="mt-2 mb-3">
                  {e.note !== '' && <p className="mt-0 mb-1 break-words whitespace-pre-wrap">{e.note}</p>}
                </div>
              ) : (
                <EntryNote entry={e} actions={<DeleteEntryButton entry={e} photos={entryPhotos.length} />} />
              )}
              <div className="grid grid-cols-2 gap-2">
                {entryPhotos.map((ph, i) => (
                  <Link
                    key={ph.id}
                    to="/projects/$slug/$day/$n"
                    params={{ slug: project.slug, day, n: photoNumber(i) }}
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
      {!readOnly && entries && photos && (
        <footer className="mt-8 border-t border-grey-light pt-4">
          <DeleteProjectButton project={project} entries={entries.length} photos={photos.length} />
        </footer>
      )}
    </article>
  )
}
