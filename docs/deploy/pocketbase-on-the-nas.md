# PocketBase on the NAS: what we know works

Lessons from running PocketBase on the NAS for Hanna's Reading List (since November 2026),
written down so this project doesn't depend on that repository. D-0005 sets the shape
(Funnel, GitHub Actions, Watchtower); this file is the *how*, for T-0013 (the image) and
T-0014 (running it). Where this app differs from Reading List, it says so.

Nothing here may contain the tailnet name, the NAS's paths or any secret (D-0005, D-0010):
use the placeholders below.

| Placeholder | Means |
| --- | --- |
| `<tailnet>` | the tailnet's MagicDNS name, like `tail1234` |
| `/mnt/POOL/apps/diy-projects` | the NAS dataset for this app |
| `tskey-auth-REPLACE-ME` | a one-time Tailscale auth key |

## 1. Shape on the NAS

Three containers in one compose app (TrueNAS SCALE / HexOS: **Apps → Discover Apps →
Install via YAML**):

- **tailscale** (`ghcr.io/tailscale/tailscale`, pinned tag): `TS_USERSPACE: "true"`,
  `TS_STATE_DIR: /var/lib/tailscale`, `TS_SERVE_CONFIG: /config/serve.json`, a
  `TS_HOSTNAME`. The auth key is only needed on the first start; the login is kept in the
  state folder, so remove `TS_AUTHKEY` afterwards.
- **pocketbase**: `network_mode: service:tailscale`, listening on `127.0.0.1:8090`. It
  shares Tailscale's network namespace, so **the only way in is through Tailscale**; no
  port is published on the NAS or the router.
- **watchtower**: updates only the pocketbase container (see 4).

On the NAS: one dataset with two empty folders, `tailscale/` and `pb_data/`, plus
`serve.json` copied next to them. That's the only file copied by hand; the schema and hooks
come inside the image.

Command line for pocketbase (keep CI's identical, see 3):

```
serve --http=127.0.0.1:8090 --dir=/pb_data --migrationsDir=/pb_migrations
      --hooksDir=/pb_hooks --automigrate=false
```

`--automigrate=false`: edits made in the admin screen are **not** turned into migrations.
The schema comes only from this repo.

**Different here:** Reading List's browser never talks to PocketBase (only its Netlify
functions do). In this app the browser talks to PocketBase directly (D-0005), so also set
`--origins=https://projects.sanderg.nl` (PocketBase's CORS allowlist, `*` by default), and
check it in CI.

Health check on the pocketbase container:
`wget -q --spider http://127.0.0.1:8090/api/health`, every 30 s, 15 s start period.

## 2. Funnel and the path allowlist (`serve.json`)

- Port **443** goes on Funnel (the internet) and proxies **only** the paths the app needs.
  Everything else, including the admin screen `/_/` and superuser sign-in
  (`/api/collections/_superusers/...`), returns 404.
- Port **8443** proxies all of PocketBase, including `/_/`, and is **not** on Funnel:
  tailnet devices only.
- `"AllowFunnel"` lists only `${TS_CERT_DOMAIN}:443`.
- Handlers end in `/` to cover the subpaths: `"/api/collections/projects/": { "Proxy":
  "http://127.0.0.1:8090/api/collections/projects" }`.

```json
{
  "TCP": { "443": { "HTTPS": true }, "8443": { "HTTPS": true } },
  "Web": {
    "${TS_CERT_DOMAIN}:443": { "Handlers": { "/api/health": { "Proxy": "http://127.0.0.1:8090/api/health" } } },
    "${TS_CERT_DOMAIN}:8443": { "Handlers": { "/": { "Proxy": "http://127.0.0.1:8090" } } }
  },
  "AllowFunnel": { "${TS_CERT_DOMAIN}:443": true }
}
```

**Different here:** this app also needs the paths for its own collections
(`/api/collections/users/` for sign-in, `projects/`, `entries/`, `photos/`) and **file
downloads** (`/api/files/` for the photos' copy and thumbnail, D-0015). `history` is never
exposed. If sync ever uses realtime subscriptions, `/api/realtime` must be added too; don't
add it unless a task names it (D-0005).

Tailscale side, once:

- **DNS:** MagicDNS on and **HTTPS Certificates** on.
- **Access controls:** Funnel must be allowed for the machine. If the policy has no
  `nodeAttrs` entry with `"funnel"`, add
  `{ "target": ["autogroup:member"], "attr": ["funnel"] }`.
- **Machines → the NAS container → Disable key expiry**, or it drops off the tailnet after
  180 days and sync stops (D-0005).
- A new Funnel name can take **up to ten minutes** to answer.
- `tailscale funnel status` in the tailscale container's shell should list 443 as *Funnel
  on*.

## 3. The image and its workflow

`deploy/nas/Dockerfile`:

```dockerfile
FROM ghcr.io/muchobien/pocketbase:<pinned version>
COPY pb_migrations /pb_migrations
COPY pb_hooks /pb_hooks
LABEL org.opencontainers.image.source="https://github.com/SanderGeraedts/diy-projects"
```

PocketBase is pre-1.0: read its changelog before a minor-version bump (0.40 → 0.41), and
treat a bump like a schema change.

`.github/workflows/backend.yml`, what worked:

- **Triggers:** `push` to `main` and `pull_request`, both filtered to
  `deploy/nas/Dockerfile`, `deploy/nas/pb_migrations/**`, `deploy/nas/pb_hooks/**` and the
  workflow itself; plus `workflow_dispatch` for the first publish.
- **Concurrency:** one publish at a time, in push order (`cancel-in-progress: false`).
- **Permissions:** `contents: read`, `packages: write`.
- **Check on an empty database**, with the same command line as the NAS (`--http=0.0.0.0`
  inside CI). Poll `/api/health` for up to 30 s, and stop early if the container has
  exited: a migration that throws makes PocketBase exit, and the run fails before anything
  is published. Print `docker logs` on every failure.
- **Smoke test with a superuser:** `docker exec pb pocketbase superuser upsert ...`, sign in
  through `/api/collections/_superusers/auth-with-password`, then assert:
  - every expected collection exists;
  - signed out, a list request returns **200 with an empty list**, not 403: that's how
    PocketBase answers a list whose rule doesn't match, so test for empty `items`;
  - another user's records are invisible;
  - each hook does its job (for example an update leaves a `history` row), and admin-only
    collections are unreadable by a normal user.
- **Publish** only on `main`: tag `:sha-<7 chars>` and `:stable`, push both to
  `ghcr.io/<owner>/<image>` with `GITHUB_TOKEN`; write the tag to the step summary.
- Hooks **can't be run locally without Docker**; the workflow's check on the PR is the only
  place they run before production. Say so in the PR.

**GHCR package visibility:** the NAS pulls without a login if the package is public (it holds
only PocketBase and the schema, no data). If it stays private: a token with only
`read:packages` in TrueNAS (**Apps → Configuration → Manage Container Images → Docker
Registries**) and `REPO_USER`/`REPO_PASS` on Watchtower. After the first run, check
**Package settings → Manage Actions access** lists the repository with *Write*.

## 4. Deploys, Watchtower and rolling back

```
merge to main ─► Netlify deploys the app                      (minutes)
             └─► backend.yml: check on empty DB, publish :stable
                     └─► NAS: Watchtower pulls :stable (polls every 5 min), restarts pocketbase,
                         PocketBase applies new migrations on start-up   (~10 min after merge)
```

- **Watchtower:** use the maintained fork `nickfedor/watchtower` (containrrr/watchtower was
  archived in December 2025), pinned. `WATCHTOWER_LABEL_ENABLE: "true"` and the label
  `com.centurylinklabs.watchtower.enable: "true"` on pocketbase only, so it touches nothing
  else on the NAS. `WATCHTOWER_POLL_INTERVAL: "300"`, `WATCHTOWER_CLEANUP: "true"`,
  `TZ: Europe/Amsterdam`, and `/var/run/docker.sock` mounted. Its log should say it watches
  **one** container.
- **The app deploys before the backend** (by about ten minutes). Schema changes must be
  ones the running app tolerates: add fields and collections first, use them in a later
  merge (D-0005).
- **Rollback:** pin the pocketbase image to the last good `:sha-…` tag in the app's YAML;
  Watchtower leaves a pinned image alone. Fix forward on `main` with a *new* migration, then
  go back to `:stable`.
- **Tailscale, Watchtower and `serve.json` are updated by hand**, rarely: they keep the NAS
  reachable, so they don't auto-update. Changing `serve.json` means copying it to the
  dataset and restarting the app.

## 5. Migrations and hooks

Migrations (`deploy/nas/pb_migrations/<unix time>_<what>.js`):

- **Never edit a migration that has run**; PocketBase applies each file once. Change things
  with a new file.
- Owner-only rules that also stop a record changing hands:
  - `listRule`/`viewRule`/`deleteRule`: `owner = @request.auth.id`
  - `createRule`: `@request.auth.id != "" && owner = @request.auth.id`
  - `updateRule`: `owner = @request.auth.id && (@request.body.owner:isset = false ||
    @request.body.owner = @request.auth.id)`
- `users.createRule = null` closes sign-up (D-0005); accounts are made with the superuser
  in the admin screen (D-0013). `users.authToken.duration` sets the sign-in lifetime
  (D-0013: 90 days).
- Turn on PocketBase's **rate limits** (`settings.rateLimits.enabled = true`) to slow
  password guessing; the sign-in path is on the internet.
- Give JSON fields an explicit `maxSize`, file fields an explicit `maxSize` (D-0003's
  originals need far more than the default), and add `autodate` `created`/`updated` fields
  explicitly.
- Collections only an admin may see (like `history`): all five rules `null`.
- Write a working down-migration too.

Hooks (`deploy/nas/pb_hooks/*.pb.js`):

- Hooks run in their own JS context: **keep everything inside the handler** (no shared
  top-level helpers), and always call `e.next()`.
- `e.record.original()` gives the record as it was before the update; that's how a history
  hook copies the previous version.
- **A history copy must never block the save:** wrap it in `try/catch` and log. Throttling
  copies (Reading List: at most one per 10 minutes per record, always one when data is
  dropped, newest 100 kept) keeps the collection small.
- Settings that differ per NAS (secrets, allowlists) come from container environment
  variables via `$os.getenv(...)`, never from the repo.

## 6. Running it

- **Admin login:** in the *pocketbase container's* shell (TrueNAS → the app → the container
  → Shell; `pocketbase` doesn't exist on the NAS host or a PC):
  `pocketbase superuser upsert <email> '<long password>' --dir=/pb_data`. Then
  `https://diy-projects.<tailnet>.ts.net:8443/_/` from a tailnet device.
- **No "forgot password" email:** reset a password on the user record in the admin screen.
- **Checks from outside the home network** (from a machine not on the tailnet):
  - `curl https://…ts.net/api/health` → `{"message":"API is healthy.", …}`
  - `curl -i -X POST https://…ts.net/api/collections/_superusers/auth-with-password` → 404
  - `curl https://…ts.net/_/` → 404
  - `https://…ts.net:8443` doesn't load at all.
- **`POCKETBASE_URL`** on Netlify: `https://…`, **no trailing slash**, Production context
  only (D-0006). Set it last: until then the production app works offline-only.
- **Logs:** TrueNAS → the app → each container's logs. "Found new … image" in Watchtower's
  log means an update landed; "unauthorized" means the GHCR package is private (see 3).

## 7. What the 9 November 2026 incident taught

On 9 November a local test copy in a developer's browser overwrote Hanna's real shelf on the
server: a device with unsent changes replaced the server's copy wholesale. Her data was
recovered by hand. What carries over:

- **Nothing but production may reach the production backend** (now D-0006). The recovery
  itself had to pull production secrets onto a laptop (`netlify env:get`), exactly what the
  rule forbids; a restore should be possible from the admin screen alone. Here: restore
  from `history` in the admin screen, no scripts against production.
- **A save must never be able to silently drop data on the server.** Reading List fixed it
  by merging on the server and only removing what a device removed on purpose. Here that's
  built in: per-record last-write-wins (D-0002), explicit tombstones for deletes (D-0014),
  and the outbox sends changes, never a whole copy. Keep it that way: no "replace
  everything" endpoint, ever.
- **Keep the previous version of every overwritten record on the server**, admin-only, and
  test that hook in CI (D-0002, T-0013).
- **Local data must never flow into an account by accident.** Reading List only moves a
  device's pre-account data into an account that has none. Here: seeded demo data never
  enters the outbox (T-0003), and previews never get a backend address (D-0006).
- **Before merging a schema change, take a backup** ("Backup now" in the admin screen): the
  CI check proves a migration on an *empty* database, not on real data. Adopted here as
  D-0018.
- **Node 26 ships its own `localStorage`**, which hid happy-dom's in Reading List's tests and
  made them fail locally while CI (an older Node) passed. This repo runs Node 26 locally and
  24 in CI: if storage tests behave differently between the two, look there first.
