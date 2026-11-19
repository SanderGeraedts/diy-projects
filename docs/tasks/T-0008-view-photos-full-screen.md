---
id: T-0008
title: "View photos full screen"
description: "A full-screen photo viewer with swipe between an entry's photos and pinch zoom, sized for the open Pixel Fold."
status: Done
guarded: false
depends_on: [T-0002]
decisions: [D-0003, D-0020]
raised_on: 2026-11-17
done_on: "2026-11-19"
result: [https://github.com/SanderGeraedts/diy-projects/pull/25, https://github.com/SanderGeraedts/diy-projects/pull/37]
---

# Goal

Tapping a photo opens it full screen from the local 2560 px copy, offline (D-0003):

- Swipe left and right through the photos of that entry; the date and note stay reachable.
- Pinch and double-tap to zoom, up to the copy's full resolution; swipe down or back closes.
- The browser back button closes the viewer (it has its own URL, so a reload reopens it).
- Uses the full inner screen of the open Fold (about 2150 px on the long side) and the
  outer screen when folded.
- Grids use the thumbnail; the viewer loads the copy.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass.
- `pnpm run test:e2e` passes, with tests on the demo data: open a photo, swipe to the next,
  go back with the browser's back button, and open a photo offline.
- Sander confirms on his Fold, open and folded.

# Notes

- Works on the seeded demo photos, so it doesn't wait for T-0007.
- A small gesture library is fine if it's maintained; say which in the PR.

# Log

- 2026-11-17 claude-code/opus-5.5: Built the viewer at `/projects/$projectId/photos/$photoId` (src/viewer/), plain pointer events, no gesture library. Grids now show the thumbnail and link to the viewer. Stacked on T-0002's branch. Open points: (1) the viewer uses the theme background (`bg-bg`), not black; a black photo background would need a token, so that's for Sander or a decision; (2) zoom goes up to one copy pixel per CSS pixel. Remaining: Sander checks it on his Fold, open and folded.
- 2026-11-19 claude-code/opus-5.5: Merged in PR #37 (reviewed and merged by Sander). Remaining for Done: Sander checks the viewer on the Fold, open and folded.
- 2026-11-19 claude-code/opus-5.5: Done. Sander checked the viewer on the Fold, open and folded. Confirmed by Sander in chat ("All checked and verified").
