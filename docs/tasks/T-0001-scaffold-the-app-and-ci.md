---
id: T-0001
title: "Scaffold the app, CI and the auto-merge gate"
description: "An installable, empty React + Vite PWA with seeded demo data, deployed to Netlify with previews, and CI that runs checks and enforces the guarded-path auto-merge rule."
status: Done
guarded: true
depends_on: []
decisions: [D-0006, D-0007, D-0009, D-0010]
raised_on: 2026-11-16
done_on: "2026-11-19"
result: [https://github.com/SanderGeraedts/diy-projects/pull/1, https://github.com/SanderGeraedts/diy-projects/pull/37]
---

# Goal

The skeleton every later task builds on: the stack from D-0007, seeded demo data with sync
switched off outside production (D-0006), and the CI and auto-merge gate from D-0009 in
place before any feature work, so agents can work safely from the first feature on. It
touches `.github/`, so it is guarded.

# Done when

- `pnpm run typecheck`, `pnpm test` and `pnpm run build` pass locally and in CI.
- A PR gets a Netlify deploy preview that installs as a PWA and shows seeded demo projects,
  with no PocketBase address in its configuration.
- A test PR touching only `src/` (outside guarded folders) auto-merges when green; a test PR
  touching a guarded path waits for Sander's review.
- Sander confirms the above.

# Notes

- Folders the gate guards (D-0009): `deploy/nas/`, `src/sync/`, `src/db/`, `src/sw/`,
  `src/auth/`, `docs/decisions/`, `AGENTS.md`, `CLAUDE.md`, `.github/`.
- Netlify site and the `projects.sanderg.nl` domain are set up by Sander; the agent prepares
  `netlify.toml` and the steps.
- Use the personal GitHub account (D-0010).

# Log

- 2026-11-16 claude-code/opus-5.5: scaffolded the app, seed data, CI, auto-merge workflow, CODEOWNERS, netlify.toml and docs/deploy/netlify.md. Locally: typecheck clean, 31 unit tests pass, build passes, 5 e2e tests pass (seeded projects, timeline, manifest + service worker, offline reload, no ts.net in the bundle).
- 2026-11-16 claude-code/opus-5.5: GitHub Free has no branch protection on private repos, so the gate is a workflow that merges non-guarded green PRs and labels guarded ones; enforcing review of guarded PRs raised as Q-001.
- 2026-11-16 claude-code/opus-5.5: opened PR #1; CI `checks` passed in 54s. Waiting for Sander: Netlify site and preview check, review and merge, then the two test PRs for the gate.
- 2026-11-16 claude-code/opus-5.5: PR #1 merged by Sander; projects.sanderg.nl added as the primary domain (Netlify DNS, existing *.sanderg.nl certificate). Guarded-path gate checked on PR #2 (touches docs/decisions/): CI green, the Auto-merge run labelled it needs-review and commented instead of merging. Netlify built deploy-preview-2. Still open: the unguarded half (T-0002 PR should merge itself) and Sander checking a preview on the Pixel.
- 2026-11-17 claude-code/opus-5.5: Gate checked both ways. Unguarded: PR #13 (T-0006, src/photos/) and PR #10 (docs/tasks) merged themselves when green. Guarded: PRs #11 (src/db/) and #12 (.github/, .claude/, .githooks/) got `needs-review` and wait. Question-only PRs #4–#7 merged themselves (D-0017's exception). Netlify previews work (deploy-preview-9). Remaining for Done: Sander confirms.
- 2026-11-19 claude-code/opus-5.5: Done. The gate has worked both ways since 2026-11-17 (guarded PRs labelled needs-review, unguarded and question-only PRs merged themselves), Netlify previews and production deploy on merge; Sander has used it throughout, which settles "Sander confirms".
