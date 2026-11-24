---
id: T-0029
title: "Move between days in the photo viewer"
description: "D-0031: arrow keys, the ‹ › buttons and swipes go from a day's last photo to the next day's first (and back) in the project page's order, skipping days without photos, for owner and visitors; counter and label stay per day; a delete shows what next would have."
status: Open
depends_on: []
decisions: [D-0031, D-0029, D-0025, D-0020, D-0002, D-0007, G-0019, G-0021]
raised_on: 2026-11-24
done_on: ""
result: []
---

# Goal

Sander (Engineer), 2026-11-24: "I noticed I can't navigate with the arrow keys between days,
only within one day. Please fix that."

The full-screen viewer (`src/viewer/PhotoViewer.tsx`) only knows one entry's photos, so
every way of moving stops at a day's first and last photo. Make it move through all of the
project's live photos as D-0031 sets out:

- **Order**: the project page's order. Entries newest date first (the owner's page reads
  `[projectId+date]` reversed, so equal dates fall back to id descending; `visitorTimeline`
  sorts by date then id, both descending), photos within an entry by `comparePhotos`. "Next"
  is the photo below on the page.
- **All three ways cross days**: ArrowRight/ArrowLeft, the › ‹ buttons, horizontal swipes.
  Buttons, and the end-of-strip resistance, only stop at the project's first and last photo.
- **Skip** entries with no live photos (note-only, or every photo deleted).
- **Address**: crossing days replaces the URL with the new day's segment and place
  (`/projects/<slug>/<day>/<n>`, D-0029, using `entryDays` for `-2` days). Back still closes
  the viewer.
- **Counter "x / y" and dialog label "Foto x van y, <date>"** stay per day and match `<n>`;
  the date and note panel show the current photo's day. The previous/next images in the
  strip get their own day's label.
- **Delete** (owner): show what next pointed at; at the project's last photo, what previous
  pointed at; with no live photo left in the project, close. Within a day the address stays,
  as now.
- Both `OwnerPhotoViewer` (Dexie, live query over the project's entries and photos) and
  `VisitorPhotoViewer` (the already loaded public timeline).

# Done when

1. `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `E2E_PORT=4794 pnpm run test:e2e`
   pass, and `pnpm exec harness check` passes.
2. A unit test for the shared ordering (suggested: a pure function in `src/routes/paths.ts`
   that turns a project's live entries and photos into the ordered list with each photo's
   day and place) covers: page order across entries, a note-only entry skipped, an entry
   whose photos are all deleted skipped, two entries on one date (`<date>` and `<date>-2`).
3. E2E tests on the seeded demo data (Tuinbank: 25 okt 1 photo, 11 okt 2, 4 okt 3), on the
   Pixel 7 project, owner:
   - at `/projects/tuinbank/2026-10-11/2`, ArrowRight goes to `/projects/tuinbank/2026-10-04/1`
     with the dialog named `Foto 1 van 3, 4 okt 2026` and the note of 4 okt;
   - at `/projects/tuinbank/2026-10-11/1`, ArrowLeft goes to `/projects/tuinbank/2026-10-25/1`,
     dialog `Foto 1 van 1, 25 okt 2026`;
   - a swipe left at `/projects/tuinbank/2026-10-11/2` also reaches `/2026-10-04/1`;
   - at `/2026-10-04/3` ArrowRight and a swipe stay put; at `/2026-10-25/1` ArrowLeft stays put;
   - after crossing days, one `goBack()` returns to `/projects/tuinbank` with no dialog;
   - with both photos of 11 okt deleted, ArrowRight from `/2026-10-25/1` goes to
     `/2026-10-04/1`;
   - deleting the only photo of 25 okt shows `/2026-10-11/1`.
   Visitor (`?bezoeker`): ArrowRight from 11 okt's last photo reaches 4 okt's first.
   The existing viewer, cover-delete and visitor tests still pass unchanged (the 4 okt
   swipe test still stops at `/2026-10-04/3`, being the project's last photo).
4. The tester, in a desktop browser with a mouse on the dev server (`pnpm run dev`, seeded
   data), confirms the › button shows on `/projects/tuinbank/2026-10-11/2` and goes to
   `/2026-10-04/1`, the ‹ button shows on `/2026-10-11/1` and goes to `/2026-10-25/1`, and
   neither shows at the project's first or last photo. (The e2e project is a touch device,
   where these buttons are hidden.)
5. After deploy, Sander confirms arrow keys cross days on his own projects.

# Notes

- Code: `src/viewer/PhotoViewer.tsx` (siblings, `previous`/`next` around line 135, `show`,
  `go`, `remove`, `label`), `src/routes/paths.ts`, `src/routes/ProjectPage.tsx` (the page's
  order; make it use the same shared function), `src/public/source.ts` (`visitorTimeline`).
- Tests: `e2e/viewer.spec.ts`, `e2e/cover-delete.spec.ts`, `e2e/visitor.spec.ts`,
  `src/routes/paths.test.ts`.
- The strip renders previous/current/next; across a day boundary the neighbour is another
  entry's photo, so `previous`/`next` need their own day and place, not `index ± 1`.
- No schema, sync or NAS change; no question for the Engineer.
- Visible change (where the buttons appear, what the counter and panel show while crossing):
  goes to the UX designer first.

# Design

# Test

# Log

- 2026-11-24 architect: Raised from Sander's request. Recorded D-0031: the viewer moves through all of a project's live photos in the page's order; arrow keys, buttons and swipes all cross days; days without photos skipped; counter and label stay per day; a delete shows what next would have shown. No open question. Handed to the UX designer.
