---
id: D-0026
title: "A permanent delete empties the records on the NAS and keeps each as a purge marker; a restore brings back what one delete cascaded to"
description: "Adds to D-0014's bin: a restore clears the tombstones that share the item's deletedAt; a permanent delete is the owner's DELETE of a tombstoned project or entry, taken over by a PocketBase hook that empties it and everything under it, drops their files and history, and keeps the record with purgedAt so late writes get 410 and other devices drop their copies."
status: Accepted
date: 2026-11-19
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [architecture, sync, product]
---

# Context

D-0014 promised a bin after v1: restore, or permanently delete with the files removed from
the NAS. T-0022 built it (PRs #42, #43). Two things needed a design D-0014 didn't give: how a
restore knows what a delete cascaded to, and how a device that was offline is kept from
re-uploading a photo that was permanently deleted. Sander approved the design on 2026-11-19
after reviewing and checking it in production.

# Decision

- **Restore:** a delete stamps the item and everything it tombstones with one `deletedAt`
  and leaves earlier tombstones alone. A restore clears exactly the records with that
  `deletedAt`, in one transaction, with an outbox row each. Something deleted on its own
  earlier stays deleted. An entry can only be restored while its project is live.
- **Permanent delete:** the owner's `DELETE` of a tombstoned project or entry, on the
  collection path Funnel already allows; no new endpoint. A PocketBase hook
  (`deploy/nas/pb_hooks/bin.pb.js`) takes it over: only the owner, only a tombstoned record
  (400 otherwise). In one transaction it empties the item and everything under it (text,
  tags, all three photo files) and deletes their `history`. PocketBase removes the files.
- **Purge marker:** each emptied record stays, with `purgedAt` set and its tombstone kept, so
  guests never see it. Any later update, upload, create under its id, or create under a
  purged parent gets 410 Gone and saves nothing. Devices can't set `purgedAt`.
- **Other devices:** a device drops its copy of a record and its outbox rows when a marker
  arrives in a pull, or when the NAS answers a push or upload with 410.

# Rationale

Sharing a `deletedAt` makes the cascade exact without a separate log. Reusing the collection
`DELETE` keeps the Funnel allowlist unchanged (D-0023). A marker is the only way an
offline device's late upload can be told apart from a new photo; without it a purged photo
would come back.

# Consequences

- Purged records stay as small empty rows forever. That is a few bytes per photo.
- A single photo deleted on its own isn't listed in the bin; it goes when its entry or
  project is permanently deleted.
- A restored project doesn't get back a cover that was cleared when it was deleted.

# Guidance for agents

- Never delete a purge marker or clear `purgedAt`; never let a client write it.
- Any new collection under projects or entries must respect markers: refuse creates under a
  purged parent with 410.
- A permanent delete runs on the NAS, never as client-side file deletes.
