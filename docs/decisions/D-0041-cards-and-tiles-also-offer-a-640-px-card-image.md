---
id: D-0041
title: "Cards and day tiles also offer a 640×480 card image: each device makes its own from its copy and keeps it, and PocketBase makes it from the thumbnail for visitors"
description: "Adds to D-0038 and D-0040, and replaces D-0015 to allow one PocketBase thumb size: the overview's cards and the project page's tiles get a third srcset candidate, a 640×480 centre crop (the cards' and tiles' 4:3 crop at a pixel ratio of 2); the owner's devices make it locally from the copy and never sync it; a visitor gets it from PocketBase's ?thumb=640x480 on the photo's thumbnail; everything else of D-0015 holds."
status: Accepted
date: 2026-11-24
decided_by: engineer
overrules: []
replaces: [D-0015]
replaced_by: []
resolves: []
tags: [photos, storage, sync]
---

# Context

After T-0037 (D-0038) Sander (Engineer) still saw jagged covers on the projects page. On
2026-11-24 he ran T-0039's console check in production on his laptop: all 23 cards at
`devicePixelRatio` 1, each 320 CSS px wide, loaded the thumbnail (srcset labels 1280w/2560w,
960w/1920w, 721w/1441w and 1280w/1600w), never the copy. So the file choice is as D-0038
designed (and D-0040 / T-0039 is not the cause on his laptop). The cause is the size: Chrome
shrinks a 960 to 1280 px thumbnail 3 to 4 times into a 320 px card, and that aliases. Before
T-0037 the 512 px thumbnails needed about 1.6 times and looked fine. The day tiles (492 CSS
px on a laptop) get the same 1280 px thumbnail at 2.6 times at a pixel ratio of 1.

D-0038 already named the way out (its option 1, a middle size) and put it with the Engineer
as a data-store change. Options put to Sander:

1. A fourth file per photo, made by the adding device and synced through the NAS.
2. **Each device makes its own card image from the copy it has, never synced; visitors get
   one that PocketBase makes on request from the thumbnail on the NAS** (one schema option,
   `thumbs`, on the thumbnail field; no new files to sync).
3. Only PocketBase thumbs, for the owner too (the owner's devices work offline from their own
   files, so this would not reach them offline).

Sander chose, in the session of 2026-11-24, word for word: **"Device + PocketBase thumbs
(Recommended)"**.

That conflicts with one line of D-0015 ("The NAS does no image processing; PocketBase's
thumbnail feature isn't used"), so this record replaces D-0015 and restates the rest of it.

Measured by the architect on a throwaway PocketBase 0.40.6 (`harness backend`, never the
NAS), with a generated 1280×960 WebP as a file whose field has `thumbs: ["640x480", "640x640f"]`:
`?thumb=640x480` answered `200 image/png`, 640×480 (PocketBase has no WebP encoder, so a
WebP's thumbs are PNG; `640x640f` gave the same image); `?thumb=320x240`, a size not listed,
answered with the file itself, the WebP, unchanged. The PNG was 135 KB for a line pattern and
456 KB for a noisy gradient; the WebP sources were 550 to 570 KB.

# Decision

**Unchanged from D-0015 (and D-0038, D-0039):**

- A photo record on the NAS has three files: the **original** (byte for byte, D-0003), the
  **2560 px WebP copy** and the **thumbnail** (1280 px, D-0038), both made on the adding
  device. The adding device uploads all three; other devices download only the copy and the
  thumbnail, never the original. A rebuilt thumbnail may replace the one on the NAS (D-0039).
- The NAS never makes copies or thumbnails and never touches the original. The one
  exception is below: PocketBase's thumb of the thumbnail, at one size.

**New: the card image.**

- **Its size: 640×480, a centre crop to 4:3.** The overview's cards and the project page's
  tiles both show the photo `aspect-[4/3]` with `object-cover` (a centre crop), and 640×480 is
  a 320 CSS px card at a pixel ratio of 2. The same crop as `object-cover` makes, so the card
  image shows exactly what the thumbnail shows there. Never upscaled on the device: a photo
  whose copy's 4:3 crop is smaller than 640×480 gets no card image.
- **On the owner's devices: made locally from the copy, kept only on the device.** WebP at
  the thumbnail's quality (0.8), in halving steps (D-0038). A local-only field of the photo,
  like `thumbnailWidth`: never synced, never uploaded, no outbox row, `uploads` and
  `updatedAt` unchanged, not counted as unsent. A new photo gets it at import, with its
  thumbnail. A photo already on the device, or one downloaded later, gets it from a
  background job like T-0037's rebuild: in the photo worker, one at a time, silent, never
  blocking the app or an import, continuing after a reload, and a failure is logged and not
  retried until the next start.
- **For visitors: PocketBase's thumb of the thumbnail.** A migration sets
  `thumbs: ["640x480"]` on the `photos` collection's `thumbnail` field. A visitor's card image
  is the thumbnail's address with `?thumb=640x480` (the SDK's
  `files.getURL(record, thumbnail, { thumb: '640x480' })`). PocketBase makes it on the first
  request (a PNG, Lanczos-resampled centre crop) and keeps it next to the file; the file hook
  (`pb_hooks/photo_files.pb.js`) decides who may load it exactly as for the thumbnail. The
  demo visitor view (D-0006) has no PocketBase and offers no card image.
- **Where: the overview's cards and the project page's day tiles,** owner and visitor. The
  photo viewer keeps the copy alone.
- **`srcset` and `sizes`.** `sizes` stay as T-0037 designed them (`CARD_SIZES`, `TILE_SIZES`).
  `srcset` gets the card image as its smallest candidate, labelled with its real width:
  - owner, card image made and thumbnail measured: `card 640w, thumbnail <thumbnailWidth>w,
    copy <width>w`;
  - owner, no card image yet: as D-0040 (thumbnail and copy when measured; the thumbnail
    alone when not);
  - owner, card image made but thumbnail not measured: as D-0040, without the card image (its
    neighbour's width is unknown, so it can't be ordered honestly). The job that makes card
    images measures the thumbnail in the same step, so this is brief;
  - visitor: `card 640w, thumbnail <width at 1280>w, copy <width>w`.

  Candidates 2 times apart (640, 1280, 2560) let the browser stay within about 2 times of
  what it draws: at most 2.0 times down at a pixel ratio of 1 on a 320 px card, and, because
  Chrome takes the smaller candidate until the pixel ratio passes the geometric mean of two
  neighbours, at worst about 0.7 (a slight enlargement) just below that point.
- **Sizes live in one place:** `CARD_WIDTH` and `CARD_HEIGHT` in `src/photos/resize.ts`; the
  migration's `"640x480"` and the visitor's `thumb` value must equal them (a test checks).

# Rationale

It fixes the aliasing where it happens (a pixel ratio of 1 to 1.5, 320 to 492 CSS px) with
the smallest change to what is stored and synced: no new file on the NAS, no sync change, no
migration on the devices, and every device (and every photo that arrives from another) gets
its card image from what it already holds. A 640×480 crop matches the layout's 4:3 crop at a
pixel ratio of 2, so it is never shown more than 2 times down, and the thumbnail and copy
remain for wider places and higher ratios. PocketBase's thumbs give visitors the same without
another file; its Lanczos resample of a 1280 px source to 640 is a clean 2 times.

# Consequences

- **Device storage:** about 40 to 70 KB more per photo (a 640×480 WebP), about 5 to 8 % on top
  of the copy and thumbnail. Each card decodes a 1.2 MB bitmap instead of 4.9 MB.
- **NAS storage:** PocketBase keeps each thumb it made, one per photo a visitor has loaded,
  about 0.15 to 0.5 MB each (PNG), deleted with its file. Small next to the originals (3 to 10
  MB each); covered by the hourly snapshots (G-0023).
- **Visitor bandwidth:** the card image is a PNG, so per card or tile it can weigh more than
  the 1280 px WebP thumbnail it replaces (measured 135 to 456 KB against 150 to 250 KB for a
  real thumbnail), in exchange for no aliasing. If real photos turn out much heavier, it goes
  back to the Engineer (dropping the visitor's card candidate is one line).
- **NAS CPU:** one decode and encode of a 1280 px image per photo, once, on a visitor's first
  request.
- **Deploy order:** the app deploys about ten minutes before the backend (Watchtower). Until
  the migration has run, `?thumb=640x480` answers with the thumbnail itself, so a visitor sees
  what they see today in that window; nothing breaks.
- **Coupled to the layout:** if cards or tiles stop being 4:3 or grow past 320 or 492 CSS px,
  the card image's size changes with them: new device images, and a new migration with the
  new `thumbs` value.
- The comment in `backend/pb_migrations/1794931200_diy_projects.js` ("PocketBase's own
  thumbnails are not used") is history; that migration has run and is never edited.

# Guidance for agents

- Read the card size from `src/photos/resize.ts`; never write 640 or 480 elsewhere, and keep
  the migration's `thumbs` and the visitor's `thumb` equal to it, with a test.
- Never sync, upload or count the card image: it is local only. Check `toServer` doesn't send
  it, and that a pulled record keeps the device's card image.
- Never label a candidate with a width it doesn't have; when the thumbnail isn't measured,
  D-0040 holds and the card image waits.
- Never let the NAS make anything else: no other `thumbs` sizes, no thumbs on the copy or the
  original. A new size is a new decision for the Engineer.
- Test the migration only on a throwaway PocketBase (`pnpm exec harness backend`, G-0032),
  never the NAS (G-0019).
