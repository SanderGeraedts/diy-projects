---
id: T-0033
title: "Update the harness from v0.1.0 to v0.9.0"
description: "G-0005: pin the harness and both reusable workflows at v0.9.0, commit what harness sync writes (agents sized by G-0031, the grill skill, the templates, the ask rules), follow each version's update notes, and per changed global decision open a task or say why none is needed."
status: Done
size: small
depends_on: []
decisions: [G-0004, G-0005, G-0011, G-0016, G-0026, G-0027, G-0028, G-0029, G-0030, G-0031, G-0032, D-0030]
raised_on: 2026-11-22
done_on: 2026-11-22
result: [https://github.com/SanderGeraedts/diy-projects/pull/61]
---

# Goal

Sander, on 2026-11-22: wait for harness 0.9.0, then update to it and carry on with T-0030,
T-0031 and T-0032. The project pinned `v0.1.0` since T-0028.

After this task the project runs on v0.9.0, the way the harness's README (*Update*) says:

- `package.json` pins `github:SanderGeraedts/harness#v0.9.0`, and `ci.yml` and
  `auto-merge.yml` call the reusable workflows at `@v0.9.0` (G-0004, D-0030).
- What `pnpm exec harness sync` writes is committed: the four agents in `.claude/agents/`
  (sized tasks, G-0031; no secrets, G-0026), `.claude/skills/grill/SKILL.md`, the ask rules
  in `.claude/settings.json` (`confirmed=true`, `project-down`, `confirmation=`), the
  registry README with its project section, and the decision and task templates
  (`size: full`).
- The per-version notes are followed:
  - 0.2.0: `ci.yml` gets `workflow_dispatch:`, so the auto-merge workflow can start CI on
    `main` after a merge; `auto-merge.yml` already grants `actions: write`.
  - 0.7.0: this project syncs, so `auto-merge.yml` listens to `[CI, backend]` and passes
    `wait-for: CI,backend`: a pull request whose backend run failed no longer merges. (This
    project's backend workflow is named `backend`, not the template's `Backend`.)
  - 0.8.0: `CLAUDE.md` gains the line on `.claude/skills/`.
  - 0.9.0: the end-to-end job fails on a test that passed only on a retry. The last eight
    CI runs on this repository had no flaky test, so nothing needs fixing first.
- Per global decision that `harness changes v0.1.0 v0.9.0` lists, a task to conform or the
  reason none is needed (G-0005), in *Notes*.

# Done when

1. `pnpm install --frozen-lockfile` succeeds and `pnpm exec harness check` prints four `✓`
   lines (tasks, decisions, engineers, generated files: current).
2. `pnpm run typecheck` and `pnpm test` pass.
3. `grep -n "harness" package.json .github/workflows/ci.yml .github/workflows/auto-merge.yml`
   shows `#v0.9.0` and `@v0.9.0` and no `v0.1.0`.
4. `pnpm exec harness sync` run again on the branch leaves `git status` clean.
5. CI on the pull request is green (`checks / checks` and `pocketbase-auth`), with no test
   that passed only on a retry.

# Notes

**`pnpm exec harness changes v0.1.0 v0.9.0`, per decision:**

| Global decision | What it means here | Action |
| --- | --- | --- |
| G-0031 replaces G-0008: tasks are sized; CI is the full run | The agents and the task template come from `sync` in this task. Open tasks without `size` count as full. | Conform: done here; T-0030 sized small, T-0031 and T-0032 full. |
| G-0026: infrastructure secrets only in the infrastructure repository's GitHub environment | `deploy/nas/admin/README.md` still has a TrueNAS key stored on the laptop. | T-0034, with Q-006 (issue #60) for the Engineer on revoking that key. |
| G-0027 replaces G-0022: the NAS through `harness nas`, normally `--remote` on the runner | The project's NAS notes describe only the local route. | T-0034. The project rule in `AGENTS.md` now names G-0026 and G-0027. |
| G-0028 replaces G-0024: spin-up through the infrastructure workflows | Applies when a project is created. This project's site and backend were set up by hand before it and keep running as they are. | None. |
| G-0029 replaces G-0025: private by default; the ruleset wherever GitHub allows one | The repository is public, and `main` has the ruleset (`checks / checks` required, no deletion, no force-push), as `gh api repos/SanderGeraedts/diy-projects/rules/branches/main` shows. | None: conforms. |
| G-0030: a private project's image needs a pull token; a public one needs none | The repository and its image are public: `ghcr.io/sandergeraedts/diy-projects-pocketbase:stable` pulls without signing in (HTTP 200 on its manifest with an anonymous token, 2026-11-22). | None: conforms. Whether the NAS app still carries an old pull login is checked in T-0034. |
| G-0032: `harness backend`, a throwaway backend without Docker | It reads `backend/Dockerfile`; this project's backend is in `deploy/nas/`, so it doesn't run here yet. | T-0035. |

- **Workflow and `.claude/` changes:** this pull request changes `.github/workflows/ci.yml`,
  `.github/workflows/auto-merge.yml`, `.claude/agents/`, `.claude/skills/` and
  `.claude/settings.json`; `.githooks/` is unchanged. GitHub runs `workflow_run` workflows
  from `main`, so the new auto-merge (CI started on `main` after a merge, waiting for
  `backend`) takes effect from the first merge after this one. Whoever merges the next pull
  request notes in this task's *Log* that a `workflow_dispatch` CI run on `main` followed.
- `pnpm install` says "Agent skills awaiting approval: @sandergeraedts/harness (git),
  @tanstack/react-router". That is pnpm's own offer to install the skills packages ship;
  the harness's skill comes from `harness sync` instead, so nothing is approved.
- Q-006 doesn't block this task, nor T-0030 to T-0032.

# Design

Nothing visible.

# Test

Tester, 2026-11-22, on `harness-v0.9.0` at `a86854c`, following G-0031 (CI is the full run;
read its log, run the rest here).

**1. Clean install and `harness check`** (after `rm -rf node_modules`):

```
$ pnpm install --frozen-lockfile
Done in 5.5s using pnpm v12.18.0
$ pnpm exec harness check
✓ tasks: 35 tasks, index in step
✓ decisions: 40 records, index complete, 0 overrules valid
✓ engineers: 2 listed
✓ generated files: current
$ pnpm exec harness --version
0.9.0
```

**2. Typecheck and unit tests:**

```
$ pnpm run typecheck
$ tsc --noEmit                      (exit 0)
$ pnpm test
      Tests  334 passed | 26 skipped (360)
```

**3. The pins:**

```
$ grep -n "harness" package.json .github/workflows/ci.yml .github/workflows/auto-merge.yml
package.json:34:    "@sandergeraedts/harness": "github:SanderGeraedts/harness#v0.9.0",
.github/workflows/ci.yml:25:    uses: SanderGeraedts/harness/.github/workflows/ci.yml@v0.9.0
.github/workflows/auto-merge.yml:22:    uses: SanderGeraedts/harness/.github/workflows/auto-merge.yml@v0.9.0
(plus comment and script lines)
$ grep -rn "v0.1.0" package.json .github/workflows/ci.yml .github/workflows/auto-merge.yml
(no output, exit 1)
```

**4. Generated files:**

```
$ pnpm exec harness sync
✓ generated files are current
$ git status --porcelain
(empty)
```

**5. CI** (run 45072210136, attempt 1, on `a86854c`; the run on `91562de` was cancelled by
the newer push): `checks / checks` success, `pocketbase-auth` success; `shards` and the
sharded e2e job skipped because `e2e-shards` is 1, so the end-to-end tests ran inside
`checks / checks`. From its log: `harness check` four `✓`, `Tests 334 passed | 26 skipped
(360)`, and Playwright `58 passed (33.8s)` with no `flaky` line (v0.9.0's flaky guard ran);
`pocketbase-auth`: sign-in 5 passed, sync 13 passed, photo files 8 passed. No retry-only pass.

**What I tried beyond the check:**

- Permissions: `auto-merge.yml` keeps `contents: write`, `pull-requests: write`,
  `actions: write` (only the comment changed); `ci.yml` keeps `contents: read`. The
  `.claude/settings.json` diff only adds six `ask` entries (`confirmed=true`,
  `project-down`, `confirmation=` for Bash and PowerShell); no `allow` entry changed. The
  agents' diff changes no `tools`/`model` front matter.
- Ruleset: `gh api repos/SanderGeraedts/diy-projects/rules/branches/main` still shows
  ruleset 27708628 ("harness: default branch", active): deletion, non_fast_forward,
  pull_request, required check `checks / checks`. This pull request doesn't touch it.
- The reusable `auto-merge.yml@v0.9.0` accepts `wait-for`, `backend-workflow`,
  `backend-paths` and defaults `ci-workflow: ci.yml`, which now has `workflow_dispatch:`;
  `wait-for: CI,backend` matches the workflow names `CI` and `backend` (backend.yml's
  `name: backend`, lower case).
- `harness changes v0.1.0 v0.9.0` names G-0008, G-0022, G-0024, G-0025, G-0026 to G-0032;
  every one is covered in *Notes* (the replaced ones through their successors). T-0034,
  T-0035 exist, sized and Open; Q-006 is Open with issue #60 assigned to SanderGeraedts;
  T-0030 small, T-0031 and T-0032 full, each with a Log line.
- `harness sync` twice in a row: still clean.
- Not testable before the merge: GitHub runs `workflow_run` workflows from `main`, so the
  new auto-merge (CI dispatched on `main`, waiting for `backend`) first acts on the next
  merge. *Notes* already asks whoever merges next to log that run; it is an agent's check,
  not a human's, so the task is Done.

**Verdict:** passed.

# Log

- 2026-11-22 architect: updated the harness to v0.9.0 on branch `harness-v0.9.0`: `pnpm add -D github:SanderGeraedts/harness#v0.9.0`, `harness sync` (agents, grill skill, templates, ask rules), both workflows at `@v0.9.0`, `workflow_dispatch` on CI, auto-merge waits for `backend`, the skills line in `CLAUDE.md`, the NAS rule in `AGENTS.md` on G-0026 and G-0027. Per changed global decision: T-0034 (G-0026, G-0027) with Q-006 (#60), T-0035 (G-0032), none for G-0028, G-0029, G-0030; G-0031 conformed here and T-0030 to T-0032 sized. Small. Handed to the tester.
- 2026-11-22 tester: passed
