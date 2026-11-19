---
id: T-0017
title: "Sync photo files: upload the original, copy and thumbnail; other devices fetch copy and thumbnail"
description: "Upload each photo's untouched original, its 2560 px copy and its thumbnail in the background, resuming after interruptions; drop the device's original once confirmed; other devices download only the copy and thumbnail."
status: Done
guarded: true
depends_on: [T-0007, T-0016]
decisions: [D-0002, D-0003, D-0005, D-0006, D-0014, D-0015]
raised_on: 2026-11-17
done_on: "2026-11-19"
result: [https://github.com/SanderGeraedts/diy-projects/pull/35, https://github.com/SanderGeraedts/diy-projects/pull/37]
---

# Goal

D-0015's three files per photo:

- **Upload:** the adding device uploads the copy and the thumbnail first (small, so other
  devices see the photo quickly), then the original byte for byte (D-0003). One photo at a
  time, in the background, starting again after an interruption or a closed app (D-0005);
  progress per photo.
- **After confirmation:** when all three files are confirmed, mark the photo synced and drop
  the device's original; keep the copy and thumbnail (D-0003). Never drop it before the NAS
  confirms (D-0002).
- **Other devices:** when a photo record arrives through T-0016's pull, download its copy and
  thumbnail, never the original (D-0015).
- **Tombstones:** a photo deleted before its upload finished is never uploaded; one deleted
  later syncs only its tombstone (D-0014).

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass.
- CI sync tests against the throwaway PocketBase (T-0016's job) cover: an upload interrupted
  halfway resumes and the stored original is byte-identical (checksum); the device's
  original is dropped only after all three files are confirmed; a second simulated device
  ends up with the copy and thumbnail and no original; a photo deleted before upload is
  never sent.
- Sander adds 20 photos on the phone on mobile data, closes the app halfway, reopens it, and
  all 20 arrive on the NAS; they then show on the laptop.
- Sander reviews the PR (guarded).

# Notes

- T-0013 adds the `copy` and `thumbnail` file fields next to `original`; if it didn't, add
  them here as an additive migration in `deploy/nas/`.

# Log

- 2026-11-17 claude-code/opus-5.5: Built on `t-0016-sync` with `t-0010-delete` merged in
  (T-0007's import chain; `src/db/` keeps T-0016's Dexie v3 and T-0010's delete API, no new
  Dexie version). `src/sync/photos.ts` holds the file helpers; `engine.ts` runs push → pull
  (downloading new photos' copy and thumbnail with a file token, never the original) →
  uploads → token refresh, all under `startBusy` and the sync lock. Uploads go one request at
  a time: first copy + thumbnail (one request) for every pending photo, then the originals,
  sent as stored (the gallery `File`, its own name). A file is marked uploaded only when
  PocketBase's answer names it; `markPhotoFileUploaded` drops the original once all three are.
  The state is the photo's `uploads` in Dexie, so a closed app carries on. Progress: per photo
  in `uploads` (`uploadProgress()`), live in `SyncStatus.photoUpload`. `cursor:photos` is
  reset once (`photoFiles` in `syncState`). New migration `1794931400_protected_photo_files.js`
  makes the three file fields protected (owner-only like their records, D-0005); the smoke
  test checks it. CI's `pocketbase-auth` job runs the new `photos.pocketbase.test.ts`.
  Implementation choices and open points for Sander (not decided here): (1) protecting the
  files: an unprotected PocketBase file is readable by anyone with its URL; (2) resuming is per
  file: PocketBase has no resumable uploads, so an interrupted original starts again from its
  first byte; (3) a photo tombstoned before its upload keeps its original and files on the
  device, pending, indefinitely (nothing is decided on dropping them; `deletePhoto`'s comment
  says the engine removes them once the NAS has the tombstone, which this doesn't do);
  (4) a file the NAS refuses (400, e.g. an original over 40 MB) skips that photo, is retried
  every run and shown as the sync error; (5) v1 photos (`uploads: none`) are still not
  uploaded (T-0003's open point). Checks: typecheck clean; `pnpm test` 265 passed / 19
  skipped; build OK; e2e 33 passed / 2 skipped; locally against PocketBase 0.40.6 auth 5/5,
  sync 9/9, photo files 5/5. Draft PR #35 (base `t-0016-sync`).
- 2026-11-19 claude-code/opus-5.5: Merged in PR #37 (reviewed and merged by Sander); photo upload works in production. Remaining for Done: Sander adds 20 photos on mobile data, closes the app halfway, reopens it, and all of them arrive.
- 2026-11-19 claude-code/opus-5.5: Done. Sander added 20 photos on mobile data, closed the app halfway and reopened it; all arrived. Confirmed by Sander in chat ("All checked and verified").
