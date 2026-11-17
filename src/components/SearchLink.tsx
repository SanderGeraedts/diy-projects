import { Link } from '@tanstack/react-router'

/** The magnifier in the header that opens search (T-0012). */
export function SearchLink() {
  return (
    <Link
      to="/zoeken"
      aria-label="Zoeken"
      className="-mr-2 flex h-11 w-11 items-center justify-center rounded-card text-text focus-visible:outline-2 focus-visible:outline-accent"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5" strokeLinecap="square" />
      </svg>
    </Link>
  )
}
