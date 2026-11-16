---
id: Q-001
title: "How should the guarded-path review be enforced while the repo is private on a free plan?"
description: "GitHub Free offers no branch protection, rulesets or code-owner reviews on private repos, so nothing on GitHub stops anyone with write access from merging a guarded PR; decide whether to accept that until the repo goes public, pay for Pro, or add a local guard."
status: Open
raised_on: 2026-11-16
raised_by: claude-code/opus-5.5
blocks: []
resolved_by: []
tags: [process, safety]
---

# Question

D-0009 says CI decides from the changed paths, and that a guarded PR needs Sander's review.
While working on T-0001 it turned out that `SanderGeraedts/diy-projects` is private on
GitHub Free, where the API answers *"Upgrade to GitHub Pro or make this repository public
to enable this feature"* for branch protection. Without it:

- CODEOWNERS doesn't require (or even request) Sander's review;
- a failing or missing check doesn't block a merge;
- GitHub's native auto-merge isn't available.

T-0001 therefore implements the gate as a workflow (`.github/workflows/auto-merge.yml`):
after CI passes it merges a PR with no guarded paths, and labels a PR with guarded paths
`needs-review` and leaves it. That covers the *auto*-merge half fully. What it can't do is
stop an agent (or anyone) with write access from merging a guarded PR by hand; that rests
on the rule in `AGENTS.md` alone.

# Options

1. **Accept it until the repo goes public (D-0010), and add a local guard now.** Deny
   `gh pr merge` for agents in the project's `.claude/settings.json` (and say so in
   `AGENTS.md`), so the auto-merge workflow is the only thing that merges for agents. When
   the repo goes public, branch protection is free: require the CI check and code-owner
   review on `main` then. Cost: nothing. Gap: an agent outside Claude Code's settings could
   still merge. **Recommended.**
2. **Upgrade the personal account to GitHub Pro** (about $4 a month) and turn on branch
   protection for `main` now: require the `checks` job, require a code-owner review, and
   let the workflow keep merging non-guarded PRs. Fully enforced by GitHub.
3. **Make the repo public now.** Free enforcement, but replaces D-0010 (private until v1);
   setup details would be public early.

# Answer

Open.
