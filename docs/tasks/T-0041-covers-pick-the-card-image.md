---
id: T-0041
title: "Make covers and day tiles really show the card image when Chrome has already loaded a larger one"
description: "D-0042: Chrome takes a larger srcset candidate whose address it already loaded in the page, so after T-0040 covers kept the 1280 px thumbnail (and, after the viewer, would take the copy); give each card's and tile's srcset addresses of its own per place and candidate set, and check the decoded width of currentSrc in every state the app passes through."
status: Doing
size: small
depends_on: [T-0040]
decisions: [D-0042, D-0041, D-0040, D-0038, D-0006, D-0023, G-0019, G-0012, G-0031, G-0032]
raised_on: 2026-11-25
done_on: ""
result: [https://github.com/SanderGeraedts/diy-projects/pull/74]
---

# Goal

Sander (Engineer), 2026-11-25, in production after T-0040 (PR #73) on his laptop (Chrome, pixel
ratio 1, cards 320 CSS px): the covers on the projects page are still jagged. In his console
check, 20 of 23 cards had `640w` in their `srcset` (`640w/1280w/2560w`, `640w/960w/1920w`,
`640w/1280w/1600w`), yet `currentSrc === src`. `window.open(currentSrc)` opened a 1280 px
image: the thumbnail, not the 640×480 card image. The other 3 cards have no card image
(`1280w/2560w`, `721w/1441w`) and show the thumbnail as D-0040 expects.

**Root cause** (reproduced by the architect, in D-0042 *Context*). Chrome first chooses the
card image, then switches to a larger candidate if that one's address is already in its memory
cache (Blink's `AvoidDownloadIfHigherDensityResourceIsInCache`). D-0040's stable object URLs
keep the thumbnail's address the same from before the card image existed. So every cover that
was loaded before the background pass made its card image keeps the thumbnail. Remounting
doesn't help: a new `<img>` does the same. The same happens with the copy once the photo
viewer has loaded it under the same address. Then a card picks the 2560 px copy, which is
worse. React's attribute order and `sizes="auto, …"` are not the cause.

Deliver D-0042:

1. **Owner:** in `PhotoWithSrcset` (`src/components/PhotoImage.tsx`), the thumbnail's and the
   copy's object URLs in a `srcset` are kept per photo, file, size and type (as now), and also
   per `sizes` value and candidate set. They are never shared with `usePhotoUrl`'s single-file
   addresses (the viewer, `SinglePhoto`, the D-0040 thumbnail-alone path) or with another place.
   When the card image arrives or the thumbnail is measured, the new `srcset` names new
   addresses. The `<img>` stays mounted and shows its loaded image until the new choice has
   loaded. A write to other fields or other photos still changes no attribute (T-0039).
2. **Visitor:** the thumbnail's and the copy's addresses in a visitor card's or tile's `srcset`
   carry a place marker in their query (for example `&in=card` / `&in=tile`), so they differ
   from the viewer's copy address. `cardUrl` is unchanged. The demo visitor view has one
   address per photo. It gets the marker too, or the developer shows that it can't hit the
   case.
3. **No other change:** `CARD_SIZES`, `TILE_SIZES`, the labels, the files and the viewer stay
   as they are.

What Sander sees: the same pages. Covers and day tiles are smooth on his laptop at 100 %, also
right after the app has made card images and after he has opened a photo and gone back. The Fold
and his phone are as sharp as now.

# Done when

"Shown width" below is the decoded width of the file behind `currentSrc`:
`(await createImageBitmap(await (await fetch(img.currentSrc)).blob())).width`. Never
`naturalWidth`, which `w` descriptors divide by the chosen density (320 for both 640w and 1280w
in a 320 px card).

1. **Reproduce first** (new e2e, `e2e/card-choice.spec.ts`, Chromium, laptop 1280×800 at pixel
   ratio **1**, generated photos in real IndexedDB, never the NAS, G-0019). Seed at least **12
   projects**, each with a generated 4000×3000 cover, so the overview has many cards like
   Sander's. Assert the **shown width is 640 on every card** in each state:
   - **a. first load:** card images present before the page opens (import, as
     `e2e/sharp-photos.spec.ts`);
   - **b. card image added while open:** photos stored without a card image and measured
     (made so in the test, as `e2e/card-images.spec.ts`). Open the overview, wait until every
     card shows the thumbnail, let the background pass add the card images, then poll: within
     10 s every card's `srcset` has `640w` **and** its shown width is 640. The image never
     becomes empty while this happens (the T-0040 check);
   - **c. unmeasured first:** as b, but the thumbnail is also unmeasured (D-0040 path,
     thumbnail alone), so the first render offers only the thumbnail;
   - **d. after the viewer:** from a project page, open the cover photo in the viewer (it loads
     the copy), go back to the project page and then to the overview without a reload. Every
     card's shown width is 640. On the project page at the same viewport, each day tile's
     shown width ÷ (CSS width × pixel ratio) is at most 2.2 and never the copy;
   - **e. reload after b:** still 640 on every card.

   **It must fail on `origin/main` at 9a8ce86 or later in b, c and d.** Run `pnpm run build` on
   main first (lesson of T-0040), and paste the failing output into *Test*: the architect
   expects 1280 in b and c, and 2560 for the viewed photo's card in d. Run it headless and
   once headed (`--headed`), and say in *Test* whether they differ. The architect saw no
   difference.
2. **Band still holds:** `e2e/sharp-photos.spec.ts` (every viewport and pixel ratio, r between
   0.7 and 2.2) and `e2e/card-images.spec.ts` pass unchanged. Add one row to the card-images
   spec: after the background pass, the shown width at pixel ratio 1 is 640, not only `640w`
   in `srcset`.
3. **Addresses** (unit, `src/components/PhotoImage.test.tsx`): for a stored photo with a card
   image,
   - re-rendering with the same files and a write to another field gives byte-identical `src`
     and `srcset` (T-0039 stays);
   - a card and a tile of the same photo don't share a thumbnail or copy address;
   - the card's `srcset` and `usePhotoUrl(photo, 'copy')` / `'thumbnail'` don't share an
     address;
   - when `card` and `cardWidth` are added, the new `srcset`'s thumbnail and copy addresses
     differ from the ones before;
   - addresses no mounted image uses are revoked after `REVOKE_AFTER_MS`.
4. **Visitor** (unit, and a `*.pocketbase.test.ts` on `pnpm exec harness backend start`):
   - a visitor card's `srcset` has `<cardUrl> 640w` unchanged, and thumbnail and copy addresses
     with the place marker, unlike the viewer's `copyUrl`;
   - signed out, a public photo's marked thumbnail and copy addresses answer 200 with the same
     bytes as the unmarked ones;
   - a private project's photo answers 404 to the marked address, as to the unmarked one.
   `e2e/visitor.spec.ts` passes.
5. `pnpm run typecheck`, `pnpm test`, `pnpm run test:e2e`, `pnpm run build` and
   `pnpm exec harness check` pass, and CI is green on the first attempt.
6. **Sander, in production, after the deploy,** on his laptop at 100 % and on the Fold: the
   covers on the projects page and the photos on a project page look smooth, not jagged, also
   after opening a photo and going back. In the console of the projects page:

   ```js
   Promise.all([...document.querySelectorAll('a img')].map(async i => [devicePixelRatio, Math.round(i.getBoundingClientRect().width), i.srcset.includes(' 640w'), (await createImageBitmap(await (await fetch(i.currentSrc)).blob())).width])).then(r => console.table(r))
   ```

   Expected on the laptop: every row with `true` in the third column shows **640** in the
   fourth. Once as a visitor (a private window on the public address): the same. The task stays
   *Doing* with `Remaining:` until he confirms. His confirmation also closes T-0040's Done when
   8 and T-0037's Done when 6.

# Notes

- **Sizing: small** (G-0031). It is a fix inside existing cards and tiles, with no new screen,
  route, collection or service, and the layout, crop and words don't change. Done when 6 says
  what Sander sees. No design before the build. The UX designer reviews afterwards, by eye at
  pixel ratio 1 and on the Fold viewport, that nothing flashes or shifts when the card image
  arrives.
- **The architect's evidence** is the table in D-0042 *Context*: a throwaway script in
  Playwright's Chromium 159.0.8154.6, headless and headed. It isn't in the repository, and Done
  when 1 is its repository form. React 19.3.1 sets `srcSet` and then `src` after every other
  attribute (`setInitialProperties`, case `img`, in `react-dom-client`). Its `commitMount`
  sets `src` again after insertion. Neither changes the choice.
- **Fixes considered and not chosen** (D-0042 *Rationale*): reordering attributes, `src` = the
  card image, remounting with `key`, `<picture>`. Each still names an address Chrome has
  cached.
- **Reload:** a reload makes new object URLs, so the owner's covers should pick the card image
  after one. That holds only until the next background pass, new download or viewer visit,
  which is why the fix is needed. Sander's reload result, when forwarded, goes in the *Log*.
- Read: `src/components/PhotoImage.tsx` (`useStoredUrl`, `fileKey`, `usePhotoUrl`,
  `useCardUrl`, `PhotoWithSrcset`), `src/components/PhotoImage.test.tsx`,
  `src/components/ui.tsx` (`CARD_SIZES`), `src/routes/ProjectPage.tsx` (`TILE_SIZES`),
  `src/viewer/PhotoViewer.tsx` (`usePhotoUrl(photo, 'copy')`), `src/public/source.ts`
  (`PublicPhoto`, `getURL`), `backend/pb_hooks/photo_files.pb.js`, `e2e/sharp-photos.spec.ts`
  (the decoded-width helper), `e2e/card-images.spec.ts` (photos without a card image), and
  `src/sync/cards.pocketbase.test.ts` (the visitor check's style). Earlier tasks: T-0037,
  T-0039 (D-0040, stable addresses), T-0040 (D-0041).
- Throwaway backends only (`pnpm exec harness backend start`), never the NAS (G-0019). Never
  write the NAS's host, tailnet name or a dataset path anywhere.
- Lesson of T-0036: fetch and merge `origin/main` before starting and again before opening the
  pull request.

# Design

Nothing new to design (size small). The UX designer reviews after the build.

**Review** (UX designer, 2026-11-25). Looked at on the dev server with the seeded demo data plus
generated 4000×3000 covers in the browser's own IndexedDB (never the NAS), in Playwright's
Chromium at 1280×800 pixel ratio 1 (12 projects) and on the Fold viewport (840×900, 2.625, 8
projects), with the same throwaway script run against `origin/main` (9a8ce86) for comparison.
A per-frame sampler recorded, for every card and tile, an empty image, a remount, a move or
resize and the srcset label of what it shows, plus Chrome's layout shifts; screenshots before,
every 0.4 s during and after the background pass. Following D-0043, which candidate is shown was
read from the label of `currentSrc` while the app ran, and the file behind `currentSrc` was decoded
only at the very end.

- **Card image arriving while open** (b: thumbnail measured; c: thumbnail alone first). Laptop:
  every Bok card goes from the thumbnail to the 640 px card image within the pass; no image empty,
  remounted, moved or resized, no layout shift, the screenshots before, during and after look the
  same apart from sharpness. On main the same run ends on 1280w in b and c (the bug). Fold: the
  cards keep the 1280 px thumbnail (r 1.88), also without empty frames, moves or shifts. Matches.
- **After the viewer** (d). Laptop: the tile shows 640w (main: 2560w, the copy); back on the
  overview every card shows 640w (main: Bok 01 at 2560w). Fold: tile 1280w (r 1.22), cards 1280w.
  Matches.
- **After a reload** (e): 640w on every laptop card; decoded at the end: 640 for every card
  (CSS 320 px × 1). Fold: 1280 for CSS 259 px × 2.625. Matches.
- **Navigation stays instant.** Click to loaded image: overview to project 68–86 ms, project to
  viewer 61–66 ms, back to project 21–25 ms, back to overview 21–30 ms; main 71 / 63 / 11 / 28 ms.
  Coming back, cards show their image from the second frame, as on main. Same.
- **Visitor view** (`?bezoeker`, demo): cards and tiles keep `blob 1280w, blob 1600w` without a
  marker, all loaded; the overview, Tuinbank page and viewer look as on main. Unchanged.
- Not from this change: a small layout shift (0.02, the project page's footer for one frame
  before the timeline) shows now and then on entering a project page, on main as well (1 in 24
  rounds on main, 0 in 24 on this branch, once in a single run of each). Recorded here, not a
  blocker.

Verdict: matches; nothing to fix before the tester.

# Test

Developer, 2026-11-25, `e2e/card-choice.spec.ts` (Done when 1), Playwright's Chromium
159.0.8154.6, 1280×800 at pixel ratio 1, 12 projects with a generated 4000×3000 cover each.
`pnpm run build` first in both runs. Abridged to Bok 01; the other 11 cards show the same in
every state.

**Before the fix** (the source of `origin/main` at 9a8ce86, this branch before the change):

```
a. first load:
  Bok 01 | shown  640 | srcset blob 640w, blob 1280w, blob 2560w
b. card image added while open, before the pass:
  Bok 01 | shows 1280w | srcset blob 1280w, blob 2560w
b. card image added while open:
  Bok 01 | shown 1280 | srcset blob 640w, blob 1280w, blob 2560w
e. reload after b:
  Bok 01 | shown  640 | srcset blob 640w, blob 1280w, blob 2560w
c. unmeasured first, before the pass:
  Bok 01 | shows src | srcset
c. unmeasured first:
  Bok 01 | shown 1280 | srcset blob 640w, blob 1280w, blob 2560w
d. tile: shows 2560w, CSS 492.0 px × pixel ratio, r 5.20
d. after the viewer:
  Bok 01 | shown 2560 | srcset blob 640w, blob 1280w, blob 2560w
  (Bok 02 to Bok 12: shown 640)
    Error: b. card image added while open: Bok 01 shown width   Expected: 640  Received: 1280
    ... (12 cards in b, 12 in c)
    Error: d: the tile never shows the copy
    Error: d: tile shown width ÷ CSS width × pixel ratio
    Error: d. after the viewer: Bok 01 shown width             Expected: 640  Received: 2560
  1 failed   (27 soft failures: b 12, c 12, d tile 2, d viewed card 1)
```

As the architect expected: 1280 in b and c, 2560 for the viewed photo's card and its tile in d;
a and e pass. Headed (`--headed`): the same output, the same 27 failures.

**After the fix:**

```
a. first load:          Bok 01 | shown  640 | srcset blob 640w, blob 1280w, blob 2560w
b. ... before the pass: Bok 01 | shows 1280w | srcset blob 1280w, blob 2560w
b. card image added while open:  Bok 01 | shown  640
e. reload after b:               Bok 01 | shown  640
c. ... before the pass: Bok 01 | shows src | srcset
c. unmeasured first:             Bok 01 | shown  640
d. tile: shows 640w, CSS 492.0 px × pixel ratio, r 1.30
d. after the viewer:             Bok 01 | shown  640
  ok 1 [pixel] › e2e/card-choice.spec.ts › every cover shows the 640 px card image at pixel ratio 1, in every state (26.4s)
```

Every one of the 12 cards shows 640 in every state. Headed: the same, passed (28.8s).
`--repeat-each 3` with `e2e/card-images.spec.ts`: 6 passed.

**A trap for checks** (found while writing the spec): fetching an address (as the decoded-width
helper does) takes it out of Chrome's memory cache, which hides the preference. The first draft
of the spec decoded every card before the pass and passed on main. So the spec reads which
candidate an image shows by its label before the choice (`chosen`), and decodes `currentSrc`
only after it; the viewer's copy is checked by `naturalWidth` (no srcset there) and never
fetched; the tile in d is read by its label (the file's real width, D-0038), so that the copy's
address is still cached when the overview is checked.

Done when 2: `e2e/sharp-photos.spec.ts` unchanged and passing; `e2e/card-images.spec.ts`
passing, with the new row (after the background pass at 1280×800, pixel ratio 1, the decoded
width of `currentSrc` is 640). Done when 3: 12 unit tests in `src/components/PhotoImage.test.tsx`
fail without the change and pass with it. Done when 4: `src/sync/cards.pocketbase.test.ts` on
`pnpm exec harness backend start` (throwaway, port 8097): 4 passed, among them the marked
thumbnail and copy (`?in=card`, `?in=tile`) at 200 with the same bytes as the plain ones and
404 for a private photo. The demo visitor view keeps its one object URL per photo without a
marker: its thumbnail and copy are one address of one file and it has no card image, so there
is no larger file Chrome could prefer (unit test). `e2e/visitor.spec.ts` passes.
Done when 5 locally: `pnpm run typecheck` clean, `pnpm test` 465 passed / 37 skipped,
`pnpm run test:e2e` 82 passed / 2 skipped, `pnpm run build` and `pnpm exec harness check` pass.

**Tester, 2026-11-25, at a274da7. Verdict: sent back.** The fix works in every state and
every attack below; `e2e/card-choice.spec.ts` itself is flaky in CI, so Done when 5 ("CI is
green on the first attempt") fails.

CI (`gh pr checks 74`, run 45577651783 on a274da7): `checks / checks fail`, `pocketbase-auth
pass`. The new spec failed its first attempt and passed only on the retry:

```
##[error]  1) [pixel] › e2e/card-choice.spec.ts:202:1 › every cover shows the 640 px card image at pixel ratio 1, in every state
   Error: route.continue: Route is already handled!
     84 |   await page.context().route(pattern, async (route) => {
     85 |     await gate
   > 86 |     await route.continue()
   Error: page.waitForTimeout: Test ended.
   > 192 |     await page.waitForTimeout(100)
       at cardImageArrives (e2e/card-choice.spec.ts:192:16)
       at e2e/card-choice.spec.ts:230:3
  1 flaky
  83 passed (2.4m)
##[error]A test passed only on a retry. Make it steady instead: a retry must not hide it (G-0031).
```

It broke right after "c. unmeasured first, before the pass" was printed, at `release()` in
`holdBackgroundPass`. The two earlier CI runs on this branch (60664bf, 37e05ce; same code,
only docs changed since) passed 84/84, so it is 1 flaky run in 3. Not reproduced locally
(`--repeat-each 10 --workers 5`: 10 passed). Likely cause (not proven): the context-wide
route also holds a worker request of the page from step e (the reload), which `page.goto('/')`
in `cardImageArrives` then cancels; Playwright handles that held route itself, and the later
`route.continue()` throws. The fix and its proof are the developer's.

Done when 1, against a fresh build of `origin/main` (9a8ce86) in a separate worktree with the
branch's spec copied in, no other preview running (`netstat`: nothing on 4173/439x),
`rm -rf dist && pnpm run build`, `E2E_PORT=4391 pnpm exec playwright test e2e/card-choice.spec.ts`:

```
b. card image added while open, before the pass:
  Bok 01 | shows 1280w | srcset blob 1280w, blob 2560w
b. card image added while open:
  Bok 01 | shown 1280 | srcset blob 640w, blob 1280w, blob 2560w
e. reload after b:
  Bok 01 | shown  640 | srcset blob 640w, blob 1280w, blob 2560w
c. unmeasured first:
  Bok 01 | shown 1280 | srcset blob 640w, blob 1280w, blob 2560w
d. tile: shows 2560w, CSS 492.0 px × pixel ratio, r 5.20
d. after the viewer:
  Bok 01 | shown 2560 | srcset blob 640w, blob 1280w, blob 2560w
     12 Error: b. card image added while open     (Received: 1280)
     12 Error: c. unmeasured first                (Received: 1280)
      2 Error: d   (tile never the copy: 2560w; r 5.203252032520325 > 2.2)
      1 Error: d. after the viewer                (Received: 2560)
  1 failed
```

Headed (`--headed`) on main: the same 27 failures, the same values. No difference.

On the branch, clean (`pnpm install --frozen-lockfile`, `rm -rf dist && pnpm run build`):
`--repeat-each 4 --workers 2`: `4 passed (56.5s)`; `--repeat-each 10 --workers 5`:
`10 passed (1.1m)`; `--headed`: `1 passed (29.4s)`, every card `shown 640` in a, b, c, d, e;
the tile in d `640w, r 1.30`.

Done when 2 and affected specs: `card-images sharp-photos cover-after-update thumbnails visitor
viewer --repeat-each 3 --workers 4`: `63 passed (1.5m)`.

Done when 3 and unit: `pnpm run typecheck` clean; `pnpm test`: `Test Files 34 passed | 5
skipped (39)`, `Tests 465 passed | 37 skipped (502)`; `PhotoImage.test.tsx` and `src/public`:
`53 passed`, including all six D-0042 address tests and both visitor tests.

Done when 4: `pnpm exec harness backend start` (throwaway, port 8097, CI's throwaway superuser
names), `src/sync/cards.pocketbase.test.ts`: `Tests 4 passed (4)`, among them "T-0041
(D-0042): a visitor gets the same bytes at the place-marked thumbnail and copy addresses, and
a private photo's stay 404". Signed out, a public photo's thumbnail at the plain, `?in=card`
and `?in=tile` address: each `200`, `Cache-Control: max-age=2592000,
stale-while-revalidate=86400`, the same `Content-Length` (217988): still cacheable.
`harness backend stop` after. CI's `pocketbase-auth` passed as well.

`pnpm exec harness check`: tasks, decisions, engineers and generated files ✓.

Tried to break it (a throwaway spec, deleted afterwards; 4 projects × 3 generated 4000×3000
photos, `URL.createObjectURL`/`revokeObjectURL` wrapped to count live and revoked addresses,
each count read 2.6 s after the step, past `REVOKE_AFTER_MS`), laptop 1280×800 @1 and Fold
840×900 @2.625, both passed:

- **Order viewer first, then tile, then overview**, 10 rounds without a reload (project page →
  viewer straight away → next photo → close → read the tiles → back → read the cards). Laptop
  every round: tiles `640w` r 1.30, cards `640w` r 2.00. Fold every round: tiles `1280w` r
  1.22, cards `1280w` r 1.89. Never the copy, always within 0.7–2.2.
- **Leaks:** live object URLs on the overview after each round: `20, 20, 20, 20, 20, 20, 20,
  20, 20, 20` on both viewports. After deleting the cover photo twice: project page 6 then 3,
  overview back to 20, the card moving on to the next photo at `640w` (Fold `1280w`).
- **Revoked address in use:** 0 in every check (src, currentSrc and every srcset address of
  every image), and no broken image.
- The demo projects' cards show `1600w` at r 5 on the laptop: their thumbnail is the SVG copy
  (`src/seed/demo.ts`), a vector, unchanged by this task and not a bug.

Not checked here: Done when 6 (Sander, in production).

**Tester, re-check after the send-back, 2026-11-25, at cc46e66. Verdict: passed.** I checked
only what was sent back.

- **The spec fix** (test only, `e2e/card-choice.spec.ts`): `editPhotos` first leaves the app for
  `/manifest.webmanifest`, so no app runs while the photos are edited. `holdBackgroundPass` is
  now a page route on `/assets/photo\.worker-[^/]+\.js$` (the build's file is
  `photo.worker-DLx7DIgS.js`), set while no app runs. `release` lets the held requests through
  and removes only that handler. The assertions are unchanged. On main the hold still works:
  "b. ..., before the pass: Bok 01 | shows 1280w", "c. ..., before the pass: shows src".
- **CI:** run 45584214667 on cc46e66, `run_attempt` 1. `checks / checks pass`,
  `pocketbase-auth pass`, log `84 passed (1.7m)`, no `flaky` line.
- **Still fails on main:** a fresh worktree at `origin/main` 9a8ce86 with the new spec copied in,
  `pnpm install --frozen-lockfile`, `rm -rf dist && pnpm run build`, nothing else listening,
  `E2E_PORT=4394 pnpm exec playwright test e2e/card-choice.spec.ts --retries 0`:

  ```
       12 Error: b. card image added while open      (Received: 1280)
       12 Error: c. unmeasured first                 (Received: 1280)
        2 Error: d                                   (tile 2560w; Received: 5.203252032520325)
        1 Error: d. after the viewer                 (Received: 2560)
  d. tile: shows 2560w, CSS 492.0 px × pixel ratio, r 5.20
    1 failed
  ```

- **Passes on the branch, steadily** (`pnpm install --frozen-lockfile`, `rm -rf dist && pnpm
  run build`):
  - `card-choice.spec.ts --retries 0 --repeat-each 16 --workers 6`: `16 passed (1.9m)`
  - with `card-images.spec.ts`, `--retries 0 --repeat-each 4 --workers 8`: `8 passed (41.7s)`
  - `--retries 0 --headed`: `1 passed (30.3s)`, `d. tile: shows 640w, ... r 1.30`

  No failures and no flaky runs.

Done when 1–5 are met. Done when 6 (Sander, in production) remains.

# Log

- 2026-11-25 architect: raised from Sander's production check after T-0040 (laptop, pixel ratio 1: `640w` in srcset but `currentSrc` the 1280 px thumbnail). Reproduced in Chromium 159: Chrome takes a larger candidate whose address it has already loaded, and D-0040's stable addresses keep that address. Recorded D-0042 (own addresses per place and candidate set). Size: small.
- 2026-11-25 developer: built D-0042. Owner: a card's or tile's srcset takes its thumbnail and copy object URLs per photo, file, size and type and per place, `sizes` and candidate set (`fileKey(..., set)`); the thumbnail-alone path and `usePhotoUrl` keep the shared single-file addresses; `PhotoImage` gets `place` (`card` in `ProjectCard`, `tile` on the project page). Visitor: `placeUrl` adds `?in=card` / `?in=tile` to the thumbnail and copy; `cardUrl` unchanged; the demo's object URLs are left as they are. New `e2e/card-choice.spec.ts`: on main 27 failures (b 1280, c 1280, d 2560), with the fix 1 passed, headless and headed alike; card-images row added; unit and PocketBase tests as in *Test*. Note for the architect: a check that fetches an address takes it out of Chrome's memory cache and hides this preference (see *Test*).
- 2026-11-25 architect: with the Engineer's go-ahead, proposed the repeated lesson as harness rule G-0033 (https://github.com/SanderGeraedts/harness/pull/23, waits for the Engineer there) and recorded it here as D-0043 (D-0042 covers only the image case); D-0043 is replaced by G-0033 when a harness release carries it.
- 2026-11-25 ux-designer: reviewed: matches. Dev server, demo data plus generated covers, laptop 1280×800 at pixel ratio 1 and Fold, against main for comparison: the card image arrives without flashing, going empty or shifting; after the viewer and a reload every card shows 640 (main: 1280 and 2560); navigation as fast as main; visitor view unchanged. To the tester.
- 2026-11-25 tester: sent back: CI run 45577651783 on a274da7 is red because `e2e/card-choice.spec.ts` passed only on its retry (`route.continue: Route is already handled!` in `holdBackgroundPass`, after "c. unmeasured first, before the pass"); 1 flaky run of 3 on this branch, not reproduced locally. Make the spec steady and show CI green on the first attempt. Everything else passed: it fails on a fresh build of main (27 failures, headless and headed alike) and passes on the branch, as do the affected specs, the unit and PocketBase tests, and the break attempts (no leaked or revoked object URLs in use, the viewer-tile-overview order, the Fold, visitor addresses still cacheable); see *Test*.
- 2026-11-25 developer: send-back fixed: `card-choice.spec.ts` no longer races the app. Cause: `editPhotos` ran in a live app page (after a, and after the reload in e), whose background pass could start, ask for the photo worker and be held by the context-wide route, then cancelled by the next `page.goto` (and could even write card images before the hold). Now `editPhotos` first leaves the app for a static file of the same origin (`/manifest.webmanifest`), so no app runs while the photos are edited or when the hold is set; the hold is a page route on the worker script's exact path, set before the next app starts, and `release` lets the held request through and removes the route. On a fresh build of `origin/main` (9a8ce86, own worktree) it still fails: 27 soft failures (b 1280 ×12, c 1280 ×12, d tile 2560w r 5.20, d Bok 01 2560). With the fix: `--repeat-each 20 --workers 6 --retries 0` 20 passed; `--repeat-each 16 --workers 16` 16 passed; CPU throttled 4× (CDP, a throwaway copy with the 10 s window widened to 40 s) `--repeat-each 6 --workers 6` 6 passed.
- 2026-11-25 tester: passed. Re-checked the send-back at cc46e66: the spec fix (no app runs while photos are edited; a page route on the worker script only), CI run 45584214667 green on its first attempt with no flaky test, the spec still failing on a fresh build of main (27 failures) and steady on the branch (16 + 8 + 1 headed runs with `--retries 0`, no failure). Remaining: Done when 6, Sander in production on his laptop at 100 % and on the Fold, also as a visitor: covers and project photos look smooth, also after opening a photo and going back, and the console table shows 640 in the fourth column for every row with `true` in the third (laptop). His confirmation also closes T-0040's Done when 8 and T-0037's Done when 6.
- 2026-11-25 developer: second send-back (CI run 45586221874 on cb13454: `e2e/thumbnails.spec.ts` "older thumbnails are rebuilt…" passed only on retry; the tile's `naturalWidth` was 0 during the rebuild). Cause: a new candidate set swapped `src`/`srcset` straight to addresses not loaded yet. Fix, atomic by construction (D-0043): `PhotoWithSrcset` renders its first sources at once, but a later change only once a hidden `Image` with the new `srcset` (its `sizes` the `<img>`'s shown width in px, as `auto` gives) has loaded and decoded the candidate it picks; until then the `<img>` keeps its sources, and `useHeldUrls` keeps the object URLs it still shows from being revoked. The thumbnails spec is stricter: a `requestAnimationFrame` watcher counts frames in which the tile has no decoded image (or was replaced) and expects 0; on the previous build it caught 1 in 10 runs. Unit: 2 new tests (no swap and no revoke before the decode; the hidden image gets the new srcset at the shown width), failing without the change. Runs, `--retries 0`: `thumbnails.spec.ts` + `card-choice.spec.ts` `--repeat-each 20 --workers 8` 80 passed; CPU throttled 4× (throwaway copies; card-choice window 40 s) `--repeat-each 5 --workers 6` 20 passed; full e2e 82 passed / 2 skipped; `pnpm test` 467 passed. `card-choice` on a fresh build of `origin/main` (9a8ce86) still fails: 27 soft failures (b 1280 ×12, c 1280 ×12, d tile 2560w r 5.20, d Bok 01 2560).
- 2026-11-25 ux-designer: reviewed again at cc54c09 (atomic swap): matches. Dev server, demo data plus generated covers, never the NAS; 1280×800 at pixel ratio 1 and the Fold (840×900, 2.625). A per-frame check of every card and tile (an image that had been shown going back to loading or empty, a remount, a move, a layout shift) found none while the card image arrived (measured thumbnail; thumbnail alone first), during the background rebuild of older 512 px thumbnails (on the overview and on a project page), after the viewer and after a reload. Each card goes straight from the thumbnail to the card image in one step, with no in-between image. At pixel ratio 1 every card ends on 640 (decoded `currentSrc`, read only at the end, D-0043; 320 CSS px), and the tile after the viewer on 640w. On the Fold, cards and tiles end on the 1280 px thumbnail (r 1.88 and 1.22), never the copy. Delay: each card is sharp 0.19–0.8 s after the background pass starts, card by card as the pass makes them; acceptable, with the old image shown until then. Navigation as before: overview to project 75–97 ms, to the viewer 57–66 ms, back 10–43 ms; 24 rounds of overview, project, viewer and back without a layout shift. To the tester.
