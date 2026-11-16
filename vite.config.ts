/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Netlify sets CONTEXT to production, deploy-preview or branch-deploy. Anything else
// (local dev, local builds, CI) is "local".
const deployContext = process.env.CONTEXT ?? 'local'

// D-0006: only a production build may know the PocketBase address. Outside production the
// address is never read, so it can't end up in a preview, dev or test bundle.
const pocketbaseUrl = deployContext === 'production' ? (process.env.POCKETBASE_URL ?? '') : ''

export default defineConfig({
  define: {
    __DEPLOY_CONTEXT__: JSON.stringify(deployContext),
    __POCKETBASE_URL__: JSON.stringify(pocketbaseUrl),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'DIY projects',
        short_name: 'DIY projects',
        description: 'Photos and progress of DIY projects, offline first.',
        lang: 'en',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f6f3ee',
        theme_color: '#2f5d50',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', '.github/scripts/**/*.test.mjs'],
  },
})
