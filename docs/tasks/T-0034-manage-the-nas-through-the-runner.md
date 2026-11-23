---
id: T-0034
title: "Manage this project's NAS app through the runner, as G-0026 and G-0027 say"
description: "G-0026, G-0027: this project's NAS notes use harness nas --remote as the normal route, name no replaced decision, and keep the laptop's own TrueNAS key only as the fallback D-0036 allows."
status: Open
size: small
depends_on: [T-0033]
decisions: [G-0026, G-0027, D-0036, G-0023, G-0030, G-0009, D-0030]
raised_on: 2026-11-22
done_on: ""
result: []
---

# Goal

Harness v0.9.0 (T-0033) replaces G-0022 with G-0027 and adds G-0026: the TrueNAS key lives
only in a GitHub environment of the Engineer's private infrastructure repository, and NAS
work runs there as a workflow on the runner on the NAS, started with
`pnpm exec harness nas --remote`. This project's `deploy/nas/admin/README.md` was written for
G-0022: a `claude-agent` key stored on the laptop, and every command run locally.

After this task:

- `deploy/nas/admin/README.md` is headed with G-0027, says that NAS work for this project
  goes through `pnpm exec harness nas --remote` in a session with the Engineer, and shows the
  app's methods (`app.query`, `app.config`, `app.redeploy`, `app.update`) and the snapshot
  example with `--remote`. The rules it keeps: snapshots need no yes (G-0023, G-0027), never
  touch the other apps, never commit a host, tailnet, pool or dataset path, record NAS
  changes in the task's Log.
- The local setup (the `claude-agent` key on the laptop, the three user environment
  variables, the section that sets them up) stays, as the fallback D-0036 allows: under a
  heading that says it is the fallback, with when it may be used (only when
  `harness nas --remote` can't run because of the runner, the workflows or GitHub, in a
  session with the Engineer who has said yes), where the key may live (only Sander's Windows
  user environment on his own laptop), that agents never read, print or carry it, and how to
  revoke or rotate it. The *Limits* section says the same.
- The app on the NAS pulls its image without a login (G-0030: the image is public).

# Done when

1. `grep -c "harness nas --remote" deploy/nas/admin/README.md` is 5 or more, and
   `grep -n "G-0022" deploy/nas/admin/README.md AGENTS.md` prints nothing.
2. `pnpm exec harness check` passes.
3. In a session with the Engineer: `pnpm exec harness nas --remote app.query '[[["name","=","diy-projects"]]]'`
   returns the `diy-projects` app in state `RUNNING`. The Log records the state only, no
   host, address or dataset path (G-0026).
4. In the same session: `app.config '["diy-projects"]'` through `--remote` shows no
   `REPO_USER`/`REPO_PASS` or other registry login for the image. If one is there, the
   Engineer decides whether to remove it (an `app.update`, which asks); the Log says which.
5. Per D-0036 (Q-006's answer, option 2):
   - `pnpm exec harness overrules` lists D-0036 over G-0026 (recorded with Q-006's answer,
     before this task's build);
   - `grep -n "D-0036" deploy/nas/admin/README.md AGENTS.md` prints at least one line in
     each file, and the README's local setup is under a heading containing "fallback";
   - in a session with the Engineer: the Engineer confirms that the laptop's key is a key of
     its own (a separate API key of `claude-agent` named after the laptop, not the one in the
     infrastructure repository's environment), checked by key name in the TrueNAS UI only.
     The Log records the confirmation, no key, host or address.

# Notes

- **Q-006 (issue #60) is answered:** D-0036 keeps the laptop's key as a fallback and
  overrules G-0026 for that one key. Nothing in this task waits on it any more. Read D-0036's
  *Decision* and *Guidance for agents* before rewriting the local setup section and *Limits*.
- AGENTS.md's project rule on the NAS still says "T-0034 and Q-006 bring it in line with the
  runner": change it to name D-0036 (laptop key as fallback only) instead of Q-006.
- How `harness nas --remote` works, and that it runs only for the Engineer, is in the
  harness's README (*The infrastructure repository*, *The NAS tool*). The runner was set up
  and proven in the harness's T-0007.
- Never run `harness nas` or start an infrastructure workflow outside a session with the
  Engineer, and never `gh workflow run` an infrastructure workflow directly (rules, *Tools*).
- Items 3, 4 and the confirmation in 5 need the Engineer in the session; the developer prepares the README and
  hands over with `Remaining:` for them.
- No schema change and nothing on the NAS changes in items 1 to 3.

# Design

Nothing visible.

# Test

# Log

- 2026-11-22 architect: raised in the harness v0.9.0 update (T-0033) to conform to G-0026 and G-0027; raised Q-006 (#60) for the Engineer on the laptop's TrueNAS key. Items 1 to 4 can start; item 5 and the local setup section wait on Q-006. Small. Handed to the developer for the parts that don't wait.
- 2026-11-23 architect: the Engineer answered Q-006 (#60): keep the laptop's key as a fallback. Recorded D-0036 (overrules G-0026 for that one key), closed Q-006, and rewrote item 5 and the local setup part of the Goal to follow it; nothing waits on Q-006 now. Still small. Handed to the developer for the whole task; items 3, 4 and the key confirmation in 5 need the Engineer in the session.
