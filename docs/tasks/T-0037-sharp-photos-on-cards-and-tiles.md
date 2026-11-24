---
id: T-0037
title: "Show photos sharp on the overview's cards and the project page's tiles"
description: "D-0038: 1280 px thumbnails made in halving steps, srcset/sizes with the thumbnail and the copy on cards and tiles for owner and visitor, and each device rebuilding its older thumbnails from its copy; nothing changes on the NAS for existing photos (Q-007)."
status: Open
size: small
depends_on: []
decisions: [D-0038, D-0003, D-0015, D-0002, D-0023, D-0007, G-0019]
raised_on: 2026-11-24
done_on: ""
result: []
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

**`sizes`** (root font size 16 px; `main` is `max-w-5xl` = 1024 px with `p-4`, so the content
is min(100vw, 1024 px) − 32 px; 100vw overstates by a scrollbar's width, which only errs
towards a sharper pick). The same values for the owner and a visitor (`?bezoeker` uses the
same pages):

- **Overview card** (`auto-fill minmax(16rem, 1fr)`, `gap-4`): one column below 560 px, two
  from 560, three from 832; at 1056 px and wider the content is capped and a card is
  330.67 px (four columns never fit):
  `sizes="auto, (min-width: 1056px) 331px, (min-width: 832px) calc((100vw - 64px) / 3), (min-width: 560px) calc((100vw - 48px) / 2), calc(100vw - 32px)"`
- **Day tile** (`grid-cols-2 gap-2`):
  `sizes="auto, (min-width: 1056px) 492px, calc((100vw - 40px) / 2)"`
- **Photo viewer**: unchanged, the copy only (no `srcset`).

If the overview's grid or the page's padding changes later, these values change with it;
keep them next to the components that own the layout, not in one shared constant that hides
the arithmetic. Photos wider than 4:3 are cropped by `object-cover`, so their visible width
is less than the `w` label; that slight softness for panoramas is accepted.

**Keyboard and screen reader: unchanged.** Same elements, order and alt texts (cards keep
`alt=""` beside the project title; tiles keep "<project>, <date>"). A rebuild announces
nothing (no live region).

# Test

# Log

- 2026-11-24 architect: verified the causes (owner's cards load the 2560 px copy, about 5 to 8x
  downscale; tiles enlarge the 512 px thumbnail 1.4 to 2x); recorded D-0038 (1280 px
  thumbnails, halving steps, srcset/sizes with thumbnail and copy, local rebuild); raised
  Q-007 on replacing the older thumbnails on the NAS, which only a follow-up task waits on;
  size small.
- 2026-11-24 ux-designer: designed (nothing shown during rebuilds, loading unchanged, `sizes` per layout; Done when 7 and 8 added).
