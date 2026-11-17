---
id: D-0015
title: "The device that adds a photo uploads its 2560 px copy and thumbnail with the original; other devices download only those"
description: "Each photo on the NAS has three files: the untouched original, the 2560 px WebP copy and a thumbnail, all uploaded by the device that added it; other devices download the copy and thumbnail, never the original, and the NAS does no image processing."
status: Accepted
date: 2026-11-17
decided_by: sander
replaces: []
replaced_by: []
resolves: [Q-004]
tags: [photos, sync, storage]
---

# Context

D-0003 has the adding device make a 2560 px copy before sync and keeps only the untouched
original on the NAS; D-0002 says every device keeps a full local copy. Q-004 asked how a
device that didn't add a photo (the laptop, or a phone whose storage Android cleared) gets
its copy. Considered: downloading originals and resizing on each device (gigabytes over
Funnel), and PocketBase's own thumbnails (JPEG only, and the NAS decoding 50 MP images).
Answered in a design interview on 2026-11-17.

# Decision

- A photo record on the NAS has three files: the **original** (byte for byte, D-0003), the
  **2560 px WebP copy** and the **thumbnail**, both made on the adding device (T-0006).
- The adding device uploads all three. Other devices download only the copy and the
  thumbnail, never the original.
- The NAS does no image processing; PocketBase's thumbnail feature isn't used.

# Rationale

About 1 MB per photo for each new device instead of 3–10+ MB, the same WebP copy everywhere
(D-0003), and no CPU or memory load on the NAS.

# Consequences

- About 25% more storage on the NAS per photo.
- The copy and thumbnail can be uploaded before the original, so other devices see a photo
  quickly while the large original is still on its way.

# Guidance for agents

- Never re-encode the original, and never let the NAS generate copies.
- Treat a photo as fully synced only when all three files are confirmed; the device keeps
  its original until then (D-0003).
