import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { formatDate } from '../components/format'
import { StatusBadge } from '../components/StatusBadge'
import { AccentHeading } from '../components/ui'
import { db } from '../db/db'
import { buildIndex, highlight, search } from '../search/search'

export interface SearchParams {
  q?: string
}

export function validateSearchParams(params: Record<string, unknown>): SearchParams {
  return typeof params.q === 'string' && params.q !== '' ? { q: params.q } : {}
}

/** Text with the words a query matches marked; underlined in the accent, never filled (D-0020). */
function Highlighted({ text, query }: { text: string; query: string }) {
  return (
    <>
      {highlight(text, query).map((s, i) =>
        s.match ? (
          <mark key={i} className="bg-transparent font-semibold text-text underline decoration-accent decoration-2">
            {s.text}
          </mark>
        ) : (
          s.text
        ),
      )}
    </>
  )
}

export function SearchPage() {
  const { q = '' } = useSearch({ from: '/zoeken' })
  const navigate = useNavigate({ from: '/zoeken' })
  // Typing updates local state at once; the URL follows, so back and reload keep the query.
  const [query, setQuery] = useState(q)
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const entries = useLiveQuery(() => db.entries.toArray(), [])
  const index = useMemo(() => (projects && entries ? buildIndex(projects, entries) : null), [projects, entries])
  const results = useMemo(() => (index ? search(index, query) : []), [index, query])

  return (
    <section>
      <AccentHeading>Zoeken</AccentHeading>
      <form role="search" className="mt-4" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="search-q" className="sr-only">
          Zoek in projecten en notities
        </label>
        <input
          id="search-q"
          type="search"
          autoFocus
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Zoek in projecten en notities"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            void navigate({ search: validateSearchParams({ q: e.target.value }), replace: true })
          }}
          className="w-full rounded-card border-2 border-grey-light bg-bg px-4 py-2 text-text placeholder:text-grey focus:border-accent focus:outline-none"
        />
      </form>
      {index && query.trim() !== '' && (
        <p className="mt-3 text-sm text-grey" aria-live="polite">
          {results.length === 0
            ? 'Niets gevonden.'
            : results.length === 1
              ? '1 project gevonden.'
              : `${results.length} projecten gevonden.`}
        </p>
      )}
      <ul className="m-0 mt-4 list-none p-0">
        {results.map((r) => (
          <li key={r.project.id} className="mb-6">
            <Link
              to="/projects/$projectId"
              params={{ projectId: r.project.id }}
              className="text-lg font-semibold text-text no-underline"
            >
              <Highlighted text={r.project.title} query={query} />
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-grey italic">
              <StatusBadge status={r.project.status} />
              {r.project.tags.length > 0 && (
                <span>
                  {r.project.tags.map((t) => (
                    <span key={t} className="mr-2">
                      #<Highlighted text={t} query={query} />
                    </span>
                  ))}
                </span>
              )}
            </div>
            {r.fields.includes('description') && (
              <p className="mt-1 mb-0 text-sm">
                <Highlighted text={r.project.description} query={query} />
              </p>
            )}
            {r.entries.length > 0 && (
              <ul className="m-0 mt-2 list-none p-0 pl-3">
                {r.entries.map((e) => (
                  <li key={e.id} className="mb-2">
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: r.project.id }}
                      hash={`entry-${e.id}`}
                      className="block text-text no-underline"
                    >
                      <time dateTime={e.date} className="text-sm font-semibold">
                        {formatDate(e.date)}
                      </time>
                      <span className="block text-sm">
                        <Highlighted text={e.note} query={query} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
