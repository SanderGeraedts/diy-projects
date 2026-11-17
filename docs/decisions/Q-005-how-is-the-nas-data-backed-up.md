---
id: Q-005
title: "How are PocketBase's data and the photo originals on the NAS backed up?"
description: "The NAS holds the only copy of every photo original (D-0003) and is the source of truth (D-0002), but no decision covers backups; decide what is backed up, where to, how often, and how a restore is tested."
status: Open
raised_on: 2026-11-17
raised_by: claude-code/opus-5.5
blocks: [T-0020]
resolved_by: []
tags: [backend, backup, nas]
---

# Question

PocketBase on the NAS is the master (D-0002) and keeps the only full-resolution original of
every photo (D-0003); once synced, the phone may drop its copy of the original. A failed
disk, a bad migration or a mistaken hard delete would then lose photos for good. The
registry README lists "how the app is run or backed up" as decision material, and D-0005
only says the setup reuses one Sander knows how to restore.

# Options

1. **Back up the PocketBase data folder with the NAS's own backup tool, off-site, nightly.
   (Recommended)** The whole `pb_data` volume (database and stored files) goes to an
   off-site target with versioning (for example Hyper Backup to cloud storage or a second
   location), the way Reading List is backed up if it is. A restore to a throwaway
   container is tested once and documented in `deploy/nas/`.
2. **PocketBase's built-in scheduled backups to S3-compatible storage.** Configured in
   PocketBase itself, but each backup is a full zip of `pb_data`, originals included, which
   grows large and slow as photos pile up.
3. **No separate backup for v1.** Rely on the NAS's RAID. Not a backup: it doesn't survive
   deletion, corruption, theft or fire.

# Answer

Open.
