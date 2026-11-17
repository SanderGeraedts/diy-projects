// D-0006: sync runs only in the production build, and only when it has an address.
// Previews, local dev and tests never get one, so they can't reach the NAS.

// reason is shown in the interface, so it is Dutch (T-0002).
export type SyncConfig = { enabled: true; url: string } | { enabled: false; reason: string }

export function resolveSyncConfig(deployContext: string, pocketbaseUrl: string): SyncConfig {
  if (deployContext !== 'production') {
    return { enabled: false, reason: `synchronisatie staat uit in ${deployContext}-builds` }
  }
  if (!pocketbaseUrl) {
    return { enabled: false, reason: 'geen PocketBase-adres ingesteld' }
  }
  return { enabled: true, url: pocketbaseUrl }
}

export const deployContext = __DEPLOY_CONTEXT__
export const syncConfig = resolveSyncConfig(__DEPLOY_CONTEXT__, __POCKETBASE_URL__)
