---
id: D-0021
title: "Personal details may be redacted from records in place; what was decided never changes"
description: "Names of other people, employers and private incident details can be removed or replaced by neutral wording in decisions, questions, tasks and docs without writing a replacing decision, as long as the substance of what was decided stays the same; redactions are listed in the commit and the PR."
status: Replaced
date: 2026-11-17
decided_by: sander
replaces: []
replaced_by: [D-0030]
resolves: []
tags: [process, privacy]
---

# Context

The repository will go public (D-0010). The public-readiness check (T-0025,
`docs/public-readiness.md`) found personal details in Accepted decisions: another person's
name and her app, details of an incident on it, a colleague's name and a work project, and
the employer's name. Sander chose to obfuscate them. The registry's rule is that Accepted
decisions are never edited, only replaced (D-0001, `docs/decisions/README.md`); replacing
six decisions to change wording, not substance, would bury the real history of choices
under redactions.

# Decision

- Personal details may be **redacted in place** in any record (decisions, questions, tasks,
  docs): names of people other than Sander, employers and colleagues, and private details
  of incidents, replaced by neutral wording ("a sister app on the same NAS", "a harness at
  work", "the work account").
- A redaction must not change **what was decided**, its reasons or its guidance. If the
  meaning would change, it's a new decision that replaces the old one, as before.
- Each redaction is listed in its commit message and PR, and the PR is guarded like any
  change under `docs/decisions/`.
- Git history is not rewritten for redactions unless Sander decides so for a specific
  finding.

# Rationale

It keeps the public repository free of other people's details while the decision history
stays readable: one record per choice, not one per wording change.

# Consequences

- Older commits still contain the original wording; that was accepted for these findings
  (low harm, T-0025).
- Open branches carry copies of redacted files until they're rebased or merged; they pick up
  the redaction then.

# Guidance for agents

- Redact only personal details; never use this to change a decision's substance.
- Never add new personal details about people other than Sander to records.
- When unsure whether a wording change alters a decision's meaning, raise a question.
