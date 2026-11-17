---
id: T-0005
title: "Add and edit timeline entries"
description: "Add an entry with a date and a note to a project, and edit its note, offline, through the local write API."
status: Open
guarded: false
depends_on: [T-0004]
decisions: [D-0002, D-0003, D-0004, D-0011]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

An entry is a date, its photos and a note; a project is a timeline of entries, newest first
(D-0004). This task adds entries without photos and edits notes; photos come in T-0007.

- "Notitie toevoegen" on a project page adds an entry for a chosen date (today by default).
  There is at most one entry per project per day, because photos are grouped by day
  (D-0003): adding to a day that has one opens that entry instead.
- Editing an entry's note in place; saving updates `updatedAt` through the write API.
- Notes are plain text with line breaks kept.
- Dutch interface, D-0011's entry component.

# Done when

- `npm run typecheck`, `npm test`, `npm run build` pass.
- `npm run test:e2e` passes, with new tests that add an entry, add a second note on the same
  day (lands in the same entry), edit the note, and see the timeline newest first, also
  offline.
- Sander confirms on the deploy preview.

# Notes

- Changing an entry's date is out of scope (it would move photos between days).
- No deleting entries here (Q-002, T-0010).

# Log
