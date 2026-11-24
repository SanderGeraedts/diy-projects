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
6. (Design) E2E, owner, Pixel 7: at `/projects/tuinbank/2026-10-25/1` the counter reads
   `1 / 1`; after ArrowRight from `/2026-10-11/2` the counter reads `1 / 3` and the panel's
   heading is `4 okt 2026`; a project with exactly one live photo (Fietsenrek) shows no
   counter.
7. (Design) The tester, on the dev server with a mouse and keyboard: Tab to ›, press Enter
   until `/2026-10-04/3`; when › disappears, focus is on ‹ (not on the page behind). With long
   notes on 11 okt and 4 okt (edit them in the app), scroll 11 okt's panel down on photo 2,
   cross to 4 okt: its panel starts at the top. Hide the panel with a tap/click, cross a day: it stays hidden.

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

Small change to the existing viewer (T-0008, T-0009, T-0026; look per D-0020). Nothing new
is drawn: no new buttons, words, colours or animations. Crossing a day looks exactly like
moving within one; what tells the user they are on another day is the date and note in the
bottom panel, and the counter starting again at 1.

**The strip.** The same 200 ms slide in both directions, within a day and across days. The
neighbour waiting left or right is the photo before or after it in the whole project (a
different day's photo at a day's edge), so a swipe drags the real next photo into view. The
end-of-strip resistance (the drag moving at a third of the finger) only applies at the
project's first photo (swiping right) and last photo (swiping left), not at a day's edge.

**The counter (top right, `x / y`).** Counts the shown photo's day, matching `<n>` in the
address: on 11 okt it reads `1 / 2`, `2 / 2`; after the next photo it reads `1 / 3` (4 okt).
It now shows whenever the project has more than one live photo, including on a day with a
single photo (`1 / 1`), so it doesn't appear and disappear as the user moves through the
project. It stays hidden only when the project has exactly one live photo (nowhere to go).
Never a project-wide count (D-0031). Still `aria-hidden`: the dialog's name carries it.

**The bottom panel (date heading with accent bar, note, owner's actions).** Always shows the
current photo's day. It changes at the moment the new photo becomes the current one (when
the slide ends and the address changes), together with the counter; no fade or animation of
its own. When the day changes, the panel scrolls back to its top, so a long note of the new
day starts at its first line. Within a day it keeps its scroll position, as now. The owner's
*Als omslagfoto gebruiken* / *Dit is de omslagfoto* and *Verwijderen* refer to the shown
photo, as now.

**Shown or hidden chrome.** A single tap still hides the top bar and the panel together.
That choice holds while moving, across days too: crossing a day doesn't bring the panel
back. (The user hid it on purpose; the counter restarting is the cue when it is visible.)

**The ‹ › buttons (mouse and trackpad only, `pointer-fine`, as now).** Same place (vertically
centred, 1rem from the left and right edge), same look (round translucent panel, 44 px),
same names *Vorige foto* and *Volgende foto*. › shows whenever there is a later photo in the
project's order, ‹ whenever there is an earlier one; so on 11 okt photo 2 the › shows and
leads to 4 okt photo 1, and on 11 okt photo 1 the ‹ shows and leads to 25 okt. Neither has a
separate day label. Neither shows at the project's first (‹) and last (›) photo. On a touch
device they stay hidden; swipes do the same work.

**Keyboard.** ArrowRight = next, ArrowLeft = previous, across days, stopping silently at the
project's ends (no sound, no message, no wrap-around to the other end). Escape closes; with
the delete confirmation open, Escape cancels it, as now. If the focused ‹ or › disappears
because the project's end was reached, focus moves to the other arrow button, or to
*Sluiten* when there is none, never to the page behind.

**Screen reader.** The dialog's name and the current image's alt text are
`Foto x van y, <d mmm yyyy>` for the shown photo's own day (e.g. `Foto 1 van 3, 4 okt
2026`), updated on every move, as within a day now. The neighbours in the strip stay
`aria-hidden`; their alt is their own day's (`Foto 1 van 3, 4 okt 2026` while 11 okt photo 2
is shown), never `Foto 3 van 2`. No extra live region.

**Address and back.** Every move replaces the address (`/projects/tuinbank/2026-10-04/1`);
one back always closes the viewer and shows the project page, whatever the number of days
crossed.

**Delete (owner).** After *Verwijderen* is confirmed: the photo next would have shown takes
its place, which may be the next day's first photo (the panel and counter switch to that
day); at the project's last photo, the previous one; with no live photo left in the project,
the viewer closes to the project page. Between the delete and the new photo the viewer shows
its plain background, never *Foto niet gevonden*. Words unchanged.

**Other states, unchanged.** Loading: the plain full-screen background. A day or place that
doesn't exist: *Foto niet gevonden* with *← Terug naar het project*. Visitor with the NAS
unreachable: the existing unreachable message with the same back link. Zoomed in: a drag
pans and arrow keys still move (resetting the zoom), as now. Small screens: nothing changes;
the panel keeps its 40% maximum height and scrolls.

# Test

# Log

- 2026-11-24 architect: Raised from Sander's request. Recorded D-0031: the viewer moves through all of a project's live photos in the page's order; arrow keys, buttons and swipes all cross days; days without photos skipped; counter and label stay per day; a delete shows what next would have shown. No open question. Handed to the UX designer.
- 2026-11-24 ux-designer: designed. Counter per day, now also `1 / 1` on single-photo days (hidden only when the project has one photo); panel switches with the photo and scrolls to top on a new day; ‹ › only at real neighbours in the whole project; focus never lost when a button disappears. Handed to the developer.
