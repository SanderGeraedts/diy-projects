import { ClientResponseError } from 'pocketbase'
import { hasBase, isSlug, slugify, uniqueSlug } from '../db/slug'
import type { RecordApi, SyncAuth, SyncClient } from './engine'
import type { PurgeClient } from './purge'
import type { ServerRecord } from './records'

// Test helpers for src/sync (T-0016). Not imported by the app.
//
// A fake PocketBase that behaves like deploy/nas on the points sync relies on: records keep
// the id they're created with, owner-only access (404 for anyone else), `updated` set by the
// server on every save, the history hook (the overwritten version on every update) and the
// last-write-wins hook (an older `updatedAt` is kept in history and the stored record is
// returned unchanged). Requests can be made to fail.
//
// Reads (T-0026): like deploy/nas's rules, a list also returns other owners' public projects
// that aren't tombstoned, and their live entries and photos; the engine asks for its own.
//
// The bin (T-0022): like deploy/nas/pb_hooks/bin.pb.js, the owner's DELETE of a tombstoned
// project, entry or photo deletes it and what it holds for good: each record becomes a marker
// with `purgedAt`, without content or files, and its history rows go. A marker answers every
// later update, upload or create (also of a new record under it) with 410 Gone.
//
// Slugs (T-0027): like deploy/nas/pb_hooks/slugs.pb.js, a project's slug is made unique
// among its owner's other projects (purge markers left out, earlier slugs taken) on every
// create and update, and a rename's stored slug joins `oldSlugs`, without a new `updatedAt`.
//
// Files (T-0017): a multipart update stores each file under a new name, as PocketBase does
// (replacing the field's earlier file), and protected downloads need a file token.

export interface HistoryRow {
  sourceCollection: string
  recordId: string
  data: Record<string, unknown>
}

/** `upload` is an update with files (multipart); `download` fetches one file. */
export type Operation = 'getList' | 'create' | 'update' | 'upload' | 'token' | 'download' | 'delete'

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

  /** Whether a record, or the project or entry holding it, was deleted for good. */
  private purgedUnder(collection: string, record: { id: string; [field: string]: unknown }): boolean {
    const gone = (c: string, id: unknown) => !!this.records.get(c)?.get(String(id))?.purgedAt
    return (
      gone(collection, record.id) ||
      (collection !== 'projects' && gone('projects', record.projectId)) ||
      (collection === 'photos' && gone('entries', record.entryId))
    )
  }

  /** What bin.pb.js does on the owner's DELETE of a tombstoned record. */
  purge(collection: string, id: string): void {
    const record = this.table(collection).get(id)
    if (!record) throw responseError(404)
    if (record.purgedAt) return
    if (!record.deletedAt) throw responseError(400)
    const time = new Date(this.clock).toISOString()
    const targets: [string, ServerRecord][] = [[collection, record]]
    const holds = (c: string, field: string) =>
      [...this.table(c).values()].filter((r) => r[field] === id && r.owner === record.owner).map((r) => [c, r] as [string, ServerRecord])
    if (collection === 'projects') targets.push(...holds('entries', 'projectId'), ...holds('photos', 'projectId'))
    if (collection === 'entries') targets.push(...holds('photos', 'entryId'))
    const EMPTY: Record<string, Record<string, unknown>> = {
      projects: { title: '', description: '', tags: [], coverPhotoId: '', public: false, slug: '', oldSlugs: [] },
      entries: { note: '' },
      photos: { original: '', copy: '', thumbnail: '', takenAt: '', width: 0, height: 0 },
    }
    for (const [c, r] of targets) {
      if (r.purgedAt) continue
      for (const field of ['original', 'copy', 'thumbnail']) {
        if (typeof r[field] === 'string' && r[field]) this.files.delete(`${c}/${r.id}/${r[field] as string}`)
      }
      const marker = { ...r, ...EMPTY[c], deletedAt: r.deletedAt || time, updatedAt: time, purgedAt: time }
      this.table(c).set(r.id, { ...marker, updated: this.now() } as ServerRecord)
    }
    const ids = new Set(targets.map(([, r]) => r.id))
    for (let i = this.history.length - 1; i >= 0; i--) if (ids.has(this.history[i]!.recordId)) this.history.splice(i, 1)
  }

  /** What slugs.pb.js does to a project before it is saved (`stored`: the version before). */
  settleSlug(record: ServerRecord, stored: ServerRecord | undefined): void {
    const list = (v: unknown) => (Array.isArray(v) ? v.filter(isSlug) : [])
    const others = [...this.table('projects').values()].filter((r) => r.owner === record.owner && r.id !== record.id && !r.purgedAt)
    const taken = new Set(others.flatMap((r) => [String(r.slug ?? ''), ...list(r.oldSlugs)]))
    const current = new Set(others.map((r) => String(r.slug ?? '')))
    const base = slugify(String(record.title ?? ''))
    const wanted = isSlug(record.slug) ? record.slug : isSlug(stored?.slug) ? stored.slug : base
    const slug = uniqueSlug(wanted, taken, hasBase(wanted, base) ? base : wanted)
    const old = [...list(stored?.oldSlugs), ...list(record.oldSlugs), ...(isSlug(stored?.slug) ? [stored.slug] : [])]
    record.slug = slug
    record.oldSlugs = [...new Set(old)].filter((s) => s !== slug && !current.has(s))
  }

  /** Readable by anyone, as the T-0026 list rules have it (deploy/nas/pb_migrations/). */
  isPublic(collection: string, record: ServerRecord): boolean {
    if (record.deletedAt) return false
    const project = collection === 'projects' ? record : this.records.get('projects')?.get(String(record.projectId))
    return !!project && project.public === true && !project.deletedAt
  }

  /** A client signed in as `userId`. Set `signedIn = false` on it to make every request a 401. */
  client(userId = 'u1'): SyncClient & PurgeClient & { signedIn: boolean } {
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
      collection(name: string): RecordApi & { delete(id: string, options?: Record<string, unknown>): Promise<boolean> } {
        const guard = (op: Operation, id?: string) => {
          if (!client.signedIn) throw responseError(401)
          server.check(op, name, id)
        }
        return {
          async getList(_page, perPage, options = {}) {
            guard('getList')
            const filter = String(options.filter ?? '')
            const visible = [...server.table(name).values()].filter(
              (r) => (r.owner === userId || server.isPublic(name, r)) && matches(r, filter),
            )
            visible.sort((a, b) => (a.updated === b.updated ? cmp(a.id, b.id) : cmp(a.updated, b.updated)))
            return { items: visible.slice(0, perPage).map(clone) }
          },
          async create(body) {
            guard('create', String(body.id))
            const table = server.table(name)
            const id = String(body.id)
            if (body.owner === userId && server.purgedUnder(name, { ...body, id })) throw responseError(410)
            if (table.has(id)) throw responseError(400)
            if (body.owner !== userId) throw responseError(400)
            const record = { ...clone(body), id, updated: server.now() } as ServerRecord
            if (name === 'projects') server.settleSlug(record, undefined)
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
            if (stored.purgedAt) throw responseError(410) // bin.pb.js
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
            if (name === 'projects') server.settleSlug(record, stored)
            table.set(id, record)
            return clone(record)
          },
          async delete(id) {
            guard('delete', id)
            const stored = server.table(name).get(id)
            if (!stored || stored.owner !== userId) throw responseError(404)
            server.purge(name, id)
            return true
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
  // T-0026: the engine asks for its owner's records only.
  const owner = /^owner = "([^"]*)"(?: && (.*))?$/.exec(filter)
  if (owner) return record.owner === owner[1] && matches(record, owner[2] ?? '')
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
