---
id: T-0030
title: "List projects on the overview by their newest photo"
description: "D-0032: the overview, the owner's and a visitor's, orders projects by the latest time taken among their live photos, newest first; projects without photos come last, by last edit."
status: Open
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

1. `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass, and
   `pnpm exec harness check` passes.
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
- Handed to the UX designer: the order a user sees changes. No new look or words are
  expected; the designer confirms whether anything on the card should hint at the order.

# Design

# Test

# Log

- 2026-11-22 architect: raised from Sander's request; recorded D-0032: the overview, owner's and visitor's, orders projects by their newest live photo by time taken, ties by last edit then id, projects without photos last by last edit; filters keep the order; nothing stored. Handed to the UX designer.
