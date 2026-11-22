---
id: D-0035
title: "A zip file dropped onto a project page is read on the device by its central directory, inflated with fflate, and its images take the normal import"
description: "D-0034 with one change: the app finds a zip's entries itself, from the end record, the central directory and ZIP64, reading each image from its own slice of the File and checking its size and CRC-32; fflate only inflates, with its streaming Inflate. Lazy loading, precache, one image at a time, images only and the 40 MB limit stay."
status: Accepted
date: 2026-11-23
decided_by: architect
replaces: [D-0034]
replaced_by: []
resolves: []
tags: [product, architecture]
---

# Context

D-0034 (2026-11-22) added zip files to D-0033's drop: unpacked on the device with fflate's
streaming reader, one entry at a time. Among the options it rejected was writing our own zip
reader, because "we would own a file format parser (central directory, data descriptors,
zip64) and its edge cases".

On T-0032 the tester found that fflate 0.8.3's streaming `Unzip` can't read zips whose
entries have a data descriptor (sizes after the data, as macOS's Compress and other
streaming zippers write them). It doesn't know where such an entry ends, so it scans the
entry's bytes for `PK` signatures and ends it at the first match. A photo whose bytes happen
to contain one is lost (deflated), or cut short and imported without a word (stored), and a
stored zip inside the zip is opened. For a 5 MB photo that is roughly a 1 in 300 chance per
photo, so a zip of a few hundred photos from a Mac more likely than not loses one.

A streaming reader can't fix this: only the central directory, at the end of the file, says
for certain where each entry starts and how long it is. A dropped zip is a `File`, which can
be read at any offset with `slice()`. fflate has no reader that uses the central directory
without loading the whole archive into memory (`unzipSync` and `unzip` take the full
buffer), which D-0034 ruled out for a phone.

Options considered:

1. **Find the entries ourselves from the central directory; fflate inflates.** The app reads
   the end record (and the ZIP64 end when sizes are maxed out) and the central directory
   with `File.slice()`, then reads each image from its own slice, inflating deflated ones
   with fflate's streaming `Inflate`. Each image is checked against the directory's size and
   CRC-32. About 150 lines of parsing, plus a CRC-32 table, since fflate 0.8 doesn't export
   one. This is what the developer built (T-0032, commit b2c7521).
2. **The same, but inflate with the browser's `DecompressionStream('deflate-raw')`** and
   drop fflate. No package at all; but the output comes in pieces of the browser's choosing,
   so the 40 MB stop is less exact, and option 1 is already built and tested.
3. **fflate's `unzip`/`unzipSync` on the whole file:** correct, but holds the whole archive
   (and every photo in it) in memory; a 2 GB zip on a phone fails.
4. **Keep the streaming `Unzip` and accept the loss:** photos lost or cut short without a
   word contradicts D-0015 (the original byte for byte) and is not acceptable.

Owning a parser is reversible (it is one module, `src/photos/unzip.ts`) and touches no
infrastructure, data store, access or outside service, so the architect decided it.

# Decision

- **Where:** as D-0033: a zip is dropped onto the owner's project page, alone or with
  photos. Not in the picker (D-0033 keeps its `accept="image/*"`).
- **Finding the entries:** the app reads the zip's end-of-central-directory record, the
  ZIP64 end record when present, and the central directory, with `File.slice()`. Each
  entry's name, method, flags, sizes, CRC-32 and offset come from the central directory,
  never from scanning the data for signatures. Each image is read from its own slice: its
  local header, then its data.
- **Inflating:** deflated entries are inflated with **fflate**'s streaming `Inflate`, in
  pieces of 16 kB; stored entries are passed through. fflate stays a dependency, pinned
  exactly (G-0016), loaded with a dynamic `import()` only when a zip is dropped, and that
  chunk is in the service worker's precache, so a zip drop works offline.
- **Checked:** each image's unpacked bytes must match the directory's size and CRC-32, or it
  isn't added. Its bytes are then the photo's original (D-0015), byte for byte.
- **One image at a time:** the next image is read only when the import asks for it; entries
  that aren't images are never read, so a zip inside the zip is never opened.
- **What is imported:** every file whose name ends in `.jpg`, `.jpeg`, `.png`, `.webp`,
  `.heic`, `.heif`, `.avif` or `.gif` (any case), in any folder of the zip, goes through
  `startImport` named after its name in the zip, and lands in the day it was taken (EXIF,
  D-0003). Skipped without a word: folders, other files, `__MACOSX/`, `._*` and dotfiles.
- **Without EXIF:** dated by the zip file's own date (`lastModified`) and listed as "dated
  by the file" in the summary. The entry's DOS time in the directory has no time zone, so it
  isn't used.
- **Not added, with a reason in the summary:** an image larger than 40 MB unpacked (the
  NAS's limit on an original, T-0013; unpacking stops as soon as it passes that size); an
  image whose size or CRC-32 doesn't match, that is encrypted, or that uses a method other
  than stored or deflated; a zip that can't be read (damaged, encrypted, not a zip). A zip
  without a central directory (cut short) is read by its local headers while they carry
  sizes, never past an entry with a data descriptor, and then listed as only partly
  unpacked. A zip with no images says so.
- **Formats:** zip only; no rar, 7z or tar.

# Rationale

Only the central directory says reliably where each entry is; a streaming reader has to
guess for entries with a data descriptor, and the guess loses photos from zips made on a
Mac, the most likely source. Reading the directory from a `File` keeps one image in memory
at a time, as D-0034 wanted, which no fflate reader does. The cost D-0034 named, owning a
parser, is real but small: only what reading entries needs (no writing, no spanning, no
encryption), with a CRC-32 check that catches any mistake in it rather than importing wrong
bytes. fflate stays for the part that is hard to get right, inflating, and keeps the 40 MB
stop exact in small pieces.

# Consequences

- `src/photos/unzip.ts` holds a zip directory reader (end record, central directory, ZIP64,
  local headers) and a CRC-32 table, maintained by this project. Its edge cases are ours.
- The runtime dependency stays `fflate`, exact version; only its `Inflate` is used.
- The precache holds the unzip chunk.
- Photos from a zip are processed one at a time, like picked ones; a large zip takes a
  while, shown by the same progress.

# Guidance for agents

- Never find an entry's end by scanning for `PK` signatures; take sizes and offsets from
  the central directory.
- Keep the size and CRC-32 check on every image; an image that fails it is listed as not
  added, never imported.
- Keep fflate behind a dynamic `import()`; don't load it on startup.
- Hand unpacked images to `startImport`; don't build a second import path.
- Don't add other archive formats, encryption or writing zips without a new decision.
- Moving inflation to `DecompressionStream` and dropping fflate, or moving to a library
  that reads the central directory from a `File`, is reversible, but record it as a
  decision that replaces this one.
- Every zip fixture with data descriptors in tests should include bytes that look like
  signatures (`PK\x03\x04`, `PK\x07\x08`, `PK\x01\x02`); a fixture without them hides this
  bug.
