---
id: T-0009
title: "Choose a project's cover photo and delete photos"
description: "Set any of a project's photos as its cover, and delete a photo as a tombstone that syncs, from the photo viewer."
status: Done
guarded: false
depends_on: [T-0003, T-0007, T-0008]
decisions: [D-0002, D-0004, D-0014, D-0020]
raised_on: 2026-11-17
done_on: "2026-11-19"
result: [https://github.com/SanderGeraedts/diy-projects/pull/29, https://github.com/SanderGeraedts/diy-projects/pull/37]
---

# Goal

- In the photo viewer (T-0008): "Als omslagfoto gebruiken" sets the project's
  `coverPhotoId` through the write API.
- "Verwijderen" asks for confirmation and calls T-0003's `deletePhoto` (a tombstone,
  D-0002). The photo disappears from the entry and the viewer; if it was the cover, the
  project falls back to its newest remaining photo, or the no-photo tile (D-0020).
- An entry left without photos and without a note still shows its date with "Geen foto's
  meer".

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass.
- `pnpm run test:e2e` passes, with tests that change the cover (the overview card shows it)
  and delete the cover photo (the fallback shows), offline.
- Sander confirms on the deploy preview.

# Notes

- Photos are never edited (D-0002): no rotate or crop.

# Log

- 2026-11-17 claude-code/opus-5.5: Stacked on T-0007 (#28), with T-0008's viewer (#25) merged in. The viewer's bottom panel has "Als omslagfoto gebruiken" (`updateProject(…, { coverPhotoId })`; shows "Dit is de omslagfoto" when it is) and "Verwijderen", which asks first (an in-app alert dialog, Annuleren keeps it) and calls `deletePhoto`; the viewer then shows the entry's next photo, else the previous, else closes (`src/viewer/PhotoActions.tsx`). The cover shown is worked out on display (`src/components/cover.ts`, `pickCover`): the chosen cover while alive, else the newest remaining photo by date taken, else the no-photo tile; nothing is written, so a stale `coverPhotoId` stays in the record. The timeline leaves out tombstoned photos; an entry whose photos were all deleted and that has no note says "Geen foto's meer". `src/db/` unchanged. Checks: typecheck clean, `pnpm test` 154 passed, build ok, `test:e2e` 23 passed / 2 skipped (design screenshots, Linux only) incl. new `e2e/cover-delete.spec.ts` (4 tests, offline), on private ports 4291/5291. Open: (1) the write API can't clear `coverPhotoId` and `deletePhoto` leaves it pointing at the tombstone, so the fallback lives in the screens; a guarded `src/db/` change could clear it instead; (2) "newest" is read as latest date taken; (3) no undo or bin after a delete (D-0014: bin after v1). Remaining: Sander tries both on the preview.
- 2026-11-19 claude-code/opus-5.5: Done. Merged in PR #37 (reviewed and merged by Sander); in use in production ("It's working").
