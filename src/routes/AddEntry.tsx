import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Button, Field, inputClass } from '../components/form'
import { formatDate } from '../components/format'
import { appendNote, todayIso } from '../components/notes'
import { AccentHeading } from '../components/ui'
import { db, type Entry, type Project } from '../db/db'
import { addEntry, updateEntry } from '../db/write'
import { secondaryLinkClass } from './ProjectLinks'

// T-0005: add a note to a project's timeline for a chosen day (today by default). There is
// at most one entry per project per day (D-0003), so a day that has one opens that entry:
// its note is shown and the new note is added under it. Writes go through the write API.

const backLink = 'mb-3 inline-block text-sm text-grey no-underline hover:text-text'
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

/** The live entry of a project for a day, if any. A read query; the write API has none. */
export function findEntry(projectId: string, date: string): Promise<Entry | undefined> {
  return db.entries
    .where('[projectId+date]')
    .equals([projectId, date])
    .filter((e) => e.deletedAt === null)
    .first()
}

export function AddEntryLink({ projectId }: { projectId: string }) {
  return (
    <p className="mt-6 mb-0">
      <Link to="/projects/$projectId/entries/new" params={{ projectId }} className={secondaryLinkClass}>
        + Notitie toevoegen
      </Link>
    </p>
  )
}

export function AddEntryPage() {
  const { projectId } = useParams({ from: '/projects/$projectId/entries/new' })
  const navigate = useNavigate()
  const project = useLiveQuery(
    () => db.projects.get(projectId).then((p): Project | null => (p && p.deletedAt === null ? p : null)),
    [projectId],
  )
  const [date, setDate] = useState(todayIso)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // undefined while loading, null when the day has no entry yet.
  const existing = useLiveQuery(
    () => (isDate(date) ? findEntry(projectId, date).then((e) => e ?? null) : null),
    [projectId, date],
  )
  const toProject = () => navigate({ to: '/projects/$projectId', params: { projectId }, replace: true })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!isDate(date)) return setError('Kies een datum.')
    if (note.trim() === '') return setError('Schrijf een notitie.')
    setError(null)
    setSaving(true)
    try {
      // Look again at save time, so a second note on a day always lands in that day's entry.
      const day = await findEntry(projectId, date)
      if (day) await updateEntry(day.id, { note: appendNote(day.note, note) })
      else await addEntry({ projectId, date, note: note.trimEnd() })
      await toProject()
    } catch (err) {
      console.error(err)
      setError('Opslaan is niet gelukt. Probeer het opnieuw.')
      setSaving(false)
    }
  }

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
    <section>
      <Link to="/projects/$projectId" params={{ projectId }} className={backLink}>
        ← {project.title}
      </Link>
      <AccentHeading>Notitie toevoegen</AccentHeading>
      <form onSubmit={submit} noValidate className="mt-6 max-w-xl">
        <Field label="Datum" htmlFor="entry-date">
          <input
            id="entry-date"
            type="date"
            className={inputClass}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </Field>
        {existing && (
          <div className="mb-5" data-testid="existing-entry">
            <p className="mt-0 mb-1 text-sm text-grey italic">
              Op {formatDate(existing.date)} is er al een notitie. Je nieuwe notitie komt eronder.
            </p>
            {existing.note !== '' && <p className="m-0 break-words whitespace-pre-wrap">{existing.note}</p>}
          </div>
        )}
        <Field label="Notitie" htmlFor="entry-note">
          <textarea
            id="entry-note"
            className={`${inputClass} min-h-32`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={error !== null && note.trim() === ''}
          />
        </Field>
        {error && (
          <p role="alert" className="mb-4 font-semibold">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>
            Opslaan
          </Button>
          <Button variant="secondary" onClick={() => void toProject()}>
            Annuleren
          </Button>
        </div>
      </form>
    </section>
  )
}
