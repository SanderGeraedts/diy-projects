---
id: T-0010
title: "Delete projects and entries, as Q-002 decides"
description: "Whatever deleting projects and entries Q-002's answer allows, with confirmation, in the write API and the screens."
status: Open
guarded: true
depends_on: [T-0004, T-0005, T-0009]
decisions: [D-0002, D-0004]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

**Blocked by Q-002.** Don't start until a decision answers it; then add that decision to
`decisions` above and rewrite this goal from it.

If the recommended option is chosen: deleting an entry tombstones it and its photos;
deleting a project tombstones it, its entries and their photos, after a confirmation that
names how many photos go with it. Nothing is purged from the NAS.

# Done when

- `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` pass.
- Tests in `src/db/` show a delete tombstones exactly the records the decision says, and
  queues them in the outbox in one transaction.
- An e2e test deletes an entry and a project offline, and they stay gone after a reload.
- Sander reviews the PR (guarded: the write API in `src/db/` changes).

# Notes

- Keep the delete logic in `src/db/`; screens only call it.

# Log
