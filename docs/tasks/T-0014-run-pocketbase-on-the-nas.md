---
id: T-0014
title: "Run PocketBase on the NAS behind Tailscale Funnel"
description: "Compose files, the Funnel serve.json allowlist and the step-by-step setup in deploy/nas/, so Sander can run the image on the NAS, reachable only through Funnel, updated by Watchtower."
status: Done
guarded: true
depends_on: [T-0013]
decisions: [D-0005, D-0006, D-0010, D-0017]
raised_on: 2026-11-17
done_on: "2026-11-19"
result: [https://github.com/SanderGeraedts/diy-projects/pull/24]
---

# Goal

Everything Sander needs to bring the backend up on the NAS (D-0005), following
`docs/deploy/pocketbase-on-the-nas.md`:

- `deploy/nas/compose.yml`: PocketBase sharing a network with a Tailscale container;
  Watchtower watching only the PocketBase container; data on a named volume
  (`pb_data`).
- `deploy/nas/serve.json`: Funnel on 443 allows only the API paths the app needs:
  `/api/health`, sign-in (`/api/collections/users/`), the app's collections, and
  `/api/files/` for photo copies and thumbnails (D-0015). Never `history` or the admin
  screen; the admin screen is on 8443, tailnet only.
- The tailnet name, auth key and any secret come from an `.env` on the NAS, never the repo
  (`.env.example` lists them).
- `deploy/nas/README.md`: the steps, in order, including creating Sander's user,
  disabling key expiry for the NAS machine, and setting `POCKETBASE_URL` in Netlify for
  the Production context only (D-0006, `docs/deploy/netlify.md`).

# Done when

- `docker compose -f deploy/nas/compose.yml config` validates locally with the example env.
- Sander has followed the README on the NAS, and from his phone on mobile data:
  - `https://<name>.<tailnet>.ts.net/api/health` answers;
  - the admin screen is not reachable through Funnel;
  - a request from another origin than `projects.sanderg.nl` is refused by CORS.
- Sander reviews the PR (guarded).

# Notes

- Never deploy to the NAS from a machine; the NAS pulls images (D-0005).
- Nothing outside production may point at it (D-0006).

# Log

- 2026-11-17 claude-code/opus-5.5: Added `deploy/nas/compose.yml` (tailscale v1.104.7,
  pocketbase `:stable` in Tailscale's network with CI's command line incl. `--origins`,
  health check, Watchtower fork `nickfedor/watchtower:1.24.0` limited by label to
  pocketbase), `serve.json` (443 on Funnel: health, users, projects, entries, photos,
  files; 8443 tailnet only), `.env.example` and `README.md` with Sander's steps. Data and
  `serve.json` sit in dataset folders (`${DIY_DIR}`, placeholder default) as in
  `docs/deploy/pocketbase-on-the-nas.md`, not a named volume as the Goal says. No Docker
  locally, so `docker compose config` did not run; a Node script parsed the YAML and JSON
  and checked the command matches CI, the label is on pocketbase only, and 443 has no
  admin, superuser or history path. Remaining: Sander follows the README on the NAS and
  runs the outside-network checks.
- 2026-11-19 claude-code/opus-5.5: Deployed with Sander (README steps 1–8). Dataset on the larger pool, `<pool>/Applications/diy-projects`, with `tailscale/`, `pb_data/`, `serve.json` and `.env`; app installed from the reviewed `compose.yml` (path substituted, otherwise identical to `main`) through the same API as Install via YAML, since the YAML editor auto-indents. GHCR package made public (anonymous pull 200). Tailscale: MagicDNS, HTTPS and the Funnel attribute were already on; one-off 1-day auth key (pasted by Sander), key expiry disabled, key line removed from `.env` afterwards and the app came back without it. Outside checks: health 200, signed-out list empty, superuser sign-in / `/_/` / `history` 404, CORS only `projects.sanderg.nl`, 8443 unreachable off the tailnet. Netlify `POCKETBASE_URL` set for Production only (free plan has no scope limits; previews have no value), production redeployed and its bundle has the address. Sander created the superuser and his user from his phone.
- 2026-11-19 claude-code/opus-5.5: Lesson: a managed work laptop can intercept TLS by hostname (a test with a wrong SNI to the tailnet IP returned that other site's real certificate), sending tailnet traffic out through Funnel; 8443 then fails with "ingress conn for unconfigured …:8443" on the NAS. Use a personal device for the admin screen.
