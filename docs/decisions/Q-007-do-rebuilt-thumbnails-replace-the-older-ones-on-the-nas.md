---
id: Q-007
title: "Do the rebuilt 1280 px thumbnails replace the older 512 px ones on the NAS?"
description: "D-0038 makes thumbnails 1280 px and has each device rebuild its own older ones locally; decide whether the owner's device also uploads them over the 512 px thumbnails of existing photos on the NAS, so visitors see older photos sharp too."
status: Open
raised_on: 2026-11-24
raised_by: architect
issue: "https://github.com/SanderGeraedts/diy-projects/issues/69"
blocks: []                  # a follow-up task to T-0037 (the upload); T-0037 itself does not wait
resolved_by: []
tags: [photos, sync, storage]
---

# Question

D-0038 (T-0037) makes a photo's thumbnail 1280 px instead of about 512 px. New photos get
the 1280 px thumbnail on the device and on the NAS. For photos that exist already, every
owner device rebuilds its own thumbnails from its 2560 px copy, so the owner sees them
sharp; the files on the NAS stay 512 px, so **a visitor** sees those older photos as soft as
today on a project page.

Replacing them means rewriting one file in every existing photo record on the NAS, which
also moves each record's `updated`. That is a change to the data store and to D-0002's
"photos are append-only" (a photo's files would change after it was added), so it is the
Engineer's call. Nothing is lost that can't be made again: a thumbnail is derived from the
copy, which stays, and the hourly snapshots (G-0023) keep the old files for two weeks.

T-0037 doesn't wait on this: it changes nothing on the NAS for existing photos. Only a
follow-up task (the upload) does.

# Options

1. **Yes: the owner's device uploads each rebuilt thumbnail once. (Recommended)** After a
   device rebuilds a thumbnail for a photo whose files are on the NAS, it queues the
   thumbnail as a normal photo-file upload (`thumbnail: 'pending'`, D-0015's upload path),
   one photo at a time, over the existing sync; the NAS does no image processing. Other
   devices already have their own rebuilt copy, and a pull skips photos it already holds,
   so nothing is downloaded twice. Costs a few hundred MB of upload once, over the home
   network or Funnel. A project decision records that a thumbnail may be replaced (an
   exception to append-only for derived files only; originals and copies never change).
2. **No: leave the older thumbnails as they are.** Visitors see photos added before the
   change as soft as now, and new ones sharp. Nothing changes on the NAS.
3. **Visitors take the copy for older photos instead.** The NAS stays as is, but the app
   must know which thumbnails are older, which needs a new field on the photo record (a
   schema change) or a date cut-off; a visitor then loads 0.6 to 0.9 MB per older tile.
   Not recommended: a schema change and more data for the same result as option 1.

# Answer

Empty while open.
