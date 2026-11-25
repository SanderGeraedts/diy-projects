---
id: D-0044
title: "Netlify skips the deploy preview and the production build of a change that touches only documentation"
description: "Overrules G-0018's deploy preview for every pull request, for docs-only changes: netlify.toml's [build] ignore runs node scripts/netlify-ignore.mjs, which skips the Netlify build (preview and production) when at least one path changed and every changed path is under docs/ or is a Markdown file at the root; previews compare against the merge base with main, production against Netlify's last built commit; anything else, any doubt and any error builds."
status: Accepted
date: 2026-11-25
decided_by: engineer
overrules: [G-0018]
replaces: []
replaced_by: []
resolves: []
tags: [hosting, process]
---

# Context

Netlify's free plan gives 300 build minutes a month, shared by this project and the other
projects on the same Netlify account. On 2026-11-25, 278 of them were used. This project had
about 213 builds that month (about 149 deploy previews and 64 production builds) of about 13 s
each, and many of its pull requests change only `docs/`: tasks, decisions, lessons. Those
builds produce exactly the same site as the build before them.

G-0018 says the front end is on Netlify "with a deploy preview for every pull request". A
preview of a change that touches no file the build reads shows nothing new, so for those
changes this project sets that part aside. Sander (Engineer) decided it on 2026-11-25: "skip
previews for docs-only PRs in both repos".

Merging doesn't depend on Netlify: the default branch's ruleset requires only `checks / checks`
(GitHub Actions), and the auto-merge workflow waits only for the CI and backend workflows.

# Decision

- `netlify.toml`'s `[build] ignore` runs a script in the repository (`node scripts/netlify-ignore.mjs`).
  Netlify skips the build when it exits 0 and builds when it exits non-zero.
- **Docs-only** means at least one path changed, and every changed path (added, changed,
  deleted, and both names of a rename) is either under `docs/` or a Markdown file (`*.md`) at
  the repository root (README, AGENTS, CLAUDE). Everything else builds, including Markdown
  anywhere else (`deploy/`, `.claude/`, `src/`, `public/`, `e2e/`, `backend/`), `public/`,
  `netlify.toml`, the ignore script itself, `package.json`, the lockfile, other config files
  and `LICENSE`.
- **The range compared:**
  - Deploy preview: from the merge base of `origin/main` and `COMMIT_REF` to `COMMIT_REF`,
    so the whole pull request counts. Never `CACHED_COMMIT_REF`, which on a new branch's first
    build can skip it wrongly. When `origin/main` is missing, `git fetch origin main` first;
    when that fails, build.
  - Production: from `CACHED_COMMIT_REF` to `COMMIT_REF` only when both are set, they differ
    and the cached commit is an ancestor of `COMMIT_REF`; otherwise build.
  - Any other context (branch deploys) builds.
- **When in doubt, build:** an empty or missing range, a commit git can't find, a failing git
  command or any other error makes the script exit non-zero. It prints the context, both
  refs, the range it used and its verdict, so the deploy log shows why.

# Rationale

A skipped docs-only build leaves the site exactly as it was: no file the build reads changed.
The `build-id` meta tag (T-0019) keeps the commit of the last real build, which still names the
code that runs. Skipping production too saves about as many minutes as previews do, since
almost every docs-only pull request is merged.

An explicit list of documentation paths, rather than a list of paths the build reads, fails
safe: a new folder or file builds until someone adds it to the list. Netlify's
`CACHED_COMMIT_REF` isn't used for previews: on a pull request's first preview it can equal
`COMMIT_REF`, and the usual `git diff --quiet $CACHED_COMMIT_REF $COMMIT_REF` would then skip
a preview that changes code. Comparing the whole pull request with its merge base means a
docs-only commit on top of a code change still rebuilds; that costs a few builds but is
simple and always right.

The same rules hold in the Engineer's other Netlify project (the reading list's D-0078), so
the two projects behave alike.

# Consequences

- A docs-only pull request has no preview; its Netlify status reports the build as skipped or
  cancelled. No required check depends on it, so it still merges itself.
- A pull request that mixes docs and code always builds.
- Adding a file the build reads under one of the listed paths would need this record replaced
  first.

# Guidance for agents

- Keep the list of docs-only paths narrow; add to it only paths nothing deployed reads.
- Never make the script skip on an error or an unknown range.
- Don't make a Netlify status a required check while this holds: a skipped build must not
  block a merge.
- This would suit every project on Netlify (the Engineer asked for it in both of his projects);
  the architect proposes it to the harness as a global decision (G-0006). Until the harness
  carries it, this record holds here.
