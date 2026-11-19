import type { Photo, Project, ProjectStatus } from '../db/db'
import { formatDate } from '../components/format'
import { PhotoImage } from '../components/PhotoImage'
import { STATUS_LABELS, StatusBadge } from '../components/StatusBadge'
import { AccentHeading, ProjectCard, Tags } from '../components/ui'
import { demoPhotoSvg } from '../seed/demo'
import { DesignFormSample } from './DesignFormSample'

// D-0020: the reference page of every token and component. Left out of production builds
// (see router.tsx). Screenshot tests in e2e/design.spec.ts cover it in light and dark.

const COLOR_TOKENS = [
  'text',
  'bg',
  'grey',
  'grey-light',
  'grey-lighter',
  'accent',
  'panel',
] as const

const SWATCH: Record<(typeof COLOR_TOKENS)[number], string> = {
  text: 'bg-text',
  bg: 'bg-bg',
  grey: 'bg-grey',
  'grey-light': 'bg-grey-light',
  'grey-lighter': 'bg-grey-lighter',
  accent: 'bg-accent',
  panel: 'bg-panel',
}

const T = '2026-11-16T12:00:00.000Z'

const sampleBlob = new Blob([demoPhotoSvg('Voorbeeld', 28, 1)], { type: 'image/svg+xml' })

// Shaped like the demo seed's photos: the drawing doubles as thumbnail, no original, never synced.
const samplePhoto: Photo = {
  id: 'design-photo',
  projectId: 'design',
  entryId: 'design-entry',
  takenAt: T,
  blob: sampleBlob,
  thumbnail: sampleBlob,
  original: null,
  uploads: { original: 'none', copy: 'none', thumbnail: 'none' },
  width: 1600,
  height: 1200,
  createdAt: T,
  updatedAt: T,
  deletedAt: null,
}

function sampleProject(title: string, status: ProjectStatus): Project {
  return { id: title, title, description: '', status, tags: ['hout', 'tuin'], public: true, createdAt: T, updatedAt: T, deletedAt: null }
}

export function DesignPage() {
  return (
    <article className="space-y-10">
      <AccentHeading>Ontwerp</AccentHeading>

      <section>
        <AccentHeading level={2}>Kleuren</AccentHeading>
        <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4">
          {COLOR_TOKENS.map((t) => (
            <li key={t} className="text-sm">
              <span className={`block h-12 rounded-card border border-grey-light ${SWATCH[t]}`} />
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <AccentHeading level={2}>Typografie</AccentHeading>
        <p className="mt-3 text-2xl font-semibold">Poppins 600 — Tuinbank</p>
        <p>Poppins 400 — Poten en zitregels op lengte gezaagd.</p>
        <p className="text-grey italic">Poppins 400 cursief — bezig · #hout #tuin</p>
      </section>

      <section>
        <AccentHeading level={2}>Status</AccentHeading>
        <div className="mt-3 flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="mt-2 text-grey">
          <Tags tags={['hout', 'tuin', 'badkamer']} />
        </div>
      </section>

      <section>
        <AccentHeading level={2}>Projectkaarten</AccentHeading>
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
          <ProjectCard project={sampleProject('Tuinbank', 'in progress')} cover={samplePhoto} />
          <ProjectCard project={sampleProject('Fietsenrek', 'idea')} />
        </div>
      </section>

      <section>
        <AccentHeading level={2}>
          <time dateTime="2026-10-04">{formatDate('2026-10-04')}</time>
        </AccentHeading>
        <p className="mt-2">Poten en zitregels op lengte gezaagd.</p>
        <div className="grid grid-cols-2 gap-2">
          <PhotoImage photo={samplePhoto} alt="Voorbeeldfoto" className="aspect-[4/3] w-full rounded-card object-cover" />
          <PhotoImage photo={samplePhoto} alt="Voorbeeldfoto" className="aspect-[4/3] w-full rounded-card object-cover" />
        </div>
      </section>

      <DesignFormSample />
    </article>
  )
}
