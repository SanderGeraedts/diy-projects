---
id: T-0012
title: "Search projects and notes offline"
description: "One search field over project titles, descriptions, entry notes and tags, run on the device's local copy, with results that open the matching project or entry."
status: Open
guarded: false
depends_on: [T-0002]
decisions: [D-0004, D-0011]
raised_on: 2026-11-17
done_on: ""
result: []
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
