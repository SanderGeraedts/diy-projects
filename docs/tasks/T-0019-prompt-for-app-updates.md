---
id: T-0019
title: "Offer app updates safely"
description: "When a new version is ready, show 'Nieuwe versie beschikbaar' and switch to it on a tap, never in the middle of an import or sync."
status: Open
guarded: true
depends_on: [T-0002]
decisions: [D-0002, D-0007, D-0012]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

The service worker waits with a new version until the app takes it (`registerType:
'prompt'`, `src/sw/register.ts`). Today that happens only when every window is closed, which
on an installed app can take days.

- When a new version is waiting: a small "Nieuwe versie beschikbaar – Bijwerken" bar.
- "Bijwerken" activates it and reloads, but waits while a photo import (T-0007) or a sync is
  running, and says so.
- Check for updates when the app comes into view, at most hourly.

# Done when

- `npm run typecheck`, `npm test`, `npm run build` pass.
- An e2e test builds the app twice (a changed build id), serves the first, swaps in the
  second, and sees the bar; tapping it shows the new version, and no local data is lost.
- Sander reviews the PR (guarded: `src/sw/`).

# Notes

- Keep the logic in `src/sw/`; the bar itself can be a component outside it.

# Log
