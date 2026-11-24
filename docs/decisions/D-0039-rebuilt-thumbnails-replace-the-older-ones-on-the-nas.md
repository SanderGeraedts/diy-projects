---
id: D-0039
title: "The owner's devices upload each rebuilt 1280 px thumbnail once, over the older one on the NAS"
description: "Answers Q-007 and adds to D-0002 and D-0038: a photo's thumbnail on the NAS may be replaced (the only file of a photo that may change after it was added); an owner device uploads its rebuilt thumbnail through the normal sync, only while the NAS's thumbnail is still narrower, without a new updatedAt, history or unsent count, so visitors see older photos sharp too."
status: Accepted
date: 2026-11-24
decided_by: engineer
overrules: []
replaces: []
replaced_by: []
resolves: [Q-007]
tags: [photos, sync, storage]
---

# Context

D-0038 (T-0037) made a photo's thumbnail 1280 px instead of about 512 px, and has every owner
device rebuild its own older thumbnails from its 2560 px copy. The files on the NAS stayed
512 px, so a visitor still saw photos added before that change as soft. Q-007 asked whether
the rebuilt thumbnails should replace the older ones on the NAS, because that changes a
photo's file after it was added, which D-0002's "photos are append-only" rules out.

On 2026-11-24 the Engineer answered, word for word: "Yes to Q-007, upload the rebuilt
thumbnails" (option 1 of Q-007). The details of how below were settled by the architect the
same day; they can be changed by a later decision without asking the Engineer again, as long
as the exception to append-only stays as narrow as it is here.

What the backend already allows (read on 2026-11-24, `backend/`): the photos collection's
`updateRule` lets the owner update their own record; `thumbnail` is a single file (max 2 MB),
so an upload replaces it and PocketBase deletes the old file; `last_write_wins.pb.js` saves an
update without `updatedAt` in its body; `history.pb.js` keeps history for projects and entries
only, not photos; `bin.pb.js` answers 410 for a purged record. Append-only was a rule of the
app, never of the NAS's rules, so nothing on the NAS changes.

# Decision

- **A thumbnail on the NAS may be replaced.** It is the only exception to D-0002's
  append-only photos: a thumbnail is derived from the copy and can always be made again. The
  original, the copy and every other field of a photo record never change after it was added
  (deletes stay tombstones, D-0014).
- **Only by the owner's devices, through the normal sync.** After a device has a thumbnail of
  the current size (D-0038) for a photo that is on the NAS and alive, its sync uploads that
  thumbnail once, as a file-only update of the photo record (the same request as D-0015's
  upload, with only `thumbnail` in the body). The NAS does no image processing; visitors never
  upload anything.
- **Once, and only while the NAS's thumbnail is older.** Right before uploading, the device
  checks the thumbnail the NAS holds now; when it is already as wide as one made now (within
  1 px), the device uploads nothing and counts the photo as done. Two devices that check at the
  same moment may both upload: last write wins, and both files are made from the same copy, so
  either is right.
- **No new version of the photo.** The upload carries no `updatedAt`, so the photo's
  `updatedAt` stays as it is, no other device takes it as an edit, and no history row is
  written. PocketBase's own `updated` moves, which only makes the record come up again in other
  devices' pulls; they keep their own files (D-0015, T-0017).
- **Not unsent work.** These uploads go after every other upload, are not counted as unsent
  (the sync status, sign-out's warning) and are not shown; a failure is not a sync error. If a
  device is wiped before its uploads are done, the next device to rebuild those photos does
  them.
- **Nothing on the NAS changes:** no migration, no rule, no hook, no deploy step. The hourly
  snapshots (G-0023) keep the replaced 512 px files for two weeks.

# Rationale

Option 1 of Q-007, as recommended: visitors see older photos as sharp as new ones, for a one-off
upload of a few hundred KB per photo, with no schema change (option 3 needed one) and no image
processing on the NAS. Checking the NAS's file before uploading makes "once" hold across
devices without a new field on the NAS to mark which thumbnails are new. Leaving `updatedAt`
alone keeps last-write-wins and history about what Sander edits, not about derived files.

# Consequences

- Every owner device downloads each older photo's thumbnail from the NAS once (about 35 KB) to
  check it, and the first device to get there uploads about 150 to 250 KB per photo.
- A photo record's `updated` on the NAS no longer means "Sander changed something"; `updatedAt`
  still does.
- A visitor's thumbnail address changes with the new file name, so browsers fetch the new file
  without any cache work; D-0038's guidance that a visitor's older thumbnails are labelled
  1280w while 512 px wide stops mattering once they are replaced.
- Anything that later reads a photo record's files must not assume the thumbnail file name is
  fixed for the photo's life.

# Guidance for agents

- Preserve: the original and the copy on the NAS are never replaced, and no photo field other
  than `thumbnail` is sent by this upload. Never send `updatedAt` with it.
- Never test against the production NAS (G-0019): use a throwaway PocketBase
  (`pnpm exec harness backend`, or CI's `pocketbase-auth` job) and generated images.
- Don't count or show these uploads as unsent work, and don't let their failure turn the sync
  status into an error.
- Stop and ask the Engineer before replacing any other file of a photo on the NAS, before doing
  image work on the NAS, or before adding a field or migration for this.
