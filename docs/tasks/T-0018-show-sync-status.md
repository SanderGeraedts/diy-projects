---
id: T-0018
title: "Show sync status: unsynced changes, last sync and storage warnings"
description: "A small status in the header with the number of unsynced changes and photos, the last successful sync, errors, and a warning when the browser hasn't granted persistent storage."
status: Doing
guarded: false
depends_on: [T-0016]
decisions: [D-0002, D-0006, D-0020, D-0013]
raised_on: 2026-11-17
done_on: ""
result: [https://github.com/SanderGeraedts/diy-projects/pull/33]
---

# Goal

Unsynced items exist only on the device, and Android can clear a site's storage, so the
count must be visible (D-0002):

- In the header: nothing when all is synced; otherwise "3 wijzigingen, 12 foto's niet
  gesynchroniseerd". Tapping opens details: last successful sync, the last error in plain
  Dutch, upload progress, and "Nu synchroniseren".
- When `navigator.storage.persist()` wasn't granted: a warning that unsynced items can be
  lost, with how to fix it (install the app).
- Offline: "Offline – wijzigingen worden later gesynchroniseerd".
- Signed out or sign-in expired: "Opnieuw inloggen om te synchroniseren", with a link to
  sign in (D-0013).
- In previews and dev: the existing demo banner, no sync status (D-0006).

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass.
- `pnpm run test:e2e` passes, with tests (sync stubbed) for: everything synced, pending
  changes with a count, an error, offline, sign-in expired, and storage not persisted.
- Sander confirms on his phone in production.

# Notes

- Reads only: counts from `src/db/` (T-0003's `countUnsynced`), state from the sync engine.
  This task doesn't change `src/db/` or `src/sync/`.

# Log

- 2026-11-17 claude-code/opus-5.5: Built `src/components/SyncStatus.tsx` (a pure
  `SyncStatusView` plus `SyncStatusBar`, which wires it to `useSyncStatus()`, `syncNow()`,
  `countUnsynced`, `storagePersisted`, `useAuthState()` and the browser's online state) and
  `useOnline.ts`; one line in `src/routes/Layout.tsx` puts it under the header, where the demo
  banner sits in previews. It renders only when the sync engine exists (production with an
  address), so previews and dev show just the demo banner (D-0006). Nothing in `src/db/`,
  `src/sync/` or `src/auth/` changed. Stubbing: the e2e build has no engine, so a test-only
  route `/design/sync-status?state=…` (left out of production like `/design`) feeds the real
  component a stubbed status; offline uses Playwright's real `setOffline`. Component tests
  cover the same states, plus the live bar rendering nothing without an engine. Gaps: no
  pending-photo count or upload progress yet (T-0017 must add a count to `src/db/`; the view
  already takes `pendingPhotos`). Choices for Sander's review (not decisions): the line shows
  one state by priority (sign-in, offline, error, pending, storage); the storage warning also
  shows when everything is synced; signed-out reads "Opnieuw inloggen…" as the task says.
  Checks: typecheck clean, `pnpm test` 174 passed / 14 skipped, build OK, e2e 16 passed /
  2 skipped (screenshot tests, Linux only) on port 4718; a production build
  (`POCKETBASE_URL=https://pb.invalid`) contains the status and not the test route.
