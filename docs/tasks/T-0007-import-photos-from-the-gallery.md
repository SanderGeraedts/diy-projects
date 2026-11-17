---
id: T-0007
title: "Import photos from the gallery into a project's entries"
description: "A multi-select picker that adds photos to a project, grouped into one entry per day taken, storing the 2560 px copy, a thumbnail and the original until it's uploaded."
status: Doing
guarded: false
depends_on: [T-0003, T-0005, T-0006]
decisions: [D-0002, D-0003, D-0004, D-0020]
raised_on: 2026-11-17
done_on: ""
result: [https://github.com/SanderGeraedts/diy-projects/pull/28]
---

# Goal

Sander takes photos with the Pixel camera and adds them later (D-0003):

- "Foto's toevoegen" on a project page opens the gallery picker
  (`<input type="file" accept="image/*" multiple>`).
- Each photo goes into the project's entry for the day it was taken (T-0006's
  `dateTaken`), creating that entry if needed. Photos without EXIF say "datum van het
  bestand" in the import summary.
- Each photo is stored through T-0003's `addPhotos`: the copy, the thumbnail and the
  original (kept until the NAS confirms it, D-0003).
- Progress while importing ("12 van 30"); the import keeps going if the screen is left, and
  a failed photo is reported without losing the others.
- If the project has no cover photo yet, the first imported photo becomes it.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass.
- `pnpm run test:e2e` passes, with a test that imports generated fixture photos taken on two
  different days and sees two entries with the right photos, offline.
- Sander imports a real batch of 20+ photos on his Pixel from the deploy preview without
  the app freezing.

# Notes

- Check storage with `navigator.storage.estimate()` before importing and warn when space is
  short.
- The share target is out of v1 (D-0004).

# Log

- 2026-11-17 claude-code/opus-5.5: Stacked on T-0005 (#26 → #22 → #14), with T-0019's busy registry (#21) merged in. "+ Foto's toevoegen" on the project page (`src/routes/ImportPhotos.tsx`) opens `<input type="file" accept="image/*" multiple>`. The import runs in `src/photos/importQueue.ts`, outside the screen (module-level queue, progress via `useSyncExternalStore`), inside `startBusy('de foto-import')`: per photo `dateTaken` → `makeCopy` → `makeThumbnail` → size → that day's entry (T-0005's `findEntry`, else `addEntry`) → `addPhotos` with the original; one write per photo so a failure loses only that photo; the first photo becomes the cover if there is none. Progress "Foto's importeren: 12 van 30", then a summary with failures and the photos dated by the file ("datum van het bestand"); a `navigator.storage.estimate()` warning when free space is less than the originals plus ~1 MB each. `src/db/` unchanged; the photo size is read on the main thread with `createImageBitmap(copy)` since the worker returns only the blob. `e2e/photos.spec.ts` port can now be set with `PHOTOS_E2E_PORT`. Checks: typecheck clean, `pnpm test` 134 passed, build ok, `test:e2e` 14 passed / 2 skipped incl. new `e2e/import.spec.ts` (offline; 3 EXIF photos on two days + a broken file → two entries with the right photos, failure reported, cover set, leaving the page mid-import; a no-EXIF photo flagged), run on private ports 4931/5931. Open: (1) low storage only warns, the import still runs (no confirm step decided); (2) the timeline still doesn't filter tombstoned entries or photos (from T-0005). Remaining: Sander imports 20+ real photos on his Pixel from the preview and checks the WebP copy size against 0.6–0.9 MB.
