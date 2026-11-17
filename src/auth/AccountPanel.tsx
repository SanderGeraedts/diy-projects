import { useRef, useState, type FormEvent } from 'react'
import { AccentHeading } from '../components/ui'
import { REAUTH_MESSAGE, type Auth } from './auth'
import { useAuthState } from './session'

// T-0015: sign in and sign out (D-0013), in Dutch with D-0020's tokens. Shown only when
// sync is on (production with an address, D-0006); the route isn't registered otherwise.

const field =
  'mt-1 block w-full rounded-card border border-grey-light bg-bg px-3 py-2 text-text focus:outline-2 focus:outline-offset-1 focus:outline-accent'
const button =
  'rounded-card border border-text bg-text px-4 py-2 font-semibold text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60'
const secondary =
  'rounded-card border border-grey-light bg-bg px-4 py-2 font-semibold text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60'

export function changesLabel(n: number): string {
  return n === 1 ? '1 wijziging' : `${n} wijzigingen`
}

function SignInForm({ auth, expired }: { auth: Auth; expired: boolean }) {
  const [email, setEmail] = useState(() => (auth.record()?.email as string | undefined) ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = await auth.signIn(email, password)
    setBusy(false)
    if (!result.ok) setError(result.message)
    else setPassword('')
  }

  return (
    <form onSubmit={submit} className="mt-4 max-w-sm space-y-4" aria-label="Inloggen">
      {expired && (
        <p className="m-0" role="status">
          {REAUTH_MESSAGE}. Je gegevens op dit apparaat blijven gewoon bewerkbaar.
        </p>
      )}
      <label className="block">
        E-mailadres
        <input
          className={field}
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block">
        Wachtwoord
        <input
          className={field}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && (
        <p className="m-0" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className={button} disabled={busy}>
        {busy ? 'Bezig met inloggen…' : 'Inloggen'}
      </button>
    </form>
  )
}

function SignOut({ auth }: { auth: Auth }) {
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'confirm'>('idle')
  const [unsynced, setUnsynced] = useState(0)
  const answer = useRef<((yes: boolean) => void) | null>(null)

  async function start() {
    setPhase('syncing')
    const result = await auth.signOut(
      (n) =>
        new Promise<boolean>((resolve) => {
          setUnsynced(n)
          answer.current = resolve
          setPhase('confirm')
        }),
    )
    answer.current = null
    if (result === 'cancelled') setPhase('idle')
  }

  function reply(yes: boolean) {
    answer.current?.(yes)
    if (yes) setPhase('syncing')
  }

  const email = auth.record()?.email as string | undefined
  return (
    <div className="mt-4 max-w-sm space-y-4">
      <p className="m-0">Ingelogd{email ? ` als ${email}` : ''}.</p>
      {phase === 'confirm' ? (
        <div role="alertdialog" aria-labelledby="unsynced-warning" className="space-y-4">
          <p id="unsynced-warning" className="m-0 font-semibold">
            {changesLabel(unsynced)} {unsynced === 1 ? 'is' : 'zijn'} nog niet gesynchroniseerd. Uitloggen wist{' '}
            {unsynced === 1 ? 'die' : 'ze'} van dit apparaat.
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={button} onClick={() => reply(true)}>
              Toch uitloggen
            </button>
            <button type="button" className={secondary} onClick={() => reply(false)}>
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="m-0 text-grey">Uitloggen synchroniseert eerst en wist daarna alles van dit apparaat.</p>
          <button type="button" className={button} onClick={start} disabled={phase === 'syncing'}>
            {phase === 'syncing' ? 'Bezig met uitloggen…' : 'Uitloggen'}
          </button>
        </>
      )}
    </div>
  )
}

export function AccountPanel({ auth }: { auth: Auth }) {
  const state = useAuthState(auth)
  return (
    <section>
      <AccentHeading>Account</AccentHeading>
      {state === 'signed-in' ? <SignOut auth={auth} /> : <SignInForm key={state} auth={auth} expired={state === 'expired'} />}
    </section>
  )
}
