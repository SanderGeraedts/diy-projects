// @vitest-environment node
// Node, like src/db's tests: fake-indexeddb and Dexie behave as in the browser there.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb, type DiyDb } from '../db/db'
import { countUnsynced, createProject, updateProject } from '../db/write'
import { authStateOf, createAuth, REAUTH_MESSAGE, signInMessage } from './auth'
import { fakeToken, mockClient, RECORD, responseError } from './testing'

let db: DiyDb | undefined
let counter = 0

function freshDb(): DiyDb {
  db = openDb(`auth-test-${++counter}`)
  return db
}

afterEach(async () => {
  await db?.delete()
  db = undefined
})

function setup(syncNow = vi.fn(async () => {})) {
  const mock = mockClient()
  const d = freshDb()
  const auth = createAuth({ client: mock.client, db: d, syncNow })
  return { ...mock, d, auth, syncNow }
}

describe('sign-in state', () => {
  it('is signed-out with nothing stored', () => {
    expect(setup().auth.state()).toBe('signed-out')
  })

  it('is expired when the stored token has run out, keeping the account', () => {
    const { auth, authStore } = setup()
    authStore.save(fakeToken(-60), RECORD)
    expect(auth.state()).toBe('expired')
    expect(auth.record()?.email).toBe(RECORD.email)
  })

  it('says what the sync status shows (T-0018)', () => {
    expect(REAUTH_MESSAGE).toBe('Opnieuw inloggen om te synchroniseren')
  })
})

describe('signIn', () => {
  it('signs in against the users collection and keeps the token in the SDK store', async () => {
    const { auth, collection, authWithPassword, authStore } = setup()
    const listener = vi.fn()
    auth.subscribe(listener)
    expect(await auth.signIn(' sander@example.invalid ', 'correct horse')).toEqual({ ok: true })
    expect(collection).toHaveBeenCalledWith('users')
    expect(authWithPassword).toHaveBeenCalledWith('sander@example.invalid', 'correct horse')
    expect(authStore.token).not.toBe('')
    expect(auth.state()).toBe('signed-in')
    expect(listener).toHaveBeenCalled()
  })

  it('reports a wrong password in Dutch and stays signed out', async () => {
    const { auth } = setup()
    expect(await auth.signIn('sander@example.invalid', 'wrong')).toEqual({
      ok: false,
      message: 'E-mailadres of wachtwoord klopt niet.',
    })
    expect(auth.state()).toBe('signed-out')
  })

  it.each([
    [0, 'Geen verbinding met de server. Probeer het later opnieuw.'],
    [429, 'Te veel pogingen. Wacht even en probeer het opnieuw.'],
    [500, 'Inloggen is mislukt. Probeer het later opnieuw.'],
  ])('explains status %i', (status, message) => {
    expect(signInMessage(responseError(status))).toBe(message)
  })

  it('signs in again after an expiry', async () => {
    const { auth, authStore } = setup()
    authStore.save(fakeToken(-60), RECORD)
    await auth.signIn(RECORD.email, 'correct horse')
    expect(auth.state()).toBe('signed-in')
  })
})

describe('refreshAfterSync', () => {
  it('renews the token', async () => {
    const { auth, authStore, authRefresh } = setup()
    await auth.signIn(RECORD.email, 'correct horse')
    const before = authStore.token
    expect(await auth.refreshAfterSync()).toBe('signed-in')
    expect(authRefresh).toHaveBeenCalledOnce()
    expect(authStore.token).not.toBe(before)
  })

  it.each([401, 403])('marks a token the NAS refuses (%i) as expired, keeping the account', async (status) => {
    const { auth, refuseNextRefresh } = setup()
    await auth.signIn(RECORD.email, 'correct horse')
    refuseNextRefresh(status)
    expect(await auth.refreshAfterSync()).toBe('expired')
    expect(auth.record()?.email).toBe(RECORD.email)
  })

  it('changes nothing when the NAS is unreachable', async () => {
    const { auth, authRefresh, authStore } = setup()
    await auth.signIn(RECORD.email, 'correct horse')
    const token = authStore.token
    authRefresh.mockRejectedValueOnce(responseError(0))
    expect(await auth.refreshAfterSync()).toBe('signed-in')
    expect(authStore.token).toBe(token)
  })

  it('does not call the NAS when not signed in', async () => {
    const { auth, authRefresh } = setup()
    expect(await auth.refreshAfterSync()).toBe('signed-out')
    expect(authRefresh).not.toHaveBeenCalled()
  })
})

describe('an expired sign-in never blocks local use (D-0013)', () => {
  it('keeps local data editable and the outbox intact', async () => {
    const { auth, refuseNextRefresh, d } = setup()
    await auth.signIn(RECORD.email, 'correct horse')
    const project = await createProject({ title: 'Schuurdeur' }, d)
    refuseNextRefresh(401)
    await auth.refreshAfterSync()
    expect(auth.state()).toBe('expired')

    await updateProject(project.id, { title: 'Schuurdeur, geverfd' }, d)
    expect((await d.projects.get(project.id))?.title).toBe('Schuurdeur, geverfd')
    expect(await countUnsynced(d)).toBe(2)
  })

  it('markExpired keeps the outbox, also after the SDK cleared its store on a 401', async () => {
    const { auth, authStore, d } = setup()
    await auth.signIn(RECORD.email, 'correct horse')
    await createProject({ title: 'Schuurdeur' }, d)
    authStore.clear() // what the SDK does on any 401
    auth.markExpired()
    expect(auth.state()).toBe('expired')
    expect(auth.record()?.email).toBe(RECORD.email)
    expect(await countUnsynced(d)).toBe(1)
  })
})

describe('signOut', () => {
  it('syncs first, then clears the device and the token without asking when all is synced', async () => {
    const { auth, authStore, d, syncNow } = setup()
    await auth.signIn(RECORD.email, 'correct horse')
    await createProject({ title: 'Schuurdeur' }, d)
    // A sync that empties the outbox, as T-0016's will once the NAS confirms.
    syncNow.mockImplementationOnce(async () => {
      await d.outbox.clear()
    })
    const confirm = vi.fn(() => true)
    expect(await auth.signOut(confirm)).toBe('signed-out')
    expect(syncNow).toHaveBeenCalledOnce()
    expect(confirm).not.toHaveBeenCalled()
    expect(await d.projects.count()).toBe(0)
    expect(authStore.token).toBe('')
    expect(authStateOf(authStore)).toBe('signed-out')
  })

  it('asks a second time with the unsynced count and keeps everything when declined', async () => {
    const { auth, d } = setup()
    await auth.signIn(RECORD.email, 'correct horse')
    await createProject({ title: 'Schuurdeur' }, d)
    await createProject({ title: 'Fietsenrek' }, d)
    const confirm = vi.fn(() => false)
    expect(await auth.signOut(confirm)).toBe('cancelled')
    expect(confirm).toHaveBeenCalledWith(2)
    expect(await d.projects.count()).toBe(2)
    expect(await countUnsynced(d)).toBe(2)
    expect(auth.state()).toBe('signed-in')
  })

  it('clears records, photos, outbox and token once confirmed', async () => {
    const { auth, d } = setup()
    await auth.signIn(RECORD.email, 'correct horse')
    await createProject({ title: 'Schuurdeur' }, d)
    expect(await auth.signOut(async () => true)).toBe('signed-out')
    expect(await d.projects.count()).toBe(0)
    expect(await countUnsynced(d)).toBe(0)
    expect(auth.state()).toBe('signed-out')
  })

  it('still asks when the sync attempt fails', async () => {
    const { auth, d } = setup(vi.fn(async () => Promise.reject(new Error('offline'))))
    await auth.signIn(RECORD.email, 'correct horse')
    await createProject({ title: 'Schuurdeur' }, d)
    const confirm = vi.fn(() => false)
    expect(await auth.signOut(confirm)).toBe('cancelled')
    expect(confirm).toHaveBeenCalledWith(1)
    expect(await d.projects.count()).toBe(1)
  })

  it('also signs out an expired sign-in', async () => {
    const { auth, authStore } = setup()
    authStore.save(fakeToken(-60), RECORD)
    expect(await auth.signOut(() => true)).toBe('signed-out')
    expect(auth.state()).toBe('signed-out')
  })
})
