---
id: T-0005
title: "Add and edit timeline entries"
description: "Add an entry with a date and a note to a project, and edit its note, offline, through the local write API."
status: Doing
guarded: false
depends_on: [T-0004]
decisions: [D-0002, D-0003, D-0004, D-0020]
raised_on: 2026-11-17
done_on: ""
result: [https://github.com/SanderGeraedts/diy-projects/pull/26]
---

# Goal

An entry is a date, its photos and a note; a project is a timeline of entries, newest first
(D-0004). This task adds entries without photos and edits notes; photos come in T-0007.

- "Notitie toevoegen" on a project page adds an entry for a chosen date (today by default).
  There is at most one entry per project per day, because photos are grouped by day
  (D-0003): adding to a day that has one opens that entry instead.
- Editing an entry's note in place; saving updates `updatedAt` through the write API.
- Notes are plain text with line breaks kept.
- Dutch interface, D-0020's entry component.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass.
- `pnpm run test:e2e` passes, with new tests that add an entry, add a second note on the same
  day (lands in the same entry), edit the note, and see the timeline newest first, also
  offline.
- Sander confirms on the deploy preview.

# Notes

- Changing an entry's date is out of scope (it would move photos between days).
- No deleting entries here (Q-002, T-0010).

# Log

- 2026-11-17 claude-code/opus-5.5: Stacked on T-0004 (#22 → #14). "+ Notitie toevoegen" on the project page opens `/projects/$projectId/entries/new` (date, today by default; note). A day that already has an entry shows its note and the new note is appended under it (same entry); the lookup is a read query in `src/routes/AddEntry.tsx`, `src/db/` unchanged. Notes are edited in place on the timeline (`src/routes/EntryNote.tsx`) via `updateEntry`; line breaks kept. Checks: typecheck clean, `pnpm test` 108 passed, build ok, `test:e2e` 12 passed / 2 skipped incl. new `e2e/entries.spec.ts` (add, same-day second note, edit, newest first, reload; same offline), run on private port 4291. Open: (1) "opens that entry" built as append-under-existing, Sander confirms; (2) the edit text button is a new component style, not on `/design` (D-0020); (3) the timeline does not filter tombstoned entries. Remaining: Sander checks on the preview.
