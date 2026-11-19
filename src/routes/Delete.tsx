import { useNavigate } from '@tanstack/react-router'
import { useId, useState } from 'react'
import { Button } from '../components/form'
import { formatDate } from '../components/format'
import { deleteEntryQuestion, deleteProjectQuestion } from '../components/deleteText'
import type { Entry, Project } from '../db/db'
import { deleteEntry, deleteProject } from '../db/write'

// T-0010 (D-0014): "Verwijderen" on an entry or a project. The delete itself (a tombstone that
// cascades to the photos) lives in the write API; these only ask first and call it. A deleted
// project or entry goes to the bin ("Prullenbak", T-0022), where it can be restored.

/** Asks before something is deleted. Escape or Annuleren keeps it. */
export function ConfirmDialog({
  question,
  confirmLabel = 'Verwijderen',
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  question: string
  confirmLabel?: string
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const titleId = useId()
  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center"
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-card border border-grey-light bg-bg p-5"
      >
        <h2 id={titleId} className="m-0 text-lg font-semibold break-words">
          {question}
        </h2>
        {error && (
          <p role="alert" className="mt-2 mb-0 font-semibold">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button autoFocus variant="secondary" onClick={onCancel}>
            Annuleren
          </Button>
        </div>
      </div>
    </div>
  )
}

function useDelete(run: () => Promise<void>) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await run()
      setConfirming(false)
    } catch (err) {
      console.error(err)
      setError('Verwijderen is niet gelukt. Probeer het opnieuw.')
    } finally {
      setBusy(false)
    }
  }
  const open = () => {
    setError(null)
    setConfirming(true)
  }
  return { confirming, busy, error, open, confirm, cancel: () => setConfirming(false) }
}

/** On the timeline: deletes the entry and its photos. `photos` is the number of live photos. */
export function DeleteEntryButton({ entry, photos }: { entry: Entry; photos: number }) {
  const day = formatDate(entry.date)
  const d = useDelete(() => deleteEntry(entry.id))
  return (
    <>
      <button
        type="button"
        className="p-0 text-sm text-grey underline"
        aria-label={`Notitie van ${day} verwijderen`}
        onClick={d.open}
      >
        Verwijderen
      </button>
      {d.confirming && (
        <ConfirmDialog
          question={deleteEntryQuestion(day, photos)}
          busy={d.busy}
          error={d.error}
          onConfirm={d.confirm}
          onCancel={d.cancel}
        />
      )}
    </>
  )
}

/** On the project page: deletes the project, its entries and their photos, then goes home. */
export function DeleteProjectButton({ project, entries, photos }: { project: Project; entries: number; photos: number }) {
  const navigate = useNavigate()
  const d = useDelete(async () => {
    await deleteProject(project.id)
    await navigate({ to: '/', replace: true })
  })
  return (
    <>
      <Button variant="secondary" className="text-sm" onClick={d.open}>
        Project verwijderen
      </Button>
      {d.confirming && (
        <ConfirmDialog
          question={deleteProjectQuestion(project.title, entries, photos)}
          busy={d.busy}
          error={d.error}
          onConfirm={d.confirm}
          onCancel={d.cancel}
        />
      )}
    </>
  )
}
