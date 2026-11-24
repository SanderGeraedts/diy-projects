---
id: D-0036
title: "The laptop keeps its own TrueNAS key as a fallback for when the runner on the NAS is unavailable; harness nas --remote stays the normal route"
description: "Overrules G-0026 for one key: Sander's laptop keeps the claude-agent TrueNAS API key in his Windows user environment, used with harness nas run locally on the home network only when harness nas --remote can't run; agents never read, print or carry it, and every other rule of G-0026 and G-0027 holds."
status: Accepted            # Accepted | Replaced
date: 2026-11-23
decided_by: engineer        # engineer | requester | the agent role, e.g. architect
overrules: [G-0026]         # global decisions this project sets aside, e.g. [G-0017]
replaces: []
replaced_by: []             # what replaced this one; may be a global decision, e.g. [G-0016]
resolves: [Q-006]           # questions this answers, e.g. [Q-001]
tags: [nas, access, operations]
---

# Context

G-0026 says the TrueNAS API key exists **only** as a secret of a GitHub environment in the
Engineer's private infrastructure repository, and that NAS work runs there as workflows.
G-0027 makes the workflow on the self-hosted runner on the NAS (`harness nas --remote`) the
normal route, and still allows an Engineer to run `harness nas` locally with the key in
their environment on the home network.

This project was set up under G-0022, before the runner existed: `deploy/nas/admin/README.md`
had Sander create a full-admin `claude-agent` user in TrueNAS with an API key named after
the laptop, stored as Windows user environment variables (`TRUENAS_HOST`,
`TRUENAS_API_KEY`, `TRUENAS_CERT_SHA256`). Q-006 asked whether to revoke that key and work
only through the runner (the architect's recommendation), keep it as a fallback, or keep it
for a while. On 2026-11-23 the Engineer answered: keep the key as a fallback.

A key on the laptop is exactly what G-0026's "only in the GitHub environment" rules out, so
this decision overrules G-0026 for that one key, and nothing else in it.

# Decision

- **`harness nas --remote` is the normal route** for all NAS work in this project, in a
  session with the Engineer (G-0027). Nothing about that changes.
- **The laptop keeps its own TrueNAS key as a fallback.** "Fallback" means: it is used only
  when the runner route is unavailable: the runner on the NAS is offline or failing, the
  infrastructure workflows can't be started, or GitHub is unreachable. It is never used
  because it is quicker, and never for work that can wait until the runner is back.
- **Where the key may live:** only in Sander's Windows user environment variables on his
  own laptop (`TRUENAS_API_KEY`, with `TRUENAS_HOST` and `TRUENAS_CERT_SHA256` beside it),
  as set up in `deploy/nas/admin/README.md`. Not in any file (no `.env`, no script, no note,
  no repository, private or not), not on another machine, not in a GitHub secret of this
  repository, and not on the managed work laptop.
- **It is a key of its own:** a separate API key of `claude-agent`, named after the laptop,
  not a copy of the key in the infrastructure repository's environment. Each can then be
  revoked without touching the other.
- **It works only on the home network,** and the tool sends it only after the certificate
  matches the pinned fingerprint (G-0027).
- **Using the fallback** is `pnpm exec harness nas <method>` run locally (without
  `--remote`), in a session with the Engineer, after the agent has told the Engineer that
  `--remote` is unavailable and why, and the Engineer has said yes to using the fallback.
  The guards of G-0027 hold unchanged: destructive calls need `--confirmed` and a human's
  yes; snapshots need none. The task's Log says the fallback was used and why, without a
  host, address, pool or dataset path.
- **Revoking it** is the Engineer's, in the TrueNAS UI (deleting a key is destructive under
  G-0027). Sander revokes it at once if the laptop is lost or he suspects the key has leaked.
  Ending the fallback for good is a new decision that replaces this one.
- **Everything else in G-0026 holds:** the Netlify token, the Tailscale OAuth client and the
  infrastructure repository's own TrueNAS key stay only in the GitHub environment; no agent
  ever reads, prints or carries a secret; nothing identifying the NAS is written into a
  repository, pull request, issue, task or decision.

# Rationale

The runner is a single process on the NAS. When it is down, G-0027 says NAS work waits or
the Engineer runs the tool locally at home; keeping the laptop's key ready makes that second
path a matter of minutes instead of a fresh setup with a new key at the moment something is
already broken. The Engineer accepted the cost: a standing full-admin key on a machine that
also runs agents. Limiting it to one machine, one place on that machine, the home network
and the moments the runner can't be used keeps that cost as small as a local key allows,
and the rules that agents never touch secrets apply to it as to every other.

# Consequences

- Anything that runs as Sander on the laptop can read the key; the `--confirmed` prompt is
  a guard for agents, not a security boundary (G-0027). The laptop must stay a machine only
  Sander uses.
- `deploy/nas/admin/README.md` keeps its local setup, under a heading that says it is the
  fallback and when it may be used; the normal examples use `--remote` (T-0034).
- Rotating the key is still Sander's: add a new key, `setx` it, delete the old one.
- If the harness later offers a better way to reach the NAS when the runner is down, this
  decision is reviewed and may be replaced.

# Guidance for agents

- Use `pnpm exec harness nas --remote` for NAS work. Reach for the local tool only when a
  `--remote` call can't run because of the runner, the workflows or GitHub, and only after
  the Engineer has said yes in chat.
- Never read, print, echo or log `TRUENAS_API_KEY` (or `TRUENAS_HOST` or
  `TRUENAS_CERT_SHA256`), never pass it to another command or tool, never copy it to a file,
  another machine or a GitHub secret. To check it is set, test for the variable's presence
  by name only, without expanding its value into output.
- Never run `harness nas` locally in a Requester's session, outside a session with the
  Engineer, or off the home network.
- Never suggest moving the key elsewhere, sharing it with the runner, or widening its use;
  that needs a new decision by the Engineer.
- If the runner keeps failing, raise it for the Engineer (G-0010) rather than letting the
  fallback become the normal route.
