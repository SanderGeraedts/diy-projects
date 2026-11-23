---
id: T-0035
title: "Make the backend run with harness backend, without Docker"
description: "G-0032: move the PocketBase image's source to backend/ with a throwaway.sh, so pnpm exec harness backend starts and smoke-tests it on a machine without Docker; CI, the publish workflow and the NAS keep working."
status: Done
size: small
depends_on: [T-0033]
decisions: [G-0032, G-0019, G-0011, G-0023, D-0023, D-0030]
raised_on: 2026-11-22
done_on: "2026-11-23"
result: ["https://github.com/SanderGeraedts/diy-projects/pull/66", "https://github.com/SanderGeraedts/diy-projects/pull/67"]
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

Tester, 2026-11-23, on 042856e (harness 0.9.0), Windows without Docker (`command -v docker`:
nothing, exit 1). `rm -rf node_modules && pnpm install --frozen-lockfile`: "Done in 8.4s", exit 0.

**CI on the pull request** (`gh pr checks 66`, `gh run view`): CI run 45122180964 attempt 1,
`checks / checks` pass, `pocketbase-auth` pass; backend run 45122180276 attempt 1, `image`
pass ("ok: a project with an entry, a photo with three files on disk, ..." and "All smoke
tests passed." in the `pb` container). No retries. e2e was skipped on the draft (the harness's
CI runs it once the pull request is ready). The `pocketbase-auth` log: "The throwaway backend
is at http://127.0.0.1:8090", then `auth.pocketbase.test.ts` 5 tests, `sync.pocketbase.test.ts`
13, `photos.pocketbase.test.ts` 8, each "1 passed (1)", then "The throwaway backend is stopped,
and its database removed." The three test steps in `ci.yml` are unchanged; only the Docker
build, start and superuser steps became `harness backend start` (and a `stop`), so the same
tests run.

**Done when 1:**

- `pnpm exec harness backend start`: "The throwaway backend is at http://127.0.0.1:53001, for
  https://app.example" (exit 0).
- `pnpm exec harness backend smoke`: 30 `ok:` lines, among them "a project with an entry, a
  photo with three files on disk, and history rows" and "deleted for good: files gone from
  disk, ...", then "All smoke tests passed." (exit 0).
- `pnpm exec harness backend stop`: "The throwaway backend is stopped, and its database
  removed." (exit 0). Then `status`: "No throwaway backend runs for this project" (exit 1);
  `stop` again: "No throwaway backend runs for this project." (exit 0).

**Done when 2:** against that same backend (after the smoke test), with
`POCKETBASE_TEST_URL=http://127.0.0.1:53001`, `POCKETBASE_TEST_SUPERUSER_EMAIL=admin@throwaway.invalid`,
`POCKETBASE_TEST_SUPERUSER_PASSWORD=throwaway-only-password` (the superuser `harness backend`
and `throwaway.sh` make): `pnpm exec vitest run src/sync/sync.pocketbase.test.ts`: "Test Files
1 passed (1), Tests 13 passed (13)".

**Done when 3:** the `git grep` prints nothing (exit 1).

**Done when 6:** `git diff --stat -M main -- deploy/nas backend` shows the Dockerfile, the 6
hook files and the 6 migrations as renames with 0 changed lines, `smoke-test.sh` 98 lines,
`throwaway.sh` new (49), `deploy/nas/README.md` 2. Judged:

- `smoke-test.sh` is not in the image: `backend/Dockerfile` copies only `pb_migrations` and
  `pb_hooks`. So the published image carries the same migrations and hooks; that is what
  Done when 6 is for.
- What the smoke test checks is unchanged: in `git diff main:deploy/nas/smoke-test.sh
  HEAD:backend/smoke-test.sh` no `ok`, `fail`, `expect` or `refused` line changes; the changes
  are plumbing (address, superuser, scratch folder, request bodies, where the files on disk
  are read). The address, superuser variables, refusal of a non-local address and `mktemp`
  match the harness's own `template-sync/backend/smoke-test.sh`. In backend.yml the superuser
  is still made with `docker exec pb ... superuser upsert`, and the on-disk checks still read
  the `pb` container.
- The data-folder lookup can't make a check pass by mistake: with
  `BACKEND_TEST_DATA_DIR=C:/nonexistent-dir` the smoke test failed with "FAIL: the photo's
  three files aren't on disk:" (exit 1), before the "files gone from disk" checks.
- The deviation goes beyond the "path lines" Done when 6 allows, but is needed for G-0032's
  `harness backend smoke` and changes no check: acceptable, no architect needed.

**Repeated and affected tests:** each of the three `*.pocketbase.test.ts` files on its own,
as CI runs them, 3 times against the backend: 5, 13 and 8 passed every time. `src/db/slug.test.ts`
(reads `backend/`) 3 times: 31 passed each. `pnpm exec playwright test e2e/bin.spec.ts
--repeat-each=3 --workers=4`: 15 passed. `pnpm exec harness check`: tasks, decisions,
engineers, generated files all ✓ (exit 0).

**Tried to break it:**

- The smoke test a second time on the same backend: "FAIL: create user owner@ci.invalid:
  expected 200, got 400 ... validation_not_unique" (exit 1). Expected: it needs an empty
  database, as it did before; it fails loudly.
- `BACKEND_TEST_URL=http://example.com:8090` and `https://127.0.0.1:8090`: both refused with
  "... is not on this machine; the smoke test runs against a throwaway backend only" (exit 1).
- The three `*.pocketbase.test.ts` files in one vitest run (parallel workers), 3 times: passed
  twice; the third time 2 tests failed in `retry429` (PocketBase's sign-in rate limit, shared
  by the parallel files); a fourth such run passed. CI runs the files one at a time,
  which passed 3 out of 3 here, and this change doesn't touch the tests or the rate limit:
  not a regression of this task, noted for whoever runs them together locally.
- Nothing points at the real NAS: the added lines hold only `127.0.0.1`, `app.example`,
  `evil.example` and the throwaway credentials; no host, tailnet name, address, pool or dataset
  path, and no secret.

Verdict: passed. Done when 4 (the auto-merge waits for `backend`) is checked once the pull
request is ready; Done when 5 after the merge.

**Done when 4** (after `gh pr ready 66`, head d5e1e55): CI's ready_for_review run 45124117848,
attempt 1, success (`checks / checks` with e2e "69 passed", no flaky; `pocketbase-auth`
success). The Auto-merge run it started, 45124305272, read `wait-for: CI,backend`, logged
"backend passed." and then merged #66 as 90cdb72 (2026-11-23T06:28:26Z). It then logged
"Started ci.yml on main." and "Started backend.yml on main."

**Done when 5:** the `backend` run on main 45124333387 (workflow_dispatch from that auto-merge
run, 90cdb72, attempt 1, success): "All smoke tests passed.", then
"sha-90cdb72: digest: sha256:a2dfb90bf726edde9c4e4e15a1c5b7e69eb3709f8c17485a6b4f9e30f279d4e8"
and "stable: digest: sha256:a2dfb90bf726edde9c4e4e15a1c5b7e69eb3709f8c17485a6b4f9e30f279d4e8",
the same image. The summary's text can't be read with `gh`; the step that writes "Published
`…:sha-90cdb72` and `…:stable`" to it passed. CI on main 45124330421 (90cdb72, attempt 1):
success.

# Log

- 2026-11-22 architect: raised in the harness v0.9.0 update (T-0033) to conform to G-0032; conform rather than overrule, because agents here have no Docker and the backend tests run only in CI today. Small. Handed to the developer.
- 2026-11-23 developer: moved `Dockerfile`, `pb_migrations/`, `pb_hooks/` and `smoke-test.sh` from `deploy/nas/` to `backend/` with `git mv` (a commit of renames only); added `backend/throwaway.sh` from the harness template (backend.yml's flags, superuser `admin@throwaway.invalid`); pointed backend.yml (triggers, build, smoke), `backend-paths` in auto-merge.yml, the docs, code comments and `src/db/slug.test.ts` at `backend/`. `smoke-test.sh` changed beyond path lines so it runs under `harness backend smoke`: the address from `BACKEND_TEST_URL` (it refuses an address not on this machine), the superuser from `BACKEND_TEST_SUPERUSER_*` (still made with `docker exec pb` when backend.yml's container runs), scratch files from `mktemp -d` instead of `/tmp`, JSON bodies through a file (curl.exe on Windows broke the UTF-8 of "Kast für Sanne" on its command line), and the on-disk file checks read the data folder `harness backend` started with (or `BACKEND_TEST_DATA_DIR`) when there is no `pb` container. Migrations and hooks are unchanged: `git diff --stat -M main -- deploy/nas backend` shows the 13 image files as renames with 0 changed lines, plus `smoke-test.sh` (98 lines), the new `throwaway.sh` and one row of `deploy/nas/README.md`. **pocketbase-auth now starts its backend with `pnpm exec harness backend start`** (port 8090, the throwaway superuser), as a development machine does; backend.yml still builds and tests the image with Docker. Check, on this Windows machine without Docker (`command -v docker`: nothing): (1) `harness backend start` printed "The throwaway backend is at http://127.0.0.1:57959, for https://app.example" (exit 0); `harness backend smoke` printed 30 `ok:` lines and "All smoke tests passed." (exit 0), the "three files on disk" and "files gone from disk" checks included; `harness backend stop` printed "The throwaway backend is stopped, and its database removed." (exit 0). (2) On a fresh one, with `POCKETBASE_TEST_URL` its address and `POCKETBASE_TEST_SUPERUSER_EMAIL`/`_PASSWORD` admin@throwaway.invalid / throwaway-only-password: `pnpm exec vitest run src/sync/sync.pocketbase.test.ts` "Test Files 1 passed (1), Tests 13 passed (13)"; with the auth and photo files too, 3 files and 26 tests passed. (3) the `git grep` prints nothing (exit 1). Also `pnpm run typecheck` clean; `pnpm test` 30 files passed, 3 skipped (the pocketbase ones), 387 tests passed.
- 2026-11-23 developer: draft PR #66. On bcc25d5, attempt 1, no retries: `backend` / `image` passed ("All smoke tests passed." in the `pb` container); CI `checks / checks` and `pocketbase-auth` passed ("The throwaway backend is at http://127.0.0.1:8090", then sign-in, sync and photo files 1 passed each, then stopped). Auto-merge said "#66 is a draft: it waits for the tester to mark it ready." Handed to the tester; nothing a user sees. Remaining: Done when 4's wait for `backend` shows only once the PR is ready; Done when 5 after the merge. On the merge, main's auto-merge still has the old `backend-paths`, but this PR changes `.github/workflows/backend.yml`, which that pattern also matches, so the publish still starts.
- 2026-11-23 tester: passed: Done when 1, 2, 3 and 6 checked on this machine without Docker, CI and backend green on attempt 1 (see *Test*); the smoke-test changes keep every check and aren't in the image. Marking the PR ready. Remaining: Done when 4 (the auto-merge waits for `backend` on the ready PR) and Done when 5 (the `backend` run on main publishes `:stable` and `:sha-<7>`), recorded after the merge.
- 2026-11-23 tester: passed: Done when 4 (auto-merge 45124305272 logged "backend passed." before merging #66) and Done when 5 (backend 45124333387 on main published `sha-90cdb72` and `stable`, same digest; CI on main 45124330421 green) recorded. Nothing remains. Done.
