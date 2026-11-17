---
id: T-0011
title: "Filter the overview by status and tag"
description: "Status and tag filters on the overview, combinable, kept in the URL, working offline on the local data."
status: Open
guarded: false
depends_on: [T-0002]
decisions: [D-0004, D-0020]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

The overview lists all projects, filterable by status and tag (D-0004):

- A row of status chips (idee, bezig, gepauzeerd, klaar) and the tags in use; several can
  be active. Statuses combine as "any of"; tags combine as "all of".
- The filters live in the URL search params, so back, reload and a home-screen shortcut keep
  them.
- An empty result says so and offers "Filters wissen".
- Sorted by last update, newest first; tombstoned projects never show.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass.
- `pnpm run test:e2e` passes, with tests on the demo data: filter by a status, by a tag, by
  both, reload with filters kept, and clear them.
- Sander confirms on the deploy preview.

# Notes

- Works on the seeded demo data, so it doesn't wait for project editing.

# Log
