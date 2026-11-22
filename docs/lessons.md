# Lessons

One line each time a task needed rework: the tester sent it back, CI failed twice, or a
human corrected something (G-0014). Newest last. The architect turns a lesson that repeats
into a proposed rule change for the harness.

`- YYYY-MM-DD T-NNNN <role>: what went wrong, and what would have prevented it`
- 2026-11-22 T-0031 developer: `scrollIntoView` on the import block left it under the sticky header; the UX review caught it. Anything scrolled into view needs the header's scroll margin (`scroll-mt-20`, as the timeline days have), and an e2e check that it ends below the header.
