---
id: D-0028
title: "No guarded paths: every green PR merges, and agents may merge green PRs themselves; pushing to main and skipping hooks stay blocked"
description: "Replaces D-0017: Sander no longer reviews decisions, the backend or any other path; the auto-merge workflow merges every green non-draft PR into main, agents may run gh pr merge on a green PR, and only direct pushes to main and skipped git hooks stay blocked by the local guard."
status: Replaced
date: 2026-11-19
decided_by: sander
replaces: [D-0017]
replaced_by: [D-0030]
resolves: []
tags: [process]
---

# Context

D-0017 made Sander review every PR touching the NAS backend, sync, the local database, the
service worker, auth, or the rules themselves, and stopped agents from merging. By the end of
v1 that made him the bottleneck: PRs waited on him, and he merged batches without needing
to change them. On 2026-11-19 he chose "yolo mode": no paths guarded, and agents may merge
green PRs themselves. Pushing straight to `main` stays blocked.

# Decision

- **Every change still goes through a PR,** and CI runs on it: type checks, unit tests, the
  task-index check, end-to-end tests, and the backend and sync tests against a throwaway
  PocketBase.
- **No guarded paths.** The auto-merge workflow merges every green, non-draft PR into `main`.
  CODEOWNERS and the guarded-path script are removed.
- **Agents may merge** a PR with `gh pr merge` once all its checks are green. Never a red,
  pending or draft PR.
- **Still blocked:** pushing to `main` directly (`.claude/settings.json` and the pre-push hook
  in `.githooks/`) and skipping git hooks (`--no-verify`).
- **Stacked PRs:** the workflow only merges PRs whose base is `main`. Retarget a stacked PR
  to `main` after its base merges.
- Decisions are still recorded (D-0001); agents now merge them without Sander's review.
  D-0018's backup before a PocketBase schema change still applies; with D-0027 an agent
  takes it.

# Rationale

CI already proves what Sander checked by hand. Removing the wait makes agents end-to-end:
build, prove, merge, deploy. The two blocks that stay (no direct pushes, no skipped hooks)
keep every change visible as a PR with its CI run.

# Consequences

- A bad change to sync, the database or the backend reaches production without a person
  looking at it. The tests are the only gate, so they must cover what matters.
- An agent can change the rules it works under, including this workflow and
  `.claude/settings.json`. It must say so plainly in the PR.
- When the repository goes public (T-0021), branch protection on `main` requires the `checks`
  status check and no review.

# Guidance for agents

- Merge only when every check on the PR is green; wait for them with `gh pr checks --watch`.
- Never push to `main` or use `--no-verify`.
- Before merging a PR that changes PocketBase's migrations, hooks or version, take a backup on
  the NAS (D-0018, D-0027).
- Say plainly in the PR when it changes the merge workflow, `.claude/` or `.githooks/`.
- Decisions Sander hasn't made are still raised as open questions, not chosen by an agent.
