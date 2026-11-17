---
id: T-0004
title: "Create and edit projects"
description: "A form to add a project and edit its title, description, status and tags, through the local write API, working offline."
status: Open
guarded: false
depends_on: [T-0002, T-0003]
decisions: [D-0002, D-0004, D-0011]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

Sander can start a project and keep its details current from the phone, offline. A
project has a title, description, status (`idea`, `in progress`, `paused`, `done`) and tags
(D-0004); the cover photo is chosen in T-0009.

- "Nieuw project" on the overview opens a form; saving opens the new project's page.
- "Bewerken" on a project page opens the same form, filled in.
- Title is required; tags are free text, trimmed, lower-cased and de-duplicated, with
  suggestions from tags already in use.
- Everything goes through T-0003's write API; the screens don't write to Dexie directly.
- Dutch interface and D-0011's components.

# Done when

- `npm run typecheck`, `npm test`, `npm run build` pass.
- `npm run test:e2e` passes, with new tests that create a project, edit its status and
  tags, reload, and still see the changes; and the same with the network offline.
- Sander confirms on the deploy preview, on his Pixel.

# Notes

- No deleting projects here (Q-002, T-0010).
- Keep form components reusable for entries (T-0005).

# Log
