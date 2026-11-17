import { AccountPanel } from '../auth/AccountPanel'
import { auth } from '../auth/session'
import { NotFound } from './NotFound'

// T-0015: the sign-in and sign-out page. Registered only when sync is on (router.tsx).
export function AccountPage() {
  return auth ? <AccountPanel auth={auth} /> : <NotFound />
}
