---
id: D-0032
title: "The overview lists projects by their newest photo, by time taken; projects without photos come last"
description: "Projects on the overview, the owner's and a visitor's, are ordered by the latest time taken among their live photos, newest first; ties by last edit, then id; projects without a live photo come after all others, by last edit."
status: Accepted
date: 2026-11-22
decided_by: architect
replaces: []
replaced_by: []
resolves: []
tags: [product]
---

# Context

The overview (`src/routes/Overview.tsx`, through `filterProjects` in `src/filters.ts`) lists
live projects by `updatedAt`, newest first. Any edit, even a typo fixed in a description or a
status change, moves a project to the top. Sander, on 2026-11-22: "On the projects page, I
want the projects to be sorted by the newest picture entry." He asked for the order; what
"newest picture entry" means exactly was chosen by the architect, as it can be reversed.

Three readings were considered:

1. **Latest time taken** among the project's live photos (`takenAt`). The entry a photo is in
   is the day it was taken (D-0003), so this is also the latest day with photos, made exact
   within the day.
2. **Latest entry date** of an entry that has photos. The same as 1 to the day, but two
   projects with photos on the same day tie, and an entry with only a note doesn't count
   either way.
3. **Latest photo added** (`createdAt`): when the photo was imported. Importing last year's
   photos today would move an old project to the top.

# Decision

- **A project's place on the overview is set by its newest live photo**: the latest
  `takenAt` among its photos with `deletedAt === null`. Newest first.
- **Ties** (the same `takenAt`): the project edited last (`updatedAt`) first, then by id,
  descending, so the order never depends on load order.
- **Projects without a live photo** (new projects, ideas, or one whose photos were all
  deleted) come after every project with photos, among themselves by `updatedAt`, newest
  first, then by id, descending. That is today's order for them.
- **`takenAt` is compared as text**, as `comparePhotos` (D-0031) and the cover choice do.
- **The same order for visitors**: a visitor's overview (`src/public/`) is ordered the same
  way, from the public photos it already loads. A visitor only sees public projects and
  their live photos, so a project is placed by its newest photo the visitor can see.
- **The filters don't change the order**: with a status or tag filter the matching projects
  keep the same relative order.
- **Worked out when shown**: nothing is stored, no field, no index, no migration and no NAS
  change. A photo deleted, added or arriving by sync moves its project the next time the
  overview renders.

# Rationale

Reading 1 matches what the app already calls "newest" for photos: the cover falls back to the
newest photo by time taken (T-0009) and a day's photos are shown newest first by time taken
(D-0031). It puts the project Sander last took photos for at the top, which is what "newest
picture entry" points at, and importing old photos doesn't reshuffle the list. Reading 2
gives the same order with more ties. Reading 3 would order by import, not by the work.

Putting projects without photos last keeps the order to the one rule Sander asked for. An
alternative was to use a photo-less project's creation time as its date, so a new project
shows at the top; that mixes two kinds of dates in one list. Creating a project already
opens its page, so it needn't be on top to be found.

# Consequences

- Editing a project's title, description, status or tags no longer moves it on the overview.
- A new project without photos appears at the bottom of the overview until its first photo
  is added.
- A project with only old photos (taken long ago, imported today) stays low in the list.
- The owner's overview needs the projects' photos before it can order them; it already
  loads them for the covers.

# Guidance for agents

- Order the overview with one function, used by the owner's and the visitor's overview; don't
  sort projects for display anywhere else.
- Skip tombstoned photos (`deletedAt !== null`) when finding a project's newest photo.
- Don't store a "last photo" field to speed this up without a new decision; it would need to
  sync and stay correct across deletes.
