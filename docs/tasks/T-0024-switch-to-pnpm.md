---
id: T-0024
title: "Switch the project to pnpm"
description: "Move from npm to pnpm (D-0019): pnpm-lock.yaml converted from the npm lockfile, packageManager pinned, CI, Netlify and Playwright on pnpm, npm installs refused, and the docs' commands updated."
status: Done
guarded: true
depends_on: []
decisions: [D-0006, D-0017, D-0019]
raised_on: 2026-11-17
done_on: "2026-11-17"
result: [https://github.com/SanderGeraedts/diy-projects/pull/9]
---

# Goal

D-0019: parallel worktrees share pnpm's store instead of each copying `node_modules`.

- `pnpm import` converts `package-lock.json`, so every dependency keeps its exact version;
  then `package-lock.json` goes.
- `package.json`: `packageManager: pnpm@12.18.0`, and a `preinstall` that refuses npm.
- CI (`.github/workflows/ci.yml`): `pnpm/action-setup`, pnpm cache,
  `pnpm install --frozen-lockfile`, `pnpm exec playwright install`.
- `netlify.toml`: `pnpm run build`. `playwright.config.ts`: `pnpm run preview`.
- `AGENTS.md` and the open tasks' checks use pnpm commands.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass locally
  and in CI.
- `npm install` in a clean copy of the repo fails with "Use pnpm (D-0019)".
- A fresh worktree installs with `pnpm install --frozen-lockfile --offline` in seconds, and
  its files are hard links into the store (`fsutil hardlink list` on one file lists the
  store, the main checkout and the worktree).
- The Netlify deploy preview of the PR builds with pnpm and shows the demo projects.
- Sander reviews the PR (guarded: `.github/`, `AGENTS.md`, `docs/decisions/`).

# Notes

- Existing checkouts: delete `node_modules` before the first `pnpm install`; npm crashes on
  a pnpm-made `node_modules` ("Cannot read properties of null (reading 'matches')").

# Log
- 2026-11-17 claude-code/opus-5.5: PR #9. Locally: typecheck clean, 46/46 unit tests, build ok, 5/5 e2e; npm install in a clean copy fails with "Use pnpm (D-0019)"; a fresh worktree installs offline in 14.2 s, hard-linked to the store. CI `checks` passed; the Netlify deploy preview built with pnpm and shows the demo projects ("Demo data · sync is off (deploy-preview)"). Waiting for Sander's review.
- 2026-11-17 claude-code/opus-5.5: Done. Sander reviewed and merged PR #9.
