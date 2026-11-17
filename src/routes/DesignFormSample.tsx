import { useState } from 'react'
import { Button, Field, inputClass, StatusSelect, TagInput } from '../components/form'
import { AccentHeading } from '../components/ui'
import type { ProjectStatus } from '../db/db'

/** T-0004: the form components on /design (D-0020). Nothing here is saved. */
export function DesignFormSample() {
  const [status, setStatus] = useState<ProjectStatus>('in progress')
  const [tags, setTags] = useState(['hout', 'tuin'])
  const [draft, setDraft] = useState('')
  return (
    <section>
      <AccentHeading level={2}>Formulier</AccentHeading>
      <div className="mt-3 max-w-xl">
        <Field label="Titel" htmlFor="design-title">
          <input id="design-title" className={inputClass} defaultValue="Tuinbank" />
        </Field>
        <Field label="Status" htmlFor="design-status">
          <StatusSelect id="design-status" value={status} onChange={setStatus} />
        </Field>
        <Field label="Tags" htmlFor="design-tags" hint="Typ een tag en druk op Enter of een komma.">
          <TagInput
            id="design-tags"
            tags={tags}
            onTagsChange={setTags}
            draft={draft}
            onDraftChange={setDraft}
            inUse={['hout', 'tuin', 'badkamer', 'verf']}
          />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button>Opslaan</Button>
          <Button variant="secondary">Annuleren</Button>
        </div>
      </div>
    </section>
  )
}
