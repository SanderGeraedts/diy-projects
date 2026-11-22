---
id: Q-006
title: "Does the laptop keep its own TrueNAS key now that NAS work runs through the runner on the NAS?"
description: "G-0026 holds the TrueNAS key only in the infrastructure repository's GitHub environment, but this project's NAS setup still has a key for the claude-agent user in Sander's user environment; decide whether to revoke it and work only through harness nas --remote, or keep it and overrule G-0026 here."
status: Open                # Open | Resolved
raised_on: 2026-11-22
raised_by: architect
issue: "https://github.com/SanderGeraedts/diy-projects/issues/60"
blocks: [T-0034]
resolved_by: []
tags: [nas, access, operations]
---

# Question

Harness v0.9.0 brings G-0026 and G-0027 (they replace G-0022). Under G-0026 the TrueNAS API
key exists **only** as a secret of a GitHub environment in the Engineer's private
infrastructure repository, and NAS work runs there as workflows on the runner on the NAS
(`harness nas --remote`). The harness's T-0007 set that runner up and proved it answers.

This project was set up under G-0022: `deploy/nas/admin/README.md` has Sander create a
`claude-agent` full-admin user with an API key named after the laptop, and store the host,
the key and the certificate fingerprint as Windows user environment variables
(`TRUENAS_HOST`, `TRUENAS_API_KEY`, `TRUENAS_CERT_SHA256`). If that is still so, a key the
rules now say no machine holds is on the laptop, readable by anything that runs as Sander.

G-0027 still allows an Engineer to run `harness nas` locally with a key in their
environment, so the two records pull in different directions for this project. Revoking a
key or a user is a change to access (G-0009, G-0027 counts it destructive), so it is the
Engineer's call. Nothing in T-0030 to T-0032 needs the NAS; they don't wait on this.

# Options

1. **Revoke the laptop's key and work only through the runner. (Recommended)** Sander checks
   that `harness nas --remote core.ping` answers from this project, then deletes the
   laptop's API key of `claude-agent` in TrueNAS (and the user, if the runner uses its own),
   and removes the three variables with `setx`/the Windows settings. T-0034 rewrites
   `deploy/nas/admin/README.md` around `harness nas --remote`, keeps the app's methods and
   the snapshot note, and drops the local setup steps. Matches G-0026 with no exception; the
   NAS can then only be reached through the private repository's workflows. Costs nothing.
   When the runner is down, NAS work waits (G-0027 says so).
2. **Keep the laptop's key as a fallback, and overrule G-0026 for it.** A project decision
   with `overrules: [G-0026]` records that the laptop keeps a full-admin key for this
   project, used only when the runner is down. T-0034 still makes `--remote` the normal
   route and keeps the local steps as the fallback. Faster recovery when the runner is down,
   at the cost of a standing key on a machine that also runs agents.
3. **Keep the key until the runner has proven itself on this project, then do 1.** As 2 for
   a while, with a date or an event (say, the first `--remote` change to this project's app)
   after which the key is revoked. Needs the same overruling decision in the meantime.

# Answer
