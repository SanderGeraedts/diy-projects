---
id: T-0014
title: "Run PocketBase on the NAS behind Tailscale Funnel"
description: "Compose files, the Funnel serve.json allowlist and the step-by-step setup in deploy/nas/, so Sander can run the image on the NAS, reachable only through Funnel, updated by Watchtower."
status: Open
guarded: true
depends_on: [T-0013]
decisions: [D-0005, D-0006, D-0010, D-0017]
raised_on: 2026-11-17
done_on: ""
result: []
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
