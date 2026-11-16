---
id: T-0001
title: "Scaffold the app, CI and the auto-merge gate"
description: "An installable, empty React + Vite PWA with seeded demo data, deployed to Netlify with previews, and CI that runs checks and enforces the guarded-path auto-merge rule."
status: Open
guarded: true
depends_on: []
decisions: [D-0006, D-0007, D-0009, D-0010]
raised_on: 2026-11-16
done_on: ""
result: []
---

# Goal

The skeleton every later task builds on: the stack from D-0007, seeded demo data with sync
switched off outside production (D-0006), and the CI and auto-merge gate from D-0009 in
place before any feature work, so agents can work safely from the first feature on. It
touches `.github/`, so it is guarded.

# Done when

- `npm run typecheck`, `npm test` and `npm run build` pass locally and in CI.
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
