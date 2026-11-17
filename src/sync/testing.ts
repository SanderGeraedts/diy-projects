import { ClientResponseError } from 'pocketbase'
import type { RecordApi, SyncAuth, SyncClient } from './engine'
import type { ServerRecord } from './records'

// Test helpers for src/sync (T-0016). Not imported by the app.
//
// A fake PocketBase that behaves like deploy/nas on the points sync relies on: records keep
// the id they're created with, owner-only access (404 for anyone else), `updated` set by the
// server on every save, the history hook (the overwritten version on every update) and the
// last-write-wins hook (an older `updatedAt` is kept in history and the stored record is
// returned unchanged). Requests can be made to fail.
//
// Files (T-0017): a multipart update stores each file under a new name, as PocketBase does
// (replacing the field's earlier file), and protected downloads need a file token.

export interface HistoryRow {
  sourceCollection: string
  recordId: string
  data: Record<string, unknown>
}

/** `upload` is an update with files (multipart); `download` fetches one file. */
export type Operation = 'getList' | 'create' | 'update' | 'upload' | 'token' | 'download'

/** Return an error to fail a request, or nothing to let it through. */
export type Interceptor = (
  op: Operation,
  collection: string,
  id?: string,
  files?: string[],
) => ClientResponseError | Error | void

export function responseError(status: number): ClientResponseError {
  return new ClientResponseError({ url: 'http://pb.invalid', status, response: {} })
}

const clone = <T>(value: T): T => structuredClone(value)

export class FakePocketBase {
  readonly records = new Map<string, Map<string, ServerRecord>>()
  readonly history: HistoryRow[] = []
  readonly requests: { op: Operation; collection: string; id?: string; files?: string[] }[] = []
  /** Stored files by `collection/id/filename`. */
  readonly files = new Map<string, Blob>()
  private readonly tokens = new Map<string, string>()
  private fileCounter = 0
  interceptor: Interceptor | null = null
  private clock = Date.parse('2026-11-17T10:00:00.000Z')

  constructor(readonly collections: readonly string[] = ['projects', 'entries', 'photos']) {
    for (const name of collections) this.records.set(name, new Map())
  }

  private now(): string {
    this.clock += 1
    return new Date(this.clock).toISOString().replace('T', ' ')
  }

  private table(name: string): Map<string, ServerRecord> {
    const table = this.records.get(name)
    if (!table) throw responseError(404)
    return table
  }

  /** All records of a collection, oldest `updated` first. */
  all(collection: string): ServerRecord[] {
    return [...this.table(collection).values()].map(clone)
  }

  get(collection: string, id: string): ServerRecord | undefined {
    const record = this.table(collection).get(id)
    return record && clone(record)
  }

  /** Changes a record as another device's push would, without going through a client. */
  put(collection: string, record: { id: string; [field: string]: unknown }): void {
    this.table(collection).set(record.id, { ...clone(record), updated: this.now() })
  }

  /** A stored file of a record, by its field. */
  file(collection: string, id: string, field: string): Blob | undefined {
    const name = this.table(collection).get(id)?.[field]
    return typeof name === 'string' && name ? this.files.get(`${collection}/${id}/${name}`) : undefined
  }

  /** Fetches a file URL made by a client's `files.getURL`, as the browser's fetch would. */
  readonly fetchFile = async (url: string): Promise<Blob> => {
    const match = /^fake:\/api\/files\/([^/]+)\/([^/]+)\/([^?]+)\?token=(.*)$/.exec(url)
    if (!match) throw responseError(404)
    const [, collection, id, name, token] = match as unknown as [string, string, string, string, string]
    this.check('download', collection, id)
    const record = this.table(collection).get(id)
    const user = this.tokens.get(token)
    const blob = this.files.get(`${collection}/${id}/${name}`)
    if (!record || !user || record.owner !== user || !blob) throw responseError(404)
    return blob
  }

  private check(op: Operation, collection: string, id?: string, files?: string[]) {
    this.requests.push(files ? { op, collection, id, files } : { op, collection, id })
    const err = this.interceptor?.(op, collection, id, files)
    if (err) throw err
  }

  /** A client signed in as `userId`. Set `signedIn = false` on it to make every request a 401. */
  client(userId = 'u1'): SyncClient & { signedIn: boolean } {
    const server = this
    const client = {
      signedIn: true,
      authStore: { record: { id: userId } as { id: string } | null },
      files: {
        async getToken() {
          if (!client.signedIn) throw responseError(401)
          server.check('token', '')
          const token = `t${++server.fileCounter}`
          server.tokens.set(token, userId)
          return token
        },
        getURL(record: { [key: string]: unknown }, filename: string, query: Record<string, unknown> = {}) {
          const collection = String(record.collectionName ?? 'photos')
          return `fake:/api/files/${collection}/${String(record.id)}/${filename}?token=${String(query.token ?? '')}`
        },
      },
      collection(name: string): RecordApi {
        const guard = (op: Operation, id?: string) => {
          if (!client.signedIn) throw responseError(401)
          server.check(op, name, id)
        }
        return {
          async getList(_page, perPage, options = {}) {
            guard('getList')
            const filter = String(options.filter ?? '')
            const visible = [...server.table(name).values()].filter((r) => r.owner === userId && matches(r, filter))
            visible.sort((a, b) => (a.updated === b.updated ? cmp(a.id, b.id) : cmp(a.updated, b.updated)))
            return { items: visible.slice(0, perPage).map(clone) }
          },
          async create(body) {
            guard('create', String(body.id))
            const table = server.table(name)
            const id = String(body.id)
            if (table.has(id)) throw responseError(400)
            if (body.owner !== userId) throw responseError(400)
            const record = { ...clone(body), id, updated: server.now() } as ServerRecord
            table.set(id, record)
            return clone(record)
          },
          async update(id, input) {
            if (input instanceof FormData) {
              const fields = [...input.keys()]
              if (!client.signedIn) throw responseError(401)
              server.check('upload', name, id, fields)
            } else guard('update', id)
            const table = server.table(name)
            const stored = table.get(id)
            if (!stored || stored.owner !== userId) throw responseError(404)
            const body: Record<string, unknown> = input instanceof FormData ? {} : input
            if (input instanceof FormData) {
              for (const [field, value] of input.entries()) {
                if (typeof value === 'string') {
                  body[field] = value
                  continue
                }
                const old = stored[field]
                if (typeof old === 'string' && old) server.files.delete(`${name}/${id}/${old}`)
                const filename = `${++server.fileCounter}_${value.name || 'blob'}`
                server.files.set(`${name}/${id}/${filename}`, value)
                body[field] = filename
              }
            }
            const incoming = { ...stored, ...clone(body) }
            const older =
              typeof body.updatedAt === 'string' &&
              Date.parse(body.updatedAt) < Date.parse(String(stored.updatedAt))
            if (older) {
              // last_write_wins.pb.js
              server.history.push({ sourceCollection: name, recordId: id, data: clone(incoming) })
              return clone(stored)
            }
            // history.pb.js (projects and entries only)
            if (name !== 'photos') server.history.push({ sourceCollection: name, recordId: id, data: clone(stored) })
            const record = { ...incoming, id, updated: server.now() }
            table.set(id, record)
            return clone(record)
          },
        }
      },
    }
    return client
  }
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** The two filter forms the engine sends (and no filter). */
function matches(record: ServerRecord, filter: string): boolean {
  if (filter === '') return true
  const since = /^updated >= "([^"]*)"$/.exec(filter)
  if (since) return record.updated >= since[1]!
  const after = /^\(updated > "([^"]*)" \|\| \(updated = "([^"]*)" && id > "([^"]*)"\)\)$/.exec(filter)
  if (after) return record.updated > after[1]! || (record.updated === after[2]! && record.id > after[3]!)
  throw new Error(`fake PocketBase can't read the filter: ${filter}`)
}

/** A sign-in that is signed in until told otherwise. */
export function fakeAuth(client?: { signedIn: boolean }) {
  let state: ReturnType<SyncAuth['state']> = 'signed-in'
  const auth = {
    state: () => state,
    markExpired: () => {
      state = 'expired'
    },
    refreshAfterSync: async () => state,
    refreshes: 0,
    set(next: ReturnType<SyncAuth['state']>) {
      state = next
      if (client) client.signedIn = next === 'signed-in'
    },
  }
  const refresh = auth.refreshAfterSync
  auth.refreshAfterSync = async () => {
    auth.refreshes++
    return refresh()
  }
  return auth
}
