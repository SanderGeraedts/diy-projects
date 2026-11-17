---
id: T-0012
title: "Search projects and notes offline"
description: "One search field over project titles, descriptions, entry notes and tags, run on the device's local copy, with results that open the matching project or entry."
status: Doing
guarded: false
depends_on: [T-0002]
decisions: [D-0004, D-0011]
raised_on: 2026-11-17
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/23"]
---

# Goal

Search over project titles, descriptions, entry notes and tags, on the device, so it works
offline (D-0004):

- A search field in the header or overview; results update as you type.
- Matching is case- and accent-insensitive ("schuur" finds "Schuur", "cafe" finds "café"),
  on whole words and word starts.
- Results group by project; a hit in an entry note links to that entry on the project page
  and highlights the words.
- Tombstoned records never match.
- Fast enough on the phone with 100 projects and 2,000 entries (under 100 ms a keystroke).

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` pass.
- Unit tests for the matcher (case, accents, word starts, tombstones).
- A unit test builds 100 projects and 2,000 entries and checks a search takes under 100 ms.
- `pnpm run test:e2e` passes, with tests that search the demo data for a title word and a
  note word, offline, and open a result.
- Sander confirms on the deploy preview.

# Notes

- Client-side only; no search service on the NAS (D-0004). A small library (for example
  MiniSearch) is fine; say which in the PR.

# Log
- 2026-11-17 claude-code/opus-5.5: Own matcher, no library, in `src/search/search.ts` (NFD + strip marks + lower case; every query word must match a word or word start; an entry matches when all words are in its note or its project's fields, at least one in the note; tombstoned projects, entries, and entries of tombstoned projects never match; `highlight()` maps matches back to the original text). Search has its own route `/zoeken` (`?q=` kept in the URL, results update as you type, grouped by project, entries newest first, matched words underlined in the accent, no fill, per D-0020), opened from a magnifier link (`Zoeken`) in the header. A note hit links to `/projects/$id#entry-<id>`; the project page gives entries that id and scrolls to it once the local data has loaded. Checks: typecheck clean, `pnpm test` 108 passed (14 for the matcher, including 100 projects + 2,000 entries: index build and 7 keystrokes under 100 ms in total), build ok, `test:e2e` 10 passed / 2 skipped (Windows), including offline searches of the demo data for a title word (`fiets`) and a note word (`DIAMANT`) that open the project and the entry. Notes: (1) words are highlighted in the results, not on the project page; say if the entry on the project page should be highlighted too; (2) parallel agents share e2e port 4173 (`reuseExistingServer`), so a run can hit another worktree's server; I ran e2e against a private port with a throwaway config; (3) Sander checks search on the deploy preview.
