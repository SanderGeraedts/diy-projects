---
id: T-0027
title: "Address projects by slug, and entries and photos by date and place, never by id"
description: "D-0029: /projects/<slug> from the title, unique per owner and settled on the NAS, old slugs kept and redirected, photos at /projects/<slug>/<yyyy-mm-dd>/<n>, entries linked by date; existing projects backfilled on the NAS and on devices."
status: Doing
guarded: false
depends_on: []
decisions: [D-0002, D-0006, D-0007, D-0018, D-0023, D-0024, D-0025, D-0026, D-0027, D-0028, D-0029]
raised_on: 2026-11-20
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/52"]
---

# Goal

Sander: "Currently the url of a project is a uuid. I never want a uuid in a url. Change it
to be a slug." D-0029 records the details he delegated. No address, link, hash or query
holds an id, for the owner or for visitors:

- projects at `/projects/<slug>` (a slug from the title, unique per owner, `new` reserved);
  `/projects/new`, `/projects/<slug>/edit`, `/projects/<slug>/entries/new` keep working;
- a rename moves the old slug into `oldSlugs`, and an old slug redirects (replace);
- photos at `/projects/<slug>/<yyyy-mm-dd>/<n>`, entries linked as `#<yyyy-mm-dd>` (with
  `-2` for a second entry on one date);
- the NAS settles slug clashes between offline devices; a migration backfills existing
  projects; a Dexie upgrade does the same on devices; visitors resolve slugs online.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `E2E_PORT=4794 pnpm run test:e2e`
  pass, with unit tests for the slug rules and uniqueness, e2e tests that the overview,
  project page, photo viewer and search show no UUID in the address bar or any link, and
  that an old slug redirects.
- CI's PocketBase jobs pass: the smoke test covers the dedupe hook (clashes, per owner, a
  rename's old slug kept and not reused, a purge freeing a slug, the unique index), and the
  sync tests show two offline devices with the same title ending up as `x` and `x-2`, and a
  rename whose old slug still finds the project, for a device and a visitor.
- Before merging, a PocketBase backup on the NAS (D-0018).
- Sander opens a project by its slug on his phone and in a private window.

# Notes

- App: `src/db/slug.ts` (rules), `src/db/db.ts` (v5), `src/db/write.ts`,
  `src/sync/records.ts` and `src/sync/engine.ts` (taking the NAS's slugs),
  `src/routes/paths.ts` and `src/routes/projectBySlug.tsx` (addresses, lookup, redirect),
  `src/public/source.ts` (visitors), `src/seed/demo.ts`.
- NAS: `deploy/nas/pb_migrations/1794931700_project_slugs.js`, `deploy/nas/pb_hooks/slug.js`
  and `slugs.pb.js`; `bin.pb.js` clears a purge marker's slugs.
- The PR is a draft: it changes PocketBase's schema, and the auto-merge workflow merges any
  green non-draft PR (D-0028), so it waits for the backup.

# Log
- 2026-11-20 claude-code/opus-5.5: Started on `project-slugs`. Sander asked for slugs instead of UUIDs in URLs and delegated the details; recorded as D-0029.
- 2026-11-20 claude-code/opus-5.5: Built on `project-slugs`. App: slug rules in `src/db/slug.ts`; projects get `slug` and `oldSlugs` (Dexie v5 backfills by `createdAt`, then id, no outbox rows); `createProject` and `updateProject` pick a slug unique on the device and move a renamed one to `oldSlugs`; routes `/projects/$slug`, `/projects/$slug/edit`, `/projects/$slug/entries/new`, `/projects/$slug/$day/$n`; owner pages find a project by slug or old slug in Dexie and redirect (replace) to the current one; entries are `#<date>` (`-2` for a second entry on a date) on the project page and in search; the sync engine takes the NAS's slug and oldSlugs whenever nothing is pending, also at an unchanged `updatedAt`, and keeps or makes a slug against a NAS without them; visitors resolve `slug = "x" || oldSlugs ~ "\"x\""` online; demo projects have slugs from their titles. NAS: migration `1794931700_project_slugs.js` (adds the fields, backfills per owner by creation with plain SQL and a new `updated`, unique index on `(owner, slug)` for non-empty slugs), hook `slugs.pb.js` with `slug.js` (dedupe on create and update, old slug kept, per owner, purge markers left out), `bin.pb.js` clears a marker's slugs. Checks: `pnpm run typecheck` clean; `pnpm test` 29 files passed, 3 skipped (351 tests passed, 26 skipped); `pnpm run build` built, precache 22 entries; `E2E_PORT=4794 pnpm run test:e2e` 52 passed, 2 skipped. Against the official PocketBase 0.40.6 Windows build with this branch's migrations and hooks: the migration on a database with existing projects gave `kast`, `kast-2` by creation, `kast-fur-sanne` to a tombstoned one, `project` to one titled `new`, nothing to a purge marker; `auth.pocketbase` 5 passed, `sync.pocketbase` 13 passed, `photos.pocketbase` 8 passed. The smoke test's new section runs in CI only (no jq here).
- 2026-11-20 claude-code/opus-5.5: Draft PR #52. CI green on it: `checks` (unit 29 files passed, 3 skipped, 356 tests passed, 26 skipped; e2e 54 passed), `pocketbase-auth` (`auth.pocketbase` 5 passed, `sync.pocketbase` 13 passed, `photos.pocketbase` 8 passed), backend `image` (smoke test "All smoke tests passed.", with the four new slug checks ok).
- Remaining: before merging, a PocketBase backup on the NAS (D-0018), then mark the PR ready; after the deploy, Sander opens a project by its slug on his phone and in a private window.
