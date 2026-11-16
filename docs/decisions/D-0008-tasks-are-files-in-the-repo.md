---
id: D-0008
title: "Tasks are T-NNNN files in docs/tasks, each with a check that proves it done"
description: "Work for agents is one file per task under docs/tasks, listed in its index, with a Done-when check and the decisions it must follow; there is no claim mechanism while Sander is the only contributor."
status: Accepted
date: 2026-11-16
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [process]
---

# Context

The project is AI-first: agents need work they can pick up in a fresh session without the
conversation that raised it. Sander chose files in the repo over GitHub Issues or Jira,
keeping tasks next to the decisions they follow.

# Decision

- One file per task, `docs/tasks/T-NNNN-<slug>.md`, from `docs/tasks/_template.md`, listed
  in `docs/tasks/index.md` under *Open*, *Doing* or *Done*.
- Each task names the decisions it follows and has a *Done when* check: a command and its
  expected output, a test, or what Sander confirms. A task without one isn't ready.
- No claim mechanism: Sander is the only contributor and starts the sessions.

# Rationale

Tasks and decisions in one place, versioned with the code, readable by any agent.

# Consequences

- If outside contributors join after the repo goes public, revisit this (Issues may suit
  them better).

# Guidance for agents

- Work on one task per session. Do only what it says; note anything else as a new task.
- Set the task to Done only after running its check, and record the actual output and the
  PR in its *Log*.
