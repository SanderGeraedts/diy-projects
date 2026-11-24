---
id: D-0033
title: "Photos can also be added by dropping them onto the owner's project page; they take the same import as the picker"
description: "Adds to D-0003: on the owner's project page, image files dragged from the computer and dropped anywhere on the page go through the same import as \"Foto's toevoegen\" and land in the day they were taken; a drop never opens the file in the browser, anywhere in the app."
status: Accepted
date: 2026-11-22
decided_by: architect
replaces: []
replaced_by: []
resolves: []
tags: [product]
---

# Context

D-0003 makes the in-app picker ("+ Foto's toevoegen", `src/routes/ImportPhotos.tsx`) the way
photos are added; the import itself runs in `src/photos/importQueue.ts` (T-0007): EXIF date
(exifr), the 2560 px copy, a thumbnail, one entry per day taken, the summary of what was
added, failed or dated by the file. Sander, on 2026-11-22: "At least on the larger screen
sizes, I want the ability to drag and drop images into the project. Preferably zip files
with images as well, but the latter is no deal breaker." The details below were chosen by the
architect, as they can be reversed. Zip files are D-0034.

Where a drop could be accepted:

1. **Anywhere on the owner's project page.** The photos go to the day they were taken, as
   with the picker.
2. **On a specific day.** The photos would go into that day's entry, whatever their date.
   That breaks D-0003's grouping by date taken and gives two rules for where a photo lands.
3. **On the overview, onto a project card.** A small target, and the result isn't visible
   where the drop happened.

# Decision

- **Where:** the owner's project page (`/projects/<slug>`), anywhere on it. Not the
  overview, the edit form, the bin or any visitor page.
- **What happens:** the dropped files go to `startImport` exactly as picked files do. Each
  photo lands in the day it was taken, the day's entry is made when needed, the progress and
  the summary are the same, and leaving the page doesn't stop it. It works offline.
- **Only images are imported.** A dropped file that isn't an image (by its type, or that
  fails to read as one) isn't added and is listed in the summary as not added, so nothing
  disappears without a word. A dropped folder isn't opened; it is listed the same way.
  Zip files: D-0034.
- **No size gate in code:** drops are handled at every width. A phone doesn't produce file
  drops, so in practice it is the laptop and large screens. Any visible hint that photos can
  be dropped is the UX designer's choice, and may be shown only on larger screens.
- **A stray drop never leaves the app:** dropping files anywhere else in the app (overview,
  visitor pages, forms) does nothing, rather than the browser opening the file in place of
  the app.
- **The picker stays as it is,** `accept="image/*"`, so the phone keeps the gallery picker.

# Rationale

One import path means one set of rules: drop and pick give the same entries, the same EXIF
handling, the same summary, and the same tests cover both. Dropping onto a day was rejected
because the day a photo belongs to is its date taken (D-0003); a drop target per day would
suggest otherwise. The whole page as a target is easy to hit with a mouse and needs no
precise aim.

# Consequences

- The project page listens for drag events; the app as a whole stops the browser's default
  of opening a dropped file.
- The import summary may list files that were never photos, with a reason.
- Visitors and the overview can't receive photos by drop; adding photos stays the owner's,
  on a project's page (D-0023).

# Guidance for agents

- Feed drops into `startImport` in `src/photos/importQueue.ts`; don't build a second import.
- Don't let a drop choose the entry: the day comes from the photo (D-0003).
- Don't change the picker's `accept` to take other file types; on Android that swaps the
  gallery picker for a file browser.
