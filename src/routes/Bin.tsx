import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { binItemName, binItems, deletedOn, partsText, purgeQuestion, type BinItem } from '../components/bin'
import { Button } from '../components/form'
import { AccentHeading } from '../components/ui'
import { db } from '../db/db'
import { restoreEntry, restoreProject } from '../db/write'
import { deleteForGood } from '../sync/app'
import { purgeErrorMessage } from '../sync/purge'
import { ConfirmDialog } from './Delete'

// T-0022 (D-0014): the bin ("Prullenbak"), the owner's only (router.tsx: ownerOnly). It lists
// deleted projects and entries, newest first. "Terugzetten" restores one with what its delete
// took with it (src/db/write.ts); "Definitief verwijderen" asks first, then has the NAS delete
// it for good (src/sync/app.ts).

const backLink = 'mb-3 inline-block text-sm text-grey no-underline hover:text-text'

export function BinPage() {
  const items = useLiveQuery(async () => {
    const [projects, entries, photos] = await Promise.all([
      db.projects.toArray(),
      db.entries.toArray(),
      db.photos.toArray(),
    ])
    return binItems(projects, entries, photos)
  }, [])
  const [done, setDone] = useState<{ text: string; slug: string } | null>(null)

  return (
    <section>
      <Link to="/" className={backLink}>
        ← Alle projecten
      </Link>
      <div>
        <AccentHeading>Prullenbak</AccentHeading>
      </div>
      <p className="text-grey">
        Verwijderde projecten en notities. Zet ze terug, of verwijder ze definitief: dan zijn ook de foto's weg.
      </p>
      <p role="status" className="min-h-6">
        {done && (
          <>
            {done.text}{' '}
            {done.slug && (
              <Link
                to="/projects/$slug"
                params={{ slug: done.slug }}
                className="text-text underline decoration-accent decoration-2 underline-offset-4"
              >
                Bekijken
              </Link>
            )}
          </>
        )}
      </p>
      {items && items.length === 0 && <p className="text-grey italic">De prullenbak is leeg.</p>}
      <ul className="m-0 list-none p-0">
        {(items ?? []).map((item) => (
          <BinRow key={`${item.kind}:${item.id}`} item={item} onDone={setDone} />
        ))}
      </ul>
    </section>
  )
}

function BinRow({ item, onDone }: { item: BinItem; onDone: (done: { text: string; slug: string }) => void }) {
  const name = binItemName(item)
  const parts = partsText(item)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [purgeError, setPurgeError] = useState<string | null>(null)

  const restore = async () => {
    setBusy(true)
    setError(null)
    try {
      if (item.kind === 'project') await restoreProject(item.id)
      else await restoreEntry(item.id)
      onDone({ text: `${name} is teruggezet.`, slug: item.projectSlug })
    } catch (err) {
      console.error(err)
      setError('Terugzetten is niet gelukt. Probeer het opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  const purge = async () => {
    setBusy(true)
    setPurgeError(null)
    try {
      await deleteForGood(item.kind, item.id)
      setConfirming(false)
      onDone({ text: `${name} is definitief verwijderd.`, slug: '' })
    } catch (err) {
      console.error(err)
      setPurgeError(purgeErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="mb-4 rounded-card border border-grey-light p-4">
      <h2 className="m-0 text-lg font-semibold break-words">{name}</h2>
      <p className="mt-1 mb-0 text-sm text-grey">
        {item.kind === 'entry' && <>In {item.projectTitle} · </>}
        Verwijderd op {deletedOn(item)}
        {parts && <> · {parts}</>}
      </p>
      {error && (
        <p role="alert" className="mt-2 mb-0 font-semibold">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3">
        <Button disabled={busy} aria-label={`${name} terugzetten`} onClick={() => void restore()}>
          Terugzetten
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          aria-label={`${name} definitief verwijderen`}
          onClick={() => {
            setPurgeError(null)
            setConfirming(true)
          }}
        >
          Definitief verwijderen
        </Button>
      </div>
      {confirming && (
        <ConfirmDialog
          question={purgeQuestion(item)}
          confirmLabel="Definitief verwijderen"
          busy={busy}
          error={purgeError}
          onConfirm={() => void purge()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </li>
  )
}

/** The way into the bin, for the owner (the overview's foot). */
export function BinLink() {
  return (
    <p className="mt-8 mb-0">
      <Link to="/prullenbak" className="text-sm text-grey underline underline-offset-4 hover:text-text">
        Prullenbak
      </Link>
    </p>
  )
}
