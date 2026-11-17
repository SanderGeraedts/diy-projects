import { useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PROJECT_STATUSES } from '../db/db'
import { hasFilters, toggle, type OverviewFilters } from '../filters'
import { STATUS_CLASSES, STATUS_LABELS } from './StatusBadge'

// T-0011: status and tag chips for the overview. Each chip is a toggle button; the active
// state is the accent ring (D-0020: accent for active states, never behind small text).

const CHIP =
  'cursor-pointer rounded-full border-0 px-3 py-1 font-sans text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
const INACTIVE = 'bg-grey-lighter text-text'
const ACTIVE_RING = 'ring-2 ring-accent'

function Chip({ pressed, className, onClick, children }: {
  pressed: boolean
  className: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={`${CHIP} ${className}`}>
      {children}
    </button>
  )
}

/** Navigates the overview to new filters; `undefined` lists are dropped from the URL. */
function useSetFilters() {
  const navigate = useNavigate({ from: '/' })
  return (filters: OverviewFilters) => navigate({ search: (prev) => ({ ...prev, ...filters }) })
}

export function ClearFilters() {
  const setFilters = useSetFilters()
  return (
    <button
      type="button"
      onClick={() => setFilters({ status: undefined, tag: undefined })}
      className="cursor-pointer border-0 bg-transparent p-0 font-sans text-sm text-text not-italic underline decoration-accent decoration-2 underline-offset-4"
    >
      Filters wissen
    </button>
  )
}

export function Filters({ filters, tags }: { filters: OverviewFilters; tags: string[] }) {
  const setFilters = useSetFilters()
  const statuses = filters.status ?? []
  const activeTags = filters.tag ?? []

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
        {PROJECT_STATUSES.map((s) => {
          const pressed = statuses.includes(s)
          return (
            <Chip
              key={s}
              pressed={pressed}
              className={pressed ? `${STATUS_CLASSES[s]} ${ACTIVE_RING}` : INACTIVE}
              onClick={() => setFilters({ status: toggle(filters.status, s) })}
            >
              {STATUS_LABELS[s]}
            </Chip>
          )
        })}
      </div>
      {tags.length > 0 && (
        <div role="group" aria-label="Tags" className="flex flex-wrap gap-2">
          {tags.map((t) => {
            const pressed = activeTags.includes(t)
            return (
              <Chip
                key={t}
                pressed={pressed}
                className={pressed ? `bg-grey-light text-text ${ACTIVE_RING}` : INACTIVE}
                onClick={() => setFilters({ tag: toggle(filters.tag, t) })}
              >
                #{t}
              </Chip>
            )
          })}
        </div>
      )}
      {hasFilters(filters) && (
        <div>
          <ClearFilters />
        </div>
      )}
    </div>
  )
}
