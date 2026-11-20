---
id: D-0001
title: "Decisions and open questions live as files in this repository"
description: "Every lasting choice is a D-NNNN file and every unanswered one a Q-NNN file under docs/decisions/, listed in its index, so agents work from recorded decisions instead of chat history."
status: Replaced
date: 2026-11-16
decided_by: sander
replaces: []
replaced_by: [D-0030]
resolves: []
tags: [process]
---

# Context

The project is built AI-first: agents write most of the code, across many sessions that
don't share memory. Anything decided only in a conversation is lost to the next session,
and an agent will happily re-decide it differently. A harness at work keeps
its decisions in a separate board repository, because that work spans several code
repositories. This project is a single repository.

# Decision

- Decisions are `docs/decisions/D-NNNN-<slug>.md`, open questions
  `docs/decisions/Q-NNN-<slug>.md`, both from the templates in that folder and listed in
  `docs/decisions/index.md`.
- They live in the code repository itself, not a separate board, and change in the same
  commits as the code they explain.
- Accepted decisions are replaced, never edited. Agents raise questions; Sander answers them.

# Rationale

One repository means one place to look, and a decision travels with the code it explains.
A separate board only pays off when work spans repositories or several people claim tasks
at once.

# Consequences

- Every agent session reads `AGENTS.md` and `docs/decisions/index.md` before changing
  anything.
- If the project ever gains a second repository or more contributors, revisit this
  (a new decision that replaces this one).

# Guidance for agents

- Read `docs/decisions/index.md` first, then only the decisions your change touches.
- Record a decision when a choice would need a discussion to reverse; note smaller choices
  in the commit message instead.
- If a change would contradict an Accepted decision, stop and ask Sander.
- Never answer an open question yourself; raise it with options and a recommendation.
