import type { Photo, Project } from '../db/db'

/** What choosing a cover needs of a photo: a stored one, or a visitor's (T-0026). */
type CoverCandidate = Pick<Photo, 'id' | 'projectId' | 'takenAt' | 'createdAt'> & { deletedAt: string | null }

// T-0009: which photo a project shows as its cover. The chosen cover (`coverPhotoId`) while
// it is alive; once it is deleted (a tombstone, D-0002, D-0014), the newest remaining photo by
// date taken; with no photos left, nothing, so the card shows the no-photo tile (D-0020).
// Worked out when shown rather than stored, so it also holds for deletes synced from
// another device.

/** The newest photo first: by date taken, then by when it was added. */
function newerFirst(a: CoverCandidate, b: CoverCandidate): number {
  return b.takenAt.localeCompare(a.takenAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
}

/** The cover to show, from the project's photos (deleted ones are skipped). */
export function pickCover<P extends CoverCandidate>(
  project: Pick<Project, 'id' | 'coverPhotoId'>,
  photos: readonly P[],
): P | undefined {
  const alive = photos.filter((p) => p.deletedAt === null && p.projectId === project.id)
  const chosen = project.coverPhotoId ? alive.find((p) => p.id === project.coverPhotoId) : undefined
  return chosen ?? alive.sort(newerFirst)[0]
}
