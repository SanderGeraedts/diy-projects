---
id: D-0002
title: "The app is an offline-first PWA; PocketBase on the NAS is the source of truth"
description: "Each device keeps a full local copy plus an outbox of changes and works with no connection; PocketBase on the NAS is the master, photos are append-only, and text edits are last-write-wins with the overwritten version kept in history."
status: Accepted
date: 2026-11-16
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [architecture, sync]
---

# Context

Progress photos are taken on a phone (an Android Pixel Fold) in the shed or on the go, often
without a connection. Sander wants the data local, not in someone else's cloud, and synced
with his NAS. He is the only editor, so concurrent edits are rare: the realistic conflict is
editing the same note on the phone and the laptop while both are offline.

Considered: a server-only web app (no offline), full multi-master CRDT sync, and
off-the-shelf replication (PouchDB/CouchDB).

# Decision

- The app is an installable PWA that works fully offline. Each device keeps a local copy of
  all records and an **outbox** of changes not yet sent.
- **PocketBase on the NAS is the master.** Devices push their outbox and pull changes from it.
- **Photos are append-only**: added or deleted, never edited. Deletes are soft (a tombstone
  that syncs), so a delete on one device can't race an upload on another.
- **Text edits are last-write-wins** per record, by the time of the edit. The overwritten
  version is kept in a history collection on the NAS, so nothing is lost silently.

# Rationale

One user makes conflicts rare, so a hub-and-spoke model with an outbox gives offline use at
a fraction of the complexity of CRDTs. Owning the sync code keeps the data model free of a
replication framework's constraints, and photos don't fit well as CouchDB attachments.

# Consequences

- The sync engine and the local database schema are the riskiest code in the app: a bug
  can lose unsynced photos. They are guarded paths (D-0009).
- A second user or real concurrent editing would need this decision revisited.

# Guidance for agents

- Never drop or overwrite an outbox item until the NAS has confirmed it.
- Never edit a stored photo; add a new one or tombstone the old one.
- Keep the previous version on the NAS before any text record is overwritten.
- Call `navigator.storage.persist()` and show the count of unsynced items; Android can
  clear a site's storage, and unsynced items exist only on the device.
- If a change needs merge logic beyond last-write-wins, stop and raise a question.
