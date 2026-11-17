import { useCallback, useSyncExternalStore, type ChangeEvent } from 'react'
import { Button } from '../components/form'
import { dismissImport, getImportStatus, startImport, subscribeImport } from '../photos/importQueue'
import { secondaryLinkClass } from './ProjectLinks'

// T-0007: "Foto's toevoegen" on a project page, and the import's progress and summary. The
// import itself runs in photos/importQueue, so leaving the page doesn't stop it; coming back
// shows where it is.

const photos = (n: number) => (n === 1 ? '1 foto' : `${n} foto's`)

export function ImportPhotos({ projectId }: { projectId: string }) {
  const status = useSyncExternalStore(
    subscribeImport,
    useCallback(() => getImportStatus(projectId), [projectId]),
  )

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = '' // the same photos can be picked again
    if (files.length > 0) void startImport(projectId, files)
  }

  return (
    <div className="mt-3">
      <label className={`${secondaryLinkClass} cursor-pointer focus-within:outline-2 focus-within:outline-accent`}>
        + Foto's toevoegen
        <input type="file" accept="image/*" multiple className="sr-only" onChange={pick} />
      </label>
      {status && (
        <div role="status" className="mt-3 rounded-card border border-grey-light px-4 py-3" data-testid="import-status">
          {status.lowStorage && (
            <p className="mt-0 mb-2 font-semibold">
              Er is weinig ruimte op dit toestel. Niet alle foto's passen misschien.
            </p>
          )}
          {status.running ? (
            <p className="m-0">
              Foto's importeren: {status.done} van {status.total}
            </p>
          ) : (
            <>
              <p className="m-0">{photos(status.added)} toegevoegd.</p>
              {status.failed.length > 0 && (
                <>
                  <p className="mt-2 mb-1 font-semibold">{photos(status.failed.length)} niet gelukt:</p>
                  <ul className="m-0 pl-5" data-testid="import-failed">
                    {status.failed.map((f, i) => (
                      <li key={i}>
                        {f.name}: {f.reason}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {status.fromFileDate.length > 0 && (
                <>
                  <p className="mt-2 mb-1 text-sm text-grey italic">
                    Zonder opnamedatum, ingedeeld op de datum van het bestand:
                  </p>
                  <ul className="m-0 pl-5 text-sm" data-testid="import-file-date">
                    {status.fromFileDate.map((name, i) => (
                      <li key={i}>{name}</li>
                    ))}
                  </ul>
                </>
              )}
              <Button variant="secondary" className="mt-3" onClick={() => dismissImport(projectId)}>
                Sluiten
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
