import { registerSW } from 'virtual:pwa-register'

// The service worker precaches the app shell so it opens offline. With registerType
// 'prompt' a new version waits until the app asks it to take over; for now the app takes it
// on the next launch. A visible "update available" prompt is a later task.
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  registerSW({ immediate: true })
}
