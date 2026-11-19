---
id: T-0022
title: "Add the bin: restore or permanently delete deleted projects and entries (after v1)"
description: "A bin screen listing deleted projects and entries, with restore, and a permanent delete that removes the files and history from the NAS but keeps a marker that refuses late uploads."
status: Doing
guarded: true
depends_on: [T-0010, T-0017]
decisions: [D-0002, D-0006, D-0014, D-0015, D-0018, D-0023, D-0024, D-0025]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

D-0014's bin, after v1:

- "Prullenbak" lists deleted projects and entries, newest first, with their photo counts.
- **Terugzetten** (restore) clears the tombstones of the item and everything its delete
  cascaded to, and syncs that.
- **Definitief verwijderen** (permanent delete), after a confirmation: the NAS removes the
  records' files (original, copy, thumbnail) and their history, and keeps a small marker per
  photo, so a late upload of that photo from another device is refused. Other devices drop
  their local copies when the marker reaches them.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass.
- CI sync tests against the throwaway PocketBase cover: restore on one device shows up on
  another; a permanent delete removes the files on the NAS; an upload of a purged photo
  from a second device is refused and doesn't re-create it.
- Sander restores and permanently deletes a test project in production.
- Sander reviews the PR (guarded: `src/db/`, `src/sync/`, `deploy/nas/`).

# Notes

- Not part of v1 (D-0014); T-0021 doesn't wait for it.
- The permanent delete runs on the NAS (a PocketBase hook or endpoint), not as a client
  doing file deletes one by one.

## How it is built (for review)

- **What a delete cascaded to:** the records that share the item's `deletedAt`.
  `deleteProject`/`deleteEntry` stamp the item and everything they tombstone with one time and
  leave earlier tombstones alone, and the time syncs verbatim (a text field on the NAS). So
  `restoreProject`/`restoreEntry` (`src/db/write.ts`) clear exactly those, in one transaction
  with a `put` outbox row each; an entry or photo deleted on its own before stays deleted. The
  bin lists deleted projects and deleted entries of live projects (an entry deleted with its
  project is part of the project's item), newest first, with the counts a restore brings
  back.
- **The permanent delete:** no custom endpoint (it would need a new Funnel path). It is the
  owner's `DELETE /api/collections/{projects|entries}/records/:id`, a path Funnel already
  allows; `deploy/nas/pb_hooks/bin.pb.js` takes it over. Only a tombstoned record (400 for a
  live one), only its owner (anyone else goes on to the owner-only rules). In one
  transaction: the item and everything in it (a project: all its entries and photos; an
  entry: all its photos, also those deleted on their own before) are emptied (text, tags,
  files) and their `history` rows deleted. PocketBase removes the files from storage after
  the commit. Answers 204.
- **The marker:** the emptied record itself stays, with a new text field `purgedAt`
  (migration `1794931600_purge_markers.js`, additive) and its tombstone, so guests never see
  it. `bin.pb.js` answers any later update or file upload of it, a create under its id, and
  a create of an entry or photo under a purged project or entry, with 410 Gone; it saves
  nothing. A device can't set `purgedAt` itself.
- **Other devices:** the sync engine drops its copy of a record (and its outbox rows) when a
  marker comes in through a pull, or when a push or upload is answered with 410. The device
  that purges removes the item and everything in it locally once the NAS answered 204
  (`removePurged`), then syncs.
- **Previews and dev** (no NAS, D-0006): "Definitief verwijderen" removes the demo data from
  the browser only.

# Log
- 2026-11-19 claude-code/opus-5.5: Started, on `t-0022-bin`, stacked on T-0026's `t-0026-public-view` (PR #41), which merges first.
- 2026-11-19 claude-code/opus-5.5: Built as described under *How it is built*. NAS: migration `1794931600_purge_markers.js` (adds `purgedAt` to projects, entries and photos; nothing else), hook `bin.pb.js`; smoke test extended (a live project can't be purged; a guest and another account can't list the bin or purge; the owner's purge removes the three files from disk, the history rows and the content, keeps a marker per record and leaves other projects alone; a late upload, edit, re-create and a new photo or entry under a purged item get 410; an entry purge keeps its project). App: `restoreProject`, `restoreEntry`, `purgeScope`, `removePurged`, `forgetPurged` in `src/db/write.ts`; the engine drops a record on a marker or a 410 (`src/sync/engine.ts`); `src/sync/purge.ts` and `deleteForGood` in `src/sync/app.ts`; the "Prullenbak" screen at `/prullenbak` (owner only, linked at the foot of the overview), with "Terugzetten" and "Definitief verwijderen" after a confirmation that names what goes. Tests: write API and bin listing unit tests, engine tests against the fake PocketBase, `sync.pocketbase` (a restore on one device shows on another; a guest or another account can neither list the bin nor purge) and `photos.pocketbase` (a purge removes the files on the NAS and the other device drops its copies; an upload and a re-create of a purged photo from a second device get 410 and re-create nothing), e2e `bin.spec.ts` and the visitor tests (no bin, no link). Checks: `pnpm run typecheck` clean; `pnpm test` 27 files passed, 3 skipped (332 tests passed, 24 skipped); `pnpm run build` built, precache 22 entries; `E2E_PORT=4792 pnpm run test:e2e` 48 passed, 2 skipped. Against the official PocketBase 0.40.6 Windows build with this branch's migrations and hooks: smoke test "All smoke tests passed."; `auth.pocketbase` 5 passed, `sync.pocketbase` 11 passed, `photos.pocketbase` 8 passed. On Windows a file still being downloaded can't be removed; the hook then keeps the purge (the marker is committed) and logs the leftover files instead of failing.
- Remaining: Sander reviews the PR (guarded: `deploy/nas/`, `src/db/`, `src/sync/`); before merging he takes a PocketBase backup in the admin screen (D-0018); after the deploy he restores and permanently deletes a test project in production.
