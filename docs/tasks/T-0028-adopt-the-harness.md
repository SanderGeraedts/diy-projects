---
id: T-0028
title: "Adopt the harness"
description: "D-0030: install the harness as a pinned dev dependency, keep only the project-specific rules and decisions here, and use its task index, checks, NAS tool, agent team and reusable CI and auto-merge workflows."
status: Doing
depends_on: []
decisions: [D-0030, G-0001, G-0002, G-0004, G-0011, G-0012, G-0016, G-0019, G-0022, G-0023, G-0025]
raised_on: 2026-11-20
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/56"]
---

# Goal

This project's way of working was extracted into
[the harness](https://github.com/SanderGeraedts/harness). Sander decided that the project
installs it and keeps only what is specific to it (D-0030):

- the harness as a dev dependency pinned at `v0.1.0`, with `.harness/engineers`,
  `docs/lessons.md` and the files `harness sync` writes (`.claude/agents/`,
  `.githooks/pre-push`, the rules in `.claude/settings.json`, the registry README and the
  templates);
- thin `AGENTS.md` and `CLAUDE.md` that point to the harness's rules and global decisions;
- the project decisions whose substance is now a global decision set to Replaced;
- `scripts/tasks-index.mjs` and `deploy/nas/admin/truenas.mjs`, with their tests, replaced
  by `harness tasks-index`, `harness check` and `harness nas`;
- `ci.yml` and `auto-merge.yml` as callers of the harness's reusable workflows.

# Done when

- `pnpm exec harness check`, `pnpm run typecheck`, `pnpm test`, `pnpm run build` and
  `E2E_PORT=4795 pnpm run test:e2e` pass.
- CI is green on the pull request: `checks / checks` and `pocketbase-auth`.
- The ruleset on `main` requires the check under its new name, `checks / checks`.
- The app's dataset on the NAS has a periodic ZFS snapshot task (G-0023).

# Notes

- The harness: `node_modules/@sandergeraedts/harness/` (README, `rules/AGENTS.md`,
  `decisions/`). Never edit the installed copy.
- `harness check` only accepts ids of this registry in `replaced_by`, so the replaced
  decisions name D-0030 there, and D-0030 and the index name the global decision.
- The pull request changes the merge workflow, `.claude/` and `.githooks/`.
- The new `auto-merge.yml` only takes effect once it is on `main`.

# Design

Nothing visible.

# Test

To be written by the tester.

# Log

- 2026-11-20 developer: Started on `adopt-harness`. Installed
  `github:SanderGeraedts/harness#v0.1.0`; added `.harness/engineers` and `docs/lessons.md`;
  `harness sync` wrote the four agents, the pre-push hook, the registry README and templates,
  and added seven PowerShell deny rules to `.claude/settings.json` (the `--confirmed` ask
  rules were already there and stay). `AGENTS.md` and `CLAUDE.md` are thin. D-0030 recorded;
  D-0001, D-0006, D-0008, D-0018, D-0019, D-0021, D-0024, D-0027 and D-0028 set to Replaced.
  D-0007 and D-0029 stay Accepted for their project-specific substance. Removed
  `scripts/tasks-index.mjs`, `deploy/nas/admin/truenas.mjs`, their two tests and the `ws`
  dependency. `ci.yml` and `auto-merge.yml` call the harness's workflows at `v0.1.0`;
  `pocketbase-auth` stays a job of its own.
- 2026-11-20 developer: Draft PR #56. Locally: `harness check` "✓ tasks: 28 tasks, index in
  step", "✓ decisions: 35 records, index complete, 0 overrules valid", "✓ engineers: 2
  listed", "✓ generated files: current"; `pnpm run typecheck` clean; `pnpm test` 27 files
  passed, 3 skipped, 333 tests passed, 26 skipped; `pnpm run build` built; `E2E_PORT=4795
  pnpm run test:e2e` 52 passed, 2 skipped. CI green on #56: `checks / checks` (harness check
  as above, e2e 54 passed) and `pocketbase-auth`. The ruleset on `main` still requires
  `checks`, which CI no longer reports under that name.
- Remaining: at the merge, the ruleset on `main` requires `checks / checks` instead of
  `checks` (`pnpm exec harness protect "checks / checks"`), after the tester has passed the
  PR; the periodic ZFS snapshot task for the app's dataset (G-0023) is still to be created
  on the NAS.
