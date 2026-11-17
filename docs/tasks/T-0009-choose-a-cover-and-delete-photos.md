---
id: T-0009
title: "Choose a project's cover photo and delete photos"
description: "Set any of a project's photos as its cover, and delete a photo as a tombstone that syncs, from the photo viewer."
status: Open
guarded: false
depends_on: [T-0003, T-0007, T-0008]
decisions: [D-0002, D-0004, D-0020]
raised_on: 2026-11-17
done_on: ""
result: []
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
