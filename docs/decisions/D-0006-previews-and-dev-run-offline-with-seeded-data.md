---
id: D-0006
title: "Deploy previews and local dev run offline with seeded data; only production syncs"
description: "Netlify PR previews and the local dev server use seeded demo projects in the browser with sync switched off; only the production build can reach the NAS, and CI tests sync against a throwaway PocketBase."
status: Accepted
date: 2026-11-16
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [environments, testing]
---

# Context

On 9 November 2026 local test data overwrote real data in a sister app on the same NAS,
because a non-production build talked to the production server. Every PR here gets a
Netlify preview, which is a complete copy of the app.

# Decision

- Previews and `npm run dev` start with seeded demo projects and photos in the browser, and
  sync is switched off: no PocketBase address is configured outside production.
- Only the production build on `main` has the NAS address.
- Sync is tested in CI against a throwaway PocketBase built from the repo's migrations.

# Rationale

Offline-first makes this nearly free: the app is meant to work without the NAS anyway.
Nothing outside production can reach real data.

# Consequences

- A preview can't show real projects; click-through review uses the seed data.
- Seed data must not contain real photos with location data.

# Guidance for agents

- Never put the production PocketBase address in a preview, dev or test configuration,
  and never pull Netlify's production environment variables.
- Test sync only against a local or CI PocketBase.
