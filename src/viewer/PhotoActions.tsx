import { Button } from '../components/form'

// T-0009: what can be done with a photo in the viewer. Photos are never edited (D-0002), so
// there is no rotate or crop: a photo becomes the cover, or is deleted.

const action = 'min-h-11 px-4 py-2 text-sm'

export function PhotoActions({
  isCover,
  busy,
  error,
  onUseAsCover,
  onDelete,
}: {
  isCover: boolean
  busy: boolean
  error: string | null
  onUseAsCover: () => void
  onDelete: () => void
}) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" className={action} disabled={busy || isCover} onClick={onUseAsCover}>
          {isCover ? 'Dit is de omslagfoto' : 'Als omslagfoto gebruiken'}
        </Button>
        <Button variant="secondary" className={action} disabled={busy} onClick={onDelete}>
          Verwijderen
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 mb-0 font-semibold">
          {error}
        </p>
      )}
    </div>
  )
}

/** Asks before a photo is deleted. Escape or Annuleren keeps it. */
export function ConfirmDelete({
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  busy: boolean
  error: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center bg-panel p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-delete-title"
        className="w-full max-w-sm rounded-card border border-grey-light bg-bg p-5"
      >
        <h2 id="confirm-delete-title" className="m-0 text-lg font-semibold">
          Deze foto verwijderen?
        </h2>
        <p className="mt-2 mb-0 text-grey">De foto verdwijnt uit dit project.</p>
        {error && (
          <p role="alert" className="mt-2 mb-0 font-semibold">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button disabled={busy} onClick={onConfirm}>
            Verwijderen
          </Button>
          <Button autoFocus variant="secondary" onClick={onCancel}>
            Annuleren
          </Button>
        </div>
      </div>
    </div>
  )
}
