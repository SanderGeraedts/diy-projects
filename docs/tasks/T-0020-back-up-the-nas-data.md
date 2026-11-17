---
id: T-0020
title: "Back up the NAS data, as Q-005 decides, and test a restore"
description: "The backup of PocketBase's data and the photo originals as Q-005's decision describes, with a restore tested once and written down in deploy/nas/."
status: Open
guarded: true
depends_on: [T-0014]
decisions: [D-0002, D-0003, D-0005]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

**Blocked by Q-005.** Don't start until a decision answers it; then add that decision to
`decisions` above and rewrite this goal from it.

Whatever the method: the NAS holds the only original of every photo once the phone drops it
(D-0003), so the backup includes PocketBase's database and stored files, runs on a schedule,
and a restore has been tested before relying on it.

# Done when

- `deploy/nas/BACKUP.md` describes what is backed up, where to, how often, and the restore
  steps.
- Sander has restored a backup into a throwaway container and seen the projects and a photo
  original intact; the date is in the task log.
- Sander reviews the PR (guarded).

# Notes

- Mostly NAS configuration Sander does; the agent writes the steps and any script.

# Log
