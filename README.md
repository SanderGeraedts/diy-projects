# diy-projects

An offline-first progress log for DIY projects: projects with a status and tags, dated
entries with photos from the phone's gallery, offline search, and a read-only public view
for visitors. It's an installable web app (PWA) that works with no connection and syncs
with a PocketBase backend you host yourself. The interface is in Dutch.

React + TypeScript, Vite, TanStack Router, vite-plugin-pwa, Dexie (IndexedDB) and
PocketBase. The reasons for each choice are in [`docs/decisions/`](docs/decisions/index.md).

The design system, rendered with demo data:
[`e2e/design.spec.ts-snapshots/design-light-pixel-linux.png`](e2e/design.spec.ts-snapshots/design-light-pixel-linux.png).

## Run it locally

Needs Node 24 (`.nvmrc`) and pnpm (the version is pinned in `package.json`; `corepack
enable` picks it up). npm is refused.

```sh
pnpm install
pnpm run dev          # http://localhost:5173, with seeded demo data and sync off
pnpm run check        # the decision and task registries (harness check)
pnpm run typecheck
pnpm test             # unit tests (Vitest)
pnpm run build        # static build in dist/
pnpm run test:e2e     # end-to-end tests (Playwright) against the build
```

The dev server and every non-production build run offline with demo data; only a
production build with `POCKETBASE_URL` set ever talks to a backend.

## Host it yourself

- **Front end:** a static site on Netlify; `netlify.toml` holds the build settings. Set
  `POCKETBASE_URL` for the production context only. Steps:
  [`docs/deploy/netlify.md`](docs/deploy/netlify.md).
- **Backend:** PocketBase with the schema and hooks baked into an image
  ([`backend/Dockerfile`](backend/Dockerfile)), run on a NAS with Docker Compose and
  reachable from the internet only through Tailscale Funnel, which exposes an allowlist of
  paths. Set `APP_ORIGIN` to your front end's origin (`https://<your-domain>`) so CORS
  allows it. Steps: [`deploy/nas/README.md`](deploy/nas/README.md); background:
  [`docs/deploy/pocketbase-on-the-nas.md`](docs/deploy/pocketbase-on-the-nas.md).

The image is published by `.github/workflows/backend.yml` to this repository's GitHub
Container Registry; in a fork it publishes to yours.

## How it's built

AI-first, with [the harness](https://github.com/SanderGeraedts/harness): a package this
project installs that holds its way of working. Coding agents write most of the code,
working from recorded decisions and tasks rather than chat history.

- The harness: the rules agents follow, the global decisions that hold in every project
  that installs it, a team of four agents (architect, UX designer, developer, tester) and
  the reusable CI and auto-merge workflows. Every change is a PR, and a PR merges once CI is
  green and a tester has passed it.
- [`docs/decisions/`](docs/decisions/index.md): the choices specific to this project, as
  decision records, and every open question.
- [`docs/tasks/`](docs/tasks/index.md): one file per piece of work, each with a check that
  proves it done.
- [`AGENTS.md`](AGENTS.md): what agents read first, and the few rules that hold only here.

`pnpm run check` (`harness check`) verifies the registries and the generated files.

## Licence

MIT, see [`LICENSE`](LICENSE). The Poppins font files in `public/fonts/` are under the SIL
Open Font License 1.1 ([`public/fonts/OFL.txt`](public/fonts/OFL.txt)).
