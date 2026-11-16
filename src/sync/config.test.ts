import { describe, expect, it } from 'vitest'
import { resolveSyncConfig, syncConfig } from './config'

describe('resolveSyncConfig', () => {
  it.each(['deploy-preview', 'branch-deploy', 'local'])('keeps sync off in %s builds', (context) => {
    expect(resolveSyncConfig(context, 'https://example.invalid')).toEqual({
      enabled: false,
      reason: `sync is off in ${context} builds`,
    })
  })

  it('keeps sync off in production without an address', () => {
    expect(resolveSyncConfig('production', '')).toMatchObject({ enabled: false })
  })

  it('turns sync on in production with an address', () => {
    expect(resolveSyncConfig('production', 'https://example.invalid')).toEqual({
      enabled: true,
      url: 'https://example.invalid',
    })
  })

  it('is off in the test build itself', () => {
    expect(syncConfig.enabled).toBe(false)
  })
})
