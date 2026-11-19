---
id: T-0026
title: "Show public projects read-only to visitors who aren't signed in"
description: "A per-project public switch (on by default, D-0025), PocketBase rules that let anyone read public projects, their entries and photo copies and thumbnails but never originals, and a read-only online view for visitors."
status: Doing
guarded: true
depends_on: []
decisions: [D-0002, D-0003, D-0006, D-0013, D-0014, D-0015, D-0018, D-0020, D-0023, D-0024, D-0025]
raised_on: 2026-11-19
done_on: ""
result: []
---

# Goal

D-0025 and D-0023: people who open `projects.sanderg.nl` without signing in see the projects
Sander hasn't switched off, read-only.

- **Public switch (D-0025):** a `public` field on projects, on by default. Locally a new
  Dexie version with an upgrade that sets it to true on existing projects (D-0007); new
  projects start true; it syncs like other fields (T-0016). The PocketBase migration sets it
  to true on existing records too. The project form gets a switch (“Openbaar”), with a short
  note that public notes and photos are visible to anyone.
- **PocketBase (additive migration, D-0018's backup first):**
  - `projects`: list/view rule `owner = @request.auth.id || (public = true && deletedAt = "")`
    (adjust to how tombstones are stored); create/update/delete stay owner-only.
  - `entries`, `photos`: readable when the owner asks, or when their project is public and
    neither the record nor its project is tombstoned.
  - Photo files: the original stays protected and owner-only. Copies and thumbnails of public
    photos must be loadable by visitors; PocketBase serves protected files only with a file
    token, which visitors can't get, so the copy and thumbnail fields become unprotected and
    are reachable only through records a visitor may view. Decide nothing beyond this: if
    that isn't possible without exposing originals, stop and raise a question.
  - `history` unchanged: admin-only.
- **Visitor view in the app:** in production, when nobody is signed in, the overview, project
  page, timeline and photo viewer read public projects online from PocketBase (no Dexie, no
  outbox, no sync), with every create, edit, delete, import, cover and bin control hidden.
  A sign-in link stays. When the NAS can't be reached: “Projecten zijn nu niet bereikbaar.”
  Previews and dev keep the seeded demo data (D-0006).
- **Signed in:** unchanged, offline-first, plus the public switch.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build`, `pnpm run test:e2e` pass.
- The backend workflow's smoke test proves on an empty database: a guest sees a public project,
  its entries and photo records, and can load a public photo's copy and thumbnail; a guest
  gets nothing for a private project, a tombstoned record, `history`, or any original (also
  not of a public photo); a guest can't create or change anything.
- Unit/e2e tests show visitor mode has no edit controls and never opens Dexie or the outbox.
- Sander sees his projects, read-only, in a private browser window; after he switches one
  off, it no longer shows there.
- Sander reviews the PR (guarded: `deploy/nas/`, `src/db/`, `src/sync/`, maybe `src/auth/`).

# Notes

- PR description starts with D-0018's “take a PocketBase backup before merging” item.
- The Funnel allowlist already has the paths visitors need (`/api/collections/projects/`,
  `entries/`, `photos/`, `/api/files/`); no `serve.json` change expected.
- Use a personal device or a private window to check, not the managed work laptop (see
  T-0014's log).

# Log
- 2026-11-19 claude-code/opus-5.5: Started. Sander chose the public switch on by default (D-0025, replacing D-0022), also for existing projects.
- 2026-11-19 claude-code/opus-5.5: Built on `t-0026-public-view`. Public switch: `public` on projects (Dexie v4 sets it true on existing projects, new projects start true, syncs like other fields), the "Openbaar" switch with its note on the project form. PocketBase: migration `1794931500_public_projects.js` adds the bool and sets it true on existing records (plain SQL, no history rows), opens list/view of public, live projects and their live entries and photos (joined with `@collection.projects … ?=`), unprotects copy and thumbnail; originals stay protected. New hook `photo_files.pb.js` serves the original only to its owner (PocketBase's own check would let any signed-in account with a file token through, now that the view rule is public) and a copy or thumbnail only to the owner or while the photo and its project are public and live, so a private photo's copy doesn't load even with its address. The owner's sync now pulls only its own records (`owner = …` in the pull filter). Visitor view (`src/public/`): in production with nobody signed in, the overview, project page, timeline and viewer read from PocketBase with an in-memory auth store; no Dexie, outbox or sync start until the owner signs in; owner pages and search show "Niet gevonden"; "Projecten zijn nu niet bereikbaar." when the NAS can't be reached. Previews and dev: `?bezoeker` shows that view with the demo data from memory (D-0006). CSP `img-src` allows `https://*.ts.net`, like `connect-src`. Smoke test extended with every guest case in *Done when*. Checks: `pnpm run typecheck` clean; `pnpm test` 25 files passed, 3 skipped (304 tests passed, 20 skipped); `pnpm run build` built, precache 22 entries; `pnpm run test:e2e` (E2E_PORT=4791) 43 passed, 2 skipped. The backend smoke test and the PocketBase tests run in CI only (no Docker locally).
- Remaining: Sander reviews the PR (guarded: `deploy/nas/`, `src/db/`, `src/sync/`); before merging he takes a PocketBase backup in the admin screen (D-0018); after the deploy he opens the site in a private window on a personal device, sees his projects read-only, switches one off and sees it disappear there.
