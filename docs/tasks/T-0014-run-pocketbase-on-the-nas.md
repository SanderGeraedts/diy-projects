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

Everything Sander needs to bring the backend up on the NAS, as in Reading List (D-0005):

- `deploy/nas/compose.yml`: PocketBase sharing a network with a Tailscale container;
  Watchtower watching only the PocketBase container; data on a named volume
  (`pb_data`).
- `deploy/nas/serve.json`: Funnel on 443 allows only the API paths the app needs (records
  and files of the app's collections, auth); the admin screen on 8443, tailnet only.
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
