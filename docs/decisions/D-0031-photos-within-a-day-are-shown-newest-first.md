---
id: D-0031
title: "Addresses use a project slug, an entry date and a photo place, never an id; a day's photos are shown and numbered newest first"
description: "D-0029 with one change: an entry's photos are shown newest first (time taken, then when added, then id, each descending), and a photo's place in its address follows that order, so place 1 is the newest photo of the day."
status: Accepted
date: 2026-11-22
decided_by: architect
replaces: [D-0029]
replaced_by: []
resolves: []
tags: [architecture, product]
---

# Context

D-0029 shows an entry's photos oldest first (time taken, then when added, then id) and
numbers them in that order. The project page shows its days newest first (D-0025), so within
a day the order runs the other way. Sander, on 2026-11-22: "Within a day, the pictures are
sorted from old to new. I want the same order as the days, so the newest first." He asked
for the order; how photo addresses follow it was chosen by the architect, as it can be
reversed.

Two ways were considered for the photo's place in its address:

1. **The place follows the new order**: `/<day>/1` is the newest photo of the day, the
   first one shown. Existing photo links shift once: a link to place 1 of a day with three
   photos now opens the photo that was place 3.
2. **The place stays chronological** while the page shows newest first: existing links keep
   their photo, but place 1 is the last photo shown, and the viewer's "next" would count
   down.

D-0029's context follows.

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
  (`new`), becomes `project`. It is stored in a `slug` field on projects and syncs.
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
- **An entry's photos are shown newest first**: by time taken, latest first; then by when
  they were added, latest first; then by id, descending. The same order on the owner's page,
  on the visitor's page and in the viewer, matching the days (newest first).
- **A photo is at `/projects/<slug>/<yyyy-mm-dd>/<n>`**: its entry's date and its 1-based
  place among that entry's live photos, in the order they're shown (newest first, above), so
  place 1 is the newest photo of the day. In the viewer, "next" (swipe left, arrow right) is
  the next photo shown, an older one; "previous" a newer one. A project has one live entry
  per date: a note or photos for a day that has an entry go into it. Two offline devices, or
  a restore from the bin, can still leave two for one date; then the later ones (by
  creation) are `<date>-2`, `<date>-3`. Deleting a photo moves the photos after it up one
  place.
- **An entry is linked to by its date** (the same `<date>` or `<date>-2`): as the hash of its
  project's page, `/projects/<slug>#2026-10-04`, from search results and anywhere else.
- **Existing projects got slugs** from an additive PocketBase migration
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
- **Previews and dev** (G-0019): the seeded demo projects have slugs from their titles
  (`/projects/tuinbank`).

# Rationale

Newest first within a day matches the days, which is what Sander asked for. The place in a
photo's address keeps following what is shown, as D-0029 intended (dates and places name
entries and photos by what Sander sees on the page): photo 1 is the first photo on the page,
and swiping forward walks the page in reading order. Option 2 would keep old links on the
same photo, but D-0029 already accepts that photo addresses shift (a delete moves the photos
after it up, old photo addresses aren't kept), so a one-time shift costs little against an
address scheme that runs backwards for good. The change touches no data or schema and is
reversed by flipping the order back.

A slug from the title reads well and can be made offline, so creating a project needs no
round trip. Letting the NAS settle clashes keeps that: offline devices may disagree for a
while, and sync brings them back in line, as it does for every other field. Keeping old slugs
means a shared link or a bookmark survives a rename.

# Consequences

- **Photo links made before this change shift once**: for a day with more than one photo,
  `/<day>/<n>` now opens a different photo of that day (place 1 of three becomes the photo
  that was place 3). It still opens a photo of the same day of the same project; project and
  day links are unaffected.
- Adding a photo taken later than a day's other photos now moves those down one place, where
  before adding an earlier one did.
- A slug can change under a device: the NAS may give its new project `kast-2` after it showed
  `kast` offline. An open page at `kast` then shows whichever project the NAS gave `kast`.
- A photo's address shifts when a photo shown before it in its entry is deleted, and an
  entry's `-2` address can change when a same-day entry is removed. Old photo addresses
  aren't kept.
- `oldSlugs` only grows (apart from renaming back); it isn't shown to visitors.
- Visitors look a slug up across all public projects; with one owner that is unambiguous.

# Guidance for agents

- Never put an id in an address, a link, a hash or a query parameter; use the slug, the
  entry's day and the photo's place (`src/routes/paths.ts`).
- Order an entry's photos only with `comparePhotos` in `src/routes/paths.ts`, wherever they
  are shown or numbered (owner page, visitor timeline, viewer), so the page, the address and
  the viewer agree. Don't sort photos for display by hand elsewhere.
- Change the slug rules in `src/db/slug.ts` and `deploy/nas/pb_hooks/slug.js` together;
  `src/db/slug.test.ts` checks they agree. Never edit the frozen copy in the migration.
- Never hand a slug that is in a project's `oldSlugs` to another project, and never let a
  purge marker keep one.
- A new route under `/projects/` with a static first segment must add that segment to the
  reserved slugs (both files), and a migration if a project already has it.
