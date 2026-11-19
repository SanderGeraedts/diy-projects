import type { DiyDb, Entry, Photo, Project, ProjectStatus } from '../db/db'

// D-0006: previews and local dev start with these demo projects. The photos are drawn here,
// so the seed never contains real photos or location data.

interface DemoEntry {
  date: string
  note: string
  photos: number
}

interface DemoProject {
  slug: string
  title: string
  description: string
  status: ProjectStatus
  tags: string[]
  hue: number
  entries: DemoEntry[]
}

const DEMO: DemoProject[] = [
  {
    slug: 'garden-bench',
    title: 'Tuinbank',
    description: 'Een tweezitsbank van overgebleven vlonderplanken, geolied voor de winter.',
    status: 'in progress',
    tags: ['hout', 'tuin'],
    hue: 28,
    entries: [
      { date: '2026-10-04', note: 'Poten en zitregels op lengte gezaagd.', photos: 3 },
      { date: '2026-10-11', note: 'Frame gelijmd en geschroefd; haaks binnen 2 mm.', photos: 2 },
      { date: '2026-10-25', note: 'Eerste laag olie. Na een droge week nog een tweede.', photos: 1 },
    ],
  },
  {
    slug: 'bathroom-shelf',
    title: 'Badkamerplank',
    description: 'Zwevende eiken plank boven de wastafel, met verborgen dragers.',
    status: 'done',
    tags: ['hout', 'badkamer'],
    hue: 200,
    entries: [
      { date: '2026-08-15', note: 'Met een diamantboor in de tegels geboord, rustig aan.', photos: 2 },
      { date: '2026-08-16', note: 'Plank hangt. Waterpas, en hij houdt de handdoeken.', photos: 2 },
    ],
  },
  {
    slug: 'bike-rack',
    title: 'Fietsenrek voor de schuur',
    description: 'Wandrek voor drie fietsen, van stalen buis.',
    status: 'idea',
    tags: ['metaal', 'schuur'],
    hue: 140,
    entries: [{ date: '2026-11-01', note: 'Schuurmuur opgemeten: 2,4 m vrij.', photos: 1 }],
  },
  {
    slug: 'attic-insulation',
    title: 'Zolderisolatie',
    description: 'Minerale wol tussen de sporen, dampremmende folie, dan gipsplaat.',
    status: 'paused',
    tags: ['isolatie', 'zolder'],
    hue: 280,
    entries: [
      { date: '2026-06-20', note: 'Eerste vak klaar. Wachten op koeler weer om verder te gaan.', photos: 2 },
    ],
  },
]

const SEED_TIME = '2026-11-16T12:00:00.000Z'

/** A drawn placeholder photo, so demo data needs no real images. */
export function demoPhotoSvg(label: string, hue: number, variant: number): string {
  const light = 55 + ((variant * 7) % 20)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue} 45% ${light}%)"/>
<stop offset="1" stop-color="hsl(${(hue + 40) % 360} 40% ${light - 25}%)"/>
</linearGradient></defs>
<rect width="1600" height="1200" fill="url(#g)"/>
<circle cx="${400 + variant * 180}" cy="420" r="220" fill="white" fill-opacity="0.15"/>
<text x="80" y="1110" font-family="sans-serif" font-size="72" fill="white" fill-opacity="0.85">${label}</text>
</svg>`
}

export interface DemoData {
  projects: Project[]
  entries: Entry[]
  photos: Photo[]
}

export function buildDemoData(): DemoData {
  const projects: Project[] = []
  const entries: Entry[] = []
  const photos: Photo[] = []

  for (const p of DEMO) {
    const projectId = `demo-${p.slug}`
    let coverPhotoId: string | undefined
    p.entries.forEach((e, ei) => {
      const entryId = `${projectId}-entry-${ei + 1}`
      entries.push({
        id: entryId,
        projectId,
        date: e.date,
        note: e.note,
        createdAt: SEED_TIME,
        updatedAt: SEED_TIME,
        deletedAt: null,
      })
      for (let i = 0; i < e.photos; i++) {
        const id = `${entryId}-photo-${i + 1}`
        const svg = demoPhotoSvg(`${p.title} · ${e.date}`, p.hue, ei * 3 + i)
        const blob = new Blob([svg], { type: 'image/svg+xml' })
        // Demo photos never sync (D-0006): no original and nothing to upload.
        photos.push({
          id,
          projectId,
          entryId,
          takenAt: `${e.date}T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
          blob,
          thumbnail: blob,
          original: null,
          uploads: { original: 'none', copy: 'none', thumbnail: 'none' },
          width: 1600,
          height: 1200,
          createdAt: SEED_TIME,
          updatedAt: SEED_TIME,
          deletedAt: null,
        })
        coverPhotoId = id
      }
    })
    projects.push({
      id: projectId,
      title: p.title,
      description: p.description,
      status: p.status,
      tags: p.tags,
      coverPhotoId,
      public: true,
      createdAt: SEED_TIME,
      updatedAt: SEED_TIME,
      deletedAt: null,
    })
  }
  return { projects, entries, photos }
}

/**
 * Fills an empty database with the demo projects. Leaves a database with data alone. Writes
 * v2 records directly, without outbox rows: demo data never syncs (D-0006).
 */
export async function seedIfEmpty(db: DiyDb): Promise<boolean> {
  return db.transaction('rw', db.projects, db.entries, db.photos, async () => {
    if ((await db.projects.count()) > 0) return false
    const data = buildDemoData()
    await db.projects.bulkAdd(data.projects)
    await db.entries.bulkAdd(data.entries)
    await db.photos.bulkAdd(data.photos)
    return true
  })
}
