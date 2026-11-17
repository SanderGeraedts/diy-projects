---
id: D-0019
title: "pnpm is the package manager, pinned in package.json"
description: "Dependencies are installed with pnpm at the version in package.json's packageManager field, with pnpm-lock.yaml as the only lockfile, so parallel worktrees share one content-addressed store instead of each copying node_modules; npm installs are refused."
status: Accepted
date: 2026-11-17
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [stack, tooling]
---

# Context

Agents work in parallel git worktrees, one per task. With npm, every worktree gets its own
full copy of `node_modules` (about 200 MB here, growing), and each install downloads and
writes all of it again. Sander wants worktrees to share their dependencies instead.

pnpm keeps every package once in a global content-addressed store and builds each
`node_modules` from hard links into it (its `.pnpm` folder) plus symlinks for the
dependency tree. Checked on 2026-11-17: a fresh worktree installed offline in about 15 s,
and the same file was one hard link in the store, the main checkout and the worktree.

# Decision

- **pnpm** installs dependencies, at the exact version in `package.json`'s
  `packageManager` field (`pnpm@12.18.0` to start).
- **`pnpm-lock.yaml`** is the only lockfile; `package-lock.json` is never committed.
- Scripts run as `pnpm <script>` / `pnpm run <script>`; one-off binaries as `pnpm exec` or
  `pnpm dlx`, not `npx`.
- A `preinstall` script makes `npm install` fail with "Use pnpm (D-0019)".
- CI installs with `pnpm install --frozen-lockfile` (pnpm/action-setup reads the version
  from `packageManager`); Netlify builds with `pnpm run build` and picks pnpm from the
  lockfile and `packageManager`.
- Where D-0017 says `npm install` sets up the git hooks, that now means `pnpm install`
  (the `prepare` script runs under both).

# Rationale

One store, hard-linked into every worktree, makes a new worktree's install take seconds and
almost no extra disk. pnpm's strict `node_modules` also catches code that imports a package
it didn't declare, which npm's flat layout hides.

# Consequences

- The pnpm store must be on the same drive as the worktrees for hard links (here both on
  `C:`); across drives pnpm falls back to copying.
- npm commands no longer work in this repo: anyone (or any agent) has to have pnpm.
- pnpm doesn't run dependencies' install scripts unless allowed; a new dependency that needs
  one has to be allowed explicitly (`pnpm approve-builds`), which shows up in review.

# Guidance for agents

- Use `pnpm install`, `pnpm add`, `pnpm run`, `pnpm exec`; never `npm` or `npx` here.
- Never commit a `package-lock.json` or `yarn.lock`.
- Change the pnpm version only by changing `packageManager`, and say so in the PR.
- If a package needs its install script, allow it explicitly and say why in the PR.
