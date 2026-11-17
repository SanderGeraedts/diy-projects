import type { ProjectStatus } from '../db/db'

/** D-0020: Dutch labels, keyed by the value stored in Dexie (D-0004). */
export const STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: 'idee',
  'in progress': 'bezig',
  paused: 'gepauzeerd',
  done: 'klaar',
}

export const STATUS_CLASSES: Record<ProjectStatus, string> = {
  idea: 'bg-status-idea-bg text-status-idea-text',
  'in progress': 'bg-status-in-progress-bg text-status-in-progress-text',
  paused: 'bg-status-paused-bg text-status-paused-text',
  done: 'bg-status-done-bg text-status-done-text',
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm not-italic ${STATUS_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
