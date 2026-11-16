import type { ProjectStatus } from '../db/db'

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`status status-${status.replace(' ', '-')}`}>{status}</span>
}
