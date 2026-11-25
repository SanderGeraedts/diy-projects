---
id: T-0041
title: "Make covers and day tiles really show the card image when Chrome has already loaded a larger one"
description: "D-0042: Chrome takes a larger srcset candidate whose address it already loaded in the page, so after T-0040 covers kept the 1280 px thumbnail (and, after the viewer, would take the copy); give each card's and tile's srcset addresses of its own per place and candidate set, and check the decoded width of currentSrc in every state the app passes through."
status: Open
size: small
depends_on: [T-0040]
decisions: [D-0042, D-0041, D-0040, D-0038, D-0006, D-0023, G-0019, G-0012, G-0031, G-0032]
raised_on: 2026-11-25
done_on: ""
result: []
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

# Test

# Log

- 2026-11-25 architect: raised from Sander's production check after T-0040 (laptop, pixel ratio 1: `640w` in srcset but `currentSrc` the 1280 px thumbnail). Reproduced in Chromium 159: Chrome takes a larger candidate whose address it has already loaded, and D-0040's stable addresses keep that address. Recorded D-0042 (own addresses per place and candidate set). Size: small.
