---
id: D-0029
title: "Addresses use a project slug, an entry date and a photo place, never an id"
description: "No UUID in any URL, for the owner or visitors: a project is at /projects/ plus a slug made from its title and unique per owner (the NAS settles clashes from offline devices with -2, -3), a rename keeps the old slug in oldSlugs and redirects it, and a photo is the entry's date plus its 1-based place in that entry."
status: Replaced
date: 2026-11-20
decided_by: sander
replaces: []
replaced_by: [D-0031]
resolves: []
tags: [architecture, product, sync]
---

# Context

Every record has a UUID that its device made offline (T-0016), and the app used it in its
addresses: `/projects/<uuid>`, `/projects/<uuid>/photos/<uuid>`, and `#entry-<uuid>` for a
search hit. Sander, on 2026-11-20: "Currently the url of a project is a uuid. I never want a
uuid in a url. Change it to be a slug." He left the details to Claude; the choices below
were made for him and recorded as his decision. T-0027 builds it.

# Decision

- **No UUID anywhere in an address**: not in the path, the query or the hash, for the owner
  and for visitors. The overview's filter parameters stay; they hold no ids.
- **A project is at `/projects/<slug>`.** The slug comes from the title: NFD, marks
  stripped, lower case, ASCII letters and digits, every run of anything else one `-`, no
  `-` at either end, at most 60 characters cut at a hyphen. `Kast für Sanne` →
  `kast-fur-sanne`. An empty slug, or one that clashes with a route under `/projects/`
  (`new`), becomes `project`. It is stored in a new `slug` field on projects and syncs.
  `/projects/new`, `/projects/<slug>/edit` and `/projects/<slug>/entries/new` keep working.
- **Unique among the owner's projects**, tombstoned ones included, purge markers (D-0026)
  not: a purged project's slugs are free again. A clash gets `-2`, `-3` and so on. A device
  picks a slug offline among the projects it knows; two offline devices can pick the same
  one. The NAS settles it: a PocketBase hook (`pb_hooks/slugs.pb.js`) on every create and
  update makes the slug unique and answers with the record as saved, and a device takes a
  project's `slug` and `oldSlugs` from the NAS whenever it has no change of its own pending,
  whatever `updatedAt` says. A unique index on `(owner, slug)` backs this up.
- **A rename gives a new slug** when the new title makes a different one. The previous slug
  goes into `oldSlugs`, a stored list that syncs. Opening an old slug redirects, replacing
  the address, to the same page at the current slug. A slug in any project's `oldSlugs`
  counts as taken, so an old address never moves to another project. Renaming back takes an
  old slug back out of the list.
- **A photo is at `/projects/<slug>/<yyyy-mm-dd>/<n>`**: its entry's date and its 1-based
  place among that entry's live photos, in the order they're shown (time taken, then when
  added, then id). A project has one live entry per date: a note or photos for a day that has
  an entry go into it. Two offline devices, or a restore from the bin, can still leave two
  for one date; then the later ones (by creation) are `<date>-2`, `<date>-3`. Deleting a
  photo moves the photos after it up one place.
- **An entry is linked to by its date** (the same `<date>` or `<date>-2`): as the hash of its
  project's page, `/projects/<slug>#2026-10-04`, from search results and anywhere else.
- **Existing projects get slugs** from an additive PocketBase migration
  (`1794931700_project_slugs.js`): per owner by creation (`createdAt`, then id), the first
  `kast` keeps `kast`, the next gets `kast-2`; `oldSlugs` starts empty; `updated` moves so
  every device pulls the result. A Dexie upgrade (v5) gives the device's projects slugs the
  same way, so addresses work before the NAS's migration runs, and adds no outbox rows. The
  order of events: whichever runs first, the NAS's slugs win once a device pulls them; a
  device with an edit pending sends its own slug, which the NAS keeps if it's free (moving
  its backfilled one to `oldSlugs`). Either way a device and the NAS end up with the same
  slugs. Against a NAS without the migration, a device keeps its own slugs, or makes one for
  a project it pulls.
- **Visitors** (`src/public/`) find a project online by its slug or an earlier one, through
  a PocketBase filter (`slug = "x" || oldSlugs ~ "\"x\""`) within the public read rules
  (D-0023, D-0025): a private or tombstoned project isn't found by either.
- **Previews and dev** (D-0006): the seeded demo projects have slugs from their titles
  (`/projects/tuinbank`).

# Rationale

A slug from the title reads well and can be made offline, so creating a project needs no
round trip. Letting the NAS settle clashes keeps that: offline devices may disagree for a
while, and sync brings them back in line, as it does for every other field. Keeping old slugs
means a shared link or a bookmark survives a rename. Dates and places name entries and photos
by what Sander sees on the page, need no stored field of their own, and stay readable.

# Consequences

- Projects gain `slug` and `oldSlugs` on the NAS and on devices; a migration and a hook are
  added, so D-0018's backup comes before merging.
- A slug can change under a device: the NAS may give its new project `kast-2` after it showed
  `kast` offline. An open page at `kast` then shows whichever project the NAS gave `kast`.
- A photo's address shifts when an earlier photo of its entry is deleted, and an entry's
  `-2` address can change when a same-day entry is removed. Old photo addresses aren't kept.
- `oldSlugs` only grows (apart from renaming back); it isn't shown to visitors.
- Visitors look a slug up across all public projects; with one owner that is unambiguous.

# Guidance for agents

- Never put an id in an address, a link, a hash or a query parameter; use the slug, the
  entry's day and the photo's place (`src/routes/paths.ts`).
- Change the slug rules in `src/db/slug.ts` and `deploy/nas/pb_hooks/slug.js` together;
  `src/db/slug.test.ts` checks they agree. Never edit the frozen copy in the migration.
- Never hand a slug that is in a project's `oldSlugs` to another project, and never let a
  purge marker keep one.
- A new route under `/projects/` with a static first segment must add that segment to the
  reserved slugs (both files), and a migration if a project already has it.
