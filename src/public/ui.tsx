import type { ComponentType, ReactElement } from 'react'
import { NotFound } from '../routes/NotFound'
import { useVisitor } from './mode'

// T-0026: small pieces of the visitor view (D-0025).

export const UNREACHABLE = 'Projecten zijn nu niet bereikbaar.'

/** Shown when the NAS can't be reached; visitors have no offline copy. */
export function Unreachable() {
  return (
    <p role="status" className="text-grey italic">
      {UNREACHABLE}
    </p>
  )
}

/**
 * For pages only the owner has (new project, edit, add entry, search): a visitor gets "Niet
 * gevonden", and the page itself, which reads and writes Dexie, never renders.
 */
export function ownerOnly(Page: ComponentType): () => ReactElement {
  return function OwnerOnly() {
    return useVisitor() ? <NotFound /> : <Page />
  }
}
