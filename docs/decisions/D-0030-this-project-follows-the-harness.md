---
id: D-0030
title: "This project follows the harness"
description: "The harness is installed as a pinned dev dependency; its rules and global decisions (G-NNNN) apply here unless a project decision overrules one, and the project decisions whose substance is now global are replaced by them."
status: Accepted
date: 2026-11-20
decided_by: sander
overrules: []
replaces: [D-0001, D-0006, D-0008, D-0018, D-0019, D-0021, D-0024, D-0027, D-0028]
replaced_by: []
resolves: []
tags: [process]
---

# Context

This project's way of working (the decision registry, tasks as files, pull requests that
merge when green, pnpm, the NAS tool) was extracted and generalised into
[the harness](https://github.com/SanderGeraedts/harness), a package that projects install.
It holds the rules for agents, a registry of global decisions (`G-NNNN`), a team of four
agents, the `harness` command and reusable workflows for CI and auto-merge. Keeping a
second copy of all that here would drift from it. Sander decided on 2026-11-20 that this
project adopts the harness and keeps only what is specific to it. T-0028 does the work.

# Decision

- **The harness is a pinned dev dependency:**
  `pnpm add -D github:SanderGeraedts/harness#vX.Y.Z`, `v0.1.0` to start. CI and auto-merge
  call its reusable workflows at the same tag (G-0004).
- **The harness's rules and global decisions apply here,** read from
  `node_modules/@sandergeraedts/harness/`, unless a project decision overrules one by naming
  it in `overrules` (G-0002). This project overrules none to start.
- **This registry keeps what is specific to the project.** Ids stay `D-NNNN` and `Q-NNN`.
- **The project decisions whose substance is now a global decision are replaced:**

  | Project decision | Replaced by the harness's |
  | --- | --- |
  | D-0001 decisions live as files in the repository | G-0001 |
  | D-0006 previews and dev run on seeded data; only production syncs | G-0019 |
  | D-0008 tasks are files with a check | G-0012 |
  | D-0018 a backup before every schema change | G-0023 |
  | D-0019 pnpm is the package manager | G-0016 |
  | D-0021 personal details may be redacted in place | G-0003 |
  | D-0024 task status moves in the same PR; the index is generated | G-0012 |
  | D-0027 agents manage the NAS through the TrueNAS API | G-0022 |
  | D-0028 no guarded paths; green PRs merge | G-0011, with G-0009 and G-0025 |

  Their front matter names this record in `replaced_by`, because a record can only name
  records of its own registry there; the index names the global decision.
- **The Engineers** are listed in `.harness/engineers`.
- The task index, the NAS tool and the checks on the registries come from the harness
  (`pnpm exec harness tasks-index`, `nas`, `check`); the project's own copies are removed.

# Rationale

One place holds the way of working, so an improvement reaches every project through an
update instead of being copied by hand. Pinning by tag makes an update a deliberate pull
request that lists what changed (G-0005).

# Consequences

- A fresh clone needs `pnpm install` before the rules can be read.
- The status check CI reports is now `checks / checks` (the caller's job, then the reusable
  workflow's), so the ruleset on `main` has to require that name.
- G-0023 expects a periodic ZFS snapshot task for the app's dataset. Until it exists on the
  NAS, an agent takes a snapshot by hand before merging a schema change (T-0028).
- A decision that stays here although a global one covers the same ground keeps its
  project-specific substance: D-0007 (the Dexie upgrade rule, PocketBase's SDK), D-0029 (the
  slug rules), D-0002, D-0020 and D-0023 (this app's sync, look and hosting).
- Records, code comments and task files written before this still name the replaced
  decisions; they are history and stay as they are.

# Guidance for agents

- Follow the harness's rules and global decisions as if they were written here.
- When a global decision doesn't fit this project, record a project decision that lists it
  in `overrules` and says why; never edit the installed copy.
- Update the harness with `pnpm add -D github:SanderGeraedts/harness#<tag>`, bump the tag in
  both workflows in the same pull request, run `pnpm exec harness sync`, and put the output
  of `pnpm exec harness changes <from> <to>` in the description.
- A choice that would suit every project is recorded here first and proposed to the
  harness (G-0006).
