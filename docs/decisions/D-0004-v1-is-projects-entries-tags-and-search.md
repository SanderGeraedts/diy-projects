---
id: D-0004
title: "v1 is projects with status and tags, dated photo entries, and offline search"
description: "A project has a title, description, status, tags and cover photo and a timeline of entries (date, photos, note); search over titles, notes and tags runs on the device; materials, costs, checklists, sharing and multiple users are out of v1."
status: Accepted
date: 2026-11-16
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [scope]
---

# Context

DIY projects invite feature creep: materials, costs, tools, tutorials, sharing. v1 should be
small enough to build quickly and use on a real project before deciding what's missing.

# Decision

- **Project:** title, description, status (`idea`, `in progress`, `paused`, `done`), tags, and a
  cover photo.
- **Entry:** a date, its photos and a note. A project is a timeline of entries, newest first.
- **Overview:** all projects, filterable by status and tag.
- **Search:** over project titles, descriptions, entry notes and tags, on the device's local
  copy, so it works offline.
- **Out of v1:** materials and costs, planned steps or checklists, sharing or public links,
  multiple users, iOS, and the share target if it isn't small.

# Rationale

This is the smallest set that's useful in the shed. Tags and search earn their place once
there are ten or more projects; materials and costs would add a whole second data model to
sync.

# Consequences

- Each out-of-scope item is a new decision when its time comes.

# Guidance for agents

- Don't add fields or screens beyond this list; propose them as a task or a question.
- Keep search client-side; don't add a search service on the NAS.
