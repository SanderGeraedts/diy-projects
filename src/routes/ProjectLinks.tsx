import { Link } from '@tanstack/react-router'

// T-0004: the ways into the project form. Styled like the form's buttons (form.tsx).
const primary = 'inline-block rounded-full bg-text px-5 py-2 font-semibold text-bg no-underline'
export const secondaryLinkClass = 'inline-block shrink-0 rounded-full border border-grey-light px-4 py-1.5 text-text no-underline'

export function NewProjectLink() {
  return (
    <p className="mt-0 mb-4">
      <Link to="/projects/new" className={primary}>
        + Nieuw project
      </Link>
    </p>
  )
}

export function EditProjectLink({ slug }: { slug: string }) {
  return (
    <Link to="/projects/$slug/edit" params={{ slug }} className={secondaryLinkClass}>
      Bewerken
    </Link>
  )
}
