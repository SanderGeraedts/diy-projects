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
export function ProjectCard({
  project,
  cover,
  coverFile = 'copy',
}: {
  project: Project
  cover?: ShownPhoto
  /** A visitor's card loads the thumbnail, not the 2560 px copy, over the internet (T-0026). */
  coverFile?: 'copy' | 'thumbnail'
}) {
  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-grey-lighter">
      {cover ? (
        <PhotoImage photo={cover} file={coverFile} alt="" className="h-full w-full object-cover" />
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
