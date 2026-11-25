---
id: D-0043
title: "A check of what a user sees reads the outcome in every state the app passes through, and a regression check fails on a fresh build of main"
description: "A Done when or test for anything a user sees checks what is actually rendered or delivered, not an attribute that should lead to it, on first load, after background work changes the data, after navigating away and back, after a reload and at the device extremes (including pixel ratio 1); a check meant to fail before the fix is shown failing on a fresh build of main. Proposed to the harness as G-0033, which replaces this record when it is released."
status: Accepted            # Accepted | Replaced
date: 2026-11-25
decided_by: architect       # engineer | requester | the agent role, e.g. architect
overrules: []
replaces: []
replaced_by: []             # G-0033 once a harness release carries it
resolves: []
tags: [process]
---

# Context

T-0037, T-0039 and T-0041 each passed their automated checks and the tester, and then failed
on Sander's own device (docs/lessons.md):

- T-0039: the e2e checks measured only freshly imported, already measured photos after a fresh
  page load. They never covered unmeasured or downloaded records, a background rebuild, or
  writes to the table while the page stays open.
- T-0037: the ratio check allowed a downscale up to 3x and ran only at pixel ratios 1.5 and
  2.625, so a 4x downscale at pixel ratio 1 was never measured.
- T-0040 (tester): a "fails on main" spec passed on main because `vite preview` served the
  branch's `dist`.
- T-0041: the specs checked the `srcset` text after the background pass, never which file
  `currentSrc` showed. Chrome keeps a larger candidate it has already loaded (D-0042).

D-0042 already says to check the decoded width of `currentSrc` in each state for card and tile
images. This record states the general rule for everything a user sees, adds the device
extremes and the fresh-build rule, and was proposed to the harness as G-0033
(https://github.com/SanderGeraedts/harness/pull/23), as G-0006 asks.

# Decision

- **The outcome, not the means.** A *Done when* or test for anything a user sees or receives
  checks the observable result: what is rendered, decoded, delivered or stored. An attribute,
  setting or request that should lead to it may be checked as well, never instead.
- **Every state the app passes through.** The check runs on a first load and again after each
  thing that can change the result while the app runs: background work or sync that changes
  the data, navigating away and back (for example the photo viewer), a reload, and data that
  came from elsewhere or from before the change.
- **The device extremes the users have.** Where the result depends on the device (screen size,
  pixel ratio, input, network), the check runs at both ends, always including pixel ratio 1.
- **Tolerances from what a user notices,** not from what the current build happens to give.
- **A regression check is shown to fail first,** against a build of main made fresh for that
  run (`pnpm run build` on main, with any server still serving the branch's build stopped).
  The failing output goes in the task's *Test*.

# Rationale

A check that reads the means proves the code did what was intended; only reading the outcome
proves the user gets it. The bugs that reached Sander's device lived in the transitions after
a first load, at a pixel ratio nobody measured, and a regression check against a stale build
proves nothing.

# Consequences

- The architect's *Done when* names the outcome to read and the states and device extremes to
  read it in, or says in one line why a state can't change it.
- The tester sends back a check that reads only an attribute, and repeats the "fails on main"
  run on a fresh build of main.
- When a harness release carries G-0033, this record becomes `status: Replaced`,
  `replaced_by: [G-0033]`. D-0042 stays: it is the image-specific case.

# Guidance for agents

- Ask "what would the user see go wrong?" and read exactly that (for an image, the decoded
  width of the file behind `currentSrc`, never `naturalWidth`).
- A check that fetches an image's address can take it out of Chrome's memory cache and hide
  what the user gets (T-0041). Read the shown image without changing that state.
- Before "this fails on main", rebuild main and stop any preview still serving the branch.
