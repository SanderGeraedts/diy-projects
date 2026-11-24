---
id: T-0038
title: "Upload each rebuilt thumbnail once over the older one on the NAS"
description: "D-0039: an owner device's sync uploads each 1280 px thumbnail it rebuilt (T-0037) over the NAS's older 512 px one, once, only while the NAS's is still narrower, without a new updatedAt, history or unsent count, so visitors see older photos sharp."
status: Doing
size: small
depends_on: [T-0037]
decisions: [D-0039, D-0038, D-0002, D-0015, D-0014, D-0026, D-0023, D-0013, G-0019, G-0023]
raised_on: 2026-11-24
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/71"]
---

# Goal

T-0037 made thumbnails 1280 px and has every owner device rebuild its older ~512 px
thumbnails from its copy, locally only (`src/photos/rebuild.ts`). The NAS still holds the
512 px files, so a **visitor** sees photos added before T-0037 as soft. Sander answered Q-007
"Yes to Q-007, upload the rebuilt thumbnails" (D-0039).

Deliver D-0039: an owner device's sync uploads each thumbnail of the current size over the
NAS's older one, once, through the normal photo upload, so visitors and new devices get the
1280 px file. Nothing visible changes for the owner; visitors see older photos as sharp as
new ones.

The points below are settled; follow them.

1. **Which photos.** A photo is a candidate when, on this device: it is alive
   (`deletedAt === null`), its `thumbnailWidth` equals the current thumbnail width for its copy
   (`currentThumbnailWidth` in rebuild.ts, within 1 px), its upload is not pending
   (`uploads.copy` and `uploads.thumbnail` are not `'pending'`), it has no outbox row, and it
   isn't marked done. That covers photos T-0037 already rebuilt on devices in production
   before this ships, and photos rebuilt later. Keep the state in a **local-only field** on
   the photo (as `thumbnailWidth` is: not indexed, so no Dexie version, and never sent by
   `toServer`); its name and values are the developer's, say them in the PR. It needs at
   least "to check" and "done". A photo whose thumbnail this device made at the current size
   and uploaded itself (imports after T-0037) may be marked done when `markPhotoFileUploaded`
   confirms the thumbnail, so it is never checked. A photo downloaded from the NAS whose
   thumbnail measures at the current size is done too (it is what the NAS has).
2. **Which device uploads: the first to check, once.** Right before uploading, the device
   fetches the NAS's current thumbnail of that photo (the record's `thumbnail` file, with a
   file token as `download` does now) and measures it in the photo worker. When it is already
   within 1 px of the current width, the device uploads nothing and marks the photo done.
   Otherwise it uploads its own thumbnail, and marks the photo done when PocketBase's answer
   names a thumbnail file. Two devices racing may both upload; that is accepted (D-0039), no
   lock or server field.
3. **How it fits the sync.** A new last step in `uploadPhotoFiles` (after `copy+thumbnail`
   and `original` for every photo), one photo at a time, as
   `api.update(id, form)` with **only** the `thumbnail` file in the form: no `updatedAt`,
   no other field, the blob as it is (never re-encoded). It doesn't use `uploads.thumbnail`
   (that stays `'uploaded'` or `'none'`), writes **no outbox row**, and never changes the
   local photo's `updatedAt`, `uploads`, `blob`, `thumbnail` or `original`; only the new
   local-only field. On the NAS: `last_write_wins.pb.js` saves an update without `updatedAt`,
   `history.pb.js` has no photos hook, so no history row; PocketBase's `updated` moves, so the
   record is pulled again elsewhere, and `pullTable` skips it (same `updatedAt`) and
   `downloadNewPhotos` skips photos it already holds. Don't change either.
4. **Not unsent work, not shown.** The step doesn't set `photoUpload` in the sync status,
   isn't counted by `countUnsynced` (sign-out's warning) or `pendingPhotos`, and nothing on
   screen mentions it (T-0037's Design: nothing shown). Signing out may drop pending
   candidates; the next device that rebuilds those photos does them.
5. **Failures and retries.**
   - Offline, a timeout, a 5xx or any other network failure: stop this step for the run,
     keep the candidates, try again on the next sync run. It must **not** turn the run into
     an error, set `lastError`, or start the engine's retry back-off on its own.
   - 401/403: as the rest of sync (the run already pauses on a refused sign-in).
   - 400 (refused, e.g. too large): `console.warn`, leave the photo as it is and don't try
     it again until the app starts again (as rebuild.ts does with `failed`); go on with the
     next photo.
   - 410 (purged, T-0022): `dropPurgedPhoto`, as the other upload steps.
   - 404 on the record (not on the NAS: a pre-sync or demo photo): mark it done, no retry.
   - 404 on the NAS's thumbnail file while the record exists: upload (there is nothing to
     keep).
   - A photo tombstoned meanwhile: skip it, keep it a candidate (a restore, D-0026, brings it
     back to the list).
   - A thumbnail the photo worker can't measure: treat as older, and upload.
6. **Other devices and visitors.** Other owner devices keep their own rebuilt thumbnail (the
   pull doesn't download files of photos it holds); a device that downloads the photo later
   gets the 1280 px file and its rebuild only measures it. A visitor's `thumbnailUrl`
   (`src/public/source.ts`) carries the new file name after the upload, so the browser loads
   the new file; no cache work is needed (the service worker doesn't cache NAS files).
7. **The NAS: nothing changes.** The photos `updateRule` already lets the owner update their
   own record, `thumbnail` is one file of at most 2 MB, and PocketBase deletes the replaced
   file. No migration, rule, hook, `deploy/nas` or backend image change; if you find one is
   needed, stop and send the task back to the architect (D-0039 says to ask the Engineer).

# Done when

All checks against generated images and a **throwaway PocketBase only**
(`pnpm exec harness backend start`, or CI's `pocketbase-auth` job), never the production NAS
(G-0019). A `*.pocketbase.test.ts` suite with simulated devices (own Dexie and client each, as
`src/sync/photos.pocketbase.test.ts`) and a fake photo worker is fine; "measured" below means
the width the test's measure returns, and "same file" means equal sha256.

1. **Upload once, from the first device.** Device A adds a photo with a 512 px thumbnail and
   syncs (copy, thumbnail, original uploaded); device B pulls it. Both rebuild (1280 px). A
   syncs: the NAS's thumbnail is A's rebuilt file; the NAS record's `updatedAt`, `copy`,
   `original` and every other field are unchanged; the `history` collection has no new row
   (counted as superuser before and after). B syncs: it fetches and measures the NAS's
   thumbnail, sends **no** update request for the photo (count PATCH requests to
   `/api/collections/photos/records/<id>`: 0), and the NAS's thumbnail is still A's file.
   A third sync on each device sends no request for it either.
2. **Race.** A and B both rebuild, and both sync with the check answered before either
   upload lands: the run ends without an error on both, the NAS has exactly one thumbnail
   file for the photo and it is one of the two rebuilt files, and both mark the photo done
   (no request on their next sync).
3. **Nothing local moves.** On the uploading device, before and after: outbox count 0,
   `countUnsynced` 0, the photo's `updatedAt`, `uploads`, `blob`, `thumbnail` unchanged, and
   the engine's status never had a `photoUpload` naming this step; `lastError` stays null.
   The body of the upload contains only `thumbnail` (assert the multipart field names).
4. **Others pick it up.** After 1, device C (new, empty) pulls the photo: its thumbnail is the
   NAS's 1280 px file, its rebuild only measures it, and it sends nothing. A visitor client
   (`createPocketBaseSource` with `visitorClient`) on the public project gets a
   `thumbnailUrl` different from before the upload, and fetching it returns A's rebuilt file.
5. **Order and skips.** With a new photo pending upload and an older one to replace in the
   same run, the new photo's `copy+thumbnail` and `original` requests come before the
   replacement. A tombstoned candidate sends nothing; after a restore it is replaced on the
   next sync. A photo with an outbox row waits for its push.
6. **Failures** (unit with a fake client, or the throwaway PocketBase where it can):
   network failure on the replacement → the run succeeds otherwise, `lastError` null, the
   candidate is uploaded on the next run; 400 → `console.warn`, not retried in that app
   session, the next candidate still goes; 410 → the photo is dropped locally; 404 on the
   record → marked done, no further request.
7. **Already rebuilt before this ships.** A device holding a photo with `thumbnailWidth` 1280
   and no state for this task (as T-0037 left production devices) checks and replaces it on
   its next sync; a photo imported after T-0037 (thumbnail made at 1280 and uploaded by this
   device) is not fetched or uploaded again.
8. `pnpm run typecheck`, `pnpm test` (with the PocketBase suites run against a throwaway
   PocketBase, not skipped), `pnpm run test:e2e`, `pnpm run build` and
   `pnpm exec harness check` pass; `e2e/thumbnails.spec.ts` (T-0037's "a rebuild is
   invisible") still passes unchanged.
9. **Sander in production** (after the merge, once his phone and laptop have opened the app
   and synced): in a private window, not signed in, a public project page shows its older
   photos (added before T-0037) as sharp as the newer ones; what he sees is the same page and
   layout, only sharper older photos. Optional proof: in the browser's developer tools such a
   tile's image has a natural width of 1280 (landscape) or 960 (portrait). The owner's app
   shows no new text or count while it happens. Keeps the task *Doing* with `Remaining:`
   until he confirms.

# Notes

- Sized **small** (G-0031): no new screen, route, collection, NAS field or outside service;
  sync work only. The owner sees nothing new, and T-0037's Design already says rebuild work
  is never shown; a visitor sees only sharper older photos. No design before the build.
- **Q-007** is answered by **D-0039** (issue #69 closed). Nothing waits on a human before the
  build. Nothing on the NAS changes, so there is **no backend or NAS deploy step**; the front
  end ships with the merge as usual. The hourly snapshots (G-0023) keep the replaced files
  for two weeks.
- Code to read: `src/sync/engine.ts` (`uploadPhotoFiles`, `download`, `downloadNewPhotos`,
  `pullTable`, the run's error handling and `photoUpload`), `src/sync/photos.ts`
  (`UPLOAD_STEPS`, `uploadBody`, `confirmedFiles`), `src/sync/records.ts` (`toServer`,
  `photoFromServer`), `src/photos/rebuild.ts` (`needsCheck`, `currentThumbnailWidth`,
  `failed`), `src/db/db.ts` (`Photo.thumbnailWidth`, `uploads`), `src/db/write.ts`
  (`markPhotoFileUploaded`, `countUnsynced`), `src/photos/photo.worker.ts` (the `size` job),
  `src/public/source.ts`, and on the NAS side `backend/pb_hooks/last_write_wins.pb.js`,
  `history.pb.js`, `bin.pb.js`, `photo_files.pb.js` and
  `backend/pb_migrations/1794931200_diy_projects.js` (rules, file limits). Read only; don't
  change the backend.
- D-0038's guidance "never upload a rebuilt thumbnail until Q-007 is answered" is now met by
  D-0039. Its line about a visitor's older thumbnails being labelled 1280w stops mattering as
  they are replaced; don't change the visitor's `srcset`.
- Rebuild (rebuild.ts) and this upload are separate: rebuild still writes only local files;
  the sync decides what to upload. Don't make rebuild touch the network.
- Earlier work: T-0017 (photo sync, `photos.pocketbase.test.ts` for the throwaway setup),
  T-0022 (purge markers, 410), T-0026 (visitor view), T-0037 (rebuild, `thumbnailWidth`).
- Lesson of T-0036: fetch and merge `origin/main` before starting the build and again before
  opening the pull request.

# Design

Small task (G-0031): nothing new is shown. T-0037's Design holds: no message, count or
progress for this work; the status bar doesn't count it.

# Test

# Log

- 2026-11-24 architect: Q-007 answered by Sander ("Yes to Q-007, upload the rebuilt
  thumbnails"); recorded D-0039 (thumbnails may be replaced on the NAS, once, by the first
  owner device to check, no `updatedAt`, history or unsent count) and closed issue #69. Read
  the backend: the owner may already replace a photo's file and photos have no history hook,
  so nothing on the NAS changes. Size small.
- 2026-11-24 developer: built the replacement as the sync's last step (`replaceThumbnails` in
  `src/sync/engine.ts`), run after a run that went through and right after its sign-in check
  (a refused token reads as a guest, who would find no record and mark it done), so it never
  starts on a run that failed. Per candidate, oldest first: re-read the photo (tombstoned or
  changed: skip, stays a candidate), wait for an outbox row, `getOne` the record (new on
  `RecordApi` and the fake), fetch its `thumbnail` with a file token and measure it with the
  photo worker (`measure`, new engine option; `src/sync/app.ts` passes `measureImage`); within
  1 px of `currentThumbnailWidth`: done, else `api.update(id, form)` with only `thumbnail`
  (`thumbnailBody` in `src/sync/photos.ts`, the blob as it is). Local-only field
  **`Photo.thumbnailOnNas?: 'check' | 'done'`** (absent counts as `check`; not indexed, no Dexie
  version, not in `toServer`). Set to `done` when the NAS's thumbnail measures current, when the
  replacement is confirmed, when `uploadPhotoFiles` confirms a thumbnail of the current size this
  device made (imports after T-0037), on 404 of the record, and by the rebuild when it only
  measures a thumbnail of the current size (downloaded ones); the rebuild sets `check` when it
  rebuilds. Failures: 401/403 throw into the run's sign-in pause; 410 drops the photo; 404
  marks done; 400 warns and skips the photo until the app starts again; anything else (offline,
  timeout, 5xx) warns and stops the step for this run, without `lastError`, retry or
  `photoUpload`. A 404 on the NAS's file, or a file that can't be measured, is replaced.
  `src/main.tsx` asks for a sync after each rebuild pass, so rebuilt thumbnails go up soon.
  No backend, `deploy/nas` or migration change. **Workflow change:** `ci.yml`'s
  `pocketbase-auth` job runs the new `src/sync/thumbnails.pocketbase.test.ts` as its own step
  (the suites run one file at a time there, for PocketBase's sign-in rate limit). Tests:
  `src/sync/thumbnails.test.ts` (16, fake PocketBase: Done when 1, 3, 5, 6, 7 and the 401 and
  missing-file cases), `src/sync/thumbnails.pocketbase.test.ts` (6, Done when 1 to 7 on a real
  PocketBase: request counts, multipart fields, sha256, history count, the race with both checks
  answered before either upload, a new device, a visitor's `thumbnailUrl`), two lines in
  `src/photos/rebuild.test.ts`. Check output, against `pnpm exec harness backend start` (a
  throwaway PocketBase on this machine): `pnpm run typecheck` clean; each PocketBase suite as CI
  runs them: auth 5 passed, sync 13 passed, photos 8 passed, thumbnails 6 passed (three runs in
  a row: 6 passed each); `pnpm test` "Test Files 34 passed | 4 skipped (38), Tests 425 passed |
  32 skipped (457)" (all four PocketBase files in one parallel run hit PocketBase's sign-in rate
  limit, 429, in auth, photos and thumbnails alike, which is why CI runs them one by one);
  `pnpm run build` ok; `E2E_PORT=4794 pnpm run test:e2e` "79 passed, 2 skipped", with
  `e2e/thumbnails.spec.ts` unchanged and passing. Remaining: Done when 9, Sander in production
  after the merge.
