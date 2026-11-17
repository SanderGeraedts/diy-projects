---
id: D-0016
title: "No separate backup of the NAS data in v1; losing the NAS is an accepted risk"
description: "v1 relies on the NAS's two-disk redundancy, and on Immich, which already holds the photos; losing the notes, tags and project structure if the NAS dies or the database corrupts is accepted for now."
status: Replaced
date: 2026-11-17
decided_by: sander
replaces: []
replaced_by: [D-0018]
resolves: [Q-005]
tags: [backend, backup, nas]
---

# Context

PocketBase on the NAS is the master (D-0002) and holds the only original of a synced photo
(D-0003). Q-005 asked how that data is backed up. The NAS has two disks of redundancy, and
Sander's photos are already stored in Immich on the same NAS. Answered in a design interview
on 2026-11-17.

# Decision

- No separate backup in v1: no off-site copy, no PocketBase backup job.
- Disk failure is covered by the NAS's redundancy; the photos themselves are also in Immich.
- Losing the PocketBase data (notes, tags, statuses, which photo belongs to which entry) if
  the NAS dies or the database corrupts is an accepted risk.

# Rationale

The irreplaceable part, the photos, already exists twice on the NAS (Immich and PocketBase);
the rest is a few MB of notes that Sander accepts losing in the worst case for now.

# Consequences

- A dead NAS, a fire or theft loses all project data; redundancy doesn't help against a
  corrupt database or a bad migration.
- Revisit when the app holds a lot of notes, or before anyone else self-hosts it (D-0010):
  backing up only the database file is cheap.

# Guidance for agents

- Don't add backup infrastructure without a new decision.
- Treat migrations as if there were no backup: additive only (D-0005), checked on an empty
  database in CI, and never destructive.
