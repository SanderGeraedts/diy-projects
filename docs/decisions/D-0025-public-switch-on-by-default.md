---
id: D-0025
title: "v1 is projects with status, tags and a public switch that is on by default, dated photo entries, offline search, and a read-only public view"
description: "D-0022's scope with one change: the public switch is on by default, for new projects and for the projects that exist when it ships; Sander switches off what he wants private."
status: Accepted
date: 2026-11-19
decided_by: sander
replaces: [D-0022]
replaced_by: []
resolves: []
tags: [scope]
---

# Context

D-0022 made the public switch off by default. On 2026-11-19, before it was built, Sander chose
on by default: he wants his projects shown, and switches off the ones he wants private.

D-0022's context follows.

D-0004 set v1's scope and kept sharing out of it. With the app running in production, Sander
wants people who aren't signed in to see his projects at `projects.sanderg.nl`, without being
able to edit or create anything. Decided on 2026-11-19, answering four choices: who sees it
(anyone with the address), which projects (a per-project switch, off by default), which
photos (copies and thumbnails only), and how visitors use the site (online, read-only).

# Decision

- **Project:** title, description, status (`idea`, `in progress`, `paused`, `done`), tags, a
  cover photo, and a **public** switch, on by default: new projects start public, and the
  projects that exist when the switch ships become public too.
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

Sander wants his work visible without switching each project on; the switch per project lets
him keep any one private. Copies made on the phone are re-encoded and carry no location, so showing them is safe;
originals stay private. Reading online keeps visitors out of the riskiest code, the local
database and sync engine.

# Consequences

- Public notes and photos are on the internet: every project is visible unless Sander switches
  it off, including the projects that exist when this ships.
- The project form says plainly that the project is public and what that means.
- Visitors need the NAS to be reachable; when it isn't, they see a short "not available"
  message.
- Previews and local dev still have no backend (D-0006): there the public view is shown with
  the seeded demo data, or not at all.

# Guidance for agents

- Never expose an original, a private project, a tombstoned record or `history` to someone who
  isn't the owner.
- A new project is public until the owner switches it off; existing projects become public
  when the field is added. Private still means private: enforce it in PocketBase's rules.
- Don't give visitors a local database, outbox or sync.
- Don't add fields or screens beyond this list; propose them as a task or a question.
- Keep search client-side; don't add a search service on the NAS.
