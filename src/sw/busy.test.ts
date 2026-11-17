import { describe, expect, it, vi } from 'vitest'
import { busyReasons, isBusy, startBusy, subscribeBusy, whenIdle } from './busy'

describe('busy registry', () => {
  it('is busy until every piece of work is released', () => {
    expect(isBusy()).toBe(false)
    const importDone = startBusy('de foto-import')
    const syncDone = startBusy('de synchronisatie')
    expect(isBusy()).toBe(true)
    expect(busyReasons()).toEqual(['de foto-import', 'de synchronisatie'])
    importDone()
    expect(busyReasons()).toEqual(['de synchronisatie'])
    syncDone()
    expect(isBusy()).toBe(false)
    expect(busyReasons()).toEqual([])
  })

  it('lists a reason once, and ignores a second release', () => {
    const a = startBusy('de synchronisatie')
    const b = startBusy('de synchronisatie')
    expect(busyReasons()).toEqual(['de synchronisatie'])
    a()
    a()
    expect(isBusy()).toBe(true)
    b()
    expect(isBusy()).toBe(false)
  })

  it('keeps the reasons array stable between changes', () => {
    const done = startBusy('x')
    expect(busyReasons()).toBe(busyReasons())
    done()
  })

  it('notifies subscribers on start and release', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeBusy(listener)
    const done = startBusy('x')
    done()
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    startBusy('y')()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('whenIdle resolves at once when idle, and otherwise after the last release', async () => {
    await expect(whenIdle()).resolves.toBeUndefined()
    const a = startBusy('a')
    const b = startBusy('b')
    let idle = false
    const p = whenIdle().then(() => (idle = true))
    a()
    await Promise.resolve()
    expect(idle).toBe(false)
    b()
    await p
    expect(idle).toBe(true)
  })
})
