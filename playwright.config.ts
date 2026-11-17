import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the production-style build on the seeded demo data (D-0006,
// D-0017). Build first: pnpm run build.
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'pixel', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'pnpm run preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
})
