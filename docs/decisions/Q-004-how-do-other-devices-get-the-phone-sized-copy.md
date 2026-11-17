---
id: Q-004
title: "How does a second device (the laptop, or a reinstalled phone) get the 2560 px copy of each photo?"
description: "D-0003 has the phone make a 2560 px copy before sync and keeps only originals on the NAS; decide how any other device gets its offline copy without downloading every original."
status: Open
raised_on: 2026-11-17
raised_by: claude-code/opus-5.5
blocks: [T-0017]
resolved_by: []
tags: [photos, sync, storage]
---

# Question

D-0003: the device that adds a photo makes a 2560 px WebP/AVIF copy on the spot, and the NAS
keeps the untouched original as "the only full-resolution copy". D-0002 says each device
keeps a full local copy. Not decided: where a device that didn't add the photo (the laptop,
or the phone after Android cleared its storage) gets its 2560 px copy. Originals are 3–5 MB,
over 10 MB at 50 MP, and travel through Funnel's relays (D-0005).

# Options

1. **The adding device uploads its copy and a thumbnail next to the original.
   (Recommended)** Each photo record on the NAS has three files: the original (untouched),
   the 2560 px copy and a small thumbnail. Other devices download only the copy and the
   thumbnail, about 1 MB a photo. No image processing on the NAS. Costs about 25% extra
   storage on the NAS.
2. **Other devices download the original and make their own copy.** Nothing extra stored,
   but every new device pulls every original (gigabytes over Funnel) and resizes 50 MP
   images in the browser.
3. **PocketBase makes the copy on request (its thumbnail feature).** Nothing extra
   uploaded, but the NAS has to decode 50 MP images, PocketBase's thumbnails keep the
   original's format (JPEG, not WebP/AVIF), and the first view of each photo is slow.

# Answer

Open.
