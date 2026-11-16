import { Link } from '@tanstack/react-router'

export function NotFound() {
  return (
    <section>
      <h1>Not found</h1>
      <p>
        <Link to="/">Back to all projects</Link>
      </p>
    </section>
  )
}
