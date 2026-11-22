---
id: T-0029
title: "Show a day's photos newest first, on the page, in the viewer and in their addresses"
description: "D-0031: within an entry, photos are shown newest first like the days, for the owner and for visitors; a photo's place in its address and the viewer's next/previous follow that order."
status: Done
depends_on: []
decisions: [D-0031, D-0025, D-0020, G-0019, G-0021]
raised_on: 2026-11-22
done_on: "2026-11-22"
result: ["https://github.com/SanderGeraedts/diy-projects/pull/58", "https://github.com/SanderGeraedts/diy-projects/pull/59"]
---

# Goal

Sander, on 2026-11-22: "Within a day, the pictures are sorted from old to new. I want the
same order as the days, so the newest first."

A project's page lists its days newest first, but each day's photos run oldest first. After
this task, every day's photos are shown newest first: latest time taken first, then the one
added last, then by id descending (D-0031). The same order holds everywhere a day's photos
appear:

- the owner's project page;
- the visitor's read-only project page (`src/public/`);
- the full-screen viewer, for the owner and for visitors: "next" (swipe left, arrow right)
  goes to the next photo shown, an older one; "previous" to a newer one;
- the photo's place in its address, `/projects/<slug>/<day>/<n>`: place 1 is the newest
  photo of the day, the first one shown.

Nothing else changes: the days' own order, entry addresses (`#<day>`), the cover photo choice
(`src/components/cover.ts` already picks the newest), stored data and the NAS. Existing photo
links shift once; D-0031 accepts that.

# Done when

1. `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass, and
   `pnpm exec harness check` passes.
2. `src/routes/paths.test.ts` asserts the new order: for photos `x` (taken 09:00), `y` (taken
   10:00, added 11:00) and `z` (taken 10:00, added 12:00), `[...photos].sort(comparePhotos)`
   gives `['z', 'y', 'x']`, and ties on both times fall back to id descending.
3. A unit test on `visitorTimeline` (`src/public/source.test.ts`) asserts a visitor's photos
   come out in the same order as `comparePhotos` (newest first, with the same tie-breaks),
   not by `takenAt` alone.
4. An e2e test on the seeded demo data (G-0019), where Tuinbank's 4 okt 2026 entry has three
   photos taken at 10:00, 11:00 and 12:00 (`demo-tuinbank-entry-…-photo-1..3`), shows for the
   owner and for a visitor:
   - the first photo of that day on the project page is the one taken at 12:00, and the last
     the one taken at 10:00;
   - clicking the first one opens `/projects/tuinbank/2026-10-04/1` showing the 12:00 photo;
     arrow right (or a swipe left) goes to `/2`, the 11:00 photo; arrow right again to `/3`,
     the 10:00 photo.
   The test tells the photos apart by something tied to the photo itself (for example its
   time taken or id in an attribute or accessible name the developer adds), not by position
   alone.
5. No code sorts a day's photos for display other than through `comparePhotos`:
   `grep -rn "takenAt.localeCompare" src` lists only `src/components/cover.ts`.
6. In the viewer at `/projects/tuinbank/2026-10-04/1` (owner and visitor) the counter reads
   "1 / 3", there is no "Vorige foto" button, and arrow left keeps the address. At `/3` there
   is no "Volgende foto" button, and arrow right keeps the address. Arrow left from `/3`
   goes to `/2`, the 11:00 photo.
7. An e2e test, as the owner on the seeded 4 okt 2026 entry: deleting the photo at `/1` (the
   12:00 one) leaves the viewer at `/1` showing the 11:00 photo with counter "1 / 2".
   Deleting the photo at the last place (the oldest) leaves the viewer at the place before
   it, showing the photo that was shown just before it. On the project page that day then
   shows the remaining photos, newest top-left.
8. Sander confirms on his phone that a day's photos on a project page now run newest first,
   and that swiping through them in the viewer follows the page.

# Notes

- **Where the order lives:** `comparePhotos` in `src/routes/paths.ts` (used by
  `src/routes/ProjectPage.tsx` and `src/viewer/PhotoViewer.tsx`, owner and visitor). The
  visitor's timeline sorts photos itself in `src/public/source.ts` (`visitorTimeline`, by
  `takenAt` only, ascending); make it use `comparePhotos`. The viewer's previous/next are
  `siblings[index - 1]` / `siblings[index + 1]`, so they follow the sorted order with no
  change of their own; check that the slide direction still matches (next slides in from the
  right).
- **Delete in the viewer** shows "the next one in the entry, which takes its place": after
  the change that is the next older photo. Keep that behaviour, and check what happens when
  the oldest (last) photo is deleted.
- **Existing e2e tests** use positions (`/2026-10-04/1`, `.nth(1)`, `/2026-09-01/2`) in
  `e2e/viewer.spec.ts`, `e2e/slugs.spec.ts`, `e2e/cover-delete.spec.ts`,
  `e2e/visitor.spec.ts`, `e2e/photos.spec.ts`, `e2e/import.spec.ts` and `e2e/delete.spec.ts`.
  Most only care about place, not which photo; update those that assume a specific photo at a
  place (cover choice, delete).
- **Code comments** that say "by date taken" or point to D-0029 for the order (`paths.ts`,
  `ProjectPage.tsx`, `source.ts`, `PhotoViewer.tsx`) should say newest first and point to
  D-0031.
- **Accessible names** like "Foto 1 van 3, 4 okt 2026" keep counting by place shown.
- **No migration, no NAS change, no Dexie upgrade:** the order is worked out when shown.
- **No question for the Engineer:** the change is reversible and touches no infrastructure,
  data store, access or outside service.
- Handed to the UX designer: the order a user sees changes, and the viewer's direction with
  it. The designer confirms the order and swipe direction in *Design*; no new look is
  expected.

# Design

No new look and no new words. Only the order of a day's photos changes, and the viewer and
photo addresses follow it. Everything below holds for the owner and for a visitor. The
owner's page, the visitor's page and the viewer use the same order (D-0031).

**Project page (owner and visitor).** Days stay newest first. Within a day, the two-column
grid reads like text: left to right, then down. The top-left photo is the newest of the day
(latest time taken). The bottom (or bottom-right) photo is the oldest. Photos with the same
time taken: the one added last comes first. Example, Tuinbank 4 okt 2026: top row 12:00 |
11:00, second row 10:00 alone on the left. Clicking a thumbnail opens the viewer at its
place: the top-left one is `/1`.

**Viewer.**

- The counter top right ("1 / 3") counts in the order shown. "1 / 3" is the newest photo of
  the day, the one top-left on the page.
- "Volgende foto" (the › button on the right, arrow right, swipe left) goes to the next photo
  on the page, which is **older**. The strip slides left, so the next photo comes in from the
  right, as it does now. "Vorige foto" (‹ on the left, arrow left, swipe right) goes to a
  **newer** photo, coming in from the left. The direction of the motion doesn't change; only
  which photo is "next" changes.
- On place 1 (the newest) there is no "Vorige foto" button and arrow left does nothing. On
  the last place (the oldest) there is no "Volgende foto" button and arrow right does
  nothing. That is how it works now.
- Accessible names keep counting by place shown: "Foto 1 van 3, 4 okt 2026" is the newest.
- Close ("Sluiten", Escape) goes back to the project page as now.

**Delete in the viewer (owner).** Same rule as now: the photo that takes the deleted one's
place is shown, so the address stays.

- Deleting a photo that has photos after it (for example place 1 or 2 of 3) shows the next
  older photo. It now has that place, and the counter drops to "/ 2".
- Deleting the last photo (the oldest) shows the photo before it, which is newer, at place
  n−1. The address changes to that place.
- Deleting the only photo of the day closes the viewer and goes back to the project page, as
  now. The day shows "Geen foto's meer" when it has no note.

**Adding photos (owner).** An imported photo goes into the day it was taken (unchanged) and
takes its place by time taken. A photo taken later than the day's others appears top-left
and moves the rest down one place. In practice that is the usual case: today's newest shot
is the first one you see under today's date. A photo without EXIF uses the file's date, as
now.

**Photos arriving by sync** (from another device, or for a visitor on reload) take their
place the same way. If the viewer is open at `/<day>/2` and a newer photo of that day
arrives, place 2 may now be another photo. D-0031 accepts this ("Adding a photo taken later
… moves those down one place"). Don't build anything for it.

**Old links.** A photo link from before this change opens another photo of the same day
(place 1 of 3 is now the old place 3). No message and no redirect: D-0031 accepts this.

**States with nothing new:** empty day, loading, offline, "Foto niet gevonden" (a place that
doesn't exist), and errors such as "Verwijderen is niet gelukt. Probeer het opnieuw." all
stay as they are.

**Small screen:** the same two-column grid, newest top-left. The ‹ › buttons only show with
a mouse (as now). On a phone, swiping left moves to an older photo.

**For the developer:** the thumbnails' alt text ("Tuinbank, 4 okt 2026") stays as it is.
For the e2e check in *Done when* 4, add an attribute that is not shown on screen to the
thumbnail link and to the viewer's current photo (for example `data-taken-at` with the
photo's time taken). Don't put an id in an address, a link or anything else a user sees
(D-0031).

## Review (2026-11-22, ux-designer)

Looked at the production build of #58 (`pnpm run build`, `vite preview`, seeded demo data),
as the owner and as a visitor (`?bezoeker`), on a Pixel 7 and on desktop Chrome, and ran
`e2e/photo-order.spec.ts`, `e2e/viewer.spec.ts`, `e2e/delete.spec.ts` and
`e2e/visitor.spec.ts` (14 passed).

Matches:

- **Project page, owner and visitor:** Tuinbank 4 okt 2026 shows 12:00 | 11:00 on the top
  row and 10:00 alone on the left below. The top-left links to `/2026-10-04/1`, then `/2`
  and `/3`. The days keep their order. The alt text is still "Tuinbank, 4 okt 2026". No new
  words and no change in look.
- **Viewer:** `/1` opens the 12:00 photo, the counter shows "1 / 3", the dialog is named
  "Foto 1 van 3, 4 okt 2026", only › is shown, and arrow left keeps the address. Arrow right
  goes to `/2` (11:00, "2 / 3", ‹ and › both shown), then to `/3` (10:00, no ›, arrow right
  stays). Arrow left and a swipe right go back to a newer photo; a swipe left goes to an
  older one. The motion is unchanged. Halfway through "next", the old photo is leaving to
  the left and the older photo is coming in from the right.
- **Delete (owner):** deleting at `/1` stays at `/1` and shows the 11:00 photo, "1 / 2".
  Deleting at `/3` (the oldest) goes to `/2` and shows the 11:00 photo, "2 / 2". In both
  cases the page then shows the remaining photos, newest top-left. Deleting a day's only
  photo uses the same code as before (covered by the existing delete tests).
- **`data-taken-at`** sits on the thumbnail link and on the viewer's current image. It isn't
  shown on screen and isn't part of an address. No id was added anywhere a user sees.

Differences: none.

# Test

2026-11-22, tester, on `t-0029-photos-newest-first` at d9630fc, Windows, from a clean
`pnpm install --frozen-lockfile` ("Lockfile is up to date … Done").

**Done when 1:**

```
$ pnpm run typecheck
$ tsc --noEmit                      (exit 0, no output)
$ pnpm test
      Tests  334 passed | 26 skipped (360)
$ pnpm run build
PWA v2.0.0 … precache 22 entries (658.97 KiB) … files generated   (exit 0)
$ pnpm run test:e2e
  2 skipped
  56 passed (16.9s)
$ pnpm exec harness check
✓ tasks: 29 tasks, index in step
✓ decisions: 36 records, index complete, 0 overrules valid
✓ engineers: 2 listed
✓ generated files: current
```

The 2 skipped e2e tests are `e2e/design.spec.ts`'s screenshot baselines, which only run on
Linux (CI). PR #58 checks: `checks / checks` pass (the only required check),
`pocketbase-auth` pass, Netlify header/redirect rules and deploy preview pass. "Pages
changed" is Netlify's informational note: it reports neutral on every PR (#56 and #57 too).

**Done when 2:** `src/routes/paths.test.ts` sorts `x` 09:00, `y` 10:00/added 11:00 and
`z` 10:00/added 12:00 to `['z', 'y', 'x']`, and ties on both times `a, c, b` to
`['c', 'b', 'a']`. It passes.

**Done when 3:** `src/public/source.test.ts` › `visitorTimeline` puts five photos (with
ties on taken time and on both times) in `['w', 'z', 'b', 'a', 'x']` and checks that this
equals `[...photos].sort(comparePhotos)`. It passes.

**Done when 4, 6, 7:** `e2e/photo-order.spec.ts` (Pixel profile), owner and visitor: the
order on the page by `data-taken-at` is 12:00, 11:00, 10:00. Clicking the first thumbnail
opens `/1` at 12:00, "1 / 3". Arrow right goes to `/2` at 11:00, then `/3` at 10:00. At `/1`
there is no Vorige and arrow left stays; at `/3` there is no Volgende and arrow right stays.
Arrow left from `/3` goes to `/2` at 11:00, and swipe left/right goes older/newer. Owner
delete at `/1` stays at `/1`, 11:00, "1 / 2", and the page shows 11:00, 10:00. Delete at
`/3` goes to `/2`, 11:00, "2 / 2", and the page shows 12:00, 11:00. All 4 pass within the
full run above.

**Done when 5:**

```
$ grep -rn "takenAt.localeCompare" src
src/components/cover.ts:14:  return b.takenAt.localeCompare(a.takenAt) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)
```

The project page, the owner's viewer and the visitor's viewer (`PhotoViewer.tsx:73`, `:111`)
and `visitorTimeline` all sort through `comparePhotos`.

**Do the tests catch the old order?** For a moment I put the old ascending `comparePhotos`
back, rebuilt and ran the new tests, then restored the file and rebuilt. Both new unit
tests failed, and all 4 `photo-order` e2e tests failed on `data-taken-at`. (Note: the e2e
tests run against `dist` via `vite preview`, so they only see a change after `pnpm run build`.)

**Tried to break it** (in a temporary spec, deleted after; 8 passed):

- Owner and visitor: a direct link to `/3` shows 10:00, also after a reload; `/2` shows
  11:00. `/4`, `/0`, `/abc` and `/01` show "Foto niet gevonden".
- Arrow right three times without waiting: the address and the photo shown still agree
  (place n shows the photo at 13-n o'clock).
- Every demo project, owner and visitor (4 projects, 7 days, 13 photos): within each day
  the thumbnails' `data-taken-at` never increases, and each thumbnail's address opens the
  viewer on that same photo.
- Owner: delete at `/1` three times. It shows 11:00 at `/1`, then 10:00 at `/1` ("Foto 1 van
  1"), and the last delete closes the viewer back to the project page with no photos left
  in that day. Delete the middle photo (`/2`): it shows 10:00 at `/2`, "2 / 2".
- Photos without an EXIF time: `dateTaken` falls back to the file's date in the same
  `YYYY-MM-DDTHH:mm:ss` local format, and the server returns `takenAt` as the same text, so
  string comparison holds for imported and synced photos alike. `takenAt` is never empty
  once stored (`downloadedPhoto`'s `''` is overwritten by `photoFromServer`). The import e2e
  test (a photo without EXIF on 1 sep 2026) passes with the new order.
- Ties: the unit tests cover equal taken time (added later comes first) and equal taken and
  added time (id descending), for the owner's and the visitor's order.

**Record:** status *Doing* with `result` pointing at #58. D-0031 is Accepted and replaces
D-0029 (in both indexes). The UX designer's build review is in *Design* › *Review*, no
differences.

**Verdict: passed.** Done when 1 to 7 hold. Done when 8 (Sander's phone) stays open for him.

**Done when 8:** Sander (the Engineer), on 2026-11-22, after checking on his phone: "Checked
on my phone, it works."

**Closing PR #59** (docs only: T-0029 Done; T-0030, T-0031, T-0032 and D-0032, D-0033,
D-0034 raised), 2026-11-22, tester, on `t-0029-done-t-0030-t-0032-architect` at 101b331,
from a clean `pnpm install --frozen-lockfile` ("Lockfile is up to date … Done"):

```
$ pnpm exec harness check
✓ tasks: 32 tasks, index in step
✓ decisions: 39 records, index complete, 0 overrules valid
✓ engineers: 2 listed
✓ generated files: current
$ pnpm exec harness tasks-index --check
✓ 32 tasks, index in step
$ pnpm exec harness overrules
No project decision overrules a global one.
$ gh pr checks 59
checks / checks         pass
pocketbase-auth         pass
Header rules            pass
Redirect rules          pass
deploy-preview          pass
Pages changed           skipping   (Netlify's informational note, neutral on every PR)
```

- T-0029: Done when 1 to 7 have their output above; Done when 8 has Sander's confirmation.
  Status *Done*, `done_on` 2026-11-22, `result` #58 and #59; it moved from *Doing* to *Done*
  in the generated index.
- T-0030, T-0031, T-0032 each have a numbered *Done when* that can be run. The seeded demo
  data agrees with what they expect (`src/seed/demo.ts`: Fietsenrek 1 nov, Tuinbank 25 okt,
  Badkamerplank 16 aug, Zolderisolatie 20 jun; `#hout` on Tuinbank and Badkamerplank;
  Tuinbank has 6 photos).
- D-0032, D-0033 and D-0034 are Accepted and listed in `docs/decisions/index.md`. None of
  them contradicts an Accepted decision. No earlier record sets the overview's order. D-0033
  and D-0034 add to D-0003: they keep its grouping by date taken, its date-from-the-file
  fallback and the untouched original (D-0015). D-0034's new package (fflate) fits G-0016
  (pnpm) and G-0017, since none of the stack's libraries reads zip files.
- Nothing is built in this PR, so there are no app tests to run for it.

**Verdict: passed.**

# Log

- 2026-11-22 architect: raised from Sander's request; recorded D-0031 (replaces D-0029): a day's photos are shown newest first and a photo's place in its address follows the shown order, so existing photo links shift once; the viewer's next goes to the older photo. Handed to the UX designer.
- 2026-11-22 ux-designer: designed: same look and words; a day's grid runs newest top-left; the viewer's next goes to the older photo and still slides in from the right; delete shows the photo that takes the place, or the newer one when the oldest goes. Added Done when 6 and 7. Handed to the developer.
- 2026-11-22 developer: built in #58: `comparePhotos` sorts newest first (taken, added, id, each descending); `visitorTimeline` uses it; thumbnails and the viewer's photo carry `data-taken-at`; new `e2e/photo-order.spec.ts` (owner and visitor: order on the page, `/1` = 12:00, arrow right to `/2` 11:00 and `/3` 10:00, swipe, no Vorige on `/1`, no Volgende on `/3`, arrows at the ends keep the address; owner delete at `/1` and at `/3`); updated `e2e/viewer.spec.ts`, `e2e/import.spec.ts`, `src/public/visitor.test.tsx`. Checks: `pnpm run typecheck` clean; `pnpm test` 334 passed, 26 skipped (the new unit tests fail on the old order); `pnpm run build` ok; `pnpm run test:e2e` 56 passed, 2 skipped (photo-order: 4 failed on the old order); `grep -rn "takenAt.localeCompare" src` → only `src/components/cover.ts:14`; `pnpm exec harness check` ✓ tasks, decisions, engineers, generated files. Handed to the UX designer for review. Remaining: Sander checks on his phone (Done when 8).
- 2026-11-22 ux-designer: reviewed: matches the design (page order, viewer counter, buttons, arrows, swipe direction, delete at first and last place, owner and visitor); no differences. Handed to the tester.
- 2026-11-22 tester: passed (Done when 1 to 7 ran green, the new tests fail on the old order, edge cases held). Remaining: Sander checks on his phone that a day's photos on a project page run newest first and that swiping in the viewer follows the page (Done when 8).
- 2026-11-22 architect: Done when 8 confirmed by Sander on 2026-11-22 ("Checked on my phone, it works."); every check has run, so the task is Done.
- 2026-11-22 tester: passed (#59: harness check green, indexes in step, T-0030 to T-0032 have runnable Done when checks, D-0032 to D-0034 contradict no Accepted decision, CI green).
