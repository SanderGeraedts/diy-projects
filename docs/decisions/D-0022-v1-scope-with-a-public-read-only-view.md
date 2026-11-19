---
id: D-0022
title: "v1 is projects with status, tags and a public switch, dated photo entries, offline search, and a read-only public view"
description: "D-0004's scope plus one addition: each project has a public switch (off by default), and visitors who aren't signed in see the public projects read-only, online, with photo copies and thumbnails but never originals; materials, costs, checklists, share links and multiple users stay out of v1."
status: Replaced
date: 2026-11-19
decided_by: sander
replaces: [D-0004]
replaced_by: [D-0025]
resolves: []
tags: [scope]
---

# Context

D-0004 set v1's scope and kept sharing out of it. With the app running in production, Sander
wants people who aren't signed in to see his projects at `projects.sanderg.nl`, without being
able to edit or create anything. Decided on 2026-11-19, answering four choices: who sees it
(anyone with the address), which projects (a per-project switch, off by default), which
photos (copies and thumbnails only), and how visitors use the site (online, read-only).

# Decision

- **Project:** title, description, status (`idea`, `in progress`, `paused`, `done`), tags, a
  cover photo, and a **public** switch, off by default.
- **Entry:** a date, its photos and a note. A project is a timeline of entries, newest first.
- **Overview:** all projects, filterable by status and tag.
- **Search:** over project titles, descriptions, entry notes and tags, on the device's local
  copy, so it works offline.
- **Public view:** anyone who opens `projects.sanderg.nl` without signing in sees the
  projects switched to public, with their entries, notes and tags, read-only: no create, edit
  or delete controls. Visitors see only the 2560 px copies and thumbnails of photos, never
  originals (D-0003: originals carry GPS location). Deleted (tombstoned) records never show.
- **Visitors work online:** their browser reads public projects from the NAS when a page
  opens; nothing is stored, queued or synced on a visitor's device. Offline-first stays the
  signed-in owner's mode (D-0002).
- **Out of v1:** materials and costs, planned steps or checklists, unlisted share links,
  multiple users, iOS, and the share target if it isn't small.

# Rationale

A switch that defaults to private means nothing leaks by accident, while finished work can be
shown. Copies made on the phone are re-encoded and carry no location, so showing them is safe;
originals stay private. Reading online keeps visitors out of the riskiest code, the local
database and sync engine.

# Consequences

- Public notes and photos are on the internet; Sander decides per project.
- Visitors need the NAS to be reachable; when it isn't, they see a short "not available"
  message.
- Previews and local dev still have no backend (D-0006): there the public view is shown with
  the seeded demo data, or not at all.

# Guidance for agents

- Never expose an original, a private project, a tombstoned record or `history` to someone who
  isn't the owner.
- A new project is private until the owner switches it on; never default it to public.
- Don't give visitors a local database, outbox or sync.
- Don't add fields or screens beyond this list; propose them as a task or a question.
- Keep search client-side; don't add a search service on the NAS.
