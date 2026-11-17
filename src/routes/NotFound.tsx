import { Link } from '@tanstack/react-router'
import { AccentHeading } from '../components/ui'

export function NotFound() {
  return (
    <section>
      <AccentHeading>Niet gevonden</AccentHeading>
      <p>
        <Link to="/" className="text-text underline decoration-accent decoration-2 underline-offset-4">
          Terug naar alle projecten
        </Link>
      </p>
    </section>
  )
}
