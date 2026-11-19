---
id: T-0026
title: "Show public projects read-only to visitors who aren't signed in"
description: "A per-project public switch (off by default), PocketBase rules that let anyone read public projects, their entries and photo copies and thumbnails but never originals, and a read-only online view for visitors."
status: Open
guarded: true
depends_on: []
decisions: [D-0002, D-0003, D-0006, D-0013, D-0014, D-0015, D-0018, D-0020, D-0022, D-0023]
raised_on: 2026-11-19
done_on: ""
result: []
---

# Goal

D-0022 and D-0023: people who open `projects.sanderg.nl` without signing in see the projects
Sander switched to public, read-only.

- **Public switch:** a `public` field on projects, off by default. Locally a new Dexie version
  with an upgrade that sets it to false on existing projects (D-0007); it syncs like other
  fields (T-0016). The project form gets a switch (“Openbaar”), with a short note that public
  notes and photos are visible to anyone.
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
- Sander switches one project to public and sees it, read-only, in a private browser window;
  a private project doesn't show there.
- Sander reviews the PR (guarded: `deploy/nas/`, `src/db/`, `src/sync/`, maybe `src/auth/`).

# Notes

- PR description starts with D-0018's “take a PocketBase backup before merging” item.
- The Funnel allowlist already has the paths visitors need (`/api/collections/projects/`,
  `entries/`, `photos/`, `/api/files/`); no `serve.json` change expected.
- Use a personal device or a private window to check, not the managed work laptop (see
  T-0014's log).

# Log
