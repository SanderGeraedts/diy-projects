import { useAppUpdate, type UpdateState } from '../sw/update'

function joinDutch(items: readonly string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} en ${items.at(-1)}`
}

/** T-0019: offers a waiting new version. The logic lives in src/sw/update.ts. */
export function UpdateBar({ state: given, onApply }: { state?: UpdateState; onApply?: () => void } = {}) {
  const live = useAppUpdate()
  const state = given ?? live.state
  const apply = onApply ?? live.apply
  if (state.status === 'none') return null

  return (
    <aside
      aria-label="Nieuwe versie"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-4 bg-grey-lighter px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm"
    >
      {state.status === 'available' && (
        <>
          <span>Nieuwe versie beschikbaar</span>
          <button
            type="button"
            onClick={apply}
            className="inline-block cursor-pointer border-0 bg-transparent p-0 font-sans text-sm font-semibold text-text"
          >
            Bijwerken
            <span aria-hidden="true" className="mt-0.5 block h-1 w-full bg-accent" />
          </button>
        </>
      )}
      {state.status === 'waiting' && <span>Bijwerken zodra {joinDutch(state.reasons)} klaar is…</span>}
      {state.status === 'updating' && <span>Bijwerken…</span>}
    </aside>
  )
}
