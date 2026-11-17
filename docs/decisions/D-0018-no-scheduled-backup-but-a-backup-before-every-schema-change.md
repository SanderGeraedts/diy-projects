---
id: D-0018
title: "No scheduled backup of the NAS data in v1, but a PocketBase backup before every schema change"
description: "v1 still relies on the NAS's two-disk redundancy and on Immich for the photos, with losing the NAS an accepted risk; but before merging any PR that changes PocketBase's migrations, hooks or version, Sander takes a backup in the admin screen, because CI only proves a migration on an empty database."
status: Accepted
date: 2026-11-17
decided_by: sander
replaces: [D-0016]
replaced_by: []
resolves: []
tags: [backend, backup, nas]
---

# Context

PocketBase on the NAS is the master (D-0002) and holds the only original of a synced photo
(D-0003). D-0016 decided on no separate backup in v1: the NAS has two disks of redundancy,
and the photos are also in Immich on the same NAS.

Writing down the lessons from a sister app on the same NAS
(`docs/deploy/pocketbase-on-the-nas.md`) showed a gap: the backend workflow proves a
migration on an *empty* database, not on real data, and Watchtower applies it on the NAS
about ten minutes after a merge. A migration that misbehaves on real data can't be undone
without a copy taken just before it. The sister app takes one before every schema change.
Decided on 2026-11-17.

# Decision

- **Still no scheduled or off-site backup in v1.** Disk failure is covered by the NAS's
  redundancy; the photos themselves are also in Immich. Losing the PocketBase data
  (notes, tags, statuses, which photo belongs to which entry) if the NAS dies is an
  accepted risk.
- **A backup before every schema change:** before merging a PR that touches
  `deploy/nas/pb_migrations/`, `deploy/nas/pb_hooks/` or the PocketBase version in
  `deploy/nas/Dockerfile`, Sander takes a backup in the admin screen
  (`:8443/_/` → **Settings → Backups → Backup now**). It stays in `pb_data/backups` on the
  NAS.
- **Restoring:** a bad migration is rolled back by pinning the previous image tag and
  restoring that backup (**Settings → Backups → Restore**), as in
  `docs/deploy/pocketbase-on-the-nas.md`.

# Rationale

A bad migration is the most likely way to lose data on a single-user app, and a manual
backup at that moment costs a minute and nothing else. Scheduled snapshots and off-site
copies stay out until the app holds enough to justify them.

# Consequences

- Every backend PR description carries the reminder, and Sander has to act on it before
  merging; it's not automated.
- A dead NAS, a fire or theft still loses all project data, and a mistake between schema
  changes can't be rolled back.
- Revisit when the app holds a lot of notes, or before anyone else self-hosts it (D-0010).

# Guidance for agents

- Start the description of any PR that touches `deploy/nas/pb_migrations/`,
  `deploy/nas/pb_hooks/` or the PocketBase version with a **Before merging** checklist item:
  "Take a PocketBase backup (admin screen → Settings → Backups → Backup now)".
- Don't add scheduled or off-site backup infrastructure without a new decision.
- Treat migrations as if the backup might be missing: additive only (D-0005), checked on an
  empty database in CI, never destructive.
