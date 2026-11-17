---
id: Q-002
title: "Can projects and entries be deleted, and what happens to their photos?"
description: "D-0004 doesn't say whether projects and entries can be deleted and D-0002 only defines tombstones for photos; decide whether deleting is allowed, whether it cascades to photos, and whether anything is ever purged from the NAS."
status: Open
raised_on: 2026-11-17
raised_by: claude-code/opus-5.5
blocks: [T-0010]
resolved_by: []
tags: [product, sync, data]
---

# Question

D-0004 lists what a project and an entry hold, but not whether they can be deleted. D-0002
makes photo deletes soft (a tombstone that syncs) so a delete can't race an upload; it says
nothing about projects and entries. Deleting a project with photos is the riskiest action
in the app: the NAS holds the only original of each photo (D-0003). The local schema and
the sync engine have to know the answer before they're built (T-0003, T-0016).

# Options

1. **Soft delete with cascade, nothing purged in v1. (Recommended)** Deleting an entry
   tombstones it and its photos; deleting a project tombstones it, its entries and their
   photos. Tombstones sync like any change. The NAS keeps the records and originals; a
   purge or "recently deleted" screen is a later decision. The app asks for confirmation
   and names how many photos go with it.
2. **No deleting projects or entries in v1.** Only photos can be deleted (D-0002). A
   finished or abandoned project gets status `done` or `paused`; an empty entry disappears
   from the timeline. Simplest and safest, but a mistaken entry can't be removed.
3. **Hard delete after confirmation.** The records and originals are removed from the NAS
   too. Frees space, but a mistake is permanent and the delete can race an upload from
   another device.

# Answer

Open.
