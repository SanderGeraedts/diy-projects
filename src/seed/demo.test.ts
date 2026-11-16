import { afterEach, describe, expect, it } from 'vitest'
import { openDb, type DiyDb } from '../db/db'
import { buildDemoData, seedIfEmpty } from './demo'

let db: DiyDb | undefined

afterEach(async () => {
  await db?.delete()
  db = undefined
})

describe('demo seed', () => {
  it('links every entry and photo to a project, and every cover to a photo', () => {
    const { projects, entries, photos } = buildDemoData()
    const projectIds = new Set(projects.map((p) => p.id))
    const photoIds = new Set(photos.map((p) => p.id))
    expect(projects.length).toBeGreaterThan(0)
    expect(entries.every((e) => projectIds.has(e.projectId))).toBe(true)
    expect(photos.every((p) => projectIds.has(p.projectId))).toBe(true)
    expect(projects.every((p) => p.coverPhotoId && photoIds.has(p.coverPhotoId))).toBe(true)
  })

  it('contains no real photos', () => {
    expect(buildDemoData().photos.every((p) => p.blob.type === 'image/svg+xml')).toBe(true)
  })

  it('fills an empty database once', async () => {
    db = openDb('seed-test')
    expect(await seedIfEmpty(db)).toBe(true)
    const count = await db.projects.count()
    expect(count).toBe(buildDemoData().projects.length)
    expect(await seedIfEmpty(db)).toBe(false)
    expect(await db.projects.count()).toBe(count)
  })
})
