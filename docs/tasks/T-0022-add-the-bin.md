---
id: T-0022
title: "Add the bin: restore or permanently delete deleted projects and entries (after v1)"
description: "A bin screen listing deleted projects and entries, with restore, and a permanent delete that removes the files and history from the NAS but keeps a marker that refuses late uploads."
status: Open
guarded: true
depends_on: [T-0010, T-0017]
decisions: [D-0002, D-0014, D-0015]
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

- `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` pass.
- CI sync tests against the throwaway PocketBase cover: restore on one device shows up on
  another; a permanent delete removes the files on the NAS; an upload of a purged photo
  from a second device is refused and doesn't re-create it.
- Sander restores and permanently deletes a test project in production.
- Sander reviews the PR (guarded: `src/db/`, `src/sync/`, `deploy/nas/`).

# Notes

- Not part of v1 (D-0014); T-0021 doesn't wait for it.
- The permanent delete runs on the NAS (a PocketBase hook or endpoint), not as a client
  doing file deletes one by one.

# Log
