---
id: D-0042
title: "A card's or tile's srcset uses addresses of its own, never one another image or an earlier candidate set has loaded"
description: "Adds to D-0040 and D-0041: Chrome takes a larger srcset candidate whose address it has already loaded in the page, so the thumbnail and copy addresses in a card's or tile's srcset are kept per place and candidate set, apart from the viewer's and from the addresses before the card image arrived; for visitors the same through a marker in the query."
status: Accepted
date: 2026-11-25
decided_by: architect
overrules: []
replaces: []
replaced_by: []
resolves: []
tags: [photos]
---

# Context

After T-0040 (D-0041) was deployed, Sander's covers were still jagged on his laptop (Chrome,
pixel ratio 1, cards 320 CSS px). In the console, 20 of 23 cards had `640w` in their `srcset`,
but `currentSrc` was the `src` (the 1280 px thumbnail), and opening `currentSrc` showed a 1280
px image.

The architect reproduced it in Playwright's Chromium 159 at 1280×800, pixel ratio 1, with
`sizes` as `CARD_SIZES` and object URLs of generated 640/1280/2560 px WebPs, headless and
headed (same result in both):

| state | currentSrc |
|---|---|
| a new `<img>`, attributes in React 19's order (`sizes`, `loading`, then `srcset`, then `src`) | card image |
| the same with `src` set first | card image |
| thumbnail loaded alone first (D-0040 path), then `srcset` gets the card image | **thumbnail** |
| thumbnail and copy loaded first, then `srcset` gets the card image | **thumbnail** |
| the thumbnail's address loaded by another image earlier; a **new** `<img>` with all three | **thumbnail** |
| the same with `src` = the card image | **thumbnail** |
| the copy's address loaded earlier (as the photo viewer does); a new `<img>` with all three | **copy** |
| as row 3, but the new `srcset` uses new object URLs for the same files | card image |
| as row 7, but the card's `srcset` uses its own object URLs | card image |

So Chrome does choose the card image. Then, if a larger candidate's address is already in its
memory cache, it takes that one instead. This is Blink's
`AvoidDownloadIfHigherDensityResourceIsInCache` in its srcset parser. D-0040's stable
addresses keep the thumbnail's address the same from before the card image arrived. Covers
loaded before the background pass made card images therefore keep the thumbnail. A photo
seen in the viewer puts its copy's address in the cache, and the D-0040 thumbnail-alone path
does the same for the thumbnail's address.

React's attribute order isn't the cause: React 19.3.1 sets every other attribute first, then
`srcSet`, then `src` (`setInitialProperties`, case `img`). Making `src` the card image,
remounting with a new `key`, or using `<picture>` (the same selection for each `<source>`)
would not help while the addresses stay the same.

T-0040's checks missed it because its e2e imported photos that had their card image from the
first render, and the card-image spec checked only the `srcset` text after the background pass,
not `currentSrc`.

# Decision

- **Each place has its own addresses.** On cards and tiles (`PhotoImage` with `sizes`), the
  thumbnail's and the copy's addresses in a stored photo's `srcset` are made for that place
  and candidate set: kept per photo, file, the file's size and type (as D-0040), and also the
  `sizes` value and the candidate set (which files are offered, with their labels). They are
  never the address a single-file image uses (the viewer's copy, D-0040's thumbnail-alone
  path, `SinglePhoto`), or another place's.
- **A new candidate set gets new addresses.** When a card or tile's candidates change (the
  card image arrives, the thumbnail is measured), its new `srcset` names addresses not loaded
  in this page before. The `<img>` stays mounted and keeps showing its loaded image until the
  new choice has loaded (T-0037's "render once" rule).
- **D-0040's stability holds within a place.** While a photo's files and its candidate set are
  the same, a write that changes only other fields or other photos leaves the `<img>`
  attributes as they are. Unused addresses are still revoked after `REVOKE_AFTER_MS`.
- **Visitors the same way.** A visitor's thumbnail and copy addresses in a card's or tile's
  `srcset` carry a marker in their query that names the place (for example `&in=card`), so
  they differ from the viewer's copy address. The card image's address (`?thumb=640x480`) is
  only ever used in a `srcset` and needs none. The file hook decides who may load them, as
  for the plain address.
- **Checks measure what is shown.** A check that an image shows the right file decodes the
  file behind `currentSrc`. It never uses `naturalWidth`: with `w` descriptors that is
  divided by the chosen density, so a 640w and a 1280w candidate both report 320 in a 320 px
  card.

# Rationale

The memory-cache preference is Chrome's to make (the HTML standard lets a browser choose any
candidate), so the fix must not depend on Chrome changing it. Giving each place and candidate
set its own addresses is the smallest change that keeps D-0040's two aims (no reload on
unrelated writes, no copy for unmeasured thumbnails) and D-0041's card image. Other options:

- New addresses on every render: these would undo D-0040 and reload every card on each write.
- Choosing the file in JavaScript from the layout width and `devicePixelRatio`: this
  duplicates what `sizes` already says and needs resize and zoom handling.
- Dropping the thumbnail and copy from the cards' `srcset`: Fold and phone cards need the
  thumbnail at 2.625.

# Consequences

- Up to one more object URL per photo on screen (the overview and the project page use
  different places). These are cheap, and only the chosen candidate is decoded.
- A visitor whose card picks the thumbnail or the copy downloads it once more under its marked
  address, even when the viewer already loaded it. A card at a pixel ratio of 1 picks the card
  image, so this happens only on high-density screens.
- Within one place, Chrome can still keep a larger candidate it loaded earlier, for example
  after zooming out from 200 % to 100 % without reloading. This is accepted: the next load
  picks again.
- Every check that an image picks the right file also runs after a candidate set changes and
  after the viewer has shown the photo (T-0041).

# Guidance for agents

- Never let a card's or tile's `srcset` name an address another `<img>` or an earlier
  candidate set has used in the page.
- Keep D-0040: never key on Blob object identity, and never offer the copy for an unmeasured
  thumbnail.
- Assert the decoded width of `currentSrc`, never `naturalWidth`. Assert it in each state the
  app passes through: first load, card image added while open, after the viewer, after a reload.
- Don't change `CARD_SIZES`, `TILE_SIZES` or the candidates' labels to work around a choice.
  The labels must stay the files' real widths (D-0038).
