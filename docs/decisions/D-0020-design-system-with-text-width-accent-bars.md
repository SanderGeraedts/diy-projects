---
id: D-0020
title: "The app's look follows sanderg.nl: Poppins, a pink/orange accent with text-width bars, the system theme, Dutch, built with Tailwind"
description: "D-0011's design system with one change: every accent bar (header title, page titles, entry dates) is as wide as the text it underlines, with square ends, instead of a short rounded fixed-width bar."
status: Accepted
date: 2026-11-17
decided_by: sander
replaces: [D-0011]
replaced_by: []
resolves: []
tags: [design, ux, stack]
---

# Context

This restates D-0011 with one change: every accent bar is as wide as the text it
underlines, with square ends, instead of a short, rounded fixed-width bar. Sander asked for it after seeing T-0002's
preview on 2026-11-17.

T-0001 shipped a placeholder look (green header, house icon). Sander wants the app to look
like his site, sanderg.nl: Poppins, near-black on off-white, a pink accent that turns orange
in dark mode, headings underlined with a thick accent bar, italic grey subtitles, 25px
rounded corners, and text on translucent panels over photos. The site loads Poppins from
Google Fonts and is in Dutch. The app is offline-first with a strict CSP (D-0005) and is
used mainly on a Pixel. Decided in a design interview on 2026-11-16.

# Decision

- **Palette (from the site):** light: text `#212121`, background `#fefefe`, grey `#666666`,
  light grey `#dddddd`, lighter grey `#eeeeee`, accent pink `#fc5e97`. Dark: text
  `#dedede`, background `#212121`, grey `#999999`, light grey `#444444`, lighter grey
  `#333333`, accent orange `#f5581a`.
- **The accent is decorative only:** bars, underlines, focus rings, active states. Never the
  colour of small text, and never a fill behind small text.
- **Accent bars are as wide as their text:** the bar under the header title, a page title
  or an entry date spans exactly the width of that text, like sanderg.nl's underlined
  titles. No fixed-width bars, and square ends (no rounded corners).
- **Status colours:** four distinct hues for `idea`, `in progress`, `paused` and `done`,
  each with a light and a dark variant. No red, orange or pink, so they don't read as the
  accent. Badge text reaches 4.5:1 contrast in both themes.
- **Type:** Poppins 400, 600 and 400 italic, self-hosted as Latin-subset woff2 and
  precached by the service worker. The root font size is the browser default (no fixed px,
  no shrinking on small screens); sizes in rem, so Android's font-size setting applies.
- **Theme:** follows the device's light/dark setting only. No toggle, nothing stored.
  `theme-color` meta tags for both schemes.
- **Shape and components:**
  - Header: a compact sticky bar, the title in Poppins 600 with the accent bar under it,
    on the page background.
  - Project card: the cover photo at 4:3 with 25px corners and a translucent panel at the
    bottom with title, status and tags. Without a cover: a grey tile of the same shape with
    the project's initial, large and faint.
  - Project page: a title block (title with accent bar, an italic grey line with status and
    tags, then the description). No hero photo.
  - Entry: the date as a heading with an accent bar as wide as the date, the note, then the photos in a
    2-column grid with 25px corners. No vertical timeline line.
- **Language:** the interface and date formats are Dutch (`nl-NL`): statuses read *idee*,
  *bezig*, *gepauzeerd*, *klaar*. Stored values stay as D-0004 defines them; code,
  comments and docs stay in English.
- **App icon and manifest:** background `#212121` with an orange `#f5581a` mark; manifest
  `theme_color` and `background_color` `#212121`.
- **Implementation:** Tailwind CSS v4 through its Vite plugin. Every colour, radius,
  spacing step and font is a token under `@theme` (CSS variables); dark styles follow
  `prefers-color-scheme`. Components use tokens only.
- **Reference and checks:** a `/design` page, left out of production builds, shows every
  token and component in both themes. Playwright screenshot tests of it run in CI, with
  baselines made on CI's Linux runner.

# Rationale

It keeps the site's identity where it is cheap (palette, font, bars, corners, panels) and
departs where an offline phone app needs it: a self-hosted font for the CSP and offline use,
the system font size for readability, distinct status colours for scanning, and no hero on
the project page so the timeline comes first. Following the device theme needs no stored
state. Dutch matches the site and Sander's own notes. Tailwind is fast for agents to write
and compiles to a static stylesheet, so the CSP is unaffected; it adds to D-0007's stack
without changing it.

# Consequences

- Tailwind and its Vite plugin become dependencies.
- Font files live in the repo and add about 60 KB to the precache.
- The splash screen is dark even when the phone is in light mode.
- Screenshot baselines can't be compared on Windows; they run in CI only.
- If the repo goes public (D-0010), a Dutch-only interface may need revisiting.

# Guidance for agents

- Use tokens; never write a raw colour value in a component. Add a token instead, and say
  so in the PR.
- Never use the accent for small text or behind small text.
- Write interface text in Dutch; keep stored values, identifiers and docs in English.
- Don't load fonts or styles from another origin.
- Don't add a theme toggle, a second language or a new component style without a decision.
- Update screenshot baselines only for an intended change, and say which in the PR.
