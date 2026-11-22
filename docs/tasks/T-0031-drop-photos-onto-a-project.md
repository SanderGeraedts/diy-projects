---
id: T-0031
title: "Add photos by dropping them onto a project page"
description: "D-0033: image files dragged from the computer and dropped anywhere on the owner's project page go through the same import as \"Foto's toevoegen\"; non-images are listed as not added, and a stray drop anywhere in the app never opens the file in the browser."
status: Doing
size: full
depends_on: []
decisions: [D-0033, D-0003, D-0015, D-0023, D-0020, G-0019]
raised_on: 2026-11-22
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/63"]
---

# Goal

Sander, on 2026-11-22: "At least on the larger screen sizes, I want the ability to drag and
drop images into the project. Preferably zip files with images as well, but the latter is no
deal breaker."

Today photos are added only with "+ Foto's toevoegen" on a project page
(`src/routes/ImportPhotos.tsx`), which hands the picked files to `startImport` in
`src/photos/importQueue.ts` (T-0007: EXIF date with exifr, the 2560 px copy, a thumbnail, one
entry per day taken, progress and a summary). After this task, as D-0033 says:

- On the **owner's project page**, image files dragged from the computer and dropped
  anywhere on the page are handed to `startImport`, exactly as picked files are. Each lands
  in the day it was taken; progress and summary are the same; it works offline; leaving the
  page doesn't stop it.
- A dropped file that **isn't an image**, or a dropped **folder**, isn't added and is listed
  in the summary as not added, with a reason.
- **A stray drop never leaves the app:** dropping files on any other page (overview, edit
  form, bin, visitor pages) does nothing; the browser doesn't open the file.
- Drops are handled at every width; what the page shows to invite a drop (and at which
  widths) is the UX designer's.
- The picker is unchanged (`accept="image/*"`, `multiple`).

Zip files are T-0032, not this task.

# Done when

1. CI on the pull request is green (`checks / checks`: `harness check`, typecheck, unit
   tests, build and the end-to-end tests), with no test that passed only on a retry
   (G-0031). Locally the developer runs typecheck and what the change touches.
2. An e2e test (`e2e/drop.spec.ts`) at a desktop viewport (1280×800, set in the spec), on
   the seeded demo data (G-0019), offline after the service worker is ready, with generated
   photos only (no real photos): on a new project, dropping three JPEGs with EXIF dates on
   two days (as `e2e/import.spec.ts` builds them) plus one broken JPEG, via a `drop` event
   with a `DataTransfer` on the project page:
   - the summary reads "3 foto's toegevoegd." and lists the broken one as not read;
   - the timeline shows the two days, newest first, with the photos in each day as the
     picker would have put them (same widths as `e2e/import.spec.ts` checks);
   - the page address hasn't changed (the browser didn't open a file).
3. In the same spec: dropping a text file and a PDF (`notes.txt`, `plan.pdf`) together with
   one JPEG adds the JPEG and lists both others as not added, each with a reason.
4. In the same spec: dropping a JPEG on the overview (`/`) and on a visitor's project page
   (`/projects/tuinbank?bezoeker`) leaves the address and the page as they were, and adds no
   photo (Tuinbank still has 6 photos as the owner).
5. A unit test on the part that turns a drop into files for `startImport` (the developer
   names it in the Log): image files pass, non-images and folder entries come out as
   failures with a reason, and the files that pass are handed on in the order dropped.
6. `e2e/import.spec.ts` still passes unchanged in what it checks, and the picker's
   `accept` is still `image/*` (it already asserts this).
7. The UX designer's review after the build, in *Design*, finds no differences, at a laptop
   width and on the Pixel profile.
8. In `e2e/drop.spec.ts`, desktop viewport, on the owner's project page: a `dragenter` with a
   `DataTransfer` holding a file shows an overlay with "Laat los om foto's toe te voegen",
   and a `drop` hides it again. A `dragenter` whose `DataTransfer` holds only text
   (`text/plain`) shows no overlay. On `/` and on `/projects/tuinbank?bezoeker` a file
   `dragenter` shows no overlay.
9. In the same spec, the summary of *Done when* 3 uses the words from *Design*: the heading
   "2 bestanden niet toegevoegd:" and the items "notes.txt: is geen foto" and
   "plan.pdf: is geen foto". In *Done when* 2 the heading stays "1 foto niet gelukt:".
10. The hint "of sleep foto's naar deze pagina" is visible next to "+ Foto's toevoegen" at
    the desktop viewport (`e2e/drop.spec.ts`), and not visible on the Pixel 7 profile (an
    assertion added to `e2e/import.spec.ts`). A visitor doesn't see it.

# Notes

- **One import:** call `startImport(projectId, files)`; don't fork `importQueue.ts`. If the
  "not an image" reason needs a new place in `ImportStatus.failed`, add it there so the
  summary shows picker and drop failures the same way.
- **What counts as an image:** a `File` whose `type` starts with `image/`, or, when the type
  is empty, a name with an image extension. One that passes but can't be decoded already
  fails in the import as "kon niet worden gelezen".
- **Folders:** in Chromium a dropped folder shows up in `dataTransfer.files` as a `File` with
  an empty type; `dataTransfer.items[i].webkitGetAsEntry()?.isDirectory` tells it apart. It
  isn't opened (D-0033).
- **Stray drops:** `dragover` and `drop` on `window` with `preventDefault()` when the drag
  carries files (`dataTransfer.types` includes `Files`); only the owner's project page acts
  on them. Text dragged within the page (selecting and dragging a word) isn't affected.
- **Testing drops in Playwright:** build a `DataTransfer` in the page with
  `page.evaluateHandle`, add `File`s made from the generated bytes, and
  `dispatchEvent('dragenter' | 'dragover' | 'drop', { dataTransfer })` on the page's target.
  The project's only Playwright profile is the Pixel 7; set a desktop viewport in this spec
  with `test.use`.
- **Phones:** Android Chrome doesn't deliver file drops from other apps to a web page in
  normal use, so nothing changes on the phone; don't add width checks to the drop handling.
- **No question for the Engineer:** reversible, no infrastructure, data store, access or
  outside service, and no new dependency.
- Handed to the UX designer: a user sees a new way to add photos and a new hint, and the
  summary may list non-photos. The designer decides how the page invites and shows a drop
  (hint text, highlight while dragging, at which widths), the words for "not a photo" and
  "folder", and may add to *Done when*.

# Design

Designed 2026-11-22 by the ux-designer, from D-0033, D-0003 and D-0020, against today's
project page (`src/routes/ProjectPage.tsx`) and its import block (`ImportPhotos.tsx`). The
page keeps its shape: title block, "+ Notitie toevoegen", "+ Foto's toevoegen", the import
block under it, then the days. New are a hint, an overlay while files are dragged over the
page, and two reasons in the summary.

## Where a drop is accepted

- **Only the owner's project page** (`/projects/<slug>`, without `?bezoeker`), once the
  project has loaded. Anywhere on it: header, title block, timeline, footer, margins. No
  aiming needed.
- **Everywhere else** (overview, project form, "+ Notitie toevoegen", bin, account, search,
  photo viewer, "Project niet gevonden", every visitor page, and the owner's project page
  while it is still loading): nothing happens. No overlay, the cursor shows the "not
  allowed" sign (`dropEffect = 'none'`), and the browser doesn't open the file. Address and
  page stay as they were.
- **Only drags that carry files from outside the app count** (`dataTransfer.types`
  includes `Files`). Dragging selected text, a link, or a thumbnail from this page
  (Chromium marks an `<img>` drag as carrying a file too) shows no overlay and imports
  nothing: a drag that starts inside the app (`dragstart` on the window) is ignored until
  its `dragend`. Dragging text into a note field works as today.

## The hint

Next to "+ Foto's toevoegen", on the same line, small grey text (`text-sm text-grey`, not
italic, never in the accent colour):

> of sleep foto's naar deze pagina

- **Shown only on a device with a mouse or trackpad** (`(hover: hover) and (pointer:
  fine)`, Tailwind's `pointer-fine:`), not by width. A laptop shows it; the Pixel and the
  open Fold (wide, but touch, and no file drops) don't. This follows Sander's "at least on
  the larger screen sizes" with the signal that actually says whether a drop can happen.
- When the line is too narrow, the hint wraps under the button; the button's own text never
  wraps.
- It's ordinary text, read by a screen reader after the button. That's honest: a screen
  reader user with a mouse can drop too, and the button stays the way for the keyboard.
- Visitors don't see it (they don't get the button either).

## While dragging files over the owner's project page

When a file drag enters the window (`dragenter`), an overlay covers the whole viewport,
fixed, above the sticky header and the update bar:

- Background: the translucent panel colour (`bg-panel`, as behind the delete dialog), so
  the page stays faintly visible.
- Centred, a box in the dialog's shape (`rounded-card`, `bg-bg`, at most about 24 rem wide,
  padding as the dialog) with a **2 px dashed accent border**: the accent as an active state
  (D-0020), never behind or as the colour of text.
- Inside, centred, in the text colour:
  - **Laat los om foto's toe te voegen** (semibold, `text-lg`)
  - next line, normal weight: **aan {projecttitel}**, with `break-words` so a long title
    wraps instead of widening the box;
  - then, small and grey: **Ze komen bij de dag waarop ze zijn gemaakt.**
- Cursor: "copy" (`dropEffect = 'copy'`).
- The overlay doesn't change with what's dragged: browsers don't reliably reveal names or
  types before the drop, so it promises nothing about which files will be added. The
  summary sorts that out after the drop.
- **It goes away** when the drag leaves the window, when the user presses Escape (the
  browser cancels the drag and fires `dragleave`), and on the drop. It must not flicker
  while the pointer moves over the page's own elements: count `dragenter`/`dragleave`, or
  hide only on a `dragleave` whose `relatedTarget` is null, and always hide on `drop` and
  `dragend`.
- Purely visual: `aria-hidden="true"`, nothing in it takes focus, and focus stays where it
  was. It appears and disappears at once, with no animation (so nothing to reduce for
  `prefers-reduced-motion`).
- Light and dark theme through the tokens.

## After the drop

1. The dropped items are split, in the order dropped, into **images** (type `image/*`, or an
   empty type with an image extension) and **not added** (anything else, and folders). The
   images go to `startImport(projectId, files)` exactly as picked files do.
2. The existing import block under "+ Foto's toevoegen" shows what it shows for the picker:
   "Foto's importeren: 2 van 5", then the summary with "Sluiten". The progress counts only
   images; the not-added items are known at once and are listed first in the summary,
   before any import failures.
3. **If the import block is out of view** (dropped lower on the page), the page scrolls just
   enough to show it (`scrollIntoView({ block: 'nearest' })`; instant under
   `prefers-reduced-motion`, smooth otherwise). Focus doesn't move. The block is already
   `role="status"`, so a screen reader announces progress and summary.
4. **While an import runs,** a new drop (or pick) joins it: the total grows ("Foto's
   importeren: 3 van 9") and there's one summary at the end, as with the picker today. A
   drop while a finished summary is still open starts a new summary, as a new pick does.
5. **Offline:** exactly the same, no extra message. The photos are on the device and the
   sync bar already says what is waiting.
6. **Only non-photos dropped:** no progress line; straight to the summary.

## The summary: exact words

The first line's form and the "dated by the file" part stay. Changes:

- **Nothing added:** "Geen foto's toegevoegd." instead of "0 foto's toegevoegd." (also for
  the picker when every photo failed). One stays "1 foto toegevoegd.", more "3 foto's
  toegevoegd."
- **Heading of the failure list:**
  - every item an image that failed (all the picker can produce): unchanged, "1 foto niet
    gelukt:" / "2 foto's niet gelukt:";
  - at least one item not a photo, or a folder: "1 bestand niet toegevoegd:" / "3 bestanden
    niet toegevoegd:", counting every item in the list.
- **Items stay "naam: reden"**, the reason a lowercase phrase about the file, like the
  existing "kon niet worden gelezen" and "geen ruimte meer op het toestel":
  - not an image: **`notes.txt: is geen foto`**
  - a folder: **`Tuin: is een map; sleep de foto's uit de map`**
  - an image that can't be decoded: unchanged, `kapot.jpg: kon niet worden gelezen`
- Long file names wrap inside the summary (`break-words` on the list items) instead of
  running out of a narrow window.

Example, after dropping `a.jpg`, `b.jpg`, `kapot.jpg`, `notes.txt`, `plan.pdf`:

```
2 foto's toegevoegd.
3 bestanden niet toegevoegd:
  • notes.txt: is geen foto
  • plan.pdf: is geen foto
  • kapot.jpg: kon niet worden gelezen
[Sluiten]
```

## Keyboard and screen reader

- Dropping is a mouse action; the keyboard and screen-reader way to add photos stays
  "+ Foto's toevoegen", unchanged (same place, same focus ring, `accept="image/*"`,
  `multiple`). Nothing about the drop needs a keyboard equivalent.
- The hint is read as text after the button; the overlay is hidden from assistive tech; the
  result is announced through the existing `role="status"`.
- Tab order is unchanged; the overlay adds nothing focusable.

## Small screens

No width check in the drop handling (D-0033). If a file drop ever reaches a narrow window,
it works the same and the overlay box fits (at most the viewport minus padding). On the
Pixel the hint is hidden and nothing else changes.

## For T-0032 (zip), not designed here

Step 1's split is the one place a zip plugs in: a zip becomes a source of images and of
not-added items with their own reasons. Until T-0032, a dropped `.zip` reads
"`fotos.zip: is geen foto`". The overlay, hint and headings are worded to stay right once
zips are accepted ("bestanden niet toegevoegd" also covers items from a zip).

## Review

Reviewed 2026-11-22 by the ux-designer, on the production build of `da9d73c` with the seeded
demo data (`pnpm run preview`), in Playwright's Chromium: a laptop (1280×800 and 1280×600,
mouse, no touch), a narrow desktop window (360×700) and the Pixel 7 profile. Drags were
`DragEvent`s with a real `DataTransfer` in the page, as in `e2e/drop.spec.ts`. One
difference has to be fixed.

**Must fix before the task can pass**

1. **After a drop lower on the page, the import block scrolls up under the sticky header.**
   On Tuinbank at 1280×600, scrolled to the bottom, a drop scrolls the page so the block's
   top lands at 0 px, while the header ends at 64 px. Only "Sluiten" is visible; the
   progress line ("Foto's importeren: 1 van 3") and the summary's first lines are behind
   the header. The design says "scrolls just enough to show it". Fix: give the import
   block the same top scroll margin as the days in the timeline (`scroll-mt-20` on the
   `role="status"` block), so `scrollIntoView({ block: 'nearest' })` stops below the
   header. Check: after that drop, the block's top is below the header's bottom.

**Matches the design**

- **Hint:** "of sleep foto's naar deze pagina" on the same line as "+ Foto's toevoegen" at
  1280 px, 14 px, grey (`rgb(102,102,102)`), not italic. At 360 px it wraps under the
  button and the button's text stays on one line. Hidden on the Pixel 7 (`pointer: coarse`).
  Not there for visitors (`?bezoeker`).
- **Overlay:** a file `dragenter` on the owner's project page shows the whole-viewport
  panel above the header and the sync bar (z 30), with the dialog-shaped box, a dashed
  accent border, and "Laat los om foto's toe te voegen" / "aan Tuinbank" / "Ze komen bij de
  dag waarop ze zijn gemaakt." in the text colour. Correct in light and dark. A long title
  without spaces wraps inside the box. `aria-hidden="true"`, and focus stays on the body.
- **No flicker:** enters and leaves across the page, the overlay and its text (enter on the
  new element before leaving the old one, as browsers do) never took the overlay out of the
  page, as seen by a MutationObserver. It goes on a `dragleave` that ends the drag (what a
  drag out of the window or Escape fires), on `dragend` and on `drop`.
- **Not shown:** for a drag carrying only `text/plain`; for a thumbnail dragged on the
  page (no overlay, no import, the address unchanged); on `/projects/new`, edit,
  "+ Notitie toevoegen", `/prullenbak`, `/zoeken`, `/account`, "Project niet gevonden",
  the photo viewer, `/` and the visitor page. On all of these a file `dragover` is cancelled
  (the browser doesn't open the file). The project page mounts the drop target only once
  the project has loaded (`ImportPhotos` renders after it). I read `copy` and `none` for
  the cursor in the code: a `DataTransfer` built in the page can't show the value it was
  set to.
- **Summary words** (actual text):
  - photo, broken photo and `notes.txt` dropped during a running import: "4 foto's
    toegevoegd." / "2 bestanden niet toegevoegd:" / "notes.txt: is geen foto",
    "kapot.jpg: kon niet worden gelezen". Items that weren't added come first.
  - `plan.pdf`, `fotos.zip`, a `.docx` with a very long name and an untyped `IMG_0001.HEIC`:
    "Geen foto's toegevoegd." / "4 bestanden niet toegevoegd:" with "is geen foto" for the
    first three, and "kon niet worden gelezen" for the HEIC (it counts as an image by its
    extension, as the Notes say). At 360 px the long name wraps inside the block and the
    page doesn't scroll sideways (scrollWidth 360).
  - only a non-photo: straight to the summary with no progress line ("1 bestand niet
    toegevoegd:"), on the laptop and the Pixel.
  - folders: I couldn't build a dropped folder in an automated browser. The reason
    "is een map; sleep de foto's uit de map" is word for word in `src/photos/drop.ts`, its
    split is unit-tested, and it goes through the same `notAdded` path and heading as
    "is geen foto". Accepted on that basis.
- **During a running import:** a second drop joins it ("Foto's importeren: 0 van 3" became
  "0 van 5"), and one summary follows. A drop while a finished summary is open starts a new
  summary.
- **Scroll:** a drop lower on the page scrolls to the block (smooth) and focus doesn't move.
  Only the stopping point is wrong; see item 1.
- **Picker:** `accept="image/*"` and `multiple` are unchanged. Two broken picks read "Geen
  foto's toegevoegd." / "2 foto's niet gelukt:" (both designed wording changes). One pick
  reads "1 foto toegevoegd." as before.
- **Pixel 7:** the page is the same as before apart from the import block's new wording. No
  hint.

Verdict: **changes needed** (item 1). Back to the developer. Once it's fixed I'll re-check
that one item; everything else stands.

# Test

# Log

- 2026-11-22 architect: raised from Sander's request; recorded D-0033 (adds to D-0003): drops anywhere on the owner's project page feed the same `startImport` as the picker, photos land in the day they were taken, non-images and folders are listed as not added, a stray drop never opens the file, picker unchanged. Zip split off into T-0032 (D-0034). Handed to the UX designer.
- 2026-11-22 architect: harness v0.9.0 (T-0033, G-0031): sized full, a new way to add photos with a hint and new summary lines that need a design first. *Done when* 1 is now CI's run. Still with the UX designer.
- 2026-11-22 ux-designer: designed: drop anywhere on the owner's project page with a full-page overlay while files are dragged, a hint next to "+ Foto's toevoegen" on mouse/trackpad devices only, the existing import block and summary with "is geen foto" / "is een map" reasons, a "bestanden niet toegevoegd" heading and "Geen foto's toegevoegd."; *Done when* 8 to 10 added. Handed to the developer.
- 2026-11-22 developer: built. `src/photos/drop.ts` turns a drop into files for `startImport`: `readDrop` (items in order, folders via `webkitGetAsEntry`) and `splitDrop` (images vs not added; the seam for T-0032's zips); unit-tested in `src/photos/drop.test.ts` (Done when 5). `src/routes/DropPhotos.tsx`: `FileDropGuard` in Layout cancels every file `dragover`/`drop` on the window (capture) with `dropEffect` none unless a target is registered, ignores drags that start in the app (`dragstart` to `dragend`/`drop`), and counts `dragenter`/`dragleave` for the overlay; `useFileDropTarget` and `DropOverlay` are used by `ImportPhotos`, which also shows the `pointer-fine:` hint and scrolls the import block into view after a drop. `ImportStatus.notAdded` (new) holds non-photos, listed before `failed`; a batch with only those goes straight to the summary; "Geen foto's toegevoegd." and the "bestanden niet toegevoegd" heading. Pixel 7 profile reports `pointer: coarse`, `hover: none`, `pointer: fine` false, so the hint is hidden there for the right reason. Checked the stray-drop test fails with the guard removed. Local: typecheck clean; `vitest run` 28 files passed, 348 tests passed (26 skipped); `playwright test` drop, import, design, visitor, photos, entries, viewer: 17 passed, 2 skipped, none retried; `harness check` all green.
- 2026-11-22 developer: draft PR #63, CI `checks / checks` green on the first run (harness check, typecheck, unit tests, build, e2e: 66 passed, no test flaky or retried). Handed to the UX designer for the review (*Done when* 7), then the tester.
- 2026-11-22 ux-designer: reviewed: changes needed. After a drop lower on the page, the import block scrolls up under the sticky header (its first lines are hidden); give it the timeline's `scroll-mt-20`. Everything else matches at 1280 px, at 360 px and on the Pixel 7. Back to the developer.
- 2026-11-22 developer: fixed the review's finding: the import block (`role="status"`) has `scroll-mt-20`, so a drop low on the page scrolls it below the sticky header. New e2e test in `e2e/drop.spec.ts` (Tuinbank at 1280×600, scrolled to the bottom, drop): the block's top is at or below the header's bottom; it fails without the fix (1 failed) and passes with it. Local: typecheck clean; `playwright test` drop + import 6 passed; `harness check` green. Lesson added. Back to the UX designer.
- 2026-11-22 developer: CI `checks / checks` green on 7eb79d0 (e2e: 67 passed, no test flaky or retried).
