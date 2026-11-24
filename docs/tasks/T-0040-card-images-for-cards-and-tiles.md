---
id: T-0040
title: "Show covers and day tiles without aliasing at every screen, from a 640×480 card image"
description: "D-0041: a third srcset candidate on the overview's cards and the project page's tiles, a 640×480 centre crop that each owner device makes from its copy and keeps locally, and that visitors get from PocketBase's ?thumb=640x480 on the thumbnail (one migration in the backend image); fixes the 3-4x downscale of the 1280 px thumbnail at a pixel ratio of 1."
status: Doing
size: full
depends_on: [T-0039]
decisions: [D-0041, D-0040, D-0038, D-0039, D-0003, D-0023, D-0006, D-0002, D-0007, G-0019, G-0012, G-0031, G-0032]
raised_on: 2026-11-24
done_on: ""
result: []
---

# Goal

Sander (Engineer), 2026-11-24: the covers on the projects page still look jagged after T-0037.
His console check in production on his laptop: all 23 cards at `devicePixelRatio` 1, 320 CSS
px wide, loaded the thumbnail (srcset labels 1280w/2560w, 960w/1920w, 721w/1441w and
1280w/1600w), never the copy. The file choice is right; the size is not: Chrome shrinks a 960
to 1280 px thumbnail 3 to 4 times into a 320 px card, and that aliases. The day tiles (492 CSS
px) get the same thumbnail at 2.6 times. Before T-0037 the 512 px thumbnails needed about 1.6
times and looked fine.

Deliver D-0041 (Sander's choice, "Device + PocketBase thumbs (Recommended)"):

1. **Card image on the owner's devices.** A 640×480 WebP (quality 0.8), the centre 4:3 crop of
   the copy, made in halving steps (`scaleSteps`) in the photo worker. Stored on the photo as
   a local-only field (blob, and its width), never synced: no outbox row, `uploads` and
   `updatedAt` unchanged, not counted as unsent, not sent by `toServer`, kept when a newer
   record is pulled. Not made when the copy's 4:3 crop is smaller than 640×480.
   - New photos get it at import, next to the thumbnail.
   - Photos already on the device, and photos downloaded later, get it from the background job
     of T-0037 (`src/photos/rebuild.ts`) or one beside it: one at a time, silent, continuing
     after a reload, a failure logged once and not retried until the next start. It also
     measures the thumbnail in the same step (measuring only reads), so the card image and a
     measured `thumbnailWidth` arrive together.
2. **PocketBase thumbs for visitors.** A new migration in `backend/pb_migrations/` sets
   `thumbs: ["640x480"]` on the `photos` collection's `thumbnail` field (down: `[]`). Nothing
   else in the schema changes; no hook changes (the file hook already covers thumbs, as it
   decides by the field). `PublicPhoto` gets a `cardUrl`: the thumbnail's address with
   `?thumb=640x480` (`files.getURL(record, thumbnail, { thumb })`). The demo source
   (`createDemoSource`) has none.
3. **`srcset` on cards and tiles** (`PhotoImage` with `sizes`), owner and visitor, as D-0041
   lists: the card image as the smallest candidate (`640w`), then the thumbnail and the copy
   as D-0040 has them; without a card image, or with an unmeasured thumbnail, exactly D-0040.
   `CARD_SIZES` and `TILE_SIZES` don't change. The photo viewer is unchanged (the copy).
4. **One size constant.** `CARD_WIDTH = 640` and `CARD_HEIGHT = 480` in `src/photos/resize.ts`;
   the visitor's `thumb` is built from them, and a unit test reads the migration file and
   checks its `thumbs` value is `` `${CARD_WIDTH}x${CARD_HEIGHT}` ``.

What Sander sees: the same pages, layout and crop; covers and day tiles smooth on his laptop
at 100 %, and as sharp as now on the Fold and his phone. Visitors the same.

# Done when

1. **Measured ratio, at a pixel ratio of 1 too** (e2e, Chromium, generated photos only,
   G-0019). Extend `e2e/sharp-photos.spec.ts` (or a new spec beside it with its helpers):
   import the generated 4000×3000 landscape and 3000×4000 portrait, the landscape one the
   cover. For every overview card and day tile showing them, compute r = the delivered
   image's pixel width (decoded from `currentSrc`, the 4:3 crop's width as the spec does now)
   ÷ (the element's CSS width × `devicePixelRatio`). Viewports (CDP
   `Emulation.setDeviceMetricsOverride`):
   - laptop 1280×800 at DPR **1**, **1.5**, **2** and **2.625**;
   - T-0037's Fold 840×900 @2.625 and phone 412×915 @2.625.

   Expected: **0.7 ≤ r ≤ 2.2** in every row (the lower bound is where Chrome's srcset choice
   between candidates 2 times apart can land; T-0037's 0.9 to 3 band is replaced). The test
   prints and attaches the table (viewport | DPR | place | photo | CSS px | delivered | r).
   **It must fail on `origin/main` first** (after T-0039 is merged there): the developer runs
   it there and pastes the failing table into *Test*. The architect expects r = 4.0 for the
   card and about 2.6 and 1.95 for the tiles at 1280×800 DPR 1. The architect's expected
   rows on the branch, from Chrome's rule (take the smaller candidate until the pixel ratio
   passes the geometric mean of two neighbours): laptop DPR 1 card 2.0, tiles 1.30; DPR 1.5
   card 1.33, tiles 0.87; DPR 2 card 1.0, tiles 1.30 / 0.98; DPR 2.625 card 0.76 (landscape)
   / 1.14 (portrait), tiles 0.99 / 0.74.
2. **Card images on the device** (e2e and unit, like T-0037's Done when 3 and 8): an imported
   4000×3000 photo has a 640×480 WebP card image; a photo already on the device without one
   (made so in the test) gets one after the app starts, while the outbox stays empty, its
   `uploads` and `updatedAt` are unchanged and the page's text doesn't change (no status-bar
   count, no message); the card keeps a loaded image throughout and afterwards its `srcset`
   has `640w`. A photo whose copy is 600×450 gets no card image and is not retried on every
   start; a job whose encoder throws logs once and doesn't loop.
3. **Never synced** (unit, and against a throwaway PocketBase from
   `pnpm exec harness backend start`, never the NAS): `toServer` of a photo with a card image
   sends no card field; after a sync with the throwaway backend the NAS record has no such
   field and nothing extra was uploaded; a pulled newer record keeps the device's card image.
4. **The migration** (a `*.pocketbase.test.ts` like `src/sync/thumbnails.pocketbase.test.ts`,
   on `pnpm exec harness backend start`): after the migrations ran, the `photos.thumbnail`
   field's `thumbs` is exactly `["640x480"]`. **Visitor check:** for a public photo whose
   thumbnail is a generated 1280×960 WebP, a signed-out `GET` of its thumbnail with
   `?thumb=640x480` answers 200 with a 640×480 image (PNG, as PocketBase encodes WebP thumbs),
   and without `?thumb` the WebP itself; for a private (non-public) project's photo the same
   `?thumb=640x480` answers 404. Plus the unit test of Goal 4 (migration value equals the
   constants). The `backend` workflow (image build, start on an empty database, smoke test)
   is green on the pull request.
5. **Visitor `srcset`** (unit, `src/components/PhotoImage.test.tsx` and
   `src/public/source` tests): a visitor photo from a PocketBase record has `cardUrl` ending in
   `?thumb=640x480` and renders `"<cardUrl> 640w, <thumbnailUrl> <1280-fit>w, <copyUrl> <width>w"`;
   a demo visitor photo renders without a card candidate. The owner cases of D-0041's list
   each have a unit test. `e2e/visitor.spec.ts` and `e2e/thumbnails.spec.ts` pass.
6. **Bytes** (in *Test*, measured, not asserted): the delivered size of one card image on the
   device and of the PocketBase PNG thumb in check 4, next to the thumbnail's size, for a
   generated photo-like image. If the PNG is more than twice the thumbnail, say so in the PR
   for the Engineer (D-0041, *Consequences*).
7. `pnpm run typecheck`, `pnpm test`, `pnpm run test:e2e`, `pnpm run build` and
   `pnpm exec harness check` pass, and CI (including `backend`) is green on the first attempt.
8. **Sander, in production, after the deploy** (the app at once; the backend about ten minutes
   later, see *Notes*), on his laptop at 100 % and on the Fold, once his devices have made
   their card images (a minute after opening the app): the covers on the projects page and
   the photos on a project page look smooth, not jagged, and as sharp as before on the Fold.
   In the console of the projects page:

   ```js
   [...document.querySelectorAll('a img')].map(i => [devicePixelRatio, Math.round(i.getBoundingClientRect().width), i.naturalWidth, +(i.naturalWidth / (i.getBoundingClientRect().width * devicePixelRatio)).toFixed(2)])
   ```

   reports a last number of 2.2 or less on every card (640 natural width at 320 px, DPR 1).
   And once as a visitor (a private window on the public address): the covers look the same,
   and the same one-liner reports 640 natural width on the cards. Keeps the task *Doing* with
   `Remaining:` until he confirms; his confirmation also closes T-0037's Done when 6.
9. **Unchanged to the eye** (the ux-designer's review, by eye; an automated pixel diff is optional): for the generated
   4000×3000 landscape and 3000×4000 portrait, a screenshot of the card and of the tile taken
   with the card image and one taken without it (D-0040 path) show the same framing: no
   visible shift of the subject, no edge appearing or disappearing, no stretch. While a card
   image is made for a photo on screen, the image never disappears (already in check 2) and
   the page text never changes. `/design`'s screenshot baselines are unchanged.

# Notes

- **Order with T-0039** (branch `t-0039-jagged-covers-regression`, in progress): T-0039
  rewrites `usePhotoSources` and `thumbnailLabel` in `src/components/PhotoImage.tsx` (D-0040:
  stable object URLs, an unmeasured thumbnail alone), which this task builds on. T-0039's pull
  request merges first; then merge `origin/main` into this branch (`t-0040-card-images`) before
  touching `PhotoImage`. The doc files both branches change (`docs/decisions/index.md`,
  `docs/tasks/index.md`, `docs/lessons.md`, T-0037's *Log*) conflict only by lines added at the
  same place: keep both sides, then `pnpm exec harness tasks-index`. **Until T-0039 is merged,
  only the parts that don't touch `PhotoImage` may start:** the migration and its check 4, the
  size constants, and the card image's making and storing (Goal 1, checks 2 and 3).
- **Deploy (nothing for Sander to run):** merging to `main` publishes the backend image
  (`.github/workflows/backend.yml`, `:stable`), and Watchtower on the NAS pulls it within
  about five minutes; PocketBase applies the migration on start-up
  (`docs/deploy/pocketbase-on-the-nas.md`, section 4). The thumbs option is additive and safe
  in either order: until the migration runs, `?thumb=640x480` answers with the thumbnail itself
  (measured, D-0041), so visitors see what they see today. **Only if** the visitor check of Done
  when 8 still shows 1280 px covers an hour after the merge (Watchtower not running), the
  backend needs a redeploy, which is Sander's: in a session with him, through
  `pnpm exec harness nas --remote` (`deploy/nas/admin/README.md`, "This project's app"). No
  snapshot is needed before it (G-0023, hourly).
- **Sizing: full.** No new screen or route, but it adds a backend schema option on the NAS and a
  new locally stored image per photo, with a background job; when in doubt, full (G-0031). The
  UX designer writes the (short) design first: what is seen while card images are made
  (expected: nothing, as T-0037's rebuild) and that the crop and framing don't change; then
  reviews after.
- Read: `src/components/PhotoImage.tsx` (as T-0039 leaves it), `src/components/ui.tsx`
  (`ProjectCard`, `CARD_SIZES`), `src/routes/ProjectPage.tsx` (`TILE_SIZES`),
  `src/photos/resize.ts`, `src/photos/encode.ts`, `src/photos/photo.worker.ts`,
  `src/photos/index.ts`, `src/photos/importQueue.ts`, `src/photos/rebuild.ts`, `src/db/db.ts`
  (`Photo`, local-only fields like `thumbnailWidth`), `src/sync/records.ts` (`toServer`,
  `downloadedPhoto`, `photoFromServer`), `src/public/source.ts` (`PublicPhoto`,
  `PHOTO_FIELDS`, `createDemoSource`), `backend/pb_migrations/1794931500_public_projects.js`
  (migration style), `backend/pb_hooks/photo_files.pb.js`, `backend/smoke-test.sh`.
  Earlier tasks: T-0037 (cards and tiles, `e2e/sharp-photos.spec.ts`,
  `e2e/thumbnails.spec.ts`, the rebuild), T-0038 (thumbnail upload, the sync's
  `thumbnailOnNas`), T-0039 (D-0040), T-0035 (`harness backend`).
- A local-only field that isn't indexed needs no Dexie version (D-0007), as `thumbnailWidth`.
  Demo photos (D-0006) get card images from the same job on the owner's preview.
- Never point anything but production at the NAS (G-0019): every PocketBase check uses
  `pnpm exec harness backend start`. Never write the NAS's host, tailnet name or a dataset path
  anywhere.
- Lesson of T-0036: fetch and merge `origin/main` before starting and again before opening the
  pull request.

# Design

No new screen, layout, look or words (D-0020 unchanged). This settles only what the user sees
around the card image: the same pictures, framed the same, smoother at a pixel ratio of 1.

**Making card images for existing photos: invisible**, as T-0037's rebuild. No message,
banner, spinner, progress or count; the sync status bar doesn't show it and doesn't count it
as unsent; the app stays fully usable, also offline, and an import is never held up by it. A
failure shows nothing (a single console line).

**Before a card image exists: exactly as today** (D-0040): the card or tile shows the
thumbnail (and the copy where measured). The same holds for a photo too small to get one
(copy's 4:3 crop under 640×480) and for a photo still being downloaded. Loading stays as now:
the card's grey 4:3 box until the image shows, `loading="lazy"`, no placeholder, blur-up or
fade.

**When a card image arrives while its card or tile is on screen:** the picture stays put and
may only get smoother. No empty frame, no flash of the grey box, no jump in the layout, no
fade. The `<img>` is not unmounted: the new `srcset` is applied only once every object URL
it names exists (T-0037's "render once" rule, with T-0039's stable object URLs), so the
browser swaps from a loaded image to a loaded image.

**Crop: identical, nothing shifts.** Cards (`aspect-[4/3]`, `object-cover`) and tiles
(`aspect-[4/3]`, `object-cover`) both use the default `object-position` (50 % 50 %), which is
a centre crop to the box's 4:3. The card image is that same centre 4:3 crop, made ahead of
time, so `object-cover` then crops nothing more. For both landscape and portrait photos (and
panoramas) the visible part is therefore the same as from the thumbnail or the copy. Required
of the build:
- the crop is centred in both directions, with the offset taken as
  `round((source − crop) / 2)` on the copy, and the crop is the largest 4:3 area of the copy
  (full width or full height), then scaled to 640×480; never stretched, never padded;
- the result may differ from today's framing by at most 1 px of the 640 px image (about
  half a CSS pixel on a 320 px card): invisible. Anything more (an off-centre crop, a sliver
  of edge appearing or disappearing, a squashed image) is a defect;
- PocketBase's `640x480` thumb is also a centre crop ("crop to W×H from centre"), so the
  visitor's framing matches too.
- The photo viewer is unchanged: the whole photo, from the copy.

**Visitors** (signed out, on the public address): the same pages, cards and tiles, framed the same. Their card image is PocketBase's PNG
of the thumbnail. The trade-off D-0041 accepts: per card or tile it may weigh as much as or
up to about twice the 1280 px WebP it replaces, so on a slow connection a cover can take a
little longer to appear; the grey box shows meanwhile, as now. On a fast laptop that is
invisible and the covers look smoother. Before the backend has the migration, the same
address returns the thumbnail itself, so visitors see exactly what they see today. A failed
image behaves as today (no new error handling or message). The demo visitor view has no card
image and is unchanged. If the PNG in Done when 6 is more than twice the thumbnail, the PR
says so and the Engineer decides; the design itself doesn't change.

**Design system (D-0020): untouched.** No token, colour, radius, spacing or word changes;
4:3 and the 25 px corners stay on the element, not in the image. The `/design` page's sample
photo is not in the database, so it gets no card image and shows the D-0040 path: its
screenshot baselines must not change (a changed baseline in this PR is a defect).

**Keyboard and screen reader: unchanged.** Same elements, order and alt texts (cards `alt=""`
beside the project title; tiles "<project>, <date>"). Making card images announces nothing
(no live region).

**Added to Done when** (see check 9).

# Test

# Log

- 2026-11-24 architect: raised from Sander's production console check (all 23 cards at DPR 1
  load the 1280 px thumbnail into 320 px, 3 to 4x down). Recorded Sander's choice as D-0041
  (640×480 card image: made on each device from its copy and kept there; for visitors
  PocketBase's `?thumb=640x480` on the thumbnail), which replaces D-0015 for its "no PocketBase
  thumbnails" line. Probed PocketBase 0.40.6 on a throwaway backend: WebP thumbs come back as
  PNG; an unlisted size returns the file itself. Depends on T-0039 for `PhotoImage`; the
  migration and the device's card images may start before it merges. Size full.
- 2026-11-24 ux-designer: designed (invisible making, D-0040 until the card image exists, identical centre crop, visitor PNG trade-off, D-0020 untouched; Done when 9 added)
