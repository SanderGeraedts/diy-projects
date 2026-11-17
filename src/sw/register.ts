import { registerSW } from 'virtual:pwa-register'
import { appUpdate, watchForUpdates } from './update'

// The service worker precaches the app shell so it opens offline. With registerType
// 'prompt' a new version waits until the app asks it to take over (T-0019): the app offers
// it in a bar (appUpdate) and looks for one whenever it comes into view, at most hourly.
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  const updateSW = registerSW({
    immediate: true,
    // updateSW() tells the waiting worker to take over; the page reloads once it has.
    onNeedRefresh: () => appUpdate.offer(() => updateSW(true)),
    onRegisteredSW: (_url, registration) => {
      if (registration) watchForUpdates({ check: () => registration.update() })
    },
  })
}
