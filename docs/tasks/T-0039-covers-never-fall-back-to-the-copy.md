---
id: T-0039
title: "Keep project covers on the thumbnail after an update, a sync, a rebuild or a download"
description: "D-0040: a regression after T-0037/T-0038; an overview card whose thumbnail isn't measured yet takes the 2560 px copy (jagged) at a pixel ratio of 2 and up, and every write to photos reloads every card; offer an unmeasured thumbnail alone and keep a photo's object URLs while its files are the same."
status: Done
size: small
depends_on: []
decisions: [D-0040, D-0038, D-0039, D-0003, D-0015, D-0002, D-0006, G-0019, G-0012, G-0031, G-0032]
raised_on: 2026-11-24
done_on: 2026-11-25
result: ["https://github.com/SanderGeraedts/diy-projects/pull/72"]
---

# Goal

Sander (Engineer), 2026-11-24, in production after T-0037 (D-0038) and T-0038 (D-0039) were
deployed: "I did notice the jagged lines being gone on the projects page, however, after an
update, they came back." The projects page is the overview's project cards. The jagged look is
the 2560 px copy shrunk by the browser, which T-0037 replaced on cards by the 1280 px
thumbnail through `srcset`/`sizes`.

**What the architect reproduced** (production build, Chromium, a generated 4000×3000 photo as
a project's cover; a throwaway probe, not committed):

| situation | laptop 1280×800 @1.5 | laptop 1280×800 @2 | Fold 840×900 @2.625 | Pixel 412×915 @2.625 |
| --- | --- | --- | --- | --- |
| reload, thumbnail measured | thumbnail | thumbnail | thumbnail | thumbnail |
| a write to `photos` while the overview is open (import in a second tab) | thumbnail, `src`/`srcset` changed 3× | same | same | same |
| thumbnail not measured (`thumbnailWidth` unset, as `downloadedPhoto` stores it), reload | thumbnail (512w label, density 1.6) | **copy** | **copy** | **copy** |
| ... after the rebuild measured it | thumbnail, attributes changed 2× | thumbnail | thumbnail | thumbnail |

Two causes, both in `src/components/PhotoImage.tsx`:

1. **Unmeasured thumbnail → copy.** `thumbnailLabel` labels a stored photo's thumbnail 512w
   while `thumbnailWidth` is unset. Where a card needs more than 512 device pixels (pixel ratio
   2 and up: the Fold, a laptop at 200 % or zoomed in; two-column widths at 1.5), Chrome takes
   the 2560 px copy until the background rebuild (`src/photos/rebuild.ts`) measures that photo.
   Unset are: every photo downloaded from the NAS (`downloadedPhoto` in
   `src/sync/records.ts`), every photo whose upload is still pending (`needsCheck` skips it),
   and every photo whose rebuild failed in this session (`failed`, retried only after a
   restart).
2. **Object-URL churn.** `usePhotoSources` keys its object URLs on the Blob objects, and Dexie
   returns new Blob objects on every live-query run, so any write to `photos` swaps `src` and
   `srcset` on every card already shown and the browser loads and chooses again. T-0038 made
   this frequent: after an update its sync step writes `thumbnailOnNas` once per photo, and
   the rebuild once per photo. In Chromium the choice stayed on the thumbnail, but each swap
   reloads every cover and re-chooses with the label of that moment.

Not reproduced: a card at the laptop's 1280×800 @1.5 with a measured thumbnail never took the
copy in any situation (reload, writes, rebuild). If Sander's jagged cards are there, the cause
is not the file choice; see *Notes*, "Before the fix".

Deliver D-0040: on cards and tiles, a stored photo whose thumbnail isn't measured is shown from
its thumbnail alone (no copy candidate); and a stored photo's object URLs stay the same while
its copy and thumbnail are the same files. What Sander sees: project covers on the overview
are the smooth thumbnail right after an update, during and after the sync that follows, and
for photos that arrive from his other devices; never the jagged copy. Nothing else on screen
changes; the viewer keeps the copy; visitors are unchanged.

# Done when

1. **A new e2e test, `e2e/cover-after-update.spec.ts`, fails on `origin/main` (54dbc21) and
   passes on the branch.** Generated photos only (G-0019), on the preview build with demo
   data (D-0006). It imports a generated 4000×3000 landscape JPEG with fine diagonal lines as
   the cover of a new project, then sets its stored record as after a sync (`uploads` all
   `'uploaded'`, empty outbox), so the rebuild may run as in production. An init script
   (`page.addInitScript`) records every `load` of an overview card's `<img>`: whether its
   `currentSrc` was the thumbnail's address (the `src`) or the copy's (the second `srcset`
   candidate), and a `MutationObserver` counts changes to its `src`/`srcset`. For each of
   laptop 1280×800 @1.5, laptop 1280×800 @2, Fold 840×900 @2.625 and Pixel 412×915 @2.625
   (CDP `Emulation.setDeviceMetricsOverride`, as `e2e/sharp-photos.spec.ts` does), in each
   situation:
   - **a. Reload** of the overview: the card loads the thumbnail; the file behind
     `currentSrc`, decoded, is 1280 px wide.
   - **b. A write to `photos` while the overview stays open:** a second page of the same
     context imports a photo into another project (Dexie tells the open page). The card's
     `src` and `srcset` don't change (0 mutations) and it still shows the 1280 px thumbnail.
   - **c. Downloaded from the NAS:** the cover's record is replaced in IndexedDB by what
     `downloadedPhoto` (`src/sync/records.ts`) stores for it: same blobs, no `thumbnailWidth`
     or `thumbnailOnNas`, `uploads` all `'none'`. Build the record's fields with
     `downloadedPhoto` itself on the Node side, so the test follows its real shape. Then
     reload. From the reload until the rebuild has written `thumbnailWidth` (poll IndexedDB),
     the card never loads the copy; afterwards it shows the 1280 px thumbnail.
   - **d. The rebuild of an older thumbnail:** the cover's thumbnail is replaced by a 512 px
     one made in the page from its copy, `thumbnailWidth` removed (as
     `e2e/thumbnails.spec.ts`'s "older version" helper does). Reload. Until the rebuild has
     written `thumbnailWidth: 1280`, the card never loads the copy; afterwards it shows the
     1280 px thumbnail, with exactly one change of `src` (the rebuilt file).

   It prints a table (viewport | situation | file loaded | decoded width | attribute changes)
   and attaches it. The developer runs it on `origin/main` first and pastes the failing table
   into *Test* (the architect expects: c and d load the copy at @2, Fold and Pixel; b counts 3
   changes), then the passing one from the branch.
2. **Unit tests** in `src/components/PhotoImage.test.tsx`: a stored photo without
   `thumbnailWidth` renders with the thumbnail only (no copy address in `srcset`, or no
   `srcset`); with it, `"<thumb> <thumbnailWidth>w, <copy> <width>w"` as now; a visitor's photo
   as now (1280w label). Re-rendering with new Blob objects for the same files keeps both
   object URLs; a new thumbnail file changes only the thumbnail's; unmounting the last user of
   an address revokes it, and no address is revoked while an `<img>` still uses it.
3. `e2e/sharp-photos.spec.ts` and `e2e/thumbnails.spec.ts` pass; `thumbnails.spec.ts`'s
   expectation of a `512w` label before the rebuild (line 150) is changed to D-0040's rule
   (no copy candidate before the rebuild) in the same pull request.
4. `pnpm exec harness check` passes, and CI is green on the first attempt.
5. **Sander, in production, after the deploy**, on his laptop and the Fold: the covers on the
   projects page are smooth, right after the new-version prompt's reload and a minute later
   (after the sync), and the one-liner in *Notes* reports `thumbnail` for every card. Keeps
   the task *Doing* with `Remaining:` until he confirms.

# Notes

- **Before the fix (for the caller to ask Sander now; not a blocker):** on the device and
  window where he sees jagged covers, in the browser console of the projects page:

  ```js
  [...document.querySelectorAll('a img')].map(i => [devicePixelRatio, Math.round(i.getBoundingClientRect().width), (i.srcset.match(/\d+w/g) || []).join('/'), i.currentSrc === i.src ? 'thumbnail' : 'copy'])
  ```

  `copy` on a card confirms cause 1 on his device. `thumbnail` with `1280w/2560w` at a pixel
  ratio of 1 to 1.5 means the file choice is right and the jaggedness is the browser's
  downscale of the 1280 px thumbnail itself (2.7 to 4×; before, he may have seen the older
  512 px thumbnails during his device's rebuild). That is not this task: the architect then
  raises a follow-up (a smaller middle size is a data-store change for the Engineer, D-0038
  option 1).
- Read: `src/components/PhotoImage.tsx` (`thumbnailLabel`, `usePhotoSources`,
  `PhotoWithSrcset`), `src/components/ui.tsx` (`ProjectCard`, `CARD_SIZES`),
  `src/routes/Overview.tsx` (one live query over all projects and photos),
  `src/routes/ProjectPage.tsx` (tiles, `TILE_SIZES`), `src/photos/rebuild.ts`,
  `src/sync/records.ts` (`downloadedPhoto`), `src/main.tsx` (`startThumbnailCheck`).
  Earlier tasks: T-0037 (design of cards and tiles, the rebuild, `e2e/sharp-photos.spec.ts`,
  `e2e/thumbnails.spec.ts`) and T-0038 (the sync's `thumbnailOnNas` writes). Both are merged;
  their *Remaining* human checks stay theirs.
- Object URLs: a small cache keyed by photo id and file (`copy`/`thumbnail`) plus what tells
  the files apart (the Blob's `size` and `type`, and `thumbnailWidth` for the thumbnail), with
  a reference count per address so it is revoked when no mounted image uses it. Keep
  `usePhotoUrl` (the viewer) working; it may share the cache.
- Unchanged: `thumbnailLabel` for visitors, `CARD_SIZES`/`TILE_SIZES`, the rebuild, the sync,
  the stored fields. No Dexie version (D-0007): nothing stored changes.
- No sync is needed for the e2e test: situation c writes the state a download leaves. The
  preview build has no sync engine (D-0006), and nothing here may reach the NAS (G-0019). If
  the developer adds a check through the real sync, it uses a throwaway PocketBase from
  `pnpm exec harness backend start` (G-0032), as `src/sync/thumbnails.pocketbase.test.ts`
  does.
- Size small (G-0031): a fix within the existing screens and data. No design before the build;
  the UX designer reviews after, because the covers change.

# Design

Nothing new is visible: covers and tiles look as T-0037 designed them; only the jagged copy no
longer appears on cards. (Small task: the UX designer reviews after the build.)

**Review (ux-designer, 2026-11-24): matches.** Looked at on the dev server with the seeded demo
data plus generated 4000×3000, 3000×4000 and 4000×2250 JPEGs, in Chromium at laptop 1280×800
@1 and @2, Fold 840×900 @2.625 and Pixel 412×915 @2.625, with a per-frame probe (an image
frame with no picture, a size change, `src`/`srcset` changes, which file a card loaded, image
errors) and screenshots.

- **Cards, unmeasured (as after a download):** the cover shows the thumbnail alone (no
  `srcset`) at every pixel ratio; the copy was never loaded. When the rebuild measures it,
  only `srcset` is added; the picture stays, no flash, no layout change.
- **Cards, older 512 px thumbnail:** shown alone, slightly soft at @2.625 (D-0040's accepted
  consequence), never the copy; the rebuild swaps `src` once. The probe saw `naturalWidth` 0
  for one animation frame in some swaps, but a screencast of 22 such swaps showed no frame
  without the picture: Chrome keeps painting the old thumbnail until the new one is ready.
- **Writes elsewhere** (a write to every photo's `thumbnailOnNas`, as T-0038's sync does):
  0 attribute changes and 0 reloads on cards and on tiles.
- **Tiles:** the same rule (no `srcset` while unmeasured, the full one after); no empty or
  moving tiles.
- **Viewer:** stepping through with the arrow keys, waiting past the 2 s revoke and going back,
  and a write while it was open: no blank frame, no image errors, no console errors.
- **Navigation** overview → project → back after more than 2 s: covers there at once, no
  errors.
- **Visitor view** (`?bezoeker`): `srcset` "thumbnail 1280w, copy 1600w", unchanged.
- **Keyboard and screen reader:** `alt` text, links and focus order are unchanged.
- Not this task: at @2 and on the Fold a portrait tile (thumbnail 960w) loads the copy
  because the tile needs more than 960 device pixels. That is D-0038's choice for a
  measured photo, not a regression.

# Test

**Developer, Done when 1** (`e2e/cover-after-update.spec.ts`, preview build, Chromium as
Pixel 7 with CDP metrics overrides). "file loaded" lists every file the card's `<img>` loaded
in that situation; "attribute changes" counts changes of `src`/`srcset` to another value
(React's same-value `src` reset on mount is not counted).

On `origin/main` (54dbc21), failing: c and d load the copy at @2, Fold and Pixel; b changes
`src` and `srcset` 3 times each.

```
viewport     | situation         | file loaded | decoded width | attribute changes
laptop @1.5  | a reload          | thumbnail   |          1280 | src 0, srcset 0
laptop @1.5  | b write elsewhere | thumbnail   |          1280 | src 3, srcset 3
laptop @1.5  | c downloaded      | thumbnail   |          1280 | src 1, srcset 2
laptop @1.5  | d rebuilt         | thumbnail   |          1280 | src 1, srcset 2
laptop @2    | a reload          | thumbnail   |          1280 | src 0, srcset 0
laptop @2    | b write elsewhere | thumbnail   |          1280 | src 3, srcset 3
laptop @2    | c downloaded      | copy+thumbnail |          1280 | src 1, srcset 2
laptop @2    | d rebuilt         | copy+thumbnail |          1280 | src 1, srcset 2
fold @2.625  | a reload          | thumbnail   |          1280 | src 0, srcset 0
fold @2.625  | b write elsewhere | thumbnail   |          1280 | src 3, srcset 3
fold @2.625  | c downloaded      | copy+thumbnail |          1280 | src 1, srcset 2
fold @2.625  | d rebuilt         | copy+thumbnail |          1280 | src 1, srcset 2
pixel @2.625 | a reload          | thumbnail   |          1280 | src 0, srcset 0
pixel @2.625 | b write elsewhere | thumbnail   |          1280 | src 3, srcset 3
pixel @2.625 | c downloaded      | copy+thumbnail |          1280 | src 1, srcset 2
pixel @2.625 | d rebuilt         | copy+thumbnail |          1280 | src 1, srcset 2
  x  1 [pixel] › e2e\cover-after-update.spec.ts:153:1 › a project cover stays on the thumbnail after a reload, writes, a download and a rebuild (51.2s)
```

On the branch, passing (also with `--repeat-each 3`):

```
viewport     | situation         | file loaded | decoded width | attribute changes
laptop @1.5  | a reload          | thumbnail   |          1280 | src 0, srcset 0
laptop @1.5  | b write elsewhere | thumbnail   |          1280 | src 0, srcset 0
laptop @1.5  | c downloaded      | thumbnail   |          1280 | src 0, srcset 1
laptop @1.5  | d rebuilt         | thumbnail   |          1280 | src 1, srcset 1
laptop @2    | a reload          | thumbnail   |          1280 | src 0, srcset 0
laptop @2    | b write elsewhere | thumbnail   |          1280 | src 0, srcset 0
laptop @2    | c downloaded      | thumbnail   |          1280 | src 0, srcset 1
laptop @2    | d rebuilt         | thumbnail   |          1280 | src 1, srcset 1
fold @2.625  | a reload          | thumbnail   |          1280 | src 0, srcset 0
fold @2.625  | b write elsewhere | thumbnail   |          1280 | src 0, srcset 0
fold @2.625  | c downloaded      | thumbnail   |          1280 | src 0, srcset 1
fold @2.625  | d rebuilt         | thumbnail   |          1280 | src 1, srcset 1
pixel @2.625 | a reload          | thumbnail   |          1280 | src 0, srcset 0
pixel @2.625 | b write elsewhere | thumbnail   |          1280 | src 0, srcset 0
pixel @2.625 | c downloaded      | thumbnail   |          1280 | src 0, srcset 1
pixel @2.625 | d rebuilt         | thumbnail   |          1280 | src 1, srcset 1
  ok 1 [pixel] › e2e\cover-after-update.spec.ts:153:1 › a project cover stays on the thumbnail after a reload, writes, a download and a rebuild (50.1s)
```

**Tester, 2026-11-24** (branch at 5fed23b, clean `pnpm install --frozen-lockfile`, preview
build on its own port, demo data and generated photos only; nothing reached the NAS).

CI on 5fed23b (run 45434974972, attempt 1): `checks` and `pocketbase-auth` pass; unit
`Tests 432 passed | 33 skipped (465)`; e2e unsharded inside `checks`, `82 passed (1.6m)`
(82 = all tests in 22 files, `cover-after-update` included); no `flaky` line and no
`retry #` in the log. The `shards`/`e2e` jobs are skipped because the run is unsharded.

- **Done when 1.** `playwright test e2e/cover-after-update.spec.ts --repeat-each 4 --workers 4`:
  `4 passed (59.4s)`; each run printed the developer's passing table (a, b: `src 0, srcset 0`;
  c: `src 0, srcset 1`; d: `src 1, srcset 1`; thumbnail, 1280 everywhere). With
  `origin/main`'s (54dbc21) `PhotoImage.tsx` put back and rebuilt: `x cover-after-update`,
  table identical to the developer's failing one (c and d `copy+thumbnail` at @2, Fold and
  Pixel; b `src 3, srcset 3`), and `x thumbnails.spec.ts:115` (the changed expectation).
- **Done when 2.** `vitest run src/components/PhotoImage.test.tsx`: `Tests 12 passed (12)`.
  With main's component: `Tests 6 failed | 6 passed (12)`; the 6 failing are the new ones
  (thumbnail alone, same files as new Blobs, measured keeps address, new thumbnail file,
  revoke on last unmount, viewer shares the tile's address). Full suite: `Tests 432 passed |
  33 skipped (465)`; `tsc --noEmit` clean.
- **Done when 3.** `playwright test thumbnails sharp-photos viewer visitor cover-delete photos
  delete --repeat-each 3 --workers 4`: `81 passed (39.7s)`. `thumbnails.spec.ts:150` now
  expects no `srcset` before the rebuild.
- **Done when 4.** `pnpm exec harness check`: `✓ tasks: 39 tasks, index in step`,
  `✓ decisions: 47 records, index complete, 1 overrule valid`, `✓ engineers: 2 listed`,
  `✓ generated files: current`. CI green on the first attempt (above).

Tried to break it (throwaway probe, not committed: wraps `URL.createObjectURL`/`revokeObjectURL`
to track live addresses, checks every animation frame whether any `<img>` `src`/`srcset`
holds a revoked address, and records image `error` events):

- **Leaks over navigation:** overview → each of the 4 projects → back, 8 rounds, waiting
  0, 300, 1800, 1950, 2000, 2050, 2200 and 2600 ms between steps (270 addresses made in all).
  Right after the fast rounds 26 live, 18 not on screen (inside the 2 s window); from the
  1800 ms rounds on, 8 live = 8 on screen; after settling `{"live":8,"inDom":8,
  "liveNotInDom":0,"violations":0,"imgErrors":0,"broken":0}`. No leak.
- **Revoked address in use:** the same rounds around the 2 s window, the viewer stepped with
  the arrow keys alternating 150 ms and 2.3 s waits, then back/forward between project and
  viewer at 0, 100, 1900, 2000, 2100 and 2500 ms: 0 violations, 0 image errors, 0 broken
  images; the viewer held 3 live = 3 shown; back on the project page 12 live = 12 shown.
- **Deletes:** deleting Tuinbank's 11 okt entry (2 photos): all of its addresses revoked
  within 2.6 s, none of the other entries'; 8 live = 8 shown. All projects deleted in a
  second tab while the overview stays open: 0 cards, 0 live addresses, no errors.
- **Imports while the overview is open:** two 3000×2000 photos imported into Tuinbank in a
  second tab: the overview made no new address at all (`created` 8 before and after),
  8 live = 8 shown.
- **Sign-out clearing the device:** the preview build has no account page, so on the dev
  server (StrictMode) `clearLocalData()` was called through the app's own module while the
  overview was open: before 8 live, after 2.6 s 0 live, 0 cards, no errors.
- **Replacement file of the same byte size (known gap):** the key is
  `photoId|file|size|type`. Photos are never edited (D-0002), so a photo's copy never
  changes; its thumbnail is replaced only by the rebuild (a 512 px older one becomes 1280 px,
  a very different size) or by the same file. Two different thumbnails of one photo with the
  same byte count and type would need a re-encode of a measured thumbnail, which nothing
  does (`needsCheck` skips measured photos). Judged not to happen in practice; at worst the
  card keeps the older thumbnail until the next reload.

Verdict: **passed** for Done when 1 to 4. Done when 5 is Sander's, in production after the
deploy.

# Log

- 2026-11-24 architect: raised from Sander's report that jagged covers came back after an
  update. Reproduced two causes in Chromium (an unmeasured thumbnail makes the card take the
  copy at a pixel ratio of 2 and up; every write to photos swaps every card's addresses);
  recorded D-0040; not reproduced at 1280×800 @1.5 with a measured thumbnail, so *Notes* asks
  Sander for a one-line console check. Size small.
- 2026-11-24 developer: `PhotoImage` offers a stored photo's unmeasured thumbnail alone (no
  `srcset`, no copy URL made) and keeps object URLs in a shared cache keyed by photo id, file,
  and the Blob's size and type, reference-counted per mounted image (layout effect) and revoked
  2 s after its last user leaves, so no `<img>` holds a revoked address; the viewer's
  `usePhotoUrl` shares it. A measured width alone keeps the thumbnail's address. New
  `e2e/cover-after-update.spec.ts` (tables in *Test*: fails on main, passes here, 3/3 with
  `--repeat-each 3`); 6 new unit tests in `PhotoImage.test.tsx` (all 6 fail on main's
  component); `thumbnails.spec.ts` now expects no `srcset` before the rebuild. Local: typecheck
  clean; vitest 432 passed; e2e sharp-photos, thumbnails, viewer, visitor, design, photos,
  cover-delete, overview-order, import 31 passed, 2 skipped; `harness check` passes.
- 2026-11-24 ux-designer: reviewed: matches (see *Design*). Dev server, demo data, generated
  photos, DPR 1, 2 and 2.625: covers and tiles of unmeasured photos never load the copy;
  writes leave cards untouched; no visible flash, empty frame or layout jump on cards, tiles
  or in the viewer, also through a measure, a rebuild and navigation; visitor view unchanged.
  No fixes needed; to the tester.
- 2026-11-24 tester: passed. Done when 1 to 4 run (tables and output in *Test*); new tests
  fail on main's component; no leaked or revoked-in-use address over navigation, the viewer,
  deletes, imports in a second tab and clearing the device; the same-size gap judged not
  reachable. CI green on the first attempt.
  Remaining: Done when 5 (Sander, in production after the deploy, on his laptop and the
  Fold: covers smooth right after the new-version reload and a minute later, and the
  console one-liner in *Notes* reports `thumbnail` for every card).
- 2026-11-25 architect: Done when 5 confirmed: the covers look smooth. Sander (Engineer) confirmed in production after the deploy of T-0041 (main at b587602), by eye: "the covers are smooth now, close the tasks", and on the arrow keys and the visitor view: "Yes, both checked: I checked the arrow keys and the visitor view too; close all six." He gave no console output; this confirms by eye only. Done.
