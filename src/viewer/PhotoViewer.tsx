import { Link, useNavigate, useParams, useRouter } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { formatDate } from '../components/format'
import { usePhotoUrl, type ShownPhoto } from '../components/PhotoImage'
import { AccentHeading } from '../components/ui'
import { db, type Entry, type Project } from '../db/db'
import { deletePhoto, updateProject } from '../db/write'
import { usePublic, useVisitor } from '../public/mode'
import { UNREACHABLE } from '../public/ui'
import { photoIndex, photoNumber, photoSequence, type SequencePhoto } from '../routes/paths'
import { SlugRedirect, useProjectBySlug } from '../routes/projectBySlug'
import { ConfirmDelete, PhotoActions } from './PhotoActions'
import {
  IDENTITY,
  clampTransform,
  dragAxis,
  fitSize,
  maxScale,
  swipeResult,
  zoomAt,
  type Size,
  type Transform,
} from './gestures'

// T-0008: the full-screen viewer. It has its own URL, so the browser's back button closes it
// and a reload reopens it. Moving between photos replaces the URL, so back always closes.
// It shows the 2560 px copy (photo.blob, D-0003) from the device, so it works offline.
// Gestures are plain pointer events: swipe left/right, swipe down to close, pinch, double-tap.
// T-0009: from here a photo becomes the project's cover, or is deleted (a tombstone, D-0002).
// Photos are never edited (D-0002): no rotate or crop.
// T-0026: a visitor sees the same viewer, read from the NAS, without the cover and delete
// actions (D-0025).
// T-0029 (D-0031): it moves through all of the project's live photos in the project page's
// order, across days; the counter and label stay per day.

const SETTLE_MS = 200
const DOUBLE_TAP_MS = 300

interface Point {
  x: number
  y: number
}

type Gesture =
  | { kind: 'drag'; start: Point; startTransform: Transform; axis: 'x' | 'y' | null; startTime: number; moved: boolean }
  | { kind: 'pinch'; startDistance: number; startMid: Point; startTransform: Transform }

/** One photo the viewer can show, with its entry, day and place in that day (routes/paths.ts). */
type ViewerPhoto = SequencePhoto<Pick<Entry, 'id' | 'date' | 'note'>, ShownPhoto>

/** What the viewer shows: the project and all its live photos in the project page's order. */
interface ViewerData {
  project: Pick<Project, 'id' | 'coverPhotoId'> | undefined
  sequence: ViewerPhoto[]
}

export function PhotoViewer() {
  return useVisitor() ? <VisitorPhotoViewer /> : <OwnerPhotoViewer />
}

// T-0027 (D-0029): the address is the project's slug, the entry's day and the photo's place
// in it (routes/paths.ts), never an id.

function OwnerPhotoViewer() {
  const { slug, day, n } = useParams({ from: '/projects/$slug/$day/$n' })
  const project = useProjectBySlug(slug)
  const projectId = project?.id ?? ''
  // All of the project's entries and photos, so the viewer can move across days (D-0031).
  const sequence = useLiveQuery(async () => {
    if (!projectId) return null
    const [entries, photos] = await Promise.all([
      db.entries.where('projectId').equals(projectId).toArray(),
      db.photos.where('projectId').equals(projectId).toArray(),
    ])
    return photoSequence(entries, photos)
  }, [projectId])
  if (project && project.slug !== slug) return <SlugRedirect slug={project.slug} />
  const data: ViewerData | null | undefined =
    project === null ? null : project === undefined || sequence === undefined ? undefined : sequence && { sequence, project }
  return <PhotoViewerView slug={slug} day={day} n={n} data={data} readOnly={false} />
}

function VisitorPhotoViewer() {
  const { slug, day, n } = useParams({ from: '/projects/$slug/$day/$n' })
  // The project's timeline, loaded once for all its photos (the source keeps it a minute).
  const loaded = usePublic((source) => source.project(slug), `project:${slug}`)
  if (loaded.state === 'unreachable') {
    return (
      <section className="fixed inset-0 z-30 bg-bg p-4">
        <p role="status" className="text-grey italic">
          {UNREACHABLE}
        </p>
        <p>
          <Link to="/projects/$slug" params={{ slug }} className="text-grey">
            ← Terug naar het project
          </Link>
        </p>
      </section>
    )
  }
  if (loaded.state === 'ready' && loaded.data && loaded.data.project.slug !== slug) {
    return <SlugRedirect slug={loaded.data.project.slug} />
  }
  let data: ViewerData | null | undefined
  if (loaded.state === 'ready') {
    data = loaded.data && {
      project: loaded.data.project,
      sequence: photoSequence(loaded.data.entries, loaded.data.photos),
    }
  }
  return <PhotoViewerView slug={slug} day={day} n={n} data={data} readOnly />
}

function PhotoViewerView({
  slug,
  day,
  n,
  data,
  readOnly,
}: {
  slug: string
  day: string
  n: string
  /** undefined while loading, null when there's no such project to show. */
  data: ViewerData | null | undefined
  /** A visitor: no cover or delete actions (T-0026). */
  readOnly: boolean
}) {
  const navigate = useNavigate()
  const router = useRouter()

  const sequence = data?.sequence ?? []
  const index = photoIndex(n)
  // The photo at this day and place; its neighbours may be another day's (D-0031).
  const position = index >= 0 ? sequence.findIndex((p) => p.day === day && p.index === index) : -1
  const current = position >= 0 ? sequence[position] : undefined
  const previous = current ? sequence[position - 1] : undefined
  const next = current ? sequence[position + 1] : undefined

  const ready = current !== undefined
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 })
  const [transform, setTransform] = useState<Transform>(IDENTITY)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [animating, setAnimating] = useState(false)
  const [chrome, setChrome] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Set once this photo is deleted, so the viewer moves on instead of saying it's gone. */
  const leaving = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousButton = useRef<HTMLButtonElement>(null)
  const nextButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  /** The arrow button that had focus when a move started, to keep focus in the viewer. */
  const arrowFocus = useRef<'next' | 'previous' | null>(null)

  /** True while the strip slides to a neighbour; input waits for the new photo. */
  const navigating = useRef(false)
  const transformRef = useRef(transform)
  transformRef.current = transform
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | null>(null)
  const lastSample = useRef<{ point: Point; time: number; velocity: Point }>({
    point: { x: 0, y: 0 },
    time: 0,
    velocity: { x: 0, y: 0 },
  })
  const lastTap = useRef<{ point: Point; time: number } | null>(null)
  const tapTimer = useRef<number | undefined>(undefined)

  // Keep the page behind from scrolling while the viewer is open.
  useEffect(() => {
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = before
      window.clearTimeout(tapTimer.current)
    }
  }, [])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => setStage({ width: el.clientWidth, height: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ready])

  // A new photo starts unzoomed and centred, before it is painted.
  useLayoutEffect(() => {
    navigating.current = false
    // Between a delete and the photo shown instead, the plain background stays.
    if (current) leaving.current = false
    setConfirming(false)
    setError(null)
    setAnimating(false)
    setOffset({ x: 0, y: 0 })
    setTransform(IDENTITY)
    // A focused arrow button that went away at the project's end hands focus to the other
    // arrow, or to Sluiten, never to the page behind.
    const had = arrowFocus.current
    arrowFocus.current = null
    const same = had === 'next' ? nextButton.current : had === 'previous' ? previousButton.current : null
    if (had && !same) {
      const other = had === 'next' ? previousButton.current : nextButton.current
      ;(other ?? closeButton.current)?.focus()
    }
  }, [current?.photo.id])

  // A new day's note starts at its top; within a day the panel keeps its scroll position.
  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.scrollTop = 0
  }, [current?.entry.id])

  const close = useCallback(() => {
    if (router.history.canGoBack()) router.history.back()
    else void navigate({ to: '/projects/$slug', params: { slug }, replace: true })
  }, [router, navigate, slug])

  /** Shows the photo of `day` at place `at` (0-based), replacing the address. */
  const show = useCallback(
    (to: { day: string; at: number }) =>
      void navigate({
        to: '/projects/$slug/$day/$n',
        params: { slug, day: to.day, n: photoNumber(to.at) },
        replace: true,
      }),
    [navigate, slug],
  )

  /** Slides the strip to a neighbour, then switches the URL to it. */
  const go = useCallback(
    (direction: 'next' | 'previous') => {
      const target = direction === 'next' ? next : previous
      if (!target || navigating.current) return
      navigating.current = true
      const active = document.activeElement
      arrowFocus.current =
        active && active === nextButton.current ? 'next' : active && active === previousButton.current ? 'previous' : null
      setAnimating(true)
      setTransform(IDENTITY)
      setOffset({ x: direction === 'next' ? -stage.width : stage.width, y: 0 })
      window.setTimeout(() => show({ day: target.day, at: target.index }), SETTLE_MS)
    },
    [next, previous, show, stage.width],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming) {
        if (e.key === 'Escape') setConfirming(false)
        return
      }
      if (e.key === 'ArrowRight') go('next')
      else if (e.key === 'ArrowLeft') go('previous')
      else if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, close, confirming])

  const makeCover = async () => {
    if (!current) return
    setBusy(true)
    setError(null)
    try {
      if (!data?.project) return
      await updateProject(data.project.id, { coverPhotoId: current.photo.id })
    } catch (err) {
      console.error(err)
      setError('Dat is niet gelukt. Probeer het opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Tombstones the photo, then shows what next pointed at (D-0031): in the same day it takes
   * the deleted one's place, so the address stays; else the next day's first. At the project's
   * last photo, the previous one; with no live photo left, it closes.
   */
  const remove = async () => {
    if (!current) return
    const target = next ?? previous
    setBusy(true)
    setError(null)
    try {
      leaving.current = true
      await deletePhoto(current.photo.id)
      setConfirming(false)
      if (target) {
        const shifts = target.entry.id === current.entry.id && target.index > current.index
        show({ day: target.day, at: shifts ? target.index - 1 : target.index })
      } else close()
    } catch (err) {
      console.error(err)
      leaving.current = false
      setError('Verwijderen is niet gelukt. Probeer het opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  const photoSize: Size = current
    ? { width: current.photo.width, height: current.photo.height }
    : { width: 0, height: 0 }
  const fitted = fitSize(photoSize, stage)
  const zoomMax = maxScale(photoSize, stage)
  const clamp = (t: Transform) => clampTransform(t, fitted, stage, zoomMax)

  /** A point relative to the stage's centre. */
  const fromCentre = (p: Point): Point => {
    const rect = stageRef.current!.getBoundingClientRect()
    return { x: p.x - rect.left - rect.width / 2, y: p.y - rect.top - rect.height / 2 }
  }

  const startDrag = (point: Point) => {
    gesture.current = {
      kind: 'drag',
      start: point,
      startTransform: transformRef.current,
      axis: null,
      startTime: performance.now(),
      moved: false,
    }
    lastSample.current = { point, time: performance.now(), velocity: { x: 0, y: 0 } }
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (navigating.current) return
    setAnimating(false)
    e.currentTarget.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const points = [...pointers.current.values()]
    if (points.length === 1) {
      startDrag(points[0]!)
    } else if (points.length === 2) {
      const [a, b] = points as [Point, Point]
      setOffset({ x: 0, y: 0 })
      gesture.current = {
        kind: 'pinch',
        startDistance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        startMid: fromCentre({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }),
        startTransform: transformRef.current,
      }
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return
    const point = { x: e.clientX, y: e.clientY }
    pointers.current.set(e.pointerId, point)
    const g = gesture.current
    if (!g) return

    if (g.kind === 'pinch') {
      const points = [...pointers.current.values()]
      if (points.length < 2) return
      const [a, b] = points as [Point, Point]
      const mid = fromCentre({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      const scale = g.startTransform.scale * (Math.hypot(a.x - b.x, a.y - b.y) / g.startDistance)
      const zoomed = zoomAt(g.startTransform, Math.min(Math.max(scale, 1), zoomMax), g.startMid)
      setTransform(clamp({ ...zoomed, x: zoomed.x + mid.x - g.startMid.x, y: zoomed.y + mid.y - g.startMid.y }))
      return
    }

    const now = performance.now()
    const sample = lastSample.current
    const dt = Math.max(1, now - sample.time)
    lastSample.current = {
      point,
      time: now,
      velocity: { x: (point.x - sample.point.x) / dt, y: (point.y - sample.point.y) / dt },
    }
    const delta = { x: point.x - g.start.x, y: point.y - g.start.y }
    if (Math.hypot(delta.x, delta.y) > 10) g.moved = true

    if (g.startTransform.scale > 1) {
      setTransform(clamp({ ...g.startTransform, x: g.startTransform.x + delta.x, y: g.startTransform.y + delta.y }))
      return
    }
    g.axis ??= dragAxis(delta)
    if (g.axis === 'x') {
      // Resist at the first and last photo.
      const atEnd = (delta.x < 0 && !next) || (delta.x > 0 && !previous)
      setOffset({ x: atEnd ? delta.x / 3 : delta.x, y: 0 })
    } else if (g.axis === 'y') {
      setOffset({ x: 0, y: Math.max(0, delta.y) })
    }
  }

  const onTap = (point: Point) => {
    const now = performance.now()
    const last = lastTap.current
    if (last && now - last.time < DOUBLE_TAP_MS && Math.hypot(point.x - last.point.x, point.y - last.point.y) < 30) {
      lastTap.current = null
      window.clearTimeout(tapTimer.current)
      setAnimating(true)
      if (transformRef.current.scale > 1) setTransform(IDENTITY)
      else setTransform(clamp(zoomAt(IDENTITY, Math.min(2.5, zoomMax), fromCentre(point))))
      window.setTimeout(() => setAnimating(false), SETTLE_MS)
      return
    }
    lastTap.current = { point, time: now }
    // A single tap shows or hides the date and note, once it's clear it isn't a double-tap.
    window.clearTimeout(tapTimer.current)
    tapTimer.current = window.setTimeout(() => setChrome((c) => !c), DOUBLE_TAP_MS)
  }

  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return
    const g = gesture.current
    const remaining = [...pointers.current.values()]

    if (g?.kind === 'pinch') {
      // Lifting one finger of a pinch carries on as a pan with the other.
      if (remaining.length === 1) startDrag(remaining[0]!)
      else gesture.current = null
      return
    }
    if (!g || remaining.length > 0) return
    gesture.current = null

    const point = { x: e.clientX, y: e.clientY }
    if (!g.moved && e.type === 'pointerup') {
      onTap(point)
      return
    }
    if (g.startTransform.scale > 1) return

    const delta = { x: point.x - g.start.x, y: point.y - g.start.y }
    const result = swipeResult(g.axis, delta, lastSample.current.velocity, stage)
    if ((result === 'next' && next) || (result === 'previous' && previous)) {
      go(result)
    } else if (result === 'close') {
      close()
    } else {
      setAnimating(true)
      setOffset({ x: 0, y: 0 })
      window.setTimeout(() => setAnimating(false), SETTLE_MS)
    }
  }

  if (data === undefined || ((data === null || !current) && leaving.current))
    return <div className="fixed inset-0 z-30 bg-bg" />
  if (data === null || !current) {
    return (
      <section className="fixed inset-0 z-30 bg-bg p-4">
        <AccentHeading>Foto niet gevonden</AccentHeading>
        <p>
          <Link to="/projects/$slug" params={{ slug }} className="text-grey">
            ← Terug naar het project
          </Link>
        </p>
      </section>
    )
  }

  const zoomed = transform.scale > 1
  const showChrome = chrome && !zoomed && offset.y === 0
  const transition = animating ? `transform ${SETTLE_MS}ms ease-out, opacity ${SETTLE_MS}ms ease-out` : 'none'
  const date = formatDate(current.entry.date)
  /** Per day, matching `<n>` in the address; a neighbour gets its own day's (D-0031). */
  const label = (p: ViewerPhoto) => `Foto ${p.index + 1} van ${p.count}, ${formatDate(p.entry.date)}`
  const button =
    'flex h-11 min-w-11 items-center justify-center rounded-full border-0 bg-panel px-3 text-text backdrop-blur-sm'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label(current)}
      className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-bg"
      style={{ opacity: offset.y > 0 ? Math.max(0.4, 1 - offset.y / (stage.height || 1)) : 1, transition }}
    >
      <div
        ref={stageRef}
        data-testid="photo-stage"
        className="relative min-h-0 flex-1 touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div
          className="flex h-full w-full"
          style={{ transform: `translate(calc(-100% + ${offset.x}px), ${offset.y}px)`, transition }}
        >
          {[previous, current, next].map((p, slot) => (
            <div key={p?.photo.id ?? `empty-${slot}`} className="h-full w-full shrink-0 overflow-hidden">
              {p && (
                <ViewerImage
                  photo={p.photo}
                  alt={label(p)}
                  current={slot === 1}
                  style={
                    slot === 1
                      ? {
                          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
                          transition,
                        }
                      : undefined
                  }
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
        style={{ opacity: showChrome ? 1 : 0, transition: 'opacity 150ms' }}
      >
        <button
          ref={closeButton}
          type="button"
          aria-label="Sluiten"
          className={`${button} pointer-events-auto text-xl`}
          onClick={close}
        >
          ✕
        </button>
        {/* The day's count, whenever there is somewhere to go, so also 1 / 1 (T-0029). */}
        {sequence.length > 1 && (
          <span className={`${button} text-sm`} aria-hidden="true" data-testid="photo-counter">
            {current.index + 1} / {current.count}
          </span>
        )}
      </div>

      {previous && (
        <button
          ref={previousButton}
          type="button"
          aria-label="Vorige foto"
          className={`${button} absolute top-1/2 left-4 hidden -translate-y-1/2 text-xl pointer-fine:flex`}
          onClick={() => go('previous')}
        >
          ‹
        </button>
      )}
      {next && (
        <button
          ref={nextButton}
          type="button"
          aria-label="Volgende foto"
          className={`${button} absolute top-1/2 right-4 hidden -translate-y-1/2 text-xl pointer-fine:flex`}
          onClick={() => go('next')}
        >
          ›
        </button>
      )}

      <div
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 max-h-[40%] overflow-y-auto bg-panel px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
        style={{
          opacity: showChrome ? 1 : 0,
          pointerEvents: showChrome ? 'auto' : 'none',
          transition: 'opacity 150ms',
        }}
      >
        <AccentHeading level={2}>
          <time dateTime={current.entry.date}>{date}</time>
        </AccentHeading>
        {current.entry.note && <p className="mt-2 mb-0">{current.entry.note}</p>}
        {!readOnly && (
          <PhotoActions
            isCover={data.project?.coverPhotoId === current.photo.id}
            busy={busy}
            error={confirming ? null : error}
            onUseAsCover={() => void makeCover()}
            onDelete={() => {
              setError(null)
              setConfirming(true)
            }}
          />
        )}
      </div>

      {!readOnly && confirming && (
        <ConfirmDelete
          busy={busy}
          error={error}
          onConfirm={() => void remove()}
          onCancel={() => {
            setError(null)
            setConfirming(false)
          }}
        />
      )}
    </div>
  )
}

/** One photo in the strip: the 2560 px copy, stored (the owner) or from the NAS (a visitor). */
function ViewerImage({
  photo,
  alt,
  current,
  style,
}: {
  photo: ShownPhoto
  alt: string
  current: boolean
  style?: CSSProperties
}) {
  const url = usePhotoUrl(photo, 'copy')
  if (!url) return null
  return (
    <img
      src={url}
      alt={alt}
      width={photo.width}
      height={photo.height}
      draggable={false}
      aria-hidden={current ? undefined : true}
      data-current={current ? '' : undefined}
      data-photo-id={photo.id}
      className="h-full w-full object-contain"
      style={style}
    />
  )
}
