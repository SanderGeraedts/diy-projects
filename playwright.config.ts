import { defineConfig, devices } from '@playwright/test'

// End-to-end tests run against the production-style build on the seeded demo data (D-0006,
// D-0017). Build first: pnpm run build. E2E_PORT picks another port, so parallel worktrees
// don't share (or reuse) one preview server.
const port = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'pixel', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `pnpm run preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
})
