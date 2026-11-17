import { BaseAuthStore, ClientResponseError } from 'pocketbase'
import { vi } from 'vitest'
import type { AuthClient } from './auth'

// Test helpers for src/auth (T-0015). Not imported by the app.

function base64url(value: object): string {
  return btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
}

/** An unsigned JWT the SDK can read; only `exp` matters to its auth store. */
let issued = 0

export function fakeToken(expiresInSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  const payload = { exp, type: 'auth', collectionId: 'users', n: ++issued }
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.sig`
}

export const RECORD = { id: 'u1', collectionId: '_pb_users_auth_', collectionName: 'users', email: 'sander@example.invalid' }

export function responseError(status: number): ClientResponseError {
  return new ClientResponseError({ url: 'http://pb.invalid', status, response: {} })
}

/** A mocked PocketBase client: a real (in-memory) auth store and stubbed `users` calls. */
export function mockClient() {
  const authStore = new BaseAuthStore()
  const authWithPassword = vi.fn(async (_email: string, password: string) => {
    if (password !== 'correct horse') throw responseError(400)
    authStore.save(fakeToken(90 * 24 * 3600), RECORD)
  })
  const authRefresh = vi.fn(async () => {
    authStore.save(fakeToken(90 * 24 * 3600), authStore.record)
  })
  const collection = vi.fn(() => ({ authWithPassword, authRefresh }))
  const client: AuthClient = { authStore, collection }
  /** Refuses the next refresh like the SDK does: on a 401 it clears its own store first. */
  const refuseNextRefresh = (status: number) =>
    authRefresh.mockImplementationOnce(async () => {
      if (status === 401) authStore.clear()
      throw responseError(status)
    })
  return { client, authStore, authWithPassword, authRefresh, collection, refuseNextRefresh }
}
