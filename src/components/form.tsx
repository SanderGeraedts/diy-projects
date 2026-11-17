import { useId, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react'
import { PROJECT_STATUSES, type ProjectStatus } from '../db/db'
import { STATUS_LABELS } from './StatusBadge'
import { normalizeTags, suggestTags } from './tags'

// T-0004: form building blocks, shared by the project form and later the entry form
// (T-0005). Tokens only (D-0020); the accent appears only as the focus ring.

export const inputClass =
  'block w-full rounded-card border border-grey-light bg-bg px-4 py-2 text-base text-text placeholder:text-grey'

export function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      <label htmlFor={htmlFor} className="mb-1 block font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 mb-0 text-sm text-grey italic">{hint}</p>}
    </div>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' }) {
  const look =
    variant === 'primary'
      ? 'bg-text font-semibold text-bg disabled:opacity-60'
      : 'border border-grey-light bg-bg text-text'
  return <button type="button" className={`rounded-full px-5 py-2 text-base ${look} ${className}`} {...props} />
}

export function StatusSelect({ id, value, onChange }: { id: string; value: ProjectStatus; onChange: (s: ProjectStatus) => void }) {
  return (
    <select id={id} className={inputClass} value={value} onChange={(e) => onChange(e.target.value as ProjectStatus)}>
      {PROJECT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  )
}

/**
 * Free-text tags: type and press Enter or a comma to add one; tap a suggestion (tags already
 * in use) to add it. `draft` is what's typed but not yet added, so a form can include it on
 * save.
 */
export function TagInput({
  id,
  tags,
  onTagsChange,
  draft,
  onDraftChange,
  inUse,
}: {
  id: string
  tags: string[]
  onTagsChange: (tags: string[]) => void
  draft: string
  onDraftChange: (draft: string) => void
  inUse: readonly string[]
}) {
  const suggestionsId = useId()
  const add = (...more: string[]) => {
    onTagsChange(normalizeTags([...tags, ...more]))
    onDraftChange('')
  }
  const onChange = (value: string) => {
    // Android keyboards often send no key event for a comma, so split on the value too.
    if (value.includes(',')) add(value)
    else onDraftChange(value)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && draft.trim() !== '') {
      e.preventDefault()
      add(draft)
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onTagsChange(tags.slice(0, -1))
    }
  }
  const suggestions = suggestTags(inUse, tags, draft)

  return (
    <div>
      {tags.length > 0 && (
        <ul className="m-0 mb-2 flex list-none flex-wrap gap-2 p-0" aria-label="Gekozen tags">
          {tags.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-grey-lighter py-0.5 pr-1 pl-3">
              <span className="before:content-['#']">{t}</span>
              <button
                type="button"
                aria-label={`Tag ${t} verwijderen`}
                className="rounded-full px-2 text-grey"
                onClick={() => onTagsChange(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        id={id}
        className={inputClass}
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoCapitalize="none"
        autoComplete="off"
        enterKeyHint="enter"
        aria-describedby={suggestions.length > 0 ? suggestionsId : undefined}
      />
      {suggestions.length > 0 && (
        <div id={suggestionsId} className="mt-2 flex flex-wrap items-center gap-2 text-sm text-grey">
          <span className="italic">Eerder gebruikt:</span>
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              aria-label={`Tag ${t} toevoegen`}
              className="rounded-full border border-grey-light px-3 py-0.5 text-text before:content-['#']"
              onClick={() => add(t)}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
