---
id: T-0011
title: "Filter the overview by status and tag"
description: "Status and tag filters on the overview, combinable, kept in the URL, working offline on the local data."
status: Doing
guarded: false
depends_on: [T-0002]
decisions: [D-0004, D-0020]
raised_on: 2026-11-17
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/20"]
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

- 2026-11-17 claude-code/opus-5.5: Stacked on T-0002's branch (PR #14). Filter logic in `src/filters.ts` (URL `validateSearch` for `/`, `filterProjects`: tombstones out, statuses any-of, tags all-of, newest update first; `tagsInUse`), with unit tests; chips in `src/components/Filters.tsx` (toggle buttons with `aria-pressed`, active state = status colours or light grey plus an accent ring, "Filters wissen"); `Overview.tsx` and `router.tsx` wired with small edits; `STATUS_CLASSES` exported from `StatusBadge.tsx`. Filters use TanStack Router's default JSON search encoding (e.g. `?status=%5B%22done%22%5D`). Checks: typecheck clean, `pnpm test` 103 passed, build ok, `test:e2e` 11 passed / 2 skipped (new `e2e/filters.spec.ts`: by status, by tag, both + reload, empty result + clear). Open for Sander: the chip look is a new component style not spelled out in D-0020; check it on the preview, light and dark.
