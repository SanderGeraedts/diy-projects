---
id: D-0027
title: "Agents manage the NAS through the TrueNAS API as a full-admin user over the LAN, and ask Sander before anything destructive"
description: "A dedicated TrueNAS user with full admin and an API key that Sander creates and keeps in his environment lets agents read, configure, update and restart apps and the NAS from the home LAN, through deploy/nas/admin/truenas.mjs with the certificate pinned; destructive calls need --confirmed, which Claude Code always asks Sander about."
status: Replaced
date: 2026-11-19
decided_by: sander
replaces: []
replaced_by: [D-0030]
resolves: []
tags: [process, hosting, security]
---

# Context

Deploying T-0014 meant driving the TrueNAS web UI through Sander's browser, with Sander
signing in per tab and pasting values. He wants agents to manage the NAS without him. On
2026-11-19 he chose, from three options each:
- **full admin**, not apps-only;
- **act, but ask before destructive changes**;
- **an API key over the LAN**, not over the tailnet or SSH.

D-0023 still holds: backend images reach the NAS only through GHCR, pulled by Watchtower,
and GitHub never connects to the NAS. This decision is about managing TrueNAS itself (app
configuration, restarts, redeploys, status, logs) from Sander's own machine.

# Decision

- **Who:** a dedicated TrueNAS user, `claude-agent`, in `builtin_administrators`, with no
  password and no shell. Agents sign in with its API key, never as Sander.
- **How:** `deploy/nas/admin/truenas.mjs` calls the TrueNAS JSON-RPC API at
  `wss://<NAS>/api/current`. It sends the key only after the NAS's certificate matches the
  pinned SHA-256 fingerprint.
- **Where:** from the home LAN only.
- **Secrets:** the host, key and fingerprint live in Sander's user environment
  (`TRUENAS_HOST`, `TRUENAS_API_KEY`, `TRUENAS_CERT_SHA256`), never in the repository, chat,
  a PR or a log. Sander creates and revokes the key himself.
- **Autonomy:** reads, app configuration, updates, restarts and redeploys run without
  asking. Destructive calls are refused unless run with `--confirmed`, and
  `.claude/settings.json` makes Claude Code ask Sander before any command containing it.
  Destructive means:
  - deleting or overwriting data, datasets, snapshots, disks or apps;
  - anything about users, groups, keys, certificates, SSH, sign-in, network or the UI's own
    settings;
  - reboot, shutdown and OS updates.

# Rationale

An API key for its own user can be revoked without touching Sander's account, and it shows
up separately in the audit log. Over the LAN with a pinned certificate, the key can't leak to
a TLS-intercepting proxy. Full admin is Sander's choice, for convenience; the
ask-before-destructive gate keeps data loss and lock-outs behind his yes.

# Consequences

- An agent with this key can change anything on the NAS, including Immich and the other
  apps. The `--confirmed` prompt guards agents in Claude Code; it isn't a security boundary
  against other programs running as Sander, which can read the key.
- It doesn't work away from home, or anywhere TLS is intercepted.
- Everything an agent does is in the TrueNAS audit log under `claude-agent`.

# Guidance for agents

- Use `truenas.mjs` only; never call the TrueNAS API another way. Never print, log or commit
  the key, and never put the host or pool names in committed files.
- Before a `--confirmed` call, tell Sander in chat exactly what it changes or deletes, and
  wait for his yes, every time.
- Don't edit the destructive list or the `ask` rule to get around a prompt.
- Take a PocketBase backup (D-0018) before changing PocketBase's app. Never touch Immich or
  other apps unless a task names them.
- Record what you changed on the NAS in the task's Log.
