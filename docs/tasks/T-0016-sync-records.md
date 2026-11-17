---
id: T-0016
title: "Sync projects and entries with PocketBase"
description: "The sync engine in src/sync/: push the outbox, pull changes since the last sync, last-write-wins with history kept on the NAS, tested in CI against a throwaway PocketBase."
status: Open
guarded: true
depends_on: [T-0003, T-0013, T-0015]
decisions: [D-0002, D-0005, D-0006, D-0012]
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

- `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` pass.
- A new CI job (`.github/workflows/ci.yml`) starts T-0013's image as a throwaway PocketBase
  and runs sync tests against it (D-0006, D-0012). They cover: push and pull between two
  simulated devices; an edit on both while offline, where the later wins and the earlier is
  in `history`; a tombstone syncing; a push that fails halfway and resumes without losing or
  duplicating anything.
- Sander sees a project he made on the phone appear on his laptop in production.
- Sander reviews the PR (guarded).

# Notes

- Guarded: `src/sync/`, `.github/`.

# Log
