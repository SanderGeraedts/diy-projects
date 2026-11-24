import type { ReactNode } from 'react'
import type { Project } from '../db/db'
import { PhotoImage, type ShownPhoto } from './PhotoImage'
import { StatusBadge } from './StatusBadge'

/** A heading underlined with an accent bar as wide as its text (D-0020). */
export function AccentHeading({ children, level = 1 }: { children: ReactNode; level?: 1 | 2 }) {
  const Tag = level === 1 ? 'h1' : 'h2'
  const size = level === 1 ? 'text-2xl' : 'text-lg'
  return (
    <Tag className={`m-0 inline-block font-semibold ${size}`}>
      {children}
      <span aria-hidden="true" className="mt-1 block h-1.5 w-full bg-accent" />
    </Tag>
  )
}

export function Tags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  return (
    <ul className="m-0 inline-flex list-none flex-wrap gap-x-2 p-0">
      {tags.map((t) => (
        <li key={t} className="before:content-['#']">
          {t}
        </li>
      ))}
    </ul>
  )
}

/** Project card: cover photo at 4:3 with a translucent panel, or a grey tile with the initial. */
/**
 * The cover's `sizes` (T-0037 Design): the overview's grid (Overview.tsx,
 * `auto-fill minmax(16rem, 1fr)` with `gap-4`) inside `main`'s `max-w-5xl p-4` has one
 * column below 560 px, two from 560, three from 832, and from 1024 px the content is capped
 * at 992 px, so a card is 320 px. Change these with that grid or padding.
 */
export const CARD_SIZES =
  'auto, (min-width: 1024px) 320px, (min-width: 832px) calc((100vw - 64px) / 3), (min-width: 560px) calc((100vw - 48px) / 2), calc(100vw - 32px)'

export function ProjectCard({ project, cover }: { project: Project; cover?: ShownPhoto }) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-grey-lighter">
      {cover ? (
        <PhotoImage photo={cover} sizes={CARD_SIZES} alt="" className="h-full w-full object-cover" />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center pb-16 text-8xl font-semibold text-grey-light"
        >
          {project.title.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-panel px-4 py-3 backdrop-blur-sm">
        <h2 className="m-0 text-lg font-semibold">{project.title}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-grey">
          <StatusBadge status={project.status} />
          <Tags tags={project.tags} />
        </div>
      </div>
    </div>
  )
}
