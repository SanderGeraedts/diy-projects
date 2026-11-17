---
id: T-0004
title: "Create and edit projects"
description: "A form to add a project and edit its title, description, status and tags, through the local write API, working offline."
status: Doing
guarded: false
depends_on: [T-0002, T-0003]
decisions: [D-0002, D-0004, D-0020]
raised_on: 2026-11-17
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/22"]
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
- Dutch interface and D-0020's components.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass.
- `pnpm run test:e2e` passes, with new tests that create a project, edit its status and
  tags, reload, and still see the changes; and the same with the network offline.
- Sander confirms on the deploy preview, on his Pixel.

# Notes

- No deleting projects here (Q-002, T-0010).
- Keep form components reusable for entries (T-0005).

# Log

- 2026-11-17 claude-code/opus-5.5: Stacked on T-0002 (#14). `/projects/new` and `/projects/$projectId/edit` share one form (`src/routes/ProjectForm.tsx`): title (required), description, status, tags (chips; Enter/comma adds; trimmed, lower-cased, de-duplicated; suggestions from tags in use); writes only via `createProject`/`updateProject`. Reusable parts in `src/components/form.tsx` (for T-0005), tag helpers + unit tests in `src/components/tags.ts`, a Formulier section on `/design`. Checks: typecheck clean, `pnpm test` 101 passed, build ok, `test:e2e` 10 passed / 2 skipped incl. new `e2e/projects.spec.ts` (create, edit, reload; same offline). Open: (1) inputs, buttons and tag chips are new component styles; D-0020 asks for a decision for those, so Sander accepts or changes them on the preview; (2) the write API doesn't lower-case tags (the UI does); enforcing it there is a guarded `src/db/` change; (3) the overview doesn't filter tombstoned projects; (4) this task still cites D-0011 (replaced by D-0020). Remaining: Sander checks on the preview, on his Pixel.
