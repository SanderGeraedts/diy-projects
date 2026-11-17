---
id: T-0016
title: "Sync projects and entries with PocketBase"
description: "The sync engine in src/sync/: push the outbox, pull changes since the last sync, last-write-wins with history kept on the NAS, tested in CI against a throwaway PocketBase."
status: Doing
guarded: true
depends_on: [T-0003, T-0013, T-0015]
decisions: [D-0002, D-0005, D-0006, D-0017]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

Records sync between devices through the NAS (D-0002). Photos' files are T-0017; this task
syncs photo *records* (and tombstones) but not their files.

- **Push:** send outbox rows in order; remove a row only after PocketBase confirms it
  (D-0002). A failed push leaves the row and retries with backoff.
- **Pull:** fetch records changed since the last sync cursor (by `updated` on the server),
  apply them locally.
- **Conflicts:** last-write-wins per record by `updatedAt`; the NAS keeps the overwritten
  version in `history` (T-0013's hook). Nothing beyond last-write-wins: if a case needs
  more, stop and raise a question (D-0002).
- **When:** at start-up, when the app comes back online or into view, after a local
  change (debounced), and on a "Nu synchroniseren" action. Never in previews or dev
  (D-0006).
- A sync never runs twice at once (one lock across tabs).

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass.
- A new CI job (`.github/workflows/ci.yml`) starts T-0013's image as a throwaway PocketBase
  and runs sync tests against it (D-0006, D-0017). They cover: push and pull between two
  simulated devices; an edit on both while offline, where the later wins and the earlier is
  in `history`; a tombstone syncing; a push that fails halfway and resumes without losing or
  duplicating anything.
- Sander sees a project he made on the phone appear on his laptop in production.
- Sander reviews the PR (guarded).

# Notes

- Guarded: `src/sync/`, `.github/`.

# Log

- 2026-11-17 claude-code/opus-5.5: Built the engine in `src/sync/` (`engine.ts`, `records.ts`,
  `app.ts`; started from `main.tsx`, wired to `setSyncNow`). Push sends each record's current
  state at the place of its oldest outbox row and removes exactly the rows that read covered,
  only after PocketBase answers; pull is keyset-paged on (`updated`, `id`) from a per-collection
  cursor minus 60 s; LWW by `updatedAt`, skipping records with a pending outbox row; Web Locks,
  `startBusy('de synchronisatie')`, backoff 5 s → 5 min, token refresh after each run.
  Implementation choices for Sander's review (not decisions): (1) records keep their local
  UUID on the NAS, so a new migration widens `id` to 15–36 chars `[a-z0-9-]`; (2) LWW is
  decided on the NAS by a new hook, `last_write_wins.pb.js`: an update older than the stored
  `updatedAt` goes to `history` and the stored record is returned, so the earlier edit is kept
  even when the later one reached the NAS first; (3) Dexie v3 adds a `syncState` table
  (cursors, last success), cleared by `clearLocalData`. PocketBase treats a revoked token as a
  guest (404/400, not 401), so the engine asks `refreshAfterSync` before calling a refusal a
  data error. Photo records from other devices are not stored locally (no files until
  T-0017), and the photos cursor moves past them: T-0017 must reset `cursor:photos`. "Nu
  synchroniseren" is `syncNow()` in `src/sync/app.ts`; the button is T-0018's. Checks:
  typecheck clean, `pnpm test` 162 passed / 14 skipped, build OK, e2e 9 passed / 2 skipped;
  `sync.pocketbase.test.ts` 9/9 against PocketBase 0.40.6 locally.
