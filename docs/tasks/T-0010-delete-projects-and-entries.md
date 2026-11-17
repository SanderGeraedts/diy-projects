---
id: T-0010
title: "Delete projects and entries as soft deletes that cascade to their photos"
description: "'Verwijderen' on an entry or project tombstones it and its photos in one transaction, after a confirmation naming the photo count; nothing is removed from the NAS."
status: Doing
guarded: true
depends_on: [T-0004, T-0005, T-0009]
decisions: [D-0002, D-0004, D-0014]
raised_on: 2026-11-17
done_on: ""
result: [https://github.com/SanderGeraedts/diy-projects/pull/31]
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

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass.
- Tests in `src/db/` show: deleting an entry tombstones exactly it and its photos; deleting
  a project tombstones it, its entries and their photos; every tombstone has an outbox row;
  a failure halfway leaves nothing tombstoned.
- An e2e test deletes an entry and a project offline, and they stay gone after a reload.
- Sander reviews the PR (guarded: the write API in `src/db/` changes).

# Notes

- No restore screen and no permanent delete: that's the bin, after v1 (T-0022).
- Keep the delete logic in `src/db/`; screens only call it.

# Log

- 2026-11-17 claude-code/opus-5.5: Stacked on T-0009 (#29), with T-0011's filters (#20) and T-0012's search (#23) merged in (conflicts in `router.tsx`, `Overview.tsx`, `Layout.tsx`, `ProjectPage.tsx` resolved keeping both sides). Write API (`src/db/write.ts`, guarded): `deleteEntry(id)` tombstones the entry and its live photos, `deleteProject(id)` the project, its live entries and their live photos, each in one transaction with a `delete` outbox row per tombstone; records already tombstoned keep their delete time and get no new row. `updateProject` now clears the cover with `coverPhotoId: null` or `undefined` (leaving the key out keeps it), and `deletePhoto` / `deleteEntry` clear the cover when they tombstone it (one extra `projects` `put` row), closing T-0009's open point (1). UI (`src/routes/Delete.tsx`): "Verwijderen" next to "Notitie bewerken" on each entry, "Project verwijderen" at the foot of the project page, each asking first in an alert dialog ("Project 'Tuinbank' verwijderen, met 3 notities en 6 foto's?"; zero parts left out, singular for 1, `src/components/deleteText.ts`); after a project delete the app goes to the overview. The project page now treats a tombstoned project as not found and leaves out tombstoned entries; the overview, filters (tags in use), viewer and search already skipped tombstones. Checks: typecheck clean, `pnpm test` 195 passed, build ok, `test:e2e` 32 passed / 2 skipped (design screenshots, Linux only) incl. new `e2e/delete.spec.ts` (entry and project deleted offline, gone after a reload and from viewer, filters and search), on private port 4791. Open: (1) the confirmation counts every entry as a "notitie", also entries without a note; (2) clearing the cover on delete is a separate `projects` `put` row, so the sync engine (T-0016) sees an edit next to the tombstones; (3) a cover deleted on another device still leaves `coverPhotoId` until the next local edit, so `pickCover` stays the display fallback; (4) no restore or purge (bin after v1, T-0022). Remaining: Sander reviews (guarded `src/db/`) and tries it on the preview.
