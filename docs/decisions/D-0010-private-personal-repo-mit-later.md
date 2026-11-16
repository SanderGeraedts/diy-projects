---
id: D-0010
title: "The repo is SanderGeraedts/diy-projects, private until v1 works, then public under MIT"
description: "The code lives on Sander's personal GitHub account as diy-projects, private while it's rough; once v1 works and the deploy docs are generic it goes public under the MIT licence."
status: Accepted
date: 2026-11-16
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [repository]
---

# Context

It's a personal project, so it belongs on Sander's personal GitHub account, not the Fugro
one. Others might find it useful, so it may become open source, but early commits will carry
setup details and rough edges.

# Decision

- Repository `SanderGeraedts/diy-projects`, created and pushed with the personal account,
  committing as `sandergeraedts@live.nl`.
- Private until v1 works and the deploy documentation is generic (no tailnet names, the
  domain as configuration). Then public, under MIT.
- The app's name is `diy-projects` for now.

# Rationale

Building in private avoids leaking infrastructure details while the setup settles. MIT keeps
it simple for anyone who wants to self-host.

# Consequences

- Write configuration and docs as if the repo were already public: secrets and personal
  addresses stay out of the code.

# Guidance for agents

- Use the personal GitHub account (`gh auth switch -u SanderGeraedts`) for any push or `gh`
  write here, and switch back to the work account afterwards.
- Never commit secrets, the tailnet name, or real photos.
