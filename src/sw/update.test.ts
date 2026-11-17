import { describe, expect, it, vi } from 'vitest'
import { startBusy } from './busy'
import { createAppUpdate, watchForUpdates } from './update'

describe('app update', () => {
  it('is offered once a new version waits, and activates it on apply', async () => {
    const update = createAppUpdate()
    expect(update.getState()).toEqual({ status: 'none' })
    const activate = vi.fn().mockResolvedValue(undefined)
    update.offer(activate)
    expect(update.getState()).toEqual({ status: 'available' })
    await update.apply()
    expect(activate).toHaveBeenCalledOnce()
    expect(update.getState()).toEqual({ status: 'updating' })
  })

  it('does nothing on apply when no version waits', async () => {
    const update = createAppUpdate()
    await update.apply()
    expect(update.getState()).toEqual({ status: 'none' })
  })

  it('waits while an import or sync runs, says so, and activates once all are done', async () => {
    const update = createAppUpdate()
    const activate = vi.fn().mockResolvedValue(undefined)
    update.offer(activate)
    const importDone = startBusy('de foto-import')

    const applying = update.apply()
    expect(update.getState()).toEqual({ status: 'waiting', reasons: ['de foto-import'] })

    const syncDone = startBusy('de synchronisatie')
    expect(update.getState()).toEqual({ status: 'waiting', reasons: ['de foto-import', 'de synchronisatie'] })
    importDone()
    expect(update.getState()).toEqual({ status: 'waiting', reasons: ['de synchronisatie'] })
    await Promise.resolve()
    expect(activate).not.toHaveBeenCalled()

    syncDone()
    await applying
    expect(activate).toHaveBeenCalledOnce()
    expect(update.getState()).toEqual({ status: 'updating' })
  })

  it('ignores a second tap while waiting', async () => {
    const update = createAppUpdate()
    const activate = vi.fn().mockResolvedValue(undefined)
    update.offer(activate)
    const done = startBusy('de synchronisatie')
    const first = update.apply()
    await update.apply()
    done()
    await first
    expect(activate).toHaveBeenCalledOnce()
  })

  it('offers the update again when activation fails', async () => {
    const update = createAppUpdate()
    update.offer(() => Promise.reject(new Error('gone')))
    await update.apply()
    expect(update.getState()).toEqual({ status: 'available' })
  })

  it('notifies subscribers', () => {
    const update = createAppUpdate()
    const listener = vi.fn()
    update.subscribe(listener)
    update.offer(() => Promise.resolve())
    expect(listener).toHaveBeenCalledOnce()
  })
})

describe('update checks', () => {
  const HOUR = 60 * 60 * 1000

  function setup() {
    let time = 0
    let visibility: DocumentVisibilityState = 'visible'
    const doc = new EventTarget() as Document
    Object.defineProperty(doc, 'visibilityState', { get: () => visibility })
    const check = vi.fn().mockResolvedValue(undefined)
    const stop = watchForUpdates({ check, now: () => time, doc })
    const show = (at: number) => {
      time = at
      visibility = 'hidden'
      doc.dispatchEvent(new Event('visibilitychange'))
      visibility = 'visible'
      doc.dispatchEvent(new Event('visibilitychange'))
    }
    return { check, stop, show }
  }

  it('checks when the app comes into view, at most hourly', () => {
    const { check, show } = setup()
    show(10 * 60 * 1000)
    expect(check).not.toHaveBeenCalled()
    show(HOUR)
    expect(check).toHaveBeenCalledOnce()
    show(HOUR + 30 * 60 * 1000)
    expect(check).toHaveBeenCalledOnce()
    show(2 * HOUR)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('does not check when the app goes out of view', () => {
    const { check, show } = setup()
    show(HOUR)
    // show() fires one hidden and one visible event; only the visible one checked.
    expect(check).toHaveBeenCalledOnce()
  })

  it('swallows a failed (offline) check', async () => {
    const { check, show } = setup()
    check.mockRejectedValueOnce(new Error('offline'))
    show(HOUR)
    await Promise.resolve()
    expect(check).toHaveBeenCalledOnce()
  })

  it('stops checking once stopped', () => {
    const { check, stop, show } = setup()
    stop()
    show(5 * HOUR)
    expect(check).not.toHaveBeenCalled()
  })
})
