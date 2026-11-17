---
id: T-0006
title: "Process photos on the device: date taken, the 2560 px copy and a thumbnail"
description: "A tested module that reads a photo's EXIF date taken and makes its 2560 px WebP copy and a thumbnail in a worker, leaving the original untouched."
status: Open
guarded: false
depends_on: []
decisions: [D-0003, D-0007]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

The image work behind photo import (T-0007), on its own and testable:

- `dateTaken(file)`: EXIF `DateTimeOriginal` as a local date and time; without EXIF, the
  file's last-modified date, flagged as such (D-0003).
- `makeCopy(file)`: the 2560 px long-edge copy at high quality, about 0.6–0.9 MB, in
  WebP (D-0003 allows WebP or AVIF; Chrome on Android can encode WebP from a canvas). Never
  upscales a smaller photo. Honours the EXIF orientation.
- `makeThumbnail(copy)`: a small copy for grids (about 512 px), derived from the copy.
- Runs in a Web Worker with `createImageBitmap` and `OffscreenCanvas`, one photo at a time,
  so importing 30 photos of 10+ MB doesn't freeze the app or run out of memory.
- The original `File` is never modified, re-encoded or stripped (D-0003).

# Done when

- `npm test` passes with tests for `dateTaken` on fixture images with and without EXIF
  (generated test images, no real photos: D-0006, D-0010).
- An e2e test (Chromium) processes a generated 6000×4000 JPEG fixture and checks the copy is
  WebP with a long edge of 2560 px and the right orientation, and the original's bytes are
  unchanged.
- `npm run typecheck` and `npm run build` pass.

# Notes

- Put it in `src/photos/` (not guarded).
- An EXIF reader library is fine if it's small and maintained (for example `exifr`); say
  which in the PR.
- Size and format are fixed by D-0003; changing them needs a new decision.

# Log
