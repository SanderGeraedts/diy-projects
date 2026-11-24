---
id: D-0031
title: "The photo viewer moves through all of a project's photos in the timeline's order, across days"
description: "Arrow keys, the ‹ › buttons and swipes all go from a day's last photo to the first photo of the next day down the project page (and back), skipping days without live photos, for the owner and visitors; the counter and label stay per day, and a delete shows what next would have shown."
status: Accepted
date: 2026-11-24
decided_by: architect
overrules: []
replaces: []
replaced_by: []
resolves: []
tags: [product]
---

# Context

The full-screen viewer (T-0008, T-0009, T-0026, T-0027) loads only one entry's photos, so
ArrowLeft/ArrowRight, the ‹ › buttons and swipes stop at a day's first and last photo.
Sander, on 2026-11-24: "I noticed I can't navigate with the arrow keys between days, only
within one day. Please fix that." He asked for next to go from a day's last photo to the
first photo of the next day, in the timeline's order, for owner and visitor, and left the
rest to the architect. Addresses stay as D-0029 has them: `/projects/<slug>/<day>/<n>`.

# Decision

- **One sequence per project**: the viewer moves through all of the project's live photos in
  the order the project page shows them. Entries in the page's order (newest date first; on
  one date, the order the page uses), and within an entry its photos by `comparePhotos`
  (time taken, then when added, then id). "Next" is the photo below on the page: from the
  last photo of 25 okt it goes to the first photo of 11 okt.
- **Every way of moving crosses days alike**: ArrowRight/ArrowLeft, the › ‹ buttons and a
  horizontal swipe. The buttons show and the swipe resistance applies only at the first and
  last photo of the whole project.
- **Entries without live photos are skipped**: a note-only entry, or one whose photos were all
  deleted, is never shown in the viewer. Deleted entries and deleted photos never count.
- **The address follows the photo**: crossing to another day replaces the URL with that day's
  segment and the photo's place in it (`/projects/<slug>/2026-10-11/1`), so back still closes
  the viewer.
- **Counter and label stay per day**: "x / y" and "Foto x van y, <date>" count the photos of
  the shown photo's day, matching `<n>` in the address; the date and note shown are that
  day's. Neighbours rendered in the strip are labelled with their own day's place and date.
- **Deleting a photo** shows the photo that next pointed at (in the same day or the next
  one); at the project's last photo, the one previous pointed at; when the project has no
  other live photo, the viewer closes. Within a day the next photo takes the deleted one's
  place, so the address stays, as before.

# Rationale

Sander browses a project as one story; stopping at a day boundary is a dead end he has to
leave the viewer for. Following the page's order means the viewer never surprises: what is
below a photo on the page is what comes next. Making keys, buttons and swipes behave the
same avoids a viewer where the keyboard crosses days and a finger doesn't. Keeping the
counter per day keeps it equal to the address's `<n>` and to the date shown beside it; a
project-wide counter would disagree with both.

# Consequences

- The owner's viewer reads all of a project's live entries and photos from Dexie instead of
  one entry's; the visitor's already has the whole timeline.
- The page's entry order and the viewer's must not drift apart; one shared function should
  define it.
- "Next" goes back in time across days (the timeline is newest first) while it goes forward in
  time within a day. That is the page's own order; changing it means changing the page too.

# Guidance for agents

- Derive the viewer's order from the same code as the project page's order; don't sort
  entries a second way.
- Keep every move a `replace` navigation, so back closes the viewer.
- Don't add a project-wide counter without replacing this decision.
