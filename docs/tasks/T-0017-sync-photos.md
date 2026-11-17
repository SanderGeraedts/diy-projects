---
id: T-0017
title: "Sync photo files: upload originals, fetch copies on other devices"
description: "Upload each photo's untouched original to the NAS in the background, resuming after interruptions, drop the device's original once confirmed, and get other devices their copy as Q-004 decides."
status: Open
guarded: true
depends_on: [T-0007, T-0016]
decisions: [D-0002, D-0003, D-0005, D-0006]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

**Blocked by Q-004** for how other devices get their copy. Don't start until a decision
answers it; then add it to `decisions` above and rewrite the second half of this goal.

- **Upload:** each photo's original goes to the NAS byte for byte (D-0003), one at a time,
  in the background, and starts again after an interruption or a closed app (D-0005).
  Large uploads over Funnel can be slow; show progress per photo.
- **After confirmation:** mark the original uploaded and drop it from the device; keep the
  2560 px copy and thumbnail (D-0003). Never drop it before the NAS confirms (D-0002).
- **Tombstoned photos:** a photo deleted before its upload finished is never uploaded; one
  deleted after upload syncs its tombstone (T-0016).
- **Other devices:** as Q-004's decision says.

# Done when

- `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` pass.
- CI sync tests against the throwaway PocketBase (T-0016's job) cover: an upload interrupted
  halfway resumes and the stored original is byte-identical (checksum); the device's
  original is dropped only after confirmation; a second simulated device ends up with the
  copy and thumbnail.
- Sander adds 20 photos on the phone on mobile data, closes the app halfway, reopens it, and
  all 20 originals arrive on the NAS; they then show on the laptop.
- Sander reviews the PR (guarded).

# Notes

- T-0013 adds the file fields Q-004's answer needs, or this task does in `deploy/nas/`.

# Log
