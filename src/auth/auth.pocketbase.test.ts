// @vitest-environment node
// T-0015: sign-in against a real, throwaway PocketBase built from backend/. CI's
// `pocketbase-auth` job starts one on an empty database and sets the variables below.
// Skipped everywhere else. Never point this at the NAS (D-0006).
import PocketBase, { ClientResponseError, getTokenPayload } from 'pocketbase'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { openDb, type DiyDb } from '../db/db'
import { countUnsynced, createProject, updateProject } from '../db/write'
import { createAuth } from './auth'

const URL = process.env.POCKETBASE_TEST_URL ?? ''
const SU_EMAIL = process.env.POCKETBASE_TEST_SUPERUSER_EMAIL ?? ''
const SU_PASSWORD = process.env.POCKETBASE_TEST_SUPERUSER_PASSWORD ?? ''
const PASSWORD = 'ci-only-password-123456'

/** PocketBase's default *:auth rate limit allows 2 sign-ins per 3 s: wait and retry on 429. */
async function retry429<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (!(err instanceof ClientResponseError && err.status === 429) || attempt >= 10) throw err
      await new Promise((r) => setTimeout(r, 1500))
    }
  }
}

function client(): PocketBase {
  const pb = new PocketBase(URL)
  pb.autoCancellation(false)
  return pb
}

/** refreshAfterSync treats 429 as "unreachable", so wait out the *:auth limit before it. */
const authLimit = () => new Promise((r) => setTimeout(r, 3100))

describe.skipIf(!URL)('sign-in against a real PocketBase (T-0015)', { timeout: 60_000 }, () => {
  const su = client()
  let n = 0
  let db: DiyDb | undefined

  beforeAll(async () => {
    await retry429(() => su.collection('_superusers').authWithPassword(SU_EMAIL, SU_PASSWORD))
  })

  afterEach(async () => {
    await db?.delete()
    db = undefined
  })

  /** A fresh user, made by the superuser as in the admin screen (D-0013), and a fresh device. */
  async function setup() {
    const email = `sander-${Date.now()}-${++n}@ci.invalid`
    const user = await su
      .collection('users')
      .create({ email, password: PASSWORD, passwordConfirm: PASSWORD, verified: true })
    db = openDb(`auth-pocketbase-test-${n}`)
    const pb = client()
    const auth = createAuth({ client: pb, db })
    const signIn = (password = PASSWORD) =>
      retry429(async () => {
        const result = await auth.signIn(email, password)
        if (!result.ok && result.message.startsWith('Te veel')) {
          throw new ClientResponseError({ status: 429 })
        }
        return result
      })
    return { email, user, pb, auth, d: db, signIn }
  }

  it('signs in with email and password, with a 90-day token (D-0013)', async () => {
    const { auth, pb, signIn, email } = await setup()
    expect(await signIn()).toEqual({ ok: true })
    expect(auth.state()).toBe('signed-in')
    expect(pb.authStore.record?.email).toBe(email)
    const lifetime = getTokenPayload(pb.authStore.token).exp - Date.now() / 1000
    expect(Math.abs(lifetime - 90 * 24 * 3600)).toBeLessThan(120)
  })

  it('refuses a wrong password', async () => {
    const { auth, signIn } = await setup()
    expect(await signIn('wrong-password-123')).toEqual({ ok: false, message: 'E-mailadres of wachtwoord klopt niet.' })
    expect(auth.state()).toBe('signed-out')
  })

  it('renews the token after a sync', async () => {
    const { auth, pb, signIn } = await setup()
    await signIn()
    const before = pb.authStore.token
    await authLimit() // also gives the new token a new second
    expect(await retry429(() => auth.refreshAfterSync())).toBe('signed-in')
    expect(pb.authStore.token).not.toBe(before)
  })

  it('keeps local data editable and the outbox intact once the sign-in is revoked', async () => {
    const { auth, user, d, signIn } = await setup()
    await signIn()
    const project = await createProject({ title: 'Schuurdeur' }, d)

    // Changing the password is how Sander cuts off a device (D-0013).
    const newPassword = `${PASSWORD}-changed`
    await su.collection('users').update(user.id, { password: newPassword, passwordConfirm: newPassword })
    await authLimit()
    expect(await auth.refreshAfterSync()).toBe('expired')

    await updateProject(project.id, { title: 'Schuurdeur, geverfd' }, d)
    expect((await d.projects.get(project.id))?.title).toBe('Schuurdeur, geverfd')
    expect(await countUnsynced(d)).toBe(2)

    expect(await signIn(newPassword)).toEqual({ ok: true })
    expect(auth.state()).toBe('signed-in')
    expect(await countUnsynced(d)).toBe(2)
  })

  it('signs out with unsynced changes only after a second confirmation, leaving an empty database', async () => {
    const { auth, pb, d, signIn } = await setup()
    await signIn()
    await createProject({ title: 'Schuurdeur' }, d)

    const asked: number[] = []
    expect(await auth.signOut((count) => (asked.push(count), false))).toBe('cancelled')
    expect(asked).toEqual([1])
    expect(await d.projects.count()).toBe(1)
    expect(auth.state()).toBe('signed-in')

    expect(await auth.signOut((count) => (asked.push(count), true))).toBe('signed-out')
    expect(asked).toEqual([1, 1])
    for (const table of [d.projects, d.entries, d.photos, d.outbox]) expect(await table.count()).toBe(0)
    expect(pb.authStore.token).toBe('')
    expect(auth.state()).toBe('signed-out')
  })
})
