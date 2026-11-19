# AGENTS.md

`diy-projects`: an offline-first PWA for photos and progress of Sander's DIY projects,
synced with PocketBase on his NAS. Built AI-first: agents write the code, working from
recorded decisions and tasks.

## Before you change anything

1. Read [docs/decisions/index.md](docs/decisions/index.md), then the decisions your change
   touches, including their *Guidance for agents*.
2. Work from a task in [docs/tasks/index.md](docs/tasks/index.md), one task per session.
3. If something you need hasn't been decided, raise an open question
   ([docs/decisions/README.md](docs/decisions/README.md)) instead of choosing yourself.

## Rules

- **Decisions are the source of truth,** not chat history. A choice that would need a
  discussion to reverse becomes a decision record, in the same commit as the code.
- **Never contradict an Accepted decision.** Stop and ask Sander.
- **Every change goes through a PR; green PRs merge** (D-0028). No paths are guarded: the
  auto-merge workflow merges green PRs into main, and you may `gh pr merge` a PR once all
  its checks are green. Say plainly in the PR when it changes the merge workflow, `.claude/`
  or `.githooks/`.
- **Never push to `main` or skip git hooks** (D-0028), and never merge a red, pending or
  draft PR.
- **Never point anything but production at the real NAS** (D-0006).
- **Manage the NAS only with `deploy/nas/admin/truenas.mjs`** (D-0027). Ask Sander in chat
  before any `--confirmed` (destructive) call, take a PocketBase backup before merging a
  schema change (D-0018), and never print or commit the key.
- **Use pnpm** (D-0019): `pnpm install`, `pnpm run <script>`, `pnpm exec`; never `npm` or
  `npx`, and never commit a `package-lock.json`.
- **Prove your work.** Run the task's check and report its actual output.
- **Keep task status current** (D-0024): update the task's status, Log and `result` in the
  same PR as the work (every task a PR carries), mark open post-merge checks `Remaining:`,
  record Sander's confirmations right away, and regenerate the index with
  `pnpm run tasks:index`; never edit it by hand.
- **Personal repository** (D-0010): commit as `sandergeraedts@live.nl`, and push or use `gh`
  only as `SanderGeraedts`.
