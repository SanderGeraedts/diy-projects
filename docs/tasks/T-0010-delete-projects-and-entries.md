---
id: T-0010
title: "Delete projects and entries as soft deletes that cascade to their photos"
description: "'Verwijderen' on an entry or project tombstones it and its photos in one transaction, after a confirmation naming the photo count; nothing is removed from the NAS."
status: Open
guarded: true
depends_on: [T-0004, T-0005, T-0009]
decisions: [D-0002, D-0004, D-0014]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

D-0014's v1 delete:

- "Verwijderen" on an entry tombstones it and its photos; on a project it tombstones the
  project, its entries and their photos.
- A confirmation names what goes: "Project 'Tuinbank' verwijderen, met 3 notities en 14
  foto's?".
- Cascades happen in `src/db/` in one transaction, each tombstone with its outbox row.
- Tombstoned records disappear from the overview, timeline, viewer, filters and search.

# Done when

- `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` pass.
- Tests in `src/db/` show: deleting an entry tombstones exactly it and its photos; deleting
  a project tombstones it, its entries and their photos; every tombstone has an outbox row;
  a failure halfway leaves nothing tombstoned.
- An e2e test deletes an entry and a project offline, and they stay gone after a reload.
- Sander reviews the PR (guarded: the write API in `src/db/` changes).

# Notes

- No restore screen and no permanent delete: that's the bin, after v1 (T-0022).
- Keep the delete logic in `src/db/`; screens only call it.

# Log
