---
id: D-0017
title: "Agents may auto-merge a green PR, except one that touches a guarded path; until the repo is public a local guard stops agents merging or pushing to main"
description: "D-0012's auto-merge rule and question exception, with .claude/ and .githooks/ added to the guarded paths, and a local guard (Claude Code permissions and a versioned pre-push hook) that stops agents merging PRs or pushing to main while GitHub Free offers no branch protection; branch protection replaces it when the repo goes public."
status: Replaced
date: 2026-11-17
decided_by: sander
replaces: [D-0012]
replaced_by: [D-0028]
resolves: [Q-001]
tags: [process, safety]
---

# Context

A merge to `main` deploys to production: the front end on Netlify, the backend through
Watchtower. Sander wants low-risk work to flow without him, but on an offline-first app the
dangerous changes aren't only on the server: a bad local schema change or service worker can
lose unsynced photos or strand the installed app.

The repository is private on GitHub Free, which offers no branch protection, rulesets or
code-owner reviews for private repositories (Q-001). The auto-merge workflow never merges a
guarded PR, but nothing on GitHub stopped an agent from merging one by hand or pushing
straight to `main`. Answered in a design interview on 2026-11-17.

# Decision

- Every change goes through a PR. CI runs type checks, unit tests, end-to-end tests on the
  seeded data, and the sync tests against a throwaway PocketBase.
- A PR that touches none of the guarded paths auto-merges when CI is green.
- A PR that touches any guarded path needs Sander's review and merge:
  - **NAS backend:** `deploy/nas/` (migrations, hooks, `serve.json`, Dockerfile, compose).
  - **Sync and local database:** the sync engine and the Dexie schema and upgrades.
  - **Service worker and auth.**
  - **The rules:** `docs/decisions/`, `AGENTS.md`, `CLAUDE.md`, `.github/`, `.claude/`,
    `.githooks/`.
- **Exception, raising questions:** a PR whose only guarded changes are new files
  `docs/decisions/Q-NNN-<slug>.md` and added lines in `docs/decisions/index.md` that list a
  question (plus at most the removal of a `None yet.` / `None.` placeholder) auto-merges when
  green. Editing, resolving, renaming or deleting a question, any decision change, and any
  other index change stay guarded.
- CI decides from the changed files and their diffs, not from the agent's judgement. The
  guarded path list lives in CODEOWNERS and the auto-merge script; the question exception
  lives only in the script. All of them are guarded themselves.
- **Local guard, while the repository is private:**
  - The project's `.claude/settings.json` denies Claude Code `gh pr merge`, the GitHub merge
    API, and `git push` to `main`.
  - A versioned pre-push hook in `.githooks/` refuses pushes to `main` for every agent and
    tool on Sander's machines; `npm install` points `core.hooksPath` at it.
  - So only the auto-merge workflow and Sander merge, and nobody pushes to `main` directly.
- **When the repository goes public** (D-0010, T-0021): branch protection on `main` with the
  required CI check and code-owner review takes over; the local guard may stay as a second
  line.

# Rationale

Fast flow for UI work and for asking questions; a person on every change that can lose data,
expose it, or change the rules agents work under. The local guard costs nothing and covers
every agent on Sander's machines, Codex included, until GitHub can enforce it for free.

# Consequences

- Code for sync, the local database, the service worker and auth must stay in their own
  folders so the path rule can find it.
- The guard is local: an agent on another machine without the hook, or one that skips hooks,
  isn't stopped. GitHub enforces it only after the repo is public.
- Sander pushes to `main` himself only by bypassing the hook deliberately
  (`git push --no-verify`); normally he merges in GitHub.

# Guidance for agents

- Keep sync, local database, service worker and auth code inside their guarded folders.
  Don't move such logic elsewhere to avoid review.
- Raise a question in its own PR, with nothing else in it, so it can merge itself.
- Never answer, resolve or edit a question yourself, and never put a decision in a
  question-only PR.
- Never change the guarded path list, CODEOWNERS, the question exception, the auto-merge
  workflow, `.claude/` or `.githooks/` without saying so plainly in the PR.
- Never merge a PR, push to `main`, or skip git hooks (`--no-verify`); the auto-merge
  workflow and Sander merge.
