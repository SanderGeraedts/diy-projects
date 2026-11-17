import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Button, inputClass } from '../components/form'
import { formatDate } from '../components/format'
import type { Entry } from '../db/db'
import { updateEntry } from '../db/write'

// T-0005: an entry's note on the timeline, edited in place. Plain text with its line breaks
// kept. Saving goes through the write API, which stamps `updatedAt`. The date can't be
// changed here (it would move photos between days). `actions` (T-0010: Verwijderen) sit
// next to the edit button.

export function EntryNote({ entry, actions }: { entry: Entry; actions?: ReactNode }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.note)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const id = useId()
  const day = formatDate(entry.date)

  const start = () => {
    setDraft(entry.note)
    setError(null)
    setEditing(true)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await updateEntry(entry.id, { note: draft.trimEnd() })
      setEditing(false)
    } catch (err) {
      console.error(err)
      setError('Opslaan is niet gelukt. Probeer het opnieuw.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <div className="mt-2 mb-3">
        {entry.note !== '' && <p className="mt-0 mb-1 break-words whitespace-pre-wrap">{entry.note}</p>}
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            className="p-0 text-sm text-grey underline"
            aria-label={`Notitie van ${day} bewerken`}
            onClick={start}
          >
            Notitie bewerken
          </button>
          {actions}
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={save} noValidate className="mt-2 mb-3 max-w-xl">
      <label htmlFor={id} className="mb-1 block font-semibold">
        Notitie van {day}
      </label>
      <textarea
        id={id}
        className={`${inputClass} min-h-32`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        autoFocus
      />
      {error && (
        <p role="alert" className="mt-2 mb-0 font-semibold">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          Opslaan
        </Button>
        <Button variant="secondary" onClick={() => setEditing(false)}>
          Annuleren
        </Button>
      </div>
    </form>
  )
}
