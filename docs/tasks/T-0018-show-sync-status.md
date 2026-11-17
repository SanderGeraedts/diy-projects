---
id: T-0018
title: "Show sync status: unsynced changes, last sync and storage warnings"
description: "A small status in the header with the number of unsynced changes and photos, the last successful sync, errors, and a warning when the browser hasn't granted persistent storage."
status: Open
guarded: false
depends_on: [T-0016]
decisions: [D-0002, D-0006, D-0011]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

Unsynced items exist only on the device, and Android can clear a site's storage, so the
count must be visible (D-0002):

- In the header: nothing when all is synced; otherwise "3 wijzigingen, 12 foto's niet
  gesynchroniseerd". Tapping opens details: last successful sync, the last error in plain
  Dutch, upload progress, and "Nu synchroniseren".
- When `navigator.storage.persist()` wasn't granted: a warning that unsynced items can be
  lost, with how to fix it (install the app).
- Offline: "Offline – wijzigingen worden later gesynchroniseerd".
- In previews and dev: the existing demo banner, no sync status (D-0006).

# Done when

- `npm run typecheck`, `npm test`, `npm run build` pass.
- `npm run test:e2e` passes, with tests (sync stubbed) for: everything synced, pending
  changes with a count, an error, offline, and storage not persisted.
- Sander confirms on his phone in production.

# Notes

- Reads only: counts from `src/db/` (T-0003's `countUnsynced`), state from the sync engine.
  This task doesn't change `src/db/` or `src/sync/`.

# Log
