import { ClientResponseError } from 'pocketbase'
import { describe, expect, it, vi } from 'vitest'
import { purgeErrorMessage, purgeOnNas } from './purge'

describe('purgeOnNas (T-0022)', () => {
  it('is the DELETE of the project or entry, never one request per file', async () => {
    const calls: [string, string][] = []
    const client = {
      collection: (name: string) => ({
        delete: vi.fn(async (id: string) => {
          calls.push([name, id])
          return true
        }),
      }),
    }
    await purgeOnNas(client, 'project', 'p1')
    await purgeOnNas(client, 'entry', 'e1')
    expect(calls).toEqual([
      ['projects', 'p1'],
      ['entries', 'e1'],
    ])
  })

  it('passes the NAS refusing it on', async () => {
    const client = {
      collection: () => ({ delete: () => Promise.reject(new ClientResponseError({ status: 400 })) }),
    }
    await expect(purgeOnNas(client, 'project', 'p1')).rejects.toMatchObject({ status: 400 })
  })
})

describe('purgeErrorMessage', () => {
  const err = (status: number) => new ClientResponseError({ status })
  it('says what went wrong, in Dutch', () => {
    expect(purgeErrorMessage(err(0))).toMatch(/kan alleen online/)
    expect(purgeErrorMessage(err(400))).toMatch(/nog niet in de prullenbak/)
    expect(purgeErrorMessage(err(404))).toMatch(/Log opnieuw in/)
    expect(purgeErrorMessage(err(401))).toMatch(/Log opnieuw in/)
    expect(purgeErrorMessage(err(429))).toMatch(/te veel verzoeken/)
    expect(purgeErrorMessage(err(500))).toBe('Definitief verwijderen is niet gelukt. Probeer het opnieuw.')
    expect(purgeErrorMessage(new Error('x'))).toBe('Definitief verwijderen is niet gelukt. Probeer het opnieuw.')
  })
})
