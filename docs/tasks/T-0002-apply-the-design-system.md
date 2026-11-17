---
id: T-0002
title: "Apply the sanderg.nl-based design system"
description: "Replace T-0001's placeholder look with D-0011's design system in Tailwind: tokens, Poppins, the header, card, badge and entry components, the Dutch interface, the new icon, and a /design page with screenshot tests."
status: Open
guarded: false
depends_on: []             # builds on T-0001's merged scaffold; its PR is T-0001's gate test
decisions: [D-0004, D-0005, D-0006, D-0007, D-0011]
raised_on: 2026-11-16
done_on: ""
result: []
---

# Goal

The app looks like sanderg.nl as D-0011 describes, built so every later feature reuses the
same tokens and components. D-0011 has the exact palette and component rules; read it
first.

This task touches no guarded path, so its PR should merge itself when CI is green. That is
also T-0001's last check of the auto-merge gate.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass, locally
  and in CI.
- Screenshot tests of `/design` in light and dark run in CI (Linux baselines) and pass.
  Locally they are skipped.
- An automated contrast test checks body text and status badge text at 4.5:1 or better in
  both themes, from the tokens.
- The e2e offline test also checks that Poppins is in use with the network off.
- `/design` isn't in the production build (`CONTEXT=production pnpm run build`, then the
  route shows the not-found page).
- No raw colour values in `src/components` or `src/routes` (a test or lint rule checks it).
- All interface text is Dutch; status values stored in Dexie are unchanged.
- Sander confirms the overview, a project page and `/design` on the Netlify preview, on
  his Pixel, in light and dark.

# Notes

- Tailwind v4 with `@tailwindcss/vite`; tokens under `@theme` in `src/styles/`. Remove the
  old `src/styles.css` classes.
- Poppins woff2 (400, 600, 400 italic, Latin subset) in `public/fonts/`. It's under the SIL
  Open Font License: commit the licence file next to it. Add `woff2` to the precache glob
  in `vite.config.ts`.
- Dutch status labels live in one map keyed by the stored value. Dates with
  `Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })`.
- Rewrite the seed demo text in `src/seed/demo.ts` in Dutch.
- Redraw the icon with `scripts/make-icons.mjs`: `#212121` background, orange `#f5581a`
  mark. Manifest `theme_color` and `background_color` `#212121`; `theme-color` meta tags
  with `media` for light (`#fefefe`) and dark (`#212121`).
- Playwright `toHaveScreenshot` for `/design`, emulating both colour schemes; skip when not
  on Linux, so baselines come from CI. Generate the first baselines in CI (for example a
  workflow run with `--update-snapshots` whose output is committed), and say how in the PR.
  A workflow change is guarded: if one is needed, split it into its own PR so this one
  stays unguarded.
- Netlify's CSP already allows fonts from 'self' (via `default-src`).

# Log
