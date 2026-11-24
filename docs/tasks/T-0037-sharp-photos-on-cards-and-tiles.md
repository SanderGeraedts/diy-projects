---
id: T-0037
title: "Show photos sharp on the overview's cards and the project page's tiles"
description: "D-0038: 1280 px thumbnails made in halving steps, srcset/sizes with the thumbnail and the copy on cards and tiles for owner and visitor, and each device rebuilding its older thumbnails from its copy; nothing changes on the NAS for existing photos (Q-007)."
status: Doing
size: small
depends_on: []
decisions: [D-0038, D-0003, D-0015, D-0002, D-0023, D-0007, G-0019]
raised_on: 2026-11-24
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/70"]
---

# Goal

Sander (Engineer), 2026-11-24, with screenshots: "Most images on the projects page appear
overly sharp and aliased, whereas the images on the log page can look blurry."

Verified causes (layout `max-w-5xl` + `p-4`: on a laptop, cards 320 CSS px in three
columns, tiles 492 CSS px in two):

- **Overview, owner** (`src/routes/Overview.tsx:82`): cards load the 2560 px copy
  (`coverFile={readOnly ? 'thumbnail' : 'copy'}`) and the browser shrinks it 5 to 8 times:
  aliased, and a 20 MB decoded bitmap per card.
- **Project page** (`src/routes/ProjectPage.tsx:145`): tiles load the 512 px thumbnail
  (`src/photos/resize.ts`), but need 492 × pixel ratio (738 px at 1.5, 984 at 2, about 1050
  on the Fold's inner screen): enlarged, so soft.
- **Encoder** (`src/photos/encode.ts`): one `drawImage` per scale with
  `imageSmoothingQuality = 'high'`; a 50 MP original goes 3.2x down to the copy in one step.

Deliver D-0038:

1. **Thumbnail 1280 px** on the long edge (`THUMBNAIL_LONG_EDGE`), WebP 0.8, from the copy.
2. **Halving steps** in `encodeScaled`: while the source is more than twice the target,
   halve it (high-quality smoothing), then one last step of at most 2x. Applies to the copy
   and the thumbnail. First run the stripe test below against today's encoder and write in
   the *Log* whether it already passed; keep the halving either way (it is what D-0038 says).
3. **`srcset` and `sizes` on cards and tiles**, owner and visitor: candidates are the
   thumbnail at its real width and the copy at its width; `sizes` matching the layout (the
   overview's `auto-fill minmax(16rem, 1fr)` grid with `gap-4`, the page's two columns with
   `gap-2`, inside `max-w-5xl p-4`). `sizes="auto, <your fallback>"` is fine as images are
   `loading="lazy"`. The owner's overview stops loading the copy as `src`. The viewer is
   unchanged (copy).
4. **Each device rebuilds its older thumbnails**: thumbnails narrower than the current size
   that can be bigger (the copy is larger than them) are rebuilt from the device's copy in
   the photo worker, one at a time, in the background, never blocking the app or an import,
   and continuing after a reload. This covers photos already on the device and photos it
   downloads from the NAS later. A rebuild writes only the local `thumbnail` blob: no outbox
   row, `uploads` unchanged, `updatedAt` unchanged, nothing sent to the NAS (Q-007).
   Until a photo's thumbnail is rebuilt, its `srcset` labels it with its real width, so the
   browser takes the copy where it's too small (D-0038 guidance). How the device knows the
   width (a local-only field, or reading it once) is yours to choose; say which in the PR.

# Done when

1. **Measured sizes** (e2e, Chromium, generated photos only, G-0019). Import a 4000×3000
   landscape and a 3000×4000 portrait photo into a project and make one the cover. At each
   viewport below, for every overview card and day tile showing those photos, take the
   loaded image (`currentSrc` → its natural width, or the crop's width when the photo is wider
   than 4:3) and compute r = that width ÷ (the element's CSS width × `devicePixelRatio`).
   Expected: **0.9 ≤ r ≤ 3** in every case. The test prints a table of viewport, place, photo,
   CSS width, DPR, delivered width and r; paste it into *Test*.
   - Laptop: 1280×800, DPR 1.5
   - Fold inner screen: 840×900, DPR 2.625
   - Phone (the project's Pixel 7 profile): 412×915, DPR 2.625

   Today's code gives r ≈ 5.3 on the laptop's cards and r ≈ 0.69 on its tiles, so the test
   must fail on `origin/main` (say in *Test* that it was run there and failed).
2. **No aliasing in the encoder** (e2e): a generated lossless 6000×4000 image of 1 px black and
   white vertical stripes goes through `makeCopy` and then `makeThumbnail`. Both are WebP with long
   edges 2560 and 1280, and the standard deviation of their luminance over the centre region
   is below 10 (of 255): uniform grey, no moiré bands.
3. **Rebuild** (e2e or unit with a fake worker): a device holding a photo whose thumbnail is
   512 px gets a 1280 px thumbnail after the app starts, while the outbox stays empty and the
   photo's `uploads` and `updatedAt` are unchanged; a photo whose copy is itself 512 px or
   smaller is left alone and isn't retried on every start.
4. **Visitor**: on `?bezoeker`, cards and tiles have a `srcset` with the thumbnail and the copy
   addresses and a `sizes`, and the viewer still shows the copy.
5. `pnpm run typecheck`, `pnpm test`, `pnpm run test:e2e`, `pnpm run build` and
   `pnpm exec harness check` pass.
6. **Sander looks** on his laptop and on the Fold (production, after the merge and after his
   devices have rebuilt their thumbnails): the overview's covers no longer look jagged and
   the project page's photos no longer look soft. What he sees: the same pages and layout,
   only sharper photos. Keeps the task *Doing* with `Remaining:` until he confirms.
7. **`sizes` as designed** (e2e or unit): every overview card and day tile, owner and
   `?bezoeker`, has exactly the `sizes` value given in *Design* for its place, and the photo
   viewer's image has no `srcset`.
8. **A rebuild is invisible** (in the test of 3): while and after the rebuild, no new text
   appears on the page (the status bar shows nothing new and no unsent count), and the tile
   showing that photo keeps a loaded image (`complete` and a non-zero `naturalWidth`) with its
   alt text unchanged; afterwards its `srcset` labels the thumbnail 1280w.

# Notes

- Sized **small**: no new screen, route, collection, field on the NAS or outside service; the
  layout doesn't change, so there is no design before the build. The UX designer may still
  look at the result.
- **Not in this task**: uploading rebuilt thumbnails over the older 512 px files on the NAS.
  That waits on **Q-007** (raised for the Engineer, issue #69); visitors see photos added before this
  change as soft as today until then. Nothing here writes to the NAS other than the normal
  upload of new photos (which now carry a 1280 px thumbnail).
- Sizes live in `src/photos/resize.ts`; the worker is `src/photos/photo.worker.ts`,
  `makeThumbnail` in `src/photos/index.ts`, import in `src/photos/importQueue.ts`, downloads
  in `src/sync/engine.ts` (`downloadNewPhotos`). `Photo.width`/`height` are the copy's.
- `PhotoImage` (`src/components/PhotoImage.tsx`) makes object URLs per blob; with `srcset`
  the owner needs both the thumbnail's and the copy's, revoked as now. `ProjectCard` is in
  `src/components/ui.tsx` (its `coverFile` prop can go). Visitor photos come from
  `src/public/source.ts` (`thumbnailUrl`, `copyUrl`); in the demo visitor view both are the
  same address.
- A Dexie schema bump is fine if needed (a local-only field is not synced; check
  `src/sync/` serialisers don't send it).
- Earlier work: T-0006 (encoder, its e2e `e2e/photos.spec.ts` checks a 512 px thumbnail and
  must move to 1280), T-0017 (photo sync), T-0026 (visitor view), T-0030 (overview covers).
- Lesson of T-0036: fetch and merge `origin/main` before starting the build and again before
  opening the pull request.

# Design

Small task (G-0031): no new screen, layout, look or words. This settles only what changes
for the user around the images: nothing, apart from sharper photos.

**While older thumbnails are rebuilt: nothing is shown.** No message, banner, spinner,
progress or count. The sync status bar (`SyncStatusBar`) doesn't show it and doesn't count it
as unsent work; the app stays fully usable, also offline. A photo already on screen whose
thumbnail is rebuilt stays visible: the new image replaces the old in place, with no empty
frame, no jump in the layout and no fade. If a rebuild fails, nothing is shown either (the
old thumbnail stays; a log line in the console is enough).

**Loading and placeholders: unchanged.** The card keeps its grey 4:3 box until the image
shows; the tile behaves as now. No new placeholder, blur-up, skeleton or fade-in. For the
owner, render the `<img>` once, with `srcset` complete (both object URLs ready), so the
browser makes one choice and the image doesn't load twice or switch after it first shows.
A photo without a thumbnail on the device shows its copy as now. Images stay
`loading="lazy"`; `width`/`height` stay the copy's (they only set the aspect ratio).

**`sizes`** (root font size 16 px; `main` is `max-w-5xl` = 1024 px including its `p-4`, so the
content is min(100vw, 1024 px) − 32 px; 100vw overstates by a scrollbar's width, which only errs
towards a sharper pick). The same values for the owner and a visitor (`?bezoeker` uses the
same pages):

- **Overview card** (`auto-fill minmax(16rem, 1fr)`, `gap-4`): one column below 560 px, two
  from 560, three from 832; at 1024 px and wider the content is capped at 992 px and a card is
  320 px (four columns never fit):
  `sizes="auto, (min-width: 1024px) 320px, (min-width: 832px) calc((100vw - 64px) / 3), (min-width: 560px) calc((100vw - 48px) / 2), calc(100vw - 32px)"`
- **Day tile** (`grid-cols-2 gap-2`):
  `sizes="auto, (min-width: 1024px) 492px, calc((100vw - 40px) / 2)"`
- **Photo viewer**: unchanged, the copy only (no `srcset`).

If the overview's grid or the page's padding changes later, these values change with it;
keep them next to the components that own the layout, not in one shared constant that hides
the arithmetic. Photos wider than 4:3 are cropped by `object-cover`, so their visible width
is less than the `w` label; that slight softness for panoramas is accepted.

**Keyboard and screen reader: unchanged.** Same elements, order and alt texts (cards keep
`alt=""` beside the project title; tiles keep "<project>, <date>"). A rebuild announces
nothing (no live region).

**Review (2026-11-24, ux-designer): matches the design; no differences to fix.** Looked at the
build on the dev server with seeded demo data plus two generated photos (4000×3000 and
3000×4000, fine diagonal lines and text), side by side with `origin/main` (7ef8fa9), at the
laptop (1280×800 @1.5), Fold inner (840×900 @2.625) and Pixel 7 (412×915 @2.625) sizes.

- `sizes`: `CARD_SIZES` (ui.tsx, next to `ProjectCard`) and `TILE_SIZES` (ProjectPage.tsx) are
  the designed strings character for character, and every card and tile in the browser
  carried them at all three sizes.
- Owner renders once: `PhotoWithSrcset` returns nothing until both object URLs exist, then one
  `<img>` with `src`, `srcset` and `sizes` together; no `srcset` change was observed after the
  image appeared. Without a thumbnail on the device it falls back to the copy, as designed.
  `width`/`height` stay the copy's, `loading="lazy"` stays; alt texts unchanged (`""` on
  cards, "Zaagbok, 1 nov 2026" on tiles).
- Viewer unchanged: still `usePhotoUrl(photo, 'copy')`; its images have no `srcset` and load
  the copy (1920 and 2560 px), same as on main.
- Rebuild invisible: nothing in the UI reports it (no text, no status-bar count; it writes no
  outbox row); e2e/thumbnails.spec.ts, run here against the dev server, passed 3 of 3,
  including the check that the page text stays identical and the tile keeps a loaded image
  and its alt throughout, ending labelled 1280w. Failures only `console.warn`.
- Visually: the laptop tile is clearly sharper than on main (main enlarges a 512/384 px
  thumbnail, the line pattern turns to mush and the text is soft; now 1280/960 px, crisp).
  The laptop card is now a 1280 px image rather than the 2560 px copy; main showed faint
  moiré bands in the line pattern, the branch is even. Layout, crop and corners are identical.
- Accepted, as in the Notes: a visitor's older 512 px thumbnails on the NAS are labelled 1280w
  and stay as soft as today until Q-007.

# Test

**Tester, 2026-11-24, at 8688e46 (branch `t-0037-sharp-photos`, up to date with `origin/main`
7ef8fa9). Verdict: passed; Done when 6 remains for Sander after the deploy.**

CI (run 45398716208, attempt 1, on 8688e46): `checks / checks` pass (vitest `409 passed | 26
skipped`, Playwright `81 passed`, no `flaky` line; the workflow fails on one),
`pocketbase-auth` pass, Netlify preview pass; the e2e shard jobs are skipped by design (e2e runs
inside `checks / checks`).

Local, after `rm -rf node_modules` and `pnpm install --frozen-lockfile`:

- `pnpm run typecheck`: `tsc --noEmit`, no errors.
- `pnpm test`: `Test Files 33 passed | 3 skipped (36)`, `Tests 409 passed | 26 skipped (435)`
  (the skipped ones need a throwaway PocketBase; run below).
- `pnpm run build`: ok (`precache 23 entries`, `dist/sw.js`).
- `E2E_PORT=4794 pnpm run test:e2e`: `79 passed`, `2 skipped`.
- `pnpm exec harness check`: tasks, decisions (45 records, 1 overrule valid), engineers,
  generated files all ✓.

Done when 1 (`e2e/sharp-photos.spec.ts`), on this branch, all 9 within 0.9 to 3:

```
viewport | place | photo     | CSS px | DPR   | delivered | r
laptop   | card  | landscape |  320.0 | 1.5   |      1280 | 2.67
laptop   | tile  | portrait  |  492.0 | 1.5   |       960 | 1.30
laptop   | tile  | landscape |  492.0 | 1.5   |      1280 | 1.73
fold     | card  | landscape |  258.7 | 2.625 |      1280 | 1.89
fold     | tile  | portrait  |  400.0 | 2.625 |      1920 | 1.83
fold     | tile  | landscape |  400.0 | 2.625 |      1280 | 1.22
phone    | card  | landscape |  380.0 | 2.625 |      1280 | 1.28
phone    | tile  | portrait  |  186.0 | 2.625 |       960 | 1.97
phone    | tile  | landscape |  186.0 | 2.625 |      1280 | 2.62
```

The same spec on a worktree of `origin/main` (7ef8fa9), built there: **failed**, 7 soft
failures (e.g. `Expected: <= 3, Received: 5.333…`; `Expected: >= 0.9, Received: 0.520…`):

```
laptop   | card  | landscape |  320.0 | 1.5   |      2560 | 5.33
laptop   | tile  | portrait  |  492.0 | 1.5   |       384 | 0.52
laptop   | tile  | landscape |  492.0 | 1.5   |       512 | 0.69
fold     | card  | landscape |  258.7 | 2.625 |      2560 | 3.77
fold     | tile  | portrait  |  400.0 | 2.625 |       384 | 0.37
fold     | tile  | landscape |  400.0 | 2.625 |       512 | 0.49
phone    | card  | landscape |  380.0 | 2.625 |      2560 | 2.57
phone    | tile  | portrait  |  186.0 | 2.625 |       384 | 0.79
phone    | tile  | landscape |  186.0 | 2.625 |       512 | 1.05
```

Done when 2 (`e2e/photos.spec.ts`): `stripes: copy {"type":"image/webp","width":2560,"height":1707,"mean":127,"sd":0}, thumbnail {"type":"image/webp","width":1280,"height":854,"mean":127,"sd":0}`.
The same spec's import test: a 6000×4000 JPEG gives a 2560 px copy and a 1280 px thumbnail.

Done when 3 and 8 (`e2e/thumbnails.spec.ts`, `src/photos/rebuild.test.ts`): pass; the e2e checks
the page text is identical throughout, the tile stays loaded with its alt, 512w becomes 1280w,
outbox 0, `uploads`/`updatedAt` unchanged, a 400 px photo only measured and unchanged after a
reload. Done when 4 and 7 (`e2e/thumbnails.spec.ts`, `src/components/PhotoImage.test.tsx`):
pass; exact `sizes` on every card and tile for owner and `?bezoeker`, viewer image without
`srcset`; the unit test shows a visitor's `srcset` with distinct thumbnail and copy addresses
(`thumb.webp 960w, copy.webp 1920w`), as in the demo visitor view both are one address.
`e2e/visitor.spec.ts` passes.

Flakiness, `--retries 0`:

- thumbnails, sharp-photos, visitor, viewer, design, cover-delete, import specs,
  `--repeat-each 5 --workers 4`: `125 passed`, `10 skipped`.
- thumbnails + sharp-photos, `--repeat-each 10 --workers 6`: `40 passed`.
- `e2e/photos.spec.ts`, `--repeat-each 5 --workers 1` (fixed port 5199): `10 passed`.
- `src/photos` + `PhotoImage.test.tsx`: `74 passed`.

Tried to break it (throwaway probes, not committed):

- **Against a throwaway PocketBase** (`pnpm exec harness backend start`, never the NAS): the
  repository's PocketBase suites (`vitest run src/sync`, `6 passed`, `82 passed`), plus a probe
  with two simulated devices and a fake worker: (1) a photo with a pending upload is skipped
  (`{ measured: 0, rebuilt: 0, failed: [] }`, makeThumbnail not called, thumbnail unchanged);
  (2) after the upload, the phone's rebuild gives `thumbnailWidth` 1280, `updatedAt` and
  `uploads` unchanged, outbox 0, and the next sync sends nothing (`pushed: 0, uploaded: 0`,
  no request to `/collections/photos/records`; NAS thumbnail's sha256 unchanged);
  (3) a second device pulls the photo (`thumbnailWidth` absent, uploads `none`), rebuilds it,
  and its next sync also sends nothing, NAS thumbnail unchanged; (4) a newer record for that
  photo pulled from the NAS keeps the rebuilt thumbnail and its width (`photoFromServer` spreads
  the local photo); (5) a new photo with `thumbnailWidth` 1280 is pushed with body
  `{"projectId",…,"width":2560,"height":1920,"createdAt","updatedAt","deletedAt":""}`: no
  `thumbnailWidth`, and the NAS record has no such field. 2 of 2 passed.
- **Failed rebuild not retried in a loop:** a checker whose `makeThumbnail` always throws, called
  five times (two in a row, three at once): `makeThumbnail` called once, a `console.warn`
  `thumbnails: photo … not checked Error: boom`, thumbnail and `thumbnailWidth` unchanged.
- **Browser** (vite preview): four 4000×3000 photos imported, viewer loads the 2560 px copy
  (`naturalWidth` 2560, no `srcset`); made old (512 px, unmeasured), then reloaded twice within
  1.5 s (interrupting the rebuild) and imported a fifth photo while it ran: the import finished,
  all five end at 1280 px with `thumbnailWidth` 1280, the four old ones keep `uploads` uploaded,
  only the new one is pending, outbox 2 (the new photo's own rows), no console warnings, viewer
  still the copy.
- **Visitor starts no rebuild:** 13 demo photos with `thumbnailWidth` removed, 2.5 s on
  `?bezoeker`: all 13 still unmeasured. Back as owner, every card and tile loads an image
  (`complete`, `naturalWidth` > 0) with a two-candidate `srcset`.
- Read: `needsCheck` skips pending copy or thumbnail; nothing sets an upload back to `pending`
  after `uploaded` (only `addPhotos` writes `pending`), so a rebuilt thumbnail can't be uploaded
  later; the write re-reads the photo in a transaction and only touches `thumbnail` and
  `thumbnailWidth`; `toServer` lists its photo fields explicitly; the rebuild is started only in
  `startOwner`. The trigger after a sync pull (main.tsx, `pulled > 0` at the end of a run) was
  read, not run: production only has a sync engine.

Not run: Done when 6 (Sander on his laptop and the Fold, production, after the merge).

# Log

- 2026-11-24 architect: verified the causes (owner's cards load the 2560 px copy, about 5 to 8x
  downscale; tiles enlarge the 512 px thumbnail 1.4 to 2x); recorded D-0038 (1280 px
  thumbnails, halving steps, srcset/sizes with thumbnail and copy, local rebuild); raised
  Q-007 on replacing the older thumbnails on the NAS, which only a follow-up task waits on;
  size small.
- 2026-11-24 ux-designer: designed (nothing shown during rebuilds, loading unchanged, `sizes` per layout; Done when 7 and 8 added).
- 2026-11-24 developer: built D-0038. `THUMBNAIL_LONG_EDGE` 1280; `encodeScaled` downscales in
  halving steps (`scaleSteps` in resize.ts) for the copy and the thumbnail; cards and tiles
  (owner and `?bezoeker`) use `PhotoImage` with `sizes` (the Design's exact values, kept as
  `CARD_SIZES` next to `ProjectCard` and `TILE_SIZES` in ProjectPage) and a `srcset` of the
  thumbnail and the copy, rendered once both object URLs exist; the owner's overview no
  longer loads the copy as `src`; the viewer is unchanged. The device knows a thumbnail's
  width through a **local-only field `Photo.thumbnailWidth`** (not indexed, so no Dexie
  version; `toServer` lists its fields and doesn't send it): set at import, and by
  `src/photos/rebuild.ts`, which runs 1 s after the owner's app starts and after a sync run
  that pulled records. It measures every unmeasured thumbnail in the photo worker (new job
  `size`), one at a time in the worker's queue, and remakes it from the copy when its width
  differs from a thumbnail made now; it writes only `thumbnail` and `thumbnailWidth` (no
  outbox row, `uploads` and `updatedAt` unchanged, nothing to the NAS, Q-007), skips photos
  whose upload is still pending, and logs a failure with `console.warn` without retrying it
  until the next start. Until measured, a device thumbnail is labelled with the old 512 px
  size (`OLD_THUMBNAIL_LONG_EDGE`); a visitor's by the photo's size at 1280. Demo photos get
  `thumbnailWidth` 1600 (their thumbnail is the copy).
  Stripe test (Done when 2) against today's encoder first: **failed**: copy sd 19.78 (and a
  512 px thumbnail, sd 5.75); with halving: copy 2560×1707 sd 0, thumbnail 1280×854 sd 0.
  Measured-ratio test (Done when 1) on `origin/main` (7ef8fa9): **failed**, 7 of 9 out of range:
  ```
  viewport | place | photo     | CSS px | DPR   | delivered | r
  laptop   | card  | landscape |  320.0 | 1.5   |      2560 | 5.33
  laptop   | tile  | portrait  |  492.0 | 1.5   |       384 | 0.52
  laptop   | tile  | landscape |  492.0 | 1.5   |       512 | 0.69
  fold     | card  | landscape |  258.7 | 2.625 |      2560 | 3.77
  fold     | tile  | portrait  |  400.0 | 2.625 |       384 | 0.37
  fold     | tile  | landscape |  400.0 | 2.625 |       512 | 0.49
  phone    | card  | landscape |  380.0 | 2.625 |      2560 | 2.57
  phone    | tile  | portrait  |  186.0 | 2.625 |       384 | 0.79
  phone    | tile  | landscape |  186.0 | 2.625 |       512 | 1.05
  ```
  With this change (e2e/sharp-photos.spec.ts), all 9 within 0.9 to 3:
  ```
  viewport | place | photo     | CSS px | DPR   | delivered | r
  laptop   | card  | landscape |  320.0 | 1.5   |      1280 | 2.67
  laptop   | tile  | portrait  |  492.0 | 1.5   |       960 | 1.30
  laptop   | tile  | landscape |  492.0 | 1.5   |      1280 | 1.73
  fold     | card  | landscape |  258.7 | 2.625 |      1280 | 1.89
  fold     | tile  | portrait  |  400.0 | 2.625 |      1920 | 1.83
  fold     | tile  | landscape |  400.0 | 2.625 |      1280 | 1.22
  phone    | card  | landscape |  380.0 | 2.625 |      1280 | 1.28
  phone    | tile  | portrait  |  186.0 | 2.625 |       960 | 1.97
  phone    | tile  | landscape |  186.0 | 2.625 |      1280 | 2.62
  ```
  (At 840 px the overview has three columns, as the Design's 832 px breakpoint says.)
  Rebuild and invisibility (Done when 3, 8): e2e/thumbnails.spec.ts plus
  src/photos/rebuild.test.ts; visitor and `sizes` (Done when 4, 7): e2e/thumbnails.spec.ts
  and src/components/PhotoImage.test.tsx. Local runs: `pnpm run typecheck` clean;
  `pnpm test` 33 files, 409 passed, 26 skipped; `pnpm run build` ok;
  `E2E_PORT=4794 pnpm run test:e2e` 79 passed, 2 skipped; new specs `--repeat-each 5`: 30 of
  30 passed; `pnpm exec harness check` all green.
  For the architect: e2e/photos.spec.ts starts a Vite server on a fixed port (5199) in
  `beforeAll`, so `--repeat-each` with more than one worker fails with "Port 5199 is already
  in use" (it passes with `--workers 1`); not changed here.
- 2026-11-24 ux-designer: reviewed: matches the design (sizes exact, image rendered once,
  viewer unchanged, rebuild unseen; tiles visibly sharper and cards free of moiré compared with
  main at all three sizes); to the tester.
- 2026-11-24 tester: passed (Done when 1 to 5, 7 and 8 run, see *Test*; fails on main as
  required; the rebuild never writes an outbox row or uploads, checked against a throwaway
  PocketBase).
  Remaining: Done when 6 (Sander looks on his laptop and the Fold, in production, after his
  devices have rebuilt their thumbnails).
- 2026-11-24 architect: Q-007 answered by D-0039; visitors' soft older photos (the 512 px
  thumbnails still on the NAS) are now T-0038's, not this task's. Done when 6 here is about
  Sander's own devices only.
  Remaining: Done when 6 (Sander looks on his laptop and the Fold, in production, after his
  devices have rebuilt their thumbnails).
- 2026-11-24 architect: Sander's console check in production, laptop, projects page: all 23
  cards at `devicePixelRatio` 1, 320 CSS px wide, loaded the thumbnail (srcset labels
  1280w/2560w, 960w/1920w, 721w/1441w and 1280w/1600w), never the copy. The file choice works
  as designed; the remaining jaggedness (and the tiles' 2.6x downscale at DPR 1) is Chrome
  shrinking a 960 to 1280 px thumbnail 3 to 4x into a 320 px card. Done when 1 allowed up to 3x
  and measured no DPR 1, so it passed. That moves to T-0040 (D-0041, a 640×480 card image).
  Remaining: Done when 6, now confirmed together with T-0040's Done when 8 (Sander looks once
  T-0040 is deployed).
