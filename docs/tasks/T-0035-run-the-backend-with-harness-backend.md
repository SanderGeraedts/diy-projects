---
id: T-0035
title: "Make the backend run with harness backend, without Docker"
description: "G-0032: move the PocketBase image's source to backend/ with a throwaway.sh, so pnpm exec harness backend starts and smoke-tests it on a machine without Docker; CI, the publish workflow and the NAS keep working."
status: Doing
size: small
depends_on: [T-0033]
decisions: [G-0032, G-0019, G-0011, G-0023, D-0023, D-0030]
raised_on: 2026-11-22
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/66"]
---

# Goal

G-0032 (harness v0.9.0) gives agents a throwaway backend without Docker:
`pnpm exec harness backend` reads the PocketBase version `backend/Dockerfile` pins, fetches
it once into a per-user cache, and starts it with `backend/pb_migrations` and
`backend/pb_hooks` on an empty database; `harness backend smoke` runs
`backend/smoke-test.sh`. This project's image source is in `deploy/nas/` (`Dockerfile`,
`pb_migrations/`, `pb_hooks/`, `smoke-test.sh`), and the development machines have no
Docker, so today the migrations, hooks and the `*.pocketbase.test.ts` files run only in CI.

After this task:

- The image's source is in `backend/`: `Dockerfile`, `pb_migrations/`, `pb_hooks/`,
  `smoke-test.sh`, and a `throwaway.sh` that starts the same throwaway with Docker, the
  flags and `-e` settings `harness backend` takes from it (see the harness's README,
  *Commands*, `backend`, and the template's `backend/throwaway.sh` in the harness repository
  under `template-sync/backend/`).
- What runs on the NAS stays in `deploy/nas/` (`compose.yml`, `serve.json`, the READMEs);
  the NAS pulls the image by tag, so it needs no change.
- `backend.yml` builds, smoke-tests and publishes from `backend/`; its path triggers, and
  `backend-paths` in `auto-merge.yml`, name the new paths.
- The `pocketbase-auth` CI job starts its PocketBase from `backend/`, with Docker as now or
  with `harness backend`; the developer chooses and says which in the Log.
- The docs that describe the image's source (`docs/deploy/pocketbase-on-the-nas.md`,
  `deploy/nas/README.md`) point at `backend/`.

# Done when

1. On a machine without Docker: `pnpm exec harness backend start` prints an address,
   `pnpm exec harness backend smoke` passes, `pnpm exec harness backend stop` stops it. Output
   in the Log.
2. Against that backend, `pnpm exec vitest run src/sync/sync.pocketbase.test.ts` passes
   locally with the environment the test needs (`POCKETBASE_TEST_URL` and the superuser
   variables, the superuser made as `throwaway.sh` makes it).
3. `git grep -n -E "deploy/nas/(Dockerfile|pb_migrations|pb_hooks|smoke-test)" -- .github docs/deploy deploy AGENTS.md`
   prints nothing.
4. On the pull request, the `backend` workflow and CI (`checks / checks`, `pocketbase-auth`)
   are green, and the auto-merge run waits for `backend` (T-0033's `wait-for`).
5. After the merge, the `backend` run on `main` publishes `:stable` and `:sha-<7>` (its step
   summary), started by the auto-merge workflow.
6. The published image carries the same migrations and hooks as before: `git diff --stat
   -M main -- deploy/nas backend` on the branch shows the moved files as renames with no
   content change, apart from `throwaway.sh` and path lines in `Dockerfile` or
   `smoke-test.sh` if any.

# Notes

- No schema change: nothing about the database changes, so no extra snapshot is needed
  (G-0023 covers it anyway).
- Never point anything but production at the real NAS (G-0019): the throwaway runs on an
  empty database with a test origin.
- `harness backend` downloads into `%LOCALAPPDATA%\harness`; never run a downloaded program
  from inside the repository, and never install anything system-wide (G-0032).
- Depends on T-0033 so that the auto-merge waits for `backend` when this lands.
- Not needed for T-0030 to T-0032, which touch no backend.

# Design

Nothing visible.

# Test

# Log

- 2026-11-22 architect: raised in the harness v0.9.0 update (T-0033) to conform to G-0032; conform rather than overrule, because agents here have no Docker and the backend tests run only in CI today. Small. Handed to the developer.
- 2026-11-23 developer: moved `Dockerfile`, `pb_migrations/`, `pb_hooks/` and `smoke-test.sh` from `deploy/nas/` to `backend/` with `git mv` (a commit of renames only); added `backend/throwaway.sh` from the harness template (backend.yml's flags, superuser `admin@throwaway.invalid`); pointed backend.yml (triggers, build, smoke), `backend-paths` in auto-merge.yml, the docs, code comments and `src/db/slug.test.ts` at `backend/`. `smoke-test.sh` changed beyond path lines so it runs under `harness backend smoke`: the address from `BACKEND_TEST_URL` (it refuses an address not on this machine), the superuser from `BACKEND_TEST_SUPERUSER_*` (still made with `docker exec pb` when backend.yml's container runs), scratch files from `mktemp -d` instead of `/tmp`, JSON bodies through a file (curl.exe on Windows broke the UTF-8 of "Kast für Sanne" on its command line), and the on-disk file checks read the data folder `harness backend` started with (or `BACKEND_TEST_DATA_DIR`) when there is no `pb` container. Migrations and hooks are unchanged: `git diff --stat -M main -- deploy/nas backend` shows the 13 image files as renames with 0 changed lines, plus `smoke-test.sh` (98 lines), the new `throwaway.sh` and one row of `deploy/nas/README.md`. **pocketbase-auth now starts its backend with `pnpm exec harness backend start`** (port 8090, the throwaway superuser), as a development machine does; backend.yml still builds and tests the image with Docker. Check, on this Windows machine without Docker (`command -v docker`: nothing): (1) `harness backend start` printed "The throwaway backend is at http://127.0.0.1:57959, for https://app.example" (exit 0); `harness backend smoke` printed 30 `ok:` lines and "All smoke tests passed." (exit 0), the "three files on disk" and "files gone from disk" checks included; `harness backend stop` printed "The throwaway backend is stopped, and its database removed." (exit 0). (2) On a fresh one, with `POCKETBASE_TEST_URL` its address and `POCKETBASE_TEST_SUPERUSER_EMAIL`/`_PASSWORD` admin@throwaway.invalid / throwaway-only-password: `pnpm exec vitest run src/sync/sync.pocketbase.test.ts` "Test Files 1 passed (1), Tests 13 passed (13)"; with the auth and photo files too, 3 files and 26 tests passed. (3) the `git grep` prints nothing (exit 1). Also `pnpm run typecheck` clean; `pnpm test` 30 files passed, 3 skipped (the pocketbase ones), 387 tests passed.
