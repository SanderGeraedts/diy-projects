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
- **Guarded paths need Sander's review** (D-0017): `deploy/nas/`, `src/sync/`, `src/db/`,
  `src/sw/`, `src/auth/`, `docs/decisions/`, `AGENTS.md`, `CLAUDE.md`, `.github/`,
  `.claude/`, `.githooks/`. Keep such code in those folders. One exception: a PR that only
  raises new open questions merges itself, so raise each in a PR of its own.
- **Never merge a PR, push to `main`, or skip git hooks** (D-0017). The auto-merge workflow
  and Sander merge.
- **Never point anything but production at the real NAS** (D-0006).
- **Prove your work.** Run the task's check and report its actual output.
- **Personal repository** (D-0010): commit as `sandergeraedts@live.nl`, and push or use `gh`
  only as `SanderGeraedts`.
