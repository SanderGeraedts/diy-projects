import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react'
import { Button } from '../components/form'
import { splitDrop, type DroppedItem } from '../photos/drop'
import { dismissImport, getImportStatus, startImport, startZipImport, subscribeImport } from '../photos/importQueue'
import { DropOverlay, useFileDropTarget } from './DropPhotos'
import { secondaryLinkClass } from './ProjectLinks'

// T-0007: "Foto's toevoegen" on a project page, and the import's progress and summary. The
// import itself runs in photos/importQueue, so leaving the page doesn't stop it; coming back
// shows where it is.
// T-0031 (D-0033): files dropped anywhere on the page take the same import; the overlay shows
// while they are dragged over it.
// T-0032 (D-0034): a dropped zip is unpacked in the import queue; its images join the import.

const photos = (n: number) => (n === 1 ? '1 foto' : `${n} foto's`)
const files = (n: number) => (n === 1 ? '1 bestand' : `${n} bestanden`)

const reducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function ImportPhotos({ projectId, projectTitle }: { projectId: string; projectTitle: string }) {
  const status = useSyncExternalStore(
    subscribeImport,
    useCallback(() => getImportStatus(projectId), [projectId]),
  )
  const statusRef = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)
  const [drops, setDrops] = useState(0)

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = '' // the same photos can be picked again
    if (files.length > 0) void startImport(projectId, files)
  }

  const drop = (items: DroppedItem[]) => {
    const { images, zips, notAdded } = splitDrop(items)
    if (images.length === 0 && zips.length === 0 && notAdded.length === 0) return
    // Loose photos first: they don't wait for the zips (T-0032).
    if (images.length > 0 || notAdded.length > 0) void startImport(projectId, images, undefined, notAdded)
    void startZipImport(projectId, zips)
    setDrops((n) => n + 1)
  }
  useFileDropTarget(drop, setOver)

  // A drop lower on the page brings the import block into view; focus stays where it was.
  // scroll-mt-20 on the block keeps it below the sticky header, as the timeline's days.
  useEffect(() => {
    if (drops === 0) return
    statusRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'instant' : 'smooth' })
  }, [drops])

  const notAdded = status ? [...status.notAdded, ...status.failed] : []

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label
          className={`${secondaryLinkClass} cursor-pointer whitespace-nowrap focus-within:outline-2 focus-within:outline-accent`}
        >
          + Foto's toevoegen
          <input type="file" accept="image/*" multiple className="sr-only" onChange={pick} />
        </label>
        {/* Only where a mouse or trackpad can drop files, not by width. */}
        <span className="hidden text-sm text-grey pointer-fine:inline" data-testid="drop-hint">
          of sleep foto's of zipbestanden naar deze pagina
        </span>
      </div>
      {over && <DropOverlay projectTitle={projectTitle} />}
      {status && (
        <div
          ref={statusRef}
          role="status"
          className="mt-3 scroll-mt-20 rounded-card border border-grey-light px-4 py-3"
          data-testid="import-status"
        >
          {status.lowStorage && (
            <p className="mt-0 mb-2 font-semibold">
              Er is weinig ruimte op dit toestel. Niet alle foto's passen misschien.
            </p>
          )}
          {status.running ? (
            <>
              {/* Not before there is a photo to import: never "0 van 0" while a zip is read. */}
              {status.total > 0 && (
                <p className="m-0">
                  Foto's importeren: {status.done} van {status.total}
                </p>
              )}
              {status.zips.length > 0 && (
                <p className={`${status.total > 0 ? 'mt-1' : 'mt-0'} mb-0 break-words`} data-testid="import-unzip">
                  {status.zips[0]} uitpakken: {status.zipPercent}%
                </p>
              )}
            </>
          ) : (
            <>
              <p className="m-0">{status.added === 0 ? "Geen foto's toegevoegd." : `${photos(status.added)} toegevoegd.`}</p>
              {notAdded.length > 0 && (
                <>
                  <p className="mt-2 mb-1 font-semibold">
                    {status.notAdded.length > 0
                      ? `${files(notAdded.length)} niet toegevoegd:`
                      : `${photos(notAdded.length)} niet gelukt:`}
                  </p>
                  <ul className="m-0 pl-5" data-testid="import-failed">
                    {notAdded.map((f, i) => (
                      <li key={i} className="break-words">
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
                      <li key={i} className="break-words">
                        {name}
                      </li>
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
