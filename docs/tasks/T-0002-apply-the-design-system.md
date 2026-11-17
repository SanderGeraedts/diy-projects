---
id: T-0002
title: "Apply the sanderg.nl-based design system"
description: "Replace T-0001's placeholder look with D-0011's design system in Tailwind: tokens, Poppins, the header, card, badge and entry components, the Dutch interface, the new icon, and a /design page with screenshot tests."
status: Doing
guarded: false
depends_on: []             # builds on T-0001's merged scaffold; its PR is T-0001's gate test
decisions: [D-0004, D-0005, D-0006, D-0007, D-0020]
raised_on: 2026-11-16
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/14"]
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
- 2026-11-17 claude-code/opus-5.5: Tailwind v4 (`@tailwindcss/vite`) with D-0011 tokens under `@theme` in `src/styles/app.css` (dark via prefers-color-scheme; old `src/styles.css` removed); self-hosted Poppins 400/600/400-italic Latin woff2 + OFL licence in `public/fonts/` (copied from `@fontsource/poppins`), woff2 precached; header, project card (photo + translucent panel, initial tile without cover), status badge (4 hues: violet, blue, teal, green), project title block and entries restyled; Dutch UI, `nl-NL` dates, Dutch seed text (ids unchanged); new icon (#212121, orange house over an accent bar), manifest and theme-color meta tags; `/design` page, dropped from production builds; tests: token contrast (light + dark, body/grey/badge text), no raw colours in `src/components` + `src/routes`, Poppins-in-use check in the offline e2e, `/design` screenshot tests (skipped off Linux and until baselines exist). Checks: typecheck clean, `pnpm test` 70 passed, build ok, `test:e2e` 6 passed / 2 skipped (Windows); `CONTEXT=production pnpm run build` has no DesignPage chunk. Remaining: (1) generate the Linux baselines in CI with `pnpm exec playwright test e2e/design.spec.ts --update-snapshots` and commit `e2e/design.spec.ts-snapshots/`; that needs a workflow change (guarded `.github/`), so it goes in its own PR; (2) the production "offline only" banner shows `syncConfig.reason`, which is English and lives in guarded `src/sync/config.ts`; translate it in a guarded PR; (3) the app name stays "DIY projects" (whether to translate it is undecided); (4) Sander checks the overview, a project page and `/design` on the Netlify preview on his Pixel, light and dark.
- 2026-11-17 claude-code/opus-5.5: Accent bars (header title and every heading, entry dates included) are now as wide as their text instead of a fixed 40–48 px, at Sander's request; recorded as D-0020 (replaces D-0011) in its own PR. Code comments point to D-0020. Checks: typecheck clean, 70 tests passed, build ok; screenshot of a project page checked.
- 2026-11-17 claude-code/opus-5.5: Accent bars have square ends (no rounded corners), at Sander's request (D-0020).
