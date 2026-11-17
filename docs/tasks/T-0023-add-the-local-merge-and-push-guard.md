---
id: T-0023
title: "Add the local guard: no agent merges or pushes to main"
description: "Claude Code permissions denying gh pr merge, the merge API and pushes to main, a versioned pre-push hook refusing pushes to main, and .claude/ and .githooks/ added to the guarded paths."
status: Open
guarded: true
depends_on: []
decisions: [D-0017]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

D-0017's local guard, while the repository is private:

- `.claude/settings.json` (project, committed): `permissions.deny` for `gh pr merge`,
  `gh api` calls to a PR's `/merge` endpoint, and `git push` to `main` (including
  `HEAD:main` and `--force` forms).
- `.githooks/pre-push`: refuses any push whose remote ref is `refs/heads/main`, with a
  message pointing to D-0017. POSIX `sh`, so it runs in Git Bash on Windows too.
- `package.json`: a `prepare` script that sets `git config core.hooksPath .githooks`, so
  `pnpm install` enables it.
- Add `.claude/` and `.githooks/` to `GUARDED_PATHS` in `.github/scripts/guarded-paths.mjs`
  and to `.github/CODEOWNERS` (the test keeps them identical). Update the D-0012 references
  in `.github/` and `CODEOWNERS` to D-0017 (AGENTS.md already points to it).

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass; the guarded-path tests include
  `.claude/settings.json` and `.githooks/pre-push`.
- After `pnpm install`, `git config core.hooksPath` prints `.githooks`.
- `git push --dry-run origin HEAD:main` is refused by the hook (quote the output); a push of a
  feature branch still works.
- In a Claude Code session in this repo, `gh pr merge` is refused by the permission rule
  (quote it).
- Sander reviews the PR (guarded; it changes the guarded path list, said plainly).

# Notes

- The auto-merge workflow merges on GitHub with its own token, so it isn't affected.
- CI doesn't need the hook; `prepare` must not fail there (`git config` in a checkout works,
  but guard it if `.git` is missing).

# Log
