---
id: D-0038
title: "Thumbnails are 1280 px on the long edge; cards and day grids show the thumbnail, with the copy as a srcset candidate"
description: "Adds to D-0003 and D-0015: a photo's thumbnail is 1280 px on the long edge (half the 2560 px copy) instead of about 512; the overview's cards and the project page's tiles, the owner's and a visitor's, show it through srcset and sizes with the copy as the larger candidate; downscales of more than 2x are done in halving steps; each device rebuilds its own older thumbnails from its copy."
status: Accepted
date: 2026-11-24
decided_by: architect
overrules: []
replaces: []
replaced_by: []
resolves: []
tags: [photos, storage]
---

# Context

Sander (Engineer), 2026-11-24, with screenshots: "Most images on the projects page appear
overly sharp and aliased, whereas the images on the log page can look blurry."

The layout is `max-w-5xl` with `p-4`: on a laptop the overview's cards are 320 CSS px wide
(three columns) and the project page's tiles 492 CSS px (two columns). Measured against
what each loads:

- **Overview, owner**: the card loads the 2560 px copy (`coverFile={readOnly ? 'thumbnail' :
  'copy'}`), and the browser shrinks it 5 to 8 times (320 CSS px at a pixel ratio of 1 to
  1.5). Chrome's downscale at that ratio aliases, and every card decodes a 20 MB bitmap.
- **Project page**: the tiles load the 512 px thumbnail (T-0006), but a tile needs 492 CSS px
  × the pixel ratio: 738 px at 1.5, 984 at 2, 1050 on the Fold's inner screen (about 400 CSS
  px at 2.625). The thumbnail is enlarged 1.4 to 2 times, so it looks soft.

D-0003 fixes only the copy (2560 px) and says thumbnails are smaller copies derived from it;
the ~512 px came from T-0006. Considered:

1. **Keep 512 and add a middle size (say 1280) as a fourth file per photo.** The best fit
   for every screen, but it is a new file field on the NAS, a sync change and a migration
   on every device: a data-store change for the Engineer, for a saving that only matters
   to visitors on phones.
2. **`srcset` over the 512 thumbnail and the 2560 copy only.** No new file, but every tile
   on a laptop or the Fold would pick the copy: 0.6 to 0.9 MB each for a visitor over the
   internet, and the same 2.5 to 5 times downscale in the browser.
3. **Make the thumbnail 1280 px, and offer the copy as the larger candidate.** Chosen.

# Decision

- **The thumbnail is 1280 px on the long edge** (exactly half the copy; never upscaled),
  WebP at quality 0.8, derived from the copy as before. It replaces the ~512 px thumbnail
  for every photo added from now on, in the same file of the same record (D-0015).
- **Cards and tiles pick by screen**: the overview's cards (owner and visitor) and the
  project page's tiles show the photo with `srcset` = the thumbnail (its real width) and the
  copy (its width), and `sizes` that match the layout, so the browser takes the thumbnail
  unless the tile needs more pixels than it has. The full-screen viewer keeps the copy.
- **No downscale of more than 2x in one step**: when the copy or the thumbnail is made, a
  source more than twice the target is first halved (each halving one `drawImage` with
  high-quality smoothing) until one last step of at most 2x is left.
- **Each device rebuilds its own older thumbnails** from its copy (local, in the worker, one
  at a time, in the background), including those it downloads from the NAS. Rebuilt
  thumbnails stay on the device: whether they also replace the files on the NAS is Q-007.

# Rationale

1280 px covers the widest tile at a pixel ratio of 2 (984 px) and the Fold's inner screen
for landscape photos, with at most about 2.7 times downscale left for the browser at the
sizes Sander uses; halving from 2560 is the cleanest possible downscale. Where it falls
short (a portrait photo, 960 px wide, on a 1050 px tile), `srcset` lets the browser take the
copy. It needs no new file, field or collection, so nothing changes on the NAS, and a later
middle size can still be added.

# Consequences

- A thumbnail is about 150 to 250 KB instead of about 35 KB: on the device about 20% more
  per photo than now (the copy is 0.6 to 0.9 MB); on the NAS negligible next to the
  originals.
- A visitor loads about 6 times as much per tile as with 512 px thumbnails, also on a phone
  where 512 would do. Tiles load lazily; on a personal site that is accepted. If it starts to
  matter, a middle size (option 1) goes to the Engineer as a data-store change.
- The owner's overview decodes a 1280 px thumbnail per card instead of a 2560 px copy: about
  a quarter of the memory.
- Until Q-007 is answered, photos added before this change keep their 512 px thumbnail on
  the NAS, so a visitor sees those as soft as today; the owner's devices don't, as they
  rebuild their own.

# Guidance for agents

- Read sizes from `src/photos/resize.ts`; don't hard-code 512 or 1280 elsewhere.
- On the device, a `srcset` width must be the image's real width: never label a thumbnail
  with a width it doesn't have (an older 512 px thumbnail labelled 1280w makes the browser
  pick it), so a photo whose thumbnail isn't rebuilt yet is labelled by what it is. A
  visitor can't tell an older thumbnail on the NAS from its record; there the label follows
  from the photo's size, and the older ones being smaller is accepted until Q-007 is
  settled.
- Never upload a rebuilt thumbnail to the NAS until Q-007 is answered by a decision.
- Never point anything but production at the real NAS (G-0019): test with generated images.
