---
id: T-0017
title: "Sync photo files: upload the original, copy and thumbnail; other devices fetch copy and thumbnail"
description: "Upload each photo's untouched original, its 2560 px copy and its thumbnail in the background, resuming after interruptions; drop the device's original once confirmed; other devices download only the copy and thumbnail."
status: Open
guarded: true
depends_on: [T-0007, T-0016]
decisions: [D-0002, D-0003, D-0005, D-0006, D-0014, D-0015]
raised_on: 2026-11-17
done_on: ""
result: []
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
