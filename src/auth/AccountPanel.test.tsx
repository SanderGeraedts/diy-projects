import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDb, type DiyDb } from '../db/db'
import { createProject } from '../db/write'
import { createAuth } from './auth'
import { AccountPanel } from './AccountPanel'
import { auth as appAuth, pb } from './session'
import { fakeToken, mockClient, RECORD } from './testing'

let db: DiyDb | undefined
let counter = 0

afterEach(async () => {
  cleanup()
  await db?.delete()
  db = undefined
})

function setup() {
  const mock = mockClient()
  db = openDb(`account-panel-test-${++counter}`)
  const syncNow = vi.fn(async () => {})
  const auth = createAuth({ client: mock.client, db, syncNow })
  render(<AccountPanel auth={auth} />)
  return { ...mock, auth, d: db, syncNow }
}

describe('the app outside production (D-0006)', () => {
  it('has no PocketBase client and no sign-in', () => {
    expect(pb).toBeNull()
    expect(appAuth).toBeNull()
  })
})

describe('AccountPanel', () => {
  it('marks the fields up for the password manager', () => {
    setup()
    expect(screen.getByLabelText('E-mailadres')).toHaveAttribute('autocomplete', 'username')
    expect(screen.getByLabelText('Wachtwoord')).toHaveAttribute('autocomplete', 'current-password')
  })

  it('signs in and then offers sign-out', async () => {
    const { authWithPassword } = setup()
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: RECORD.email } })
    fireEvent.change(screen.getByLabelText('Wachtwoord'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inloggen' }))
    expect(await screen.findByRole('button', { name: 'Uitloggen' })).toBeInTheDocument()
    expect(authWithPassword).toHaveBeenCalledWith(RECORD.email, 'correct horse')
    expect(screen.getByText(`Ingelogd als ${RECORD.email}.`)).toBeInTheDocument()
  })

  it('shows a wrong password', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: RECORD.email } })
    fireEvent.change(screen.getByLabelText('Wachtwoord'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inloggen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mailadres of wachtwoord klopt niet.')
  })

  it('asks to sign in again after an expiry, with the email filled in', async () => {
    const { authStore } = setup()
    act(() => authStore.save(fakeToken(-60), RECORD))
    expect(await screen.findByText(/Opnieuw inloggen om te synchroniseren/)).toBeInTheDocument()
    expect(screen.getByLabelText('E-mailadres')).toHaveValue(RECORD.email)
  })

  it('warns with the unsynced count, and signs out only on the second confirmation', async () => {
    const { auth, d, syncNow } = setup()
    await act(() => auth.signIn(RECORD.email, 'correct horse'))
    await createProject({ title: 'Schuurdeur' }, d)

    fireEvent.click(await screen.findByRole('button', { name: 'Uitloggen' }))
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('1 wijziging is nog niet gesynchroniseerd')
    expect(syncNow).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
    expect(await screen.findByRole('button', { name: 'Uitloggen' })).toBeEnabled()
    expect(await d.projects.count()).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Uitloggen' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Toch uitloggen' }))
    expect(await screen.findByRole('button', { name: 'Inloggen' })).toBeInTheDocument()
    await waitFor(async () => expect(await d.projects.count()).toBe(0))
    expect(auth.state()).toBe('signed-out')
  })
})
