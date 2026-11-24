---
id: T-0039
title: "Keep project covers on the thumbnail after an update, a sync, a rebuild or a download"
description: "D-0040: a regression after T-0037/T-0038; an overview card whose thumbnail isn't measured yet takes the 2560 px copy (jagged) at a pixel ratio of 2 and up, and every write to photos reloads every card; offer an unmeasured thumbnail alone and keep a photo's object URLs while its files are the same."
status: Open
size: small
depends_on: []
decisions: [D-0040, D-0038, D-0039, D-0003, D-0015, D-0002, D-0006, G-0019, G-0012, G-0031, G-0032]
raised_on: 2026-11-24
done_on: ""
result: []
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

# Test

# Log

- 2026-11-24 architect: raised from Sander's report that jagged covers came back after an
  update. Reproduced two causes in Chromium (an unmeasured thumbnail makes the card take the
  copy at a pixel ratio of 2 and up; every write to photos swaps every card's addresses);
  recorded D-0040; not reproduced at 1280×800 @1.5 with a measured thumbnail, so *Notes* asks
  Sander for a one-line console check. Size small.
