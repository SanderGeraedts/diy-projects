---
id: D-0034
title: "A zip file dropped onto a project page is unpacked on the device with fflate, and its images take the normal import"
description: "Adds to D-0033: a dropped .zip is unpacked in the browser, one file at a time, with fflate (MIT, no dependencies of its own), loaded only when a zip is dropped and precached for offline use; its image files go through startImport, everything else in it is skipped, and an image over 40 MB is not added."
status: Accepted
date: 2026-11-22
decided_by: architect
replaces: []
replaced_by: []
resolves: []
tags: [product, architecture]
---

# Context

Sander, on 2026-11-22, about dropping photos onto a project: "Preferably zip files with
images as well, but the latter is no deal breaker." Dropping images is D-0033 (T-0031). A
browser can't read a zip by itself: it can inflate a deflate stream (`DecompressionStream`),
but not find the files in an archive.

No decision, global or in this project, governs adding a dependency. G-0017 says not to add a
second library for a job one of the stack's libraries already does; none of them reads zip
files. Adding an npm package costs nothing, touches no infrastructure, data store, access or
outside service, and is undone by removing it, so the architect chose it.

Options considered:

1. **fflate:** MIT, no dependencies of its own, small (the unzip part is a few kB),
   streaming unzip so one file is in memory at a time.
2. **JSZip:** well known, but larger, and its API loads a whole archive into memory.
3. **Our own zip reader on `DecompressionStream`:** no new package, but we would own a file
   format parser (central directory, data descriptors, zip64) and its edge cases.
4. **No zip support:** Sander said it is no deal breaker.

# Decision

- **Zip files are supported, in a task of their own (T-0032)** after the image drop
  (T-0031), so image drop doesn't wait on it.
- **Where:** the same as D-0033: dropped onto the owner's project page. Not in the picker
  (D-0033 keeps its `accept="image/*"`).
- **How:** the zip is unpacked in the browser, on the device, with **fflate**, added as a
  dependency with pnpm (G-0016). It is loaded with a dynamic `import()` only when a zip is
  dropped, and that chunk is in the service worker's precache, so a zip drop works offline
  like everything else.
- **One file at a time:** entries are inflated and handed to the import one by one, never
  the whole archive at once.
- **What is imported:** every file in the zip whose name ends in an image extension the
  picker takes (`.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif`, `.avif`, `.gif`, any
  case), in any folder of the zip. They go through `startImport` as files named after their
  name in the zip, so each lands in the day it was taken (EXIF, D-0003). Skipped without a
  word: folders, other files, and the `__MACOSX/` folder and `._*` and dotfiles that macOS
  and others add. A zip inside the zip isn't opened.
- **Original:** the unpacked bytes are the photo's original (D-0015), byte for byte as they
  were put into the zip.
- **Without EXIF:** dated by the file's modification time in the zip when fflate gives it,
  otherwise by the zip file's own date, and listed as "dated by the file" in the summary,
  as today.
- **Limits:** an image larger than 40 MB unpacked (the NAS's limit on an original, T-0013)
  isn't added and is listed in the summary with a reason; unpacking stops as soon as an
  entry passes that size. A zip that can't be read (damaged, encrypted, not a zip) is listed
  as not added. A zip with no images says so in the summary.

# Rationale

fflate does the job with no dependencies of its own, so it adds one package to trust, not a
tree, and its streaming API keeps a large archive from filling a phone's or laptop's memory.
JSZip loads the whole archive. Writing our own reader would avoid a package but make us
maintain a file format. A separate task keeps the part Sander called no deal breaker from
holding up the part he asked for.

# Consequences

- One new runtime dependency, `fflate`, in `package.json` and `pnpm-lock.yaml`.
- The app's precache grows by the unzip chunk.
- Photos from a zip are processed one at a time, like picked ones; a large zip takes a while,
  shown by the same progress.

# Guidance for agents

- Keep fflate behind a dynamic `import()`; don't load it on startup.
- Hand unpacked images to `startImport`; don't build a second import path.
- Don't add other archive formats (rar, 7z, tar) without a new decision.
- Replacing fflate with another zip library is reversible, but record it as a decision that
  replaces this one.
