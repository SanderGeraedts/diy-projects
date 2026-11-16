---
id: D-0003
title: "Photos are added from the gallery, grouped by date taken, kept offline at 2560 px, with originals only on the NAS"
description: "Photos taken in the Pixel camera app are added later through a multi-select picker and grouped into entries by EXIF date taken; the phone keeps every photo as a 2560 px WebP/AVIF copy and the untouched original lives only on the NAS."
status: Accepted
date: 2026-11-16
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [photos]
---

# Context

Sander takes photos with the Pixel camera app (best quality) and opens the project app
later to add them; he doesn't want the share menu as the main route. He wants every photo
viewable offline, looking good full screen on the open Pixel Fold 10 Pro (inner screen about
2150 px on the long side). Full originals (3–5 MB, over 10 MB at 50 MP) on the phone would
grow to tens of GB in browser storage.

# Decision

- **Input:** an in-app multi-select picker over the gallery. An Android share target is a
  nice-to-have, built only if it's small.
- **Grouping:** photos go into the entry for the day they were taken (EXIF
  `DateTimeOriginal`), creating that day's entry if needed. Without EXIF, use the file's
  last-modified date and say so.
- **On the phone:** every photo is kept offline as a 2560 px (long edge) WebP or AVIF copy at
  high quality, about 0.6–0.9 MB. Smaller thumbnails are derived from it.
- **On the NAS:** the original is uploaded byte-for-byte, kept forever, and is the only
  full-resolution copy. Once synced, the phone may drop its copy of the original.

# Rationale

2560 px covers the Fold's inner screen with room to zoom, at roughly a tenth of the original
size. Grouping by date taken keeps the timeline true even when photos are added days later.

# Consequences

- The phone copy is made on the device, before sync, so it exists offline.
- PocketBase's file size limit must be raised above its default for 50 MP originals.
- Originals contain GPS location. Fine while private; strip it before any sharing or public
  demo data.

# Guidance for agents

- Never re-encode, resize or strip the original that goes to the NAS.
- Don't change the 2560 px size or format without a new decision; it was chosen for the Fold.
- Keep the original on the device until the NAS confirms the upload.
