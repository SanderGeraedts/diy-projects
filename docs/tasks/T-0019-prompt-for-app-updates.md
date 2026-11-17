---
id: T-0019
title: "Offer app updates safely"
description: "When a new version is ready, show 'Nieuwe versie beschikbaar' and switch to it on a tap, never in the middle of an import or sync."
status: Doing
guarded: true
depends_on: [T-0002]
decisions: [D-0002, D-0007, D-0017]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

The service worker waits with a new version until the app takes it (`registerType:
'prompt'`, `src/sw/register.ts`). Today that happens only when every window is closed, which
on an installed app can take days.

- When a new version is waiting: a small "Nieuwe versie beschikbaar – Bijwerken" bar.
- "Bijwerken" activates it and reloads, but waits while a photo import (T-0007) or a sync is
  running, and says so.
- Check for updates when the app comes into view, at most hourly.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass.
- An e2e test builds the app twice (a changed build id), serves the first, swaps in the
  second, and sees the bar; tapping it shows the new version, and no local data is lost.
- Sander reviews the PR (guarded: `src/sw/`).

# Notes

- Keep the logic in `src/sw/`; the bar itself can be a component outside it.

# Log

- 2026-11-17 claude-code/opus-5.5: Stacked on T-0002 (#14). Logic in `src/sw/`: `busy.ts`
  (`startBusy(reason)` returns a release function; `isBusy`, `busyReasons`, `whenIdle`) for
  T-0007 and T-0016 to wrap an import or sync in; `update.ts` (update state, `apply()` waits
  until nothing is busy, then activates; `watchForUpdates` checks on `visibilitychange` to
  visible, at most hourly, registration counting as the first check); `register.ts` wires both
  to `registerSW`. The bar is `src/components/UpdateBar.tsx`, one line in `Layout.tsx`; while
  waiting it reads "Bijwerken zodra de foto-import klaar is…". `vite.config.ts` writes
  `<meta name="build-id">` (`BUILD_ID`, else Netlify's `COMMIT_REF`, else `local`).
  `e2e/update.spec.ts` builds twice (`e2e-a`, `e2e-b`), serves a then b from its own server on
  port 4183, sees the bar, taps it, and finds build b with a project written to IndexedDB
  before the update. Checks: typecheck clean, `pnpm test` 110 passed, build ok,
  `pnpm run test:e2e` 8 passed, 2 skipped (the /design screenshots, as before).
  Not decided, left as is: a page opened for the first time (not yet controlled by a service
  worker) gets no reload after "Bijwerken" until reopened; an app kept in view for hours
  doesn't check until it comes into view again.
