# Decision registry

Every choice someone would later ask "why?" about, one file each. Agents read
[index.md](index.md) first, then only the records their work touches.

## Records

| Kind | File | Status values |
| --- | --- | --- |
| Decision | `D-NNNN-<slug>.md` | `Accepted`, `Replaced` |
| Open question | `Q-NNN-<slug>.md` | `Open`, `Resolved` |

Start every record from [_template-decision.md](_template-decision.md) or
[_template-question.md](_template-question.md). Ids are never reused.

## When to record a decision

Record it when reversing it would need a discussion: architecture, data shape, storage,
dependencies, how the app is run or backed up, UX promises, and changes to how we work
(this registry, `AGENTS.md`). Names, wording and small refactors are not decisions.

## Rules

- **Decisions are never edited once Accepted.** To change one, write a new decision that
  stands alone, list the old one in `replaces`, set the old one to `Replaced` with
  `replaced_by`, and move its index line to *Replaced*.
- **Agents don't answer open questions.** They raise one (`Q-NNN`), with options and a
  recommendation, and stop or work around it. Sander answers; a decision records the answer
  and lists the question in `resolves`.
- **Every decision ends with *Guidance for agents*:** what to preserve, what to avoid, and
  when to stop and ask.
- **The index is the table of contents.** When a record is added or changes status, update
  its line in [index.md](index.md) in the same commit: `- [D-NNNN Title](file.md): one
  sentence`.
- Commit with the record id first: `D-0003: record`, `Q-002: raise`, `Q-002: resolve`.
