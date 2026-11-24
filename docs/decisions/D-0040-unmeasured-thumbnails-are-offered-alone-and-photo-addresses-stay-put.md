---
id: D-0040
title: "A thumbnail this device hasn't measured is offered alone, and a shown photo keeps its addresses while its files are the same"
description: "Adds to D-0038: on cards and tiles a stored photo whose thumbnail width isn't measured yet is shown from its thumbnail only, without the copy as a srcset candidate; and the object URLs of a stored photo stay the same while its copy and thumbnail are the same files, so a write to photos doesn't reload every card."
status: Accepted
date: 2026-11-24
decided_by: architect
overrules: []
replaces: []
replaced_by: []
resolves: []
tags: [photos]
---

# Context

Sander (Engineer), 2026-11-24, after T-0037 (D-0038) and T-0038 (D-0039) were deployed: "I
did notice the jagged lines being gone on the projects page, however, after an update, they
came back."

Reproduced by the architect in Chromium on the production build (generated 4000×3000 photo,
overview card), see T-0039:

- **A thumbnail not measured yet makes the card take the 2560 px copy.** `thumbnailLabel`
  (src/components/PhotoImage.tsx) labels such a thumbnail with the smallest width an older one
  can have (512w), as T-0037 designed. At a pixel ratio of 2 (laptop at 200 % or zoomed) or
  2.625 (the Fold), 512w is less than the card needs, so Chrome takes the copy: the jagged
  cards of before T-0037. It lasts until the background rebuild (src/photos/rebuild.ts) has
  measured that photo. Every photo downloaded from the NAS starts that way (`downloadedPhoto`
  sets no width), and so does every photo whose upload is still pending or whose rebuild
  failed in this session.
- **Every write to `photos` gives every card new addresses.** Dexie returns new Blob objects
  on each live-query run, and `usePhotoSources` makes object URLs per Blob object, so a write
  to any photo (T-0038's per-photo `thumbnailOnNas`, the rebuild, a sync, an import in
  another tab) swaps `src` and `srcset` on every card already shown (3 attribute changes per
  write in the test) and the browser loads and chooses again. Chrome kept the thumbnail in the
  test, but it reloads and decodes every cover on each write, and each new choice is made
  again from the label of that moment.

# Decision

- **Unmeasured: thumbnail only.** On cards and tiles (`PhotoImage` with `sizes`), a stored
  photo whose `thumbnailWidth` is not set is shown from its thumbnail, without the copy as a
  `srcset` candidate. Once measured, both candidates with their real widths, as D-0038 says.
  A visitor's photos (`copyUrl`) are unchanged: labelled at the current thumbnail width.
- **Addresses stay put.** A stored photo's object URLs for its copy and thumbnail are made
  once per file and kept while the file is the same; they change only when that photo's copy
  or thumbnail itself is replaced (a rebuild of that photo, a sync that takes over another
  file), and are revoked when no shown photo uses them any more. A write that changes only
  other fields or other photos leaves the `<img>` attributes as they are.

# Rationale

The copy is the one thing a card must never fall back to without a reason: it is what made
cards jagged before T-0037. An unmeasured thumbnail is at worst an older 512 px one, a little
soft for the seconds until the rebuild replaces it; the rebuild writes the width, and the card
switches to the full `srcset` then. Keeping the addresses removes a reload of every cover per
write (T-0038 writes once per photo, so dozens in a row after an update) and keeps the
browser's choice stable. Both are reversible front-end rules: no stored field, no sync change.

# Consequences

- T-0037's design note "without a measured width, labelled the smallest it can be" no longer
  holds for stored photos; a tile at a high pixel ratio may show an older 512 px thumbnail
  soft for a moment instead of the copy.
- The object-URL lifetime moves out of a per-render effect; it needs care not to leak (revoke
  what no longer shows) nor to revoke an address an `<img>` still uses.

# Guidance for agents

- Never offer the copy on a card or tile for a stored photo without a measured thumbnail
  width.
- Don't key object URLs on Blob object identity: Dexie hands out new Blob objects for the same
  stored file on every query.
- Keep the visitor path (`copyUrl`) and the viewer (the copy, `usePhotoUrl`) as they are.
