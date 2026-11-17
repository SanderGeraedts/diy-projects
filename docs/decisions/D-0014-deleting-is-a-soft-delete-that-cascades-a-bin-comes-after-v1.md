---
id: D-0014
title: "Deleting a project or entry is a soft delete that cascades to its photos; a bin to restore or permanently delete comes after v1"
description: "In v1, deleting an entry tombstones it and its photos, and deleting a project tombstones it, its entries and their photos, after a confirmation naming the photo count; everything stays on the NAS. After v1, a bin lets Sander restore or permanently delete."
status: Accepted
date: 2026-11-17
decided_by: sander
replaces: []
replaced_by: []
resolves: [Q-002]
tags: [product, sync, data]
---

# Context

D-0004 didn't say whether projects and entries can be deleted; D-0002 made photo deletes
soft so a delete can't race an upload from another device. Q-002 asked what deleting means.
Sander first wanted a hard delete; a hard delete brings back the race D-0002 avoids and
removes the history D-0002 keeps. He settled on a bin, with only soft delete before v1.
Answered in a design interview on 2026-11-17.

# Decision

- **v1:** "Verwijderen" on an entry tombstones it and its photos; on a project it tombstones
  the project, its entries and their photos. A confirmation names how many photos go with
  it. Tombstones sync like any change (D-0002). Nothing is removed from the NAS.
- **After v1, a bin:** deleted projects (and entries) show in a bin, from where Sander can
  restore them or delete them for good. A permanent delete removes the records' files and
  history from the NAS but keeps a small marker, so a late upload of a deleted photo from
  another device is refused instead of re-creating it.

# Rationale

A tombstone is reversible and race-free, which is what D-0002 needs; the bin gives Sander
the "really gone" option later without risking the only copy of an original by accident.
The v1 data model already holds everything the bin needs.

# Consequences

- Deleted data keeps using NAS storage until the bin exists.
- Restoring has no screen in v1; it can be done in PocketBase's admin screen if needed.

# Guidance for agents

- Delete only by tombstoning in v1; never remove records or files from the NAS.
- Cascade in one local transaction, with every tombstone in the outbox.
- A permanent delete is only built as part of the bin, and must refuse late uploads for
  purged photos.
