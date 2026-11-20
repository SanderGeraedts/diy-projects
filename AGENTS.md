# AGENTS.md

`diy-projects`: an offline-first PWA for photos and progress of Sander's DIY projects,
synced with PocketBase on his NAS.

Built AI-first with [the harness](https://github.com/SanderGeraedts/harness) (D-0030):
agents write the code, working from recorded decisions and tasks.

## Before you change anything

1. Read the rules: `node_modules/@sandergeraedts/harness/rules/AGENTS.md`. They apply here
   in full. If that file is missing, run `pnpm install` first.
2. Run `pnpm exec harness role`, and work in the mode it prints.
3. Read the global decisions (`node_modules/@sandergeraedts/harness/decisions/index.md`),
   then this project's ([docs/decisions/index.md](docs/decisions/index.md)). A project
   decision with `overrules` wins over the global decision it names.
4. Work from a task in [docs/tasks/index.md](docs/tasks/index.md).

## Project rules

Rules that hold only for this project. Each one points at the decision behind it.

- **Never point anything but production at the real NAS** (G-0019, D-0023). Previews, the
  dev server and tests never get the production PocketBase address.
- **Personal repository** (D-0010): commit as `sandergeraedts@live.nl`, and push or use `gh`
  only as `SanderGeraedts`.
- **The NAS** (G-0022): the setup for `pnpm exec harness nas` on this project is in
  [deploy/nas/admin/README.md](deploy/nas/admin/README.md). Never commit the NAS's host, a
  tailnet name or a pool name.
- **Backups** (G-0023): the NAS snapshots the app's dataset every hour and keeps each for two
  weeks, so a schema change needs no manual backup first.
