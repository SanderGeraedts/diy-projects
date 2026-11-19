---
id: D-0023
title: "The front end is on Netlify at projects.sanderg.nl; the browser talks directly to PocketBase on the NAS through Tailscale Funnel; only the owner writes, anyone may read public projects"
description: "D-0005's hosting and lock-down, with one change: records stay owner-only to write, but public projects, their entries and their photo records, copies and thumbnails are readable without signing in; originals, private projects and history stay owner-only."
status: Accepted
date: 2026-11-19
decided_by: sander
replaces: [D-0005]
replaced_by: []
resolves: []
tags: [architecture, hosting, security]
---

# Context

Sync must work on the go. A sister app on the same NAS already runs PocketBase behind
Tailscale Funnel (no router ports open, home IP private), with the app on Netlify calling it
only from server functions. Two things don't carry over: Netlify functions take about 6 MB
per request and the free tier caps bandwidth, too little for photo originals; and Funnel
serves only `*.ts.net` names, not a custom domain. Sander wants Netlify's deploy experience
(deploy on merge, PR previews) and the address `projects.sanderg.nl`.

D-0005 made every record owner-only. D-0022 adds a read-only public view of projects the owner
switches to public, so PocketBase must allow those reads without a sign-in.

# Decision

- **Front end:** the static PWA on Netlify at `projects.sanderg.nl`. Merging to `main`
  deploys it; every PR gets a deploy preview.
- **Back end:** PocketBase in a container on the NAS, sharing a network with a Tailscale
  container. Funnel exposes it at `https://<name>.<tailnet>.ts.net`.
- **The browser talks to PocketBase directly** for records and photos. No Netlify functions.
- **Locked down like the sister app:** Funnel's `serve.json` allows only the API paths the app
  needs on port 443; the admin screen is on 8443, tailnet only. Sign-up is closed, and
  PocketBase accepts cross-origin requests from `projects.sanderg.nl` only.
- **Writes are owner-only. Reads are owner-only, except public projects:** anyone may list and
  view a project switched to public (D-0022) and not tombstoned, its entries and its photo
  records that aren't tombstoned, and those photos' copy and thumbnail files. Originals,
  private projects, tombstoned records and `history` stay readable by the owner only.
- **Backend deploys:** GitHub Actions builds the PocketBase image with migrations and hooks,
  checks the migrations on an empty database, and publishes it; Watchtower on the NAS pulls
  it. GitHub never connects to the NAS.

# Rationale

It keeps Netlify's developer experience and the custom domain, sends photos straight to the
NAS without size limits, and reuses a setup Sander already runs and knows how to restore.
Public reads go through the same rules engine as the owner's, so the boundary is enforced on
the NAS, not by the app hiding things.

# Consequences

- The PocketBase sign-in token lives in the browser, so a cross-site scripting bug would
  expose the data. Keep the content security policy strict.
- Funnel traffic goes through Tailscale's relays; large uploads may be slow. Uploads run in
  the background and resume after interruptions.
- Disable key expiry for the NAS machine in Tailscale, or sync stops after 180 days.
- Visitors' requests reach the NAS through Funnel; rate limits stay on.

# Guidance for agents

- Enforce visibility in PocketBase's API rules and test it in the backend workflow; never rely
  on the app alone to hide private data.
- Never make an original readable to anyone but the owner, and never expose `history`.
- Add a path to Funnel's allowlist only when a task names it, and never put the admin
  screen on Funnel.
- Never deploy to the NAS from a machine; the NAS pulls images.
- Make schema changes the running app tolerates (add first, use later), as the sister app does.
- Don't put the tailnet name in committed code; it comes from build configuration.
