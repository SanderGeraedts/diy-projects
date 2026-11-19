import type { Entry, Photo, Project } from '../db/db'
import type { BinKind } from '../db/write'
import { formatDate } from './format'

// T-0022 (D-0014): what the bin ("Prullenbak") lists. Deleted projects, and deleted entries of
// projects that aren't deleted themselves (an entry deleted with its project is part of that
// project's item). Newest delete first. The counts are what "Terugzetten" brings back: the
// records the delete took with it, which share its `deletedAt` (src/db/write.ts). A permanent
// delete takes more: everything in the project or entry, also what was deleted on its own
// before (`purge`, as `purgeScope` in src/db/write.ts and the NAS's bin.pb.js).

export interface BinItem {
  kind: BinKind
  id: string
  /** The project: its own; an entry: the project it belongs to. */
  projectId: string
  projectTitle: string
  /** An entry's day, YYYY-MM-DD. */
  date?: string
  deletedAt: string
  /** What a restore brings back with it. */
  entries: number
  photos: number
  /** What a permanent delete removes with it. */
  purge: { entries: number; photos: number }
}

type PhotoRef = Pick<Photo, 'projectId' | 'entryId' | 'deletedAt'>

export function binItems(projects: Project[], entries: Entry[], photos: PhotoRef[]): BinItem[] {
  const byId = new Map(projects.map((p) => [p.id, p] as const))
  const items: BinItem[] = []
  for (const p of projects) {
    if (p.deletedAt === null) continue
    items.push({
      kind: 'project',
      id: p.id,
      projectId: p.id,
      projectTitle: p.title,
      deletedAt: p.deletedAt,
      entries: entries.filter((e) => e.projectId === p.id && e.deletedAt === p.deletedAt).length,
      photos: photos.filter((ph) => ph.projectId === p.id && ph.deletedAt === p.deletedAt).length,
      purge: {
        entries: entries.filter((e) => e.projectId === p.id).length,
        photos: photos.filter((ph) => ph.projectId === p.id).length,
      },
    })
  }
  for (const e of entries) {
    if (e.deletedAt === null) continue
    const project = byId.get(e.projectId)
    if (!project || project.deletedAt !== null) continue
    items.push({
      kind: 'entry',
      id: e.id,
      projectId: project.id,
      projectTitle: project.title,
      date: e.date,
      deletedAt: e.deletedAt,
      entries: 0,
      photos: photos.filter((ph) => ph.entryId === e.id && ph.deletedAt === e.deletedAt).length,
      purge: { entries: 0, photos: photos.filter((ph) => ph.entryId === e.id).length },
    })
  }
  return items.sort((a, b) =>
    a.deletedAt === b.deletedAt ? (a.id < b.id ? -1 : 1) : a.deletedAt < b.deletedAt ? 1 : -1,
  )
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "Project 'Tuinbank'" or "Notitie van 4 okt 2026". */
export function binItemName(item: BinItem): string {
  return item.kind === 'project' ? `Project '${item.projectTitle}'` : `Notitie van ${formatDate(item.date ?? '')}`
}

/** "3 notities en 14 foto's", "2 foto's", or "" for nothing. */
export function partsText({ entries, photos }: { entries: number; photos: number }): string {
  const parts = [
    ...(entries > 0 ? [count(entries, 'notitie', 'notities')] : []),
    ...(photos > 0 ? [count(photos, 'foto', "foto's")] : []),
  ]
  return parts.join(' en ')
}

/** The day of the delete, in the device's time zone: "19 nov 2026". */
export function deletedOn(item: BinItem): string {
  const d = new Date(item.deletedAt)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return formatDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`)
}

/** The confirmation before a permanent delete. */
export function purgeQuestion(item: BinItem): string {
  const parts = partsText(item.purge)
  return `${binItemName(item)} definitief verwijderen${parts ? `, met ${parts}` : ''}? Dit kan niet ongedaan worden gemaakt.`
}
