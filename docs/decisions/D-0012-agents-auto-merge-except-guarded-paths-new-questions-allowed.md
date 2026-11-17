---
id: D-0012
title: "Agents may auto-merge a green PR, except one that touches a guarded path; raising a new question is allowed"
description: "An agent's PR merges itself when CI is green, unless it touches the NAS backend, the sync engine or local database, the service worker or auth, or the decisions, CI and agent rules; those need Sander's review, enforced by CI from the changed files. One exception: a PR whose only guarded change is adding new open questions (Q-NNN files and their index lines) merges itself too."
status: Replaced
date: 2026-11-16
decided_by: sander
replaces: [D-0009]
replaced_by: [D-0017]
resolves: []
tags: [process, safety]
---

# Context

A merge to `main` deploys to production: the front end on Netlify, the backend through
Watchtower. Sander wants low-risk work to flow without him, but on an offline-first app the
dangerous changes aren't only on the server: a bad local schema change or service worker can
lose unsynced photos or strand the installed app.

D-0009 guarded all of `docs/decisions/`. That also blocked agents from simply *raising* an
open question, which the registry asks them to do whenever something isn't decided
(D-0001): the question sat in a PR waiting for review before Sander could even see it on
`main`. A new question decides nothing, so it needs no review to land; answering it does,
because the answer is a decision.

# Decision

- Every change goes through a PR. CI runs type checks, unit tests, end-to-end tests on the
  seeded data, and the sync tests against a throwaway PocketBase.
- A PR that touches none of the guarded paths auto-merges when CI is green.
- A PR that touches any guarded path needs Sander's review and merge:
  - **NAS backend:** `deploy/nas/` (migrations, hooks, `serve.json`, Dockerfile, compose).
  - **Sync and local database:** the sync engine and the Dexie schema and upgrades.
  - **Service worker and auth.**
  - **The rules:** `docs/decisions/`, `AGENTS.md`, `CLAUDE.md`, `.github/`.
- **Exception, raising questions:** a PR whose only guarded changes are
  - new files `docs/decisions/Q-NNN-<slug>.md`, and
  - added lines in `docs/decisions/index.md` that list a question (`- [Q-NNN …`), plus at
    most the removal of a `None yet.` / `None.` placeholder,

  is treated as unguarded and auto-merges when green. Editing an existing question,
  resolving one, adding or replacing a decision, renaming or deleting any file under
  `docs/decisions/`, or any other change to the index stays guarded.
- CI decides from the changed files and their diffs, not from the agent's judgement. The
  guarded path list lives in CODEOWNERS and the auto-merge script; the question exception
  lives only in the script. All of them are guarded themselves.

# Rationale

Fast flow for UI work and for asking questions; a person on every change that can lose data,
expose it, or change the rules agents work under. A question is a request for a decision,
not a decision, so letting it through costs nothing and gets it in front of Sander sooner.

# Consequences

- Code for sync, the local database, the service worker and auth must stay in their own
  folders so the path rule can find it.
- An agent can put a question on `main` that is badly worded or duplicates another; Sander
  tidies those up when he answers.
- The gate reads diffs, not only file names: if GitHub omits a diff (a very large file), the
  change counts as guarded.

# Guidance for agents

- Keep sync, local database, service worker and auth code inside their guarded folders.
  Don't move such logic elsewhere to avoid review.
- Raise a question in its own PR, with nothing else in it, so it can merge itself.
- Never answer, resolve or edit a question yourself, and never put a decision in a
  question-only PR.
- Never change the guarded path list, CODEOWNERS, the question exception or the
  auto-merge workflow without saying so plainly in the PR.
- Never approve or merge a guarded PR yourself.
