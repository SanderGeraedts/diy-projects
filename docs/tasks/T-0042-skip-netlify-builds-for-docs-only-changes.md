---
id: T-0042
title: "Skip Netlify's preview and production builds when a change touches only documentation"
description: "D-0044: netlify.toml's [build] ignore runs scripts/netlify-ignore.mjs, which skips the build when every changed path is docs-only and builds on anything else or any doubt; proven by a git-range test in pnpm test and one real docs-only pull request that Netlify skips and that still merges itself."
status: Doing
size: small
depends_on: []
decisions: [D-0044, G-0018, G-0019, G-0011, G-0029, G-0012, G-0031]
raised_on: 2026-11-25
done_on: ""
result: [https://github.com/SanderGeraedts/diy-projects/pull/76]
---

# Goal

Netlify's build minutes are nearly used up (278 of 300 this month, shared with another
project). About 213 of them were this project's builds, about 149 of those deploy previews,
and many pull requests here change only `docs/` (tasks, decisions, lessons). Sander (Engineer)
decided on 2026-11-25 to skip Netlify builds for docs-only changes (D-0044).

Add a `[build] ignore` command to `netlify.toml` that runs a small Node script,
`scripts/netlify-ignore.mjs`, which exits 0 (Netlify skips the build) only when every path
changed in the range D-0044 defines is docs-only, and exits 1 (build) otherwise. It applies
to deploy previews and to production; branch deploys always build. It follows the same
approach and paths as the reading list's T-0099 (D-0078 there), so both projects behave alike.

What D-0044 fixes, in short (read the record for the full rules):

- **Docs-only:** at least one changed path, and every changed path is under `docs/` or is a
  `*.md` at the repository root. Nothing else: Markdown anywhere else (`deploy/`, `.claude/`,
  `src/`, `public/`, `e2e/`, `backend/`), `public/**`, `netlify.toml`, the script itself,
  `package.json`, `pnpm-lock.yaml`, other config files and `LICENSE` build. Take paths from
  `git diff --name-only --no-renames` (so both names of a rename count, and deletions too).
- **Range, deploy preview:** always `merge-base(origin/main, COMMIT_REF)..COMMIT_REF`, never
  `CACHED_COMMIT_REF`. Netlify's clone may lack `origin/main` or enough history: run
  `git fetch origin main` (deepen if shallow) and build if the merge base still can't be
  found.
- **Range, production:** `CACHED_COMMIT_REF..COMMIT_REF` only when both are set, they differ
  and the cached commit is an ancestor of `COMMIT_REF` (`git merge-base --is-ancestor`);
  otherwise build (a "clear cache and deploy" gives equal refs and must build).
- **Fail safe:** any error, unset `COMMIT_REF`, empty range or unknown commit exits 1. The
  script prints `CONTEXT`, both refs, the range used, the changed paths (or their count) and
  `skip` or `build` with the reason, so the deploy log shows why.
- Use only Node's built-ins (`node:child_process`, `node:process`), so it runs before
  `pnpm install`. Keep the path rule a pure exported function so it can be tested alone.

Nothing a user sees changes: a skipped build leaves the deployed site as it was, and the
app's `build-id` meta tag (T-0019, `vite.config.ts`) keeps naming the commit of the last real
build, which nothing in `src/` compares against.

# Done when

1. **The script, tested without Netlify.** `pnpm test` runs a new test,
   `scripts/netlify-ignore.test.mjs` (add `scripts/**/*.test.mjs` to `test.include` in
   `vite.config.ts`), that makes a throwaway git repository with a `main` branch and runs the
   script with `CONTEXT`, `COMMIT_REF` and `CACHED_COMMIT_REF` set, asserting its exit code:

   | Case | Exit |
   | --- | --- |
   | preview (`CACHED_COMMIT_REF` = `COMMIT_REF`, as on a first build), only `docs/tasks/*.md` and `docs/decisions/*.md` changed since main | 0 |
   | preview, only `README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/lessons.md`, `docs/deploy/netlify.md` | 0 |
   | preview, no change since main (empty range) | 1 |
   | preview, `src/x.ts` changed | 1 |
   | preview, `docs/` and `src/` both changed | 1 |
   | preview, `deploy/nas/README.md`, `.claude/agents/x.md`, `src/notes.md`, `public/x.md`, `e2e/x.md` or `backend/x.md` | 1 each |
   | preview, `netlify.toml`, `scripts/netlify-ignore.mjs`, `vite.config.ts`, `package.json`, `pnpm-lock.yaml`, `LICENSE` | 1 each |
   | preview, a rename `docs/a.md` → `src/a.md`, and a deleted `src/` file | 1 each |
   | preview, a code commit then a docs-only commit, with `CACHED_COMMIT_REF` set to the code commit (it is ignored: the whole PR counts) | 1 |
   | preview, no `origin/main` locally but fetchable from the throwaway remote | per the merge base |
   | preview, no `main` and no way to fetch it | 1 |
   | production, docs-only commit after the cached one | 0 |
   | production, code commit after the cached one | 1 |
   | production, `CACHED_COMMIT_REF` equal to `COMMIT_REF`, unset, or an unknown sha | 1 each |
   | `CONTEXT=branch-deploy` or unset, docs-only | 1 |
   | `COMMIT_REF` unset | 1 |

   The test passes in CI (`checks / checks`) and locally on Windows (Git Bash) with
   `pnpm test -- scripts/netlify-ignore`.
2. **The delivery pull request builds.** It changes `netlify.toml` and the script, so its
   first deploy preview must build: its deploy log shows the script's lines with `build` and
   the merge base as the range (this is the real check of the first-preview case, where
   Netlify's two refs may be equal; record the `CACHED_COMMIT_REF` and `COMMIT_REF` the log
   shows in *Test*). Its production deploy after the merge also builds.
3. **A real docs-only pull request is skipped and still merges.** After (2) is merged, the
   next docs-only pull request (for example the one that marks this task Done) shows in its
   checks the Netlify deploy preview as skipped or cancelled because of the ignore command,
   not built; `checks / checks` passes; the auto-merge workflow merges it once it isn't a
   draft. Its production deploy on Netlify is also skipped, and
   `curl -s https://projects.sanderg.nl/ | grep -o 'name="build-id" content="[^"]*"'` still
   shows the commit of the last real build, not the docs-only merge. Record the PR's
   `gh pr checks` output and the deploy log lines in *Test*.

# Notes

- Decision: D-0044 (overrules G-0018's "a deploy preview for every pull request" for docs-only
  changes). G-0019 still holds: the script reads no Netlify environment variable beyond
  `CONTEXT`, `COMMIT_REF` and `CACHED_COMMIT_REF`, and nothing here touches `POCKETBASE_URL`,
  the production PocketBase address or the NAS.
- **Merging doesn't depend on Netlify.** Checked 2026-11-25 with
  `gh api repos/SanderGeraedts/diy-projects/rulesets`: the ruleset "harness: default branch"
  requires only the status check `checks / checks` (GitHub Actions). The auto-merge workflow
  (`.github/workflows/auto-merge.yml`, harness v0.9.0) waits only for the `CI` and `backend`
  workflow runs and never reads commit statuses. PR #75's checks show Netlify's statuses
  (`netlify/diy-projects-sanderg/deploy-preview`, "Header rules", "Redirect rules", "Pages
  changed") as not required. Don't make any of them required.
- Netlify's environment (from its documentation; confirm in (2)): `COMMIT_REF` is the commit
  being built; `CACHED_COMMIT_REF` is the commit of the last build Netlify has a cache for.
  On a pull request's first preview there is none, and it is commonly equal to `COMMIT_REF`;
  that is why previews never use it. In production a skipped build's commit may become the
  next build's `CACHED_COMMIT_REF`; that is safe, since a skipped commit only ever adds docs
  to what was last built.
- **Same as the reading list (T-0099, D-0078 there).** The approach and paths are the same,
  with no difference needed here: diy-projects' other Markdown (`deploy/nas/*.md`,
  `.claude/**`) changes rarely, and building for it keeps the rule identical in both
  projects.
- **Docs that promised a preview on every pull request:** `docs/deploy/netlify.md` (step 2
  and *Checking a preview*) is updated in the architect's commit to say docs-only pull
  requests get none. No other doc here promises one (`.claude/agents/ux-designer.md` mentions
  a preview address, but only for changes a user sees, which always build; it is generated
  by the harness).
- No Markdown file is read by the app or the build today: `grep` over `src/`, `index.html`,
  `vite.config.ts`, `public/` and `scripts/` finds no `.md` import or `docs/` path.
- Netlify prints the ignore command's output in the deploy log; a cancelled build still
  shows a few seconds of clone time. Whether those seconds count toward the build minutes is
  for (3) to observe on the Netlify usage page if Sander wants it confirmed; it doesn't
  change the task.
- The PR changes `netlify.toml` (deploy configuration) and `vite.config.ts` (test include
  only): say so in its description. No workflow, `.claude/` or `.githooks/` change.
- The reading list has its own task for the same change; this task covers only
  diy-projects. The architect proposes D-0044 to the harness as a global decision (G-0006).

# Design

Nothing visible.

# Test

# Log

- 2026-11-25 architect: raised on Sander's request (Engineer) to skip Netlify builds for docs-only pull requests; recorded D-0044 (overrules G-0018 for docs-only changes); checked that the ruleset requires only `checks / checks` and auto-merge waits only for CI and backend, so a skipped Netlify build can't block a merge; aligned with the reading list's approach (T-0099, D-0078 there: previews always against the merge base, docs-only is `docs/**` and root `*.md`); updated `docs/deploy/netlify.md`; size small (tooling, nothing visible), to the developer.
- 2026-11-25 developer: built `scripts/netlify-ignore.mjs` (Node built-ins and git; pure `isDocsOnlyPath`/`isDocsOnlyChange`; previews diff `merge-base(origin/main, COMMIT_REF)..COMMIT_REF`, fetching `origin/main` when missing and unshallowing when no merge base; production diffs `CACHED_COMMIT_REF..COMMIT_REF` only with both set, different and the cached one an ancestor; anything else or any error builds; logs CONTEXT, both refs, range, paths and verdict), `[build] ignore = "node scripts/netlify-ignore.mjs"` in `netlify.toml`, and `scripts/netlify-ignore.test.mjs` (every *Done when* (1) case in throwaway repositories, plus a non-ancestor production case), added to `test.include` in `vite.config.ts`. Locally on Windows: `pnpm exec vitest run scripts/netlify-ignore` → `Test Files 1 passed (1)`, `Tests 33 passed (33)`; `pnpm run typecheck` clean; `pnpm exec harness check` all ✓. Dry run in this checkout on the docs-only commit 5d897f2 (`CONTEXT=deploy-preview`, both refs equal) → `range 810e99e..5d897f2`, 5 docs paths, `skip (docs-only change)`, exit 0; with no `COMMIT_REF` → `build (COMMIT_REF is unset)`, exit 1.
