---
id: T-0013
title: "Build the PocketBase image: schema, rules, history and the publish workflow"
description: "The PocketBase backend in deploy/nas/: migrations for projects, entries, photos and history, owner-only rules, CORS, the photo size limit, a history hook, and a GitHub Actions workflow that checks the migrations and publishes the image."
status: Open
guarded: true
depends_on: [T-0003]
decisions: [D-0002, D-0003, D-0004, D-0005, D-0006, D-0010, D-0012]
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
  Photo file fields with a size limit above 50 MP originals (D-0003), say 40 MB. Every
  change additive, so the running app tolerates it (D-0005).
- **Rules:** sign-up closed; every record readable and writable only by its owner
  (D-0005). No public read.
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

- Follow Hanna's Reading List's backend setup where it applies; ask Sander for its
  repository before starting.
- Which file fields `photos` gets for copies and thumbnails depends on Q-004. Add only the
  original now; T-0017 adds the rest.
- Running it on the NAS is T-0014.

# Log
