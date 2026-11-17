---
id: T-0007
title: "Import photos from the gallery into a project's entries"
description: "A multi-select picker that adds photos to a project, grouped into one entry per day taken, storing the 2560 px copy, a thumbnail and the original until it's uploaded."
status: Open
guarded: false
depends_on: [T-0003, T-0005, T-0006]
decisions: [D-0002, D-0003, D-0004, D-0011]
raised_on: 2026-11-17
done_on: ""
result: []
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

- `npm run typecheck`, `npm test`, `npm run build` pass.
- `npm run test:e2e` passes, with a test that imports generated fixture photos taken on two
  different days and sees two entries with the right photos, offline.
- Sander imports a real batch of 20+ photos on his Pixel from the deploy preview without
  the app freezing.

# Notes

- Check storage with `navigator.storage.estimate()` before importing and warn when space is
  short.
- The share target is out of v1 (D-0004).

# Log
