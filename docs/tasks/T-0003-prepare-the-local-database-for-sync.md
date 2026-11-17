---
id: T-0003
title: "Prepare the local database for sync: change tracking, soft deletes, the outbox and a write API"
description: "Dexie schema v2 with updatedAt and tombstones on every record, an outbox of unsynced changes, photo originals kept until uploaded, persistent storage, and the one write API every screen uses."
status: Doing
guarded: true
depends_on: []
decisions: [D-0002, D-0003, D-0004, D-0007, D-0017, D-0014, D-0015]
raised_on: 2026-11-17
done_on: ""
result: [https://github.com/SanderGeraedts/diy-projects/pull/11]
---

# Goal

Every later screen writes through one API in `src/db/`, and every write is recorded in an
outbox in the same transaction, so the sync engine (T-0016) only has to send the outbox.
This is the riskiest code in the app (D-0002): a bug here loses unsynced photos.

- **Schema v2** (a new Dexie version with an upgrade that keeps v1 data, D-0007):
  - `projects`, `entries`, `photos`: `updatedAt` (ISO time of the last edit, used for
    last-write-wins) and `deletedAt` (tombstone, `null` when alive) on every record.
  - `photos`: the 2560 px copy (`blob`), a thumbnail blob, the original blob until the NAS
    confirms it, and per-file upload state for the original, copy and thumbnail (D-0015).
  - `outbox`: one row per change (`table`, `recordId`, `op`: put or delete, `queuedAt`),
    in order; several edits to one record may collapse into one row.
- **Write API** in `src/db/` (for example `createProject`, `updateProject`, `addEntry`,
  `updateEntry`, `addPhotos`, `deletePhoto`): each validates its input, stamps
  `updatedAt`, and writes the record and its outbox row in one transaction. Reads stay
  plain Dexie queries.
- `deletePhoto` tombstones (D-0002); never edits a stored photo.
- `navigator.storage.persist()` is requested at start-up and its result kept for T-0018.
- A `countUnsynced()` read for the sync status (T-0018).

Deleting projects and entries (D-0014's cascading soft delete) is T-0010; don't add it here.

# Done when

- `pnpm test` passes, including new tests in `src/db/` that show:
  - opening a v1 database with data upgrades it to v2 without losing any record;
  - every write API call adds exactly one outbox row, in the same transaction (a write that
    throws leaves neither the record nor the row);
  - `deletePhoto` sets `deletedAt` and queues a delete; the photo's blobs stay until sync
    removes them;
  - a photo's original stays until it is marked uploaded.
- `pnpm run typecheck`, `pnpm run build` and `pnpm run test:e2e` pass; the seeded demo data
  still loads.
- Sander reviews the PR (guarded).

# Notes

- Guarded paths: `src/db/`. The seed (`src/seed/demo.ts`) moves to the write API or writes
  v2-shaped records directly; demo records have no outbox rows (they never sync).
- Don't touch `src/sync/` beyond reading the config; the engine is T-0016.

# Log

- 2026-11-17 claude-code/opus-5.5: Built schema v2 (`src/db/db.ts`: `updatedAt`/`deletedAt`
  on every record, photo `thumbnail`, `original`, per-file `uploads`, `outbox` table with an
  upgrade from v1 that keeps all data) and the write API (`src/db/write.ts`: `createProject`,
  `updateProject`, `addEntry`, `updateEntry`, `addPhotos` (one outbox row per photo),
  `deletePhoto`, `markPhotoFileUploaded`, `countUnsynced`, `requestPersistentStorage`, called
  from `main.tsx`). Seed writes v2 records with no outbox rows. Outbox rows are never
  collapsed, so the sync engine can't lose an in-flight change. The original is dropped
  only when all three files are confirmed (D-0015). Tests in `src/db/write.test.ts` run in
  the node environment, since jsdom Blobs don't survive fake-indexeddb. Checks: typecheck
  clean, `pnpm test` 57 passed, build OK, `test:e2e` 5 passed. Open points for Sander:
  (1) v1 photos are upgraded with the copy as thumbnail, no original and upload state
  `none`, and v1 records are not queued in the outbox; is that right, or did v1 data ever
  reach production and need to sync? (2) Existing screens don't hide tombstoned photos yet;
  nothing can delete one from the UI so far. Remaining: Sander's review, then `done`.
