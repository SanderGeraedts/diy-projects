---
id: T-0006
title: "Process photos on the device: date taken, the 2560 px copy and a thumbnail"
description: "A tested module that reads a photo's EXIF date taken and makes its 2560 px WebP copy and a thumbnail in a worker, leaving the original untouched."
status: Doing
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

- `pnpm test` passes with tests for `dateTaken` on fixture images with and without EXIF
  (generated test images, no real photos: D-0006, D-0010).
- An e2e test (Chromium) processes a generated 6000×4000 JPEG fixture and checks the copy is
  WebP with a long edge of 2560 px and the right orientation, and the original's bytes are
  unchanged.
- `pnpm run typecheck` and `pnpm run build` pass.

# Notes

- Put it in `src/photos/` (not guarded).
- An EXIF reader library is fine if it's small and maintained (for example `exifr`); say
  which in the PR.
- Size and format are fixed by D-0003; changing them needs a new decision.

# Log

- 2026-11-17 claude-code/opus-5.5: Built `src/photos/`: `dateTaken(file)` (EXIF DateTimeOriginal via
  `exifr` 7.1.3 on the first 256 KB, returned as local "YYYY-MM-DDTHH:mm:ss" with
  `source: 'exif' | 'lastModified'`), `makeCopy(file)` (2560 px long edge, WebP q 0.85, no
  upscaling, `createImageBitmap(..., { imageOrientation: 'from-image' })`) and
  `makeThumbnail(copy)` (512 px, WebP q 0.8), both in one module Web Worker with
  OffscreenCanvas, queued one photo at a time. The original is only read. Tests: unit tests
  for `dateTaken` on generated EXIF fixtures (`src/photos/exifFixture.ts`) and `fitLongEdge`;
  e2e `e2e/photos.spec.ts` runs the module from its own Vite dev server (port 5199, as the
  module isn't in a screen yet) on a generated 6000×4000 JPEG with EXIF orientation 6 and
  checks WebP, 1707×2560, red on top (rotation applied), a 512 px thumbnail, and unchanged
  original bytes. Checks: typecheck clean; `pnpm test` 52 passed; build ok; `pnpm run
  test:e2e` 6 passed (one earlier full run had `app.spec.ts` "no Funnel address" fail once;
  it passed alone and in three later full runs, so likely a flake not caused by this change).
  Remaining: the 0.6–0.9 MB copy size can't be checked on a flat-colour fixture (quality 0.85
  is to be verified on real photos on the Fold, by Sander); wiring into import is T-0007.
