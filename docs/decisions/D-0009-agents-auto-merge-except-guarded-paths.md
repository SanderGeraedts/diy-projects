---
id: D-0009
title: "Agents may auto-merge a green PR, except one that touches a guarded path"
description: "An agent's PR merges itself when CI is green, unless it touches the NAS backend, the sync engine or local database, the service worker or auth, or the decisions, CI and agent rules; those always need Sander's review, enforced by CI from the changed paths."
status: Accepted
date: 2026-11-16
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [process, safety]
---

# Context

A merge to `main` deploys to production: the front end on Netlify, the backend through
Watchtower. Sander wants low-risk work to flow without him, but on an offline-first app the
dangerous changes aren't only on the server: a bad local schema change or service worker can
lose unsynced photos or strand the installed app.

# Decision

- Every change goes through a PR. CI runs type checks, unit tests, end-to-end tests on the
  seeded data, and the sync tests against a throwaway PocketBase.
- A PR that touches none of the guarded paths auto-merges when CI is green.
- A PR that touches any guarded path needs Sander's review and merge:
  - **NAS backend:** `deploy/nas/` (migrations, hooks, `serve.json`, Dockerfile, compose).
  - **Sync and local database:** the sync engine and the Dexie schema and upgrades.
  - **Service worker and auth.**
  - **The rules:** `docs/decisions/`, `AGENTS.md`, `CLAUDE.md`, `.github/`.
- CI decides from the changed file paths, not from the agent's judgement. The exact path
  list lives in a CODEOWNERS file and the auto-merge workflow, both guarded themselves.

# Rationale

Fast flow for UI work; a person on every change that can lose data, expose it, or change
the rules agents work under.

# Consequences

- Code for sync, the local database, the service worker and auth must stay in their own
  folders so the path rule can find it.

# Guidance for agents

- Keep sync, local database, service worker and auth code inside their guarded folders.
  Don't move such logic elsewhere to avoid review.
- Never change the guarded path list, CODEOWNERS or the auto-merge workflow without saying
  so plainly in the PR.
- Never approve or merge a guarded PR yourself.
