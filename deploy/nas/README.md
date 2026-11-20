# Running PocketBase on the NAS

The backend for `diy-projects`: PocketBase on the NAS, reachable from the internet only
through Tailscale Funnel, updated by Watchtower (D-0005). Background and the reasons behind
each setting: [`docs/deploy/pocketbase-on-the-nas.md`](../../docs/deploy/pocketbase-on-the-nas.md).

| File | What it is |
| --- | --- |
| `compose.yml` | Three containers: `tailscale`, `pocketbase` (inside Tailscale's network), `watchtower` (updates only `pocketbase`). |
| `serve.json` | Funnel's path allowlist on 443; the full PocketBase on 8443, tailnet only. |
| `.env.example` | The secrets the NAS needs, as placeholders. The real `.env` lives only on the NAS. |
| `Dockerfile`, `pb_migrations/`, `pb_hooks/` | The image, built and published by `.github/workflows/backend.yml` (T-0013). |

Placeholders used below (never commit the real values, D-0010):

| Placeholder | Means |
| --- | --- |
| `<tailnet>` | the tailnet's MagicDNS name, like `tail1234` |
| `/mnt/POOL/apps/diy-projects` | the NAS dataset for this app |
| `tskey-auth-REPLACE-ME` | a one-time Tailscale auth key |
| `<your-domain>` | the front end's domain on Netlify ([`docs/deploy/netlify.md`](../../docs/deploy/netlify.md)) |

Settings (compose variables):

| Variable | Means |
| --- | --- |
| `DIY_DIR` | the dataset's path; its default is the placeholder `/mnt/POOL/apps/diy-projects` |
| `APP_ORIGIN` | the front end's origin, `https://<your-domain>` (no trailing slash): the only origin PocketBase's CORS allows (`--origins`). **Required**; compose refuses to start without it |

PocketBase's address will be `https://diy-projects.<tailnet>.ts.net`.

## Before you start

- The image `ghcr.io/sandergeraedts/diy-projects-pocketbase:stable` exists: the `backend`
  workflow has run on `main` at least once (T-0013; *Actions → backend → Run workflow* for
  the first publish).
- **GHCR package visibility.** The NAS pulls without a login if the package is public (it
  holds only PocketBase and the schema, no data). If it stays private, make a GitHub token
  with only `read:packages` and add it in TrueNAS (**Apps → Configuration → Manage Container
  Images → Docker Registries**) and as `REPO_USER`/`REPO_PASS` in `.env` (step 3).

## Steps, in order

### 1. Tailscale, once

In the Tailscale admin console:

1. **DNS:** MagicDNS on, and **HTTPS Certificates** on.
2. **Access controls:** Funnel must be allowed. If the policy has no `nodeAttrs` entry with
   `"funnel"`, add `{ "target": ["autogroup:member"], "attr": ["funnel"] }`.
3. **Settings → Keys → Generate auth key:** one-off, not reusable. You'll paste it in step 3.

### 2. Dataset and folders

1. Create a dataset, e.g. `/mnt/POOL/apps/diy-projects`.
2. In it, create two empty folders: `tailscale/` and `pb_data/`.
3. Copy `deploy/nas/serve.json` into the dataset, next to the two folders. It's the only
   repo file copied by hand; the schema and hooks come inside the image.

### 3. The `.env`

Copy `deploy/nas/.env.example` to `/mnt/POOL/apps/diy-projects/.env` and replace
`tskey-auth-REPLACE-ME` with the key from step 1. Add `REPO_USER`/`REPO_PASS` only if the
GHCR package is private.

### 4. Install the app

1. TrueNAS SCALE / HexOS: **Apps → Discover Apps → Install via YAML**, name `diy-projects`.
2. Paste `deploy/nas/compose.yml`, and in it:
   - replace every `/mnt/POOL/apps/diy-projects` with the dataset's real path (it's the
     default of `DIY_DIR`, used for the folders, `serve.json` and `.env`);
   - set `APP_ORIGIN`: replace `${APP_ORIGIN:?set APP_ORIGIN to the app's origin, like
     https://<your-domain>}` on the pocketbase `--origins=` line with the front end's origin,
     so the line reads `- --origins=https://<your-domain>`. (With plain `docker compose`
     instead of TrueNAS, set `APP_ORIGIN` in the environment or in `.env` and pass it with
     `--env-file`; see `.env.example`.)

   Save; the three containers start.
3. Wait up to ten minutes: a new Funnel name can take that long to answer.
4. Check, in the **tailscale** container's shell: `tailscale funnel status` lists 443 as
   *Funnel on* (and 8443 without Funnel).
5. Check the **watchtower** log: it watches **one** container.
6. The login is now kept in `tailscale/`. Remove the `TS_AUTHKEY` line from `.env` and
   restart the app.

### 5. Disable key expiry

Tailscale admin console → **Machines → `diy-projects` → ⋯ → Disable key expiry**. Without
this the machine drops off the tailnet after 180 days and sync stops (D-0005).

### 6. Superuser and your user (D-0013)

1. In the **pocketbase** container's shell (TrueNAS → the app → the container → Shell;
   `pocketbase` doesn't exist on the NAS host or a PC):

   ```
   pocketbase superuser upsert <email> '<long password>' --dir=/pb_data
   ```

2. From a tailnet device, open `https://diy-projects.<tailnet>.ts.net:8443/_/` and sign in
   as the superuser.
3. **Collections → users → New record:** your email, a password, *verified* on. This is
   the one user the app signs in with; sign-up is closed, so this is the only way to make
   it. There's no "forgot password" email: reset a password on the user record here.
   Changing it is how a lost device is cut off.

### 7. Checks from outside the home network

From a machine **not** on the tailnet (the phone on mobile data with Tailscale off):

```sh
curl https://diy-projects.<tailnet>.ts.net/api/health
# -> {"message":"API is healthy.", ...}

curl -i -X POST https://diy-projects.<tailnet>.ts.net/api/collections/_superusers/auth-with-password
# -> 404

curl -i https://diy-projects.<tailnet>.ts.net/_/
# -> 404

curl -i https://diy-projects.<tailnet>.ts.net/api/collections/history/records
# -> 404

curl -si -H 'Origin: https://<your-domain>' https://diy-projects.<tailnet>.ts.net/api/health | grep -i access-control-allow-origin
# -> access-control-allow-origin: https://<your-domain>

curl -si -H 'Origin: https://example.com' https://diy-projects.<tailnet>.ts.net/api/health | grep -i access-control-allow-origin
# -> nothing: another origin is refused by CORS
```

`https://diy-projects.<tailnet>.ts.net:8443` must not load at all off the tailnet.

### 8. Point production at it, last

Netlify → *Site configuration → Environment variables → Add* `POCKETBASE_URL` =
`https://diy-projects.<tailnet>.ts.net` (**no trailing slash**), **Scopes: Builds**,
**Deploy contexts: Production only**. Never a value for Deploy Previews, Branch deploys or
Local development (D-0006, [`docs/deploy/netlify.md`](../../docs/deploy/netlify.md)). Until
this is set the production app simply works offline.

## Running it

- **Deploys:** a merge to `main` that touches the image publishes `:stable`; Watchtower
  polls every 5 minutes, pulls it and restarts `pocketbase`, which applies new migrations
  on start-up (~10 minutes after the merge). The app on Netlify deploys first, so schema
  changes must be ones the running app tolerates (add first, use later; D-0005).
- **Snapshots, not manual backups** (G-0023): the app's dataset gets a periodic ZFS snapshot
  task: every hour, kept two weeks (created 2026-11-20). A schema change needs no manual
  backup first; to go back, roll the dataset back to a snapshot
  ([admin/README.md](admin/README.md)).
- **Rollback:** in the app's YAML, pin the pocketbase image to the last good tag, e.g.
  `ghcr.io/sandergeraedts/diy-projects-pocketbase:sha-1a2b3c4` (the `backend` run's summary
  names each tag); Watchtower leaves a pinned image alone. Roll the dataset back to the
  snapshot taken before the change (destructive: an agent asks Sander first, G-0022). Fix
  forward on `main` with a *new* migration, then go back to `:stable`.
- **The YAML on the NAS is a copy.** Changes to `compose.yml` in the repo reach the NAS only
  when you paste it again (**Apps → diy-projects → Edit**); when you do, fill in `DIY_DIR`'s
  path and `APP_ORIGIN` again as in step 4. Watchtower only updates the pocketbase image.
- **Updated by hand, rarely:** Tailscale, Watchtower and `serve.json`; they keep the NAS
  reachable. Changing `serve.json` means copying it to the dataset again and restarting the
  app. Add a path to the Funnel allowlist only when a task names it, and never the admin
  screen or `history` (D-0005).
- **Logs:** TrueNAS → the app → each container's logs. "Found new … image" in Watchtower's
  log means an update landed; "unauthorized" means the GHCR package is private and the
  token is missing.
- **Never** deploy to the NAS from a machine, and never point anything but production at it
  (D-0005, G-0019).
