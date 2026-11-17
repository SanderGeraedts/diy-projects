---
id: T-0013
title: "Build the PocketBase image: schema, rules, history and the publish workflow"
description: "The PocketBase backend in deploy/nas/: migrations for projects, entries, photos and history, owner-only rules, CORS, the photo size limit, a history hook, and a GitHub Actions workflow that checks the migrations and publishes the image."
status: Open
guarded: true
depends_on: [T-0003]
decisions: [D-0002, D-0003, D-0004, D-0005, D-0006, D-0010, D-0017, D-0013, D-0014, D-0015, D-0018]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

The backend as code, built and published by GitHub Actions; the NAS only pulls it (D-0005).

- `deploy/nas/Dockerfile`: a pinned PocketBase release with `pb_migrations/` and
  `pb_hooks/` baked in.
- **Migrations:** collections `projects`, `entries`, `photos` matching T-0003's v2 records
  (including `updatedAt` and `deletedAt`), and `history` for overwritten versions (D-0002).
  `photos` has three file fields (D-0015): `original` with a size limit above 50 MP
  originals (D-0003), say 40 MB, and `copy` and `thumbnail`. Every change additive, so the
  running app tolerates it (D-0005); there is no backup, so never destructive (D-0018).
- **Rules:** sign-up closed; every record readable and writable only by its owner
  (D-0005). No public read. The `users` auth token lasts 90 days (D-0013).
- **History hook:** before a `projects` or `entries` record is updated, its previous version
  is written to `history` (D-0002).
- **CORS:** only `https://projects.sanderg.nl` (D-0005).
- **Workflow** `.github/workflows/backend.yml`: on changes under `deploy/nas/`, start the
  image on an empty database, check the migrations apply, run a smoke test (create a user,
  write and update a record, see a `history` row, see a stranger refused), then publish the
  image (for example to GHCR) on `main`.

# Done when

- The workflow passes on the PR (migrations on an empty database, smoke test) and publishes
  the image after merge; quote the run in the PR.
- `docker build deploy/nas` works locally.
- No tailnet name, NAS address or secret in the repo (D-0005, D-0010).
- Sander reviews the PR (guarded).

# Notes

- Read `docs/deploy/pocketbase-on-the-nas.md` first: the image, workflow, migration and hook
  patterns that already work on the NAS, and the incident they came from. Don't depend on
  the Reading List repository.
- Set `--origins=https://projects.sanderg.nl` on `serve` (the browser calls PocketBase
  directly, D-0005) and check in the workflow that another origin gets no CORS header.
- Turn on PocketBase's rate limits; the sign-in path is on the internet.
- PocketBase's own thumbnail feature isn't used; the NAS does no image processing (D-0015).
- Running it on the NAS is T-0014.
- The PR description starts with D-0018's **Before merging** item: take a PocketBase
  backup. (For this first PR there's no data yet, but keep the habit.)

# Log
