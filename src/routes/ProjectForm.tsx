import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type FormEvent } from 'react'
import { Button, Field, inputClass, StatusSelect, TagInput } from '../components/form'
import { normalizeTags } from '../components/tags'
import { AccentHeading } from '../components/ui'
import { db, type ProjectStatus } from '../db/db'
import { createProject, updateProject } from '../db/write'
import { SlugRedirect, useProjectBySlug } from './projectBySlug'

// T-0004: one form to start a project and to edit its title, description, status and tags.
// Writes go through the write API (T-0003); reads are plain Dexie queries.
// T-0026: and its public switch, on by default (D-0025).

export interface ProjectFields {
  title: string
  description: string
  status: ProjectStatus
  tags: string[]
  public: boolean
}

const backLink = 'mb-3 inline-block text-sm text-grey no-underline hover:text-text'

/** Every tag on a live project, for suggestions. */
function useTagsInUse(): string[] {
  return (
    useLiveQuery(async () => {
      const projects = await db.projects.filter((p) => p.deletedAt === null).toArray()
      return normalizeTags(projects.flatMap((p) => p.tags))
    }, []) ?? []
  )
}

export function ProjectForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: ProjectFields
  submitLabel: string
  onSave: (fields: ProjectFields) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [description, setDescription] = useState(initial.description)
  const [status, setStatus] = useState<ProjectStatus>(initial.status)
  const [tags, setTags] = useState<string[]>(initial.tags)
  const [isPublic, setIsPublic] = useState(initial.public)
  const [tagDraft, setTagDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inUse = useTagsInUse()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (title.trim() === '') {
      setError('Geef het project een titel.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        description,
        status,
        tags: normalizeTags([...tags, tagDraft]),
        public: isPublic,
      })
    } catch (err) {
      console.error(err)
      setError('Opslaan is niet gelukt. Probeer het opnieuw.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-6 max-w-xl">
      <Field label="Titel" htmlFor="project-title">
        <input
          id="project-title"
          className={inputClass}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-invalid={error !== null && title.trim() === ''}
          autoComplete="off"
        />
      </Field>
      <Field label="Omschrijving" htmlFor="project-description">
        <textarea
          id="project-description"
          className={`${inputClass} min-h-32`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <Field label="Status" htmlFor="project-status">
        <StatusSelect id="project-status" value={status} onChange={setStatus} />
      </Field>
      <Field label="Tags" htmlFor="project-tags" hint="Typ een tag en druk op Enter of een komma.">
        <TagInput
          id="project-tags"
          tags={tags}
          onTagsChange={setTags}
          draft={tagDraft}
          onDraftChange={setTagDraft}
          inUse={inUse}
        />
      </Field>
      <div className="mb-5">
        <label htmlFor="project-public" className="flex items-center gap-3 font-semibold">
          <input
            id="project-public"
            type="checkbox"
            role="switch"
            className="h-5 w-5 accent-accent"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            aria-describedby="project-public-hint"
          />
          Openbaar
        </label>
        <p id="project-public-hint" className="mt-1 mb-0 text-sm text-grey italic">
          {isPublic
            ? "Iedereen kan dit project zien, met de notities en foto's, ook zonder in te loggen."
            : 'Alleen jij ziet dit project.'}
        </p>
      </div>
      {error && (
        <p role="alert" className="mb-4 font-semibold">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {submitLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Annuleren
        </Button>
      </div>
    </form>
  )
}

export function NewProjectPage() {
  const navigate = useNavigate()
  return (
    <section>
      <Link to="/" className={backLink}>
        ← Alle projecten
      </Link>
      <AccentHeading>Nieuw project</AccentHeading>
      <ProjectForm
        initial={{ title: '', description: '', status: 'idea', tags: [], public: true }}
        submitLabel="Opslaan"
        onCancel={() => void navigate({ to: '/' })}
        onSave={async (fields) => {
          const project = await createProject(fields)
          await navigate({ to: '/projects/$slug', params: { slug: project.slug }, replace: true })
        }}
      />
    </section>
  )
}

export function EditProjectPage() {
  const { slug } = useParams({ from: '/projects/$slug/edit' })
  const navigate = useNavigate()
  // T-0027: found by its slug, or an earlier one, which redirects (D-0029).
  const project = useProjectBySlug(slug)
  const toProject = () => navigate({ to: '/projects/$slug', params: { slug } })

  if (project === undefined) return null
  if (project && project.slug !== slug) return <SlugRedirect slug={project.slug} />
  if (project === null) {
    return (
      <section>
        <AccentHeading>Project niet gevonden</AccentHeading>
        <p>
          <Link to="/" className={backLink}>
            ← Alle projecten
          </Link>
        </p>
      </section>
    )
  }

  return (
    <section>
      <Link to="/projects/$slug" params={{ slug }} className={backLink}>
        ← {project.title}
      </Link>
      <AccentHeading>Project bewerken</AccentHeading>
      {/* Keyed on the id so the form starts from this project's stored values. */}
      <ProjectForm
        key={project.id}
        initial={project}
        submitLabel="Opslaan"
        onCancel={() => void toProject()}
        onSave={async (fields) => {
          // A new title can mean a new slug (D-0029): go to the address it has now.
          const updated = await updateProject(project.id, fields)
          await navigate({ to: '/projects/$slug', params: { slug: updated.slug }, replace: true })
        }}
      />
    </section>
  )
}
