---
id: T-0030
title: "List projects on the overview by their newest photo"
description: "D-0032: the overview, the owner's and a visitor's, orders projects by the latest time taken among their live photos, newest first; projects without photos come last, by last edit."
status: Doing
size: small
depends_on: []
decisions: [D-0032, D-0031, D-0025, D-0020, G-0019]
raised_on: 2026-11-22
done_on: ""
result: []
---

# Goal

Sander, on 2026-11-22: "On the projects page, I want the projects to be sorted by the newest
picture entry."

Today the overview lists live projects by `updatedAt`, newest first (`filterProjects` in
`src/filters.ts:44`), so any edit moves a project to the top. After this task the overview is
ordered as D-0032 says:

- by each project's **newest live photo**, its latest `takenAt` among photos with
  `deletedAt === null`, newest first;
- ties on that time: `updatedAt` descending, then id descending;
- projects **without a live photo** after all projects with one, among themselves by
  `updatedAt` descending, then id descending;
- the **same order for visitors** (`?bezoeker` in previews, `src/public/` in production),
  from the public photos the visitor's overview already loads;
- the status and tag **filters keep that order** for the projects they leave.

Nothing is stored: no new field, index, Dexie version, migration or NAS change.

# Done when

1. CI on the pull request is green (`checks / checks`: `harness check`, typecheck, unit
   tests, build and the end-to-end tests), with no test that passed only on a retry
   (G-0031). Locally the developer runs typecheck and what the change touches.
2. A unit test in `src/filters.test.ts` on the overview's ordering, with these projects and
   photos, gives `['A', 'E', 'B', 'C', 'D']`:
   - A: one photo taken `2026-11-01T10:00:00`, project `updatedAt` 2026-11-02;
   - E: one photo taken `2026-11-01T10:00:00`, project `updatedAt` 2026-11-01;
   - B: photos taken `2026-10-25T09:00:00` and `2026-09-01T09:00:00`, project `updatedAt`
     2026-11-20;
   - C: no photos, project `updatedAt` 2026-11-21;
   - D: one tombstoned photo taken `2026-12-01T09:00:00` (no live photo), project
     `updatedAt` 2026-11-10;
   and the same test checks that a photo of another project doesn't count for a project,
   and that filtering by a tag only A and C carry gives `['A', 'C']`.
3. An e2e test on the seeded demo data (G-0019), at `/` as the owner and at `/?bezoeker` as
   a visitor: the project cards read, in order, `Fietsenrek voor de schuur` (newest photo
   1 nov 2026), `Tuinbank` (25 okt), `Badkamerplank` (16 aug), `Zolderisolatie` (20 jun).
   With the `#hout` tag filter: `Tuinbank`, `Badkamerplank`.
4. An e2e test as the owner, on the seeded demo data:
   - editing Zolderisolatie's description and saving leaves it last on the overview;
   - deleting Fietsenrek voor de schuur's only photo puts it last: `Tuinbank`,
     `Badkamerplank`, `Zolderisolatie`, `Fietsenrek voor de schuur`;
   - in a fresh run, a new project made with "Nieuw project" and no photos shows after the
     four demo projects.
5. The overview doesn't show the list in another order first: on the owner's overview the
   cards are rendered once the projects and their photos are both loaded (the e2e in 3
   reads the order on first render, without waiting for it to settle).
6. One function orders projects for display, used by the owner's and the visitor's
   overview: `grep -rn "updatedAt.localeCompare" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
   lists nothing outside `src/filters.ts` (or the one file the developer puts the function
   in, named in the Log).

# Notes

- **Where:** `filterProjects` in `src/filters.ts` sorts today; `OverviewView` in
  `src/routes/Overview.tsx` calls it for both the owner and the visitor. The owner's
  overview already loads the projects' photos for the covers (`covers` live query; it
  includes tombstoned photos, `pickCover` skips them); the visitor's overview gets
  `photos` from `source.overview()`. The ordering can take those photos; how the function
  is shaped is the developer's call, as long as one function serves both.
- **`takenAt` is text**, compared as text, as in `comparePhotos` (`src/routes/paths.ts`) and
  `pickCover` (`src/components/cover.ts`).
- **The owner's photos query loads blobs** today (whole photo records). Fine for the order;
  don't widen it. A lighter query is welcome but not required.
- **Existing e2e tests** that read the overview's cards (`e2e/bin.spec.ts`,
  `e2e/delete.spec.ts`, `e2e/filters.spec.ts`) mostly sort or filter first; update any that
  assume the old order. The `/design` screenshots don't show the overview.
- **No question for the Engineer:** the change is reversible and touches no infrastructure,
  data store, access or outside service.
- **Small (G-0031):** no new look or words are expected, so there is no design before the
  build; the developer builds from *Done when*. The UX designer reviews after the build,
  since the order a user sees changes, and says there whether anything on the card should
  hint at the order.

# Design

# Test

# Log

- 2026-11-22 architect: raised from Sander's request; recorded D-0032: the overview, owner's and visitor's, orders projects by their newest live photo by time taken, ties by last edit then id, projects without photos last by last edit; filters keep the order; nothing stored. Handed to the UX designer.
- 2026-11-22 architect: harness v0.9.0 (T-0033, G-0031): sized small, a change within the existing overview and data, with no new route, collection or outside service; *Done when* 3 and 4 say what the user sees. No design before the build: handed to the developer; the UX designer reviews after, since the order a user sees changes. *Done when* 1 is now CI's run.
- 2026-11-22 developer: built. `filterProjects(projects, filters, photos)` in `src/filters.ts` now orders by D-0032 (newest live `takenAt` as text, ties `updatedAt` then id descending, projects without a live photo last by `updatedAt` then id); the owner's and the visitor's overview both call it through `OverviewView`, which also picks the covers from the same photos. The owner's overview loads projects and photos in one live query, so the cards render once, in order. Unit tests in `src/filters.test.ts` (the A/E/B/C/D case gives `['A', 'E', 'B', 'C', 'D']`, another project's photo doesn't count, the `ac` tag gives `['A', 'C']`; 4 of them fail on the old code); e2e in `e2e/overview-order.spec.ts` (owner and visitor order read on first render with a MutationObserver, `#hout` filter, edit keeps the place, deleting Fietsenrek's only photo puts it last, a new project comes after the demo four). No existing e2e assumed the old order. Locally: `pnpm run typecheck` clean; `pnpm test` 338 passed, 26 skipped; `pnpm exec playwright test` 60 passed, 2 skipped; *Done when* 6 grep lists only `src/filters.ts:60`.
