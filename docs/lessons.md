# Lessons

One line each time a task needed rework: the tester sent it back, CI failed twice, or a
human corrected something (G-0014). Newest last. The architect turns a lesson that repeats
into a proposed rule change for the harness.

`- YYYY-MM-DD T-NNNN <role>: what went wrong, and what would have prevented it`
- 2026-11-22 T-0031 developer: `scrollIntoView` on the import block left it under the sticky header; the UX review caught it. Anything scrolled into view needs the header's scroll margin (`scroll-mt-20`, as the timeline days have), and an e2e check that it ends below the header.
- 2026-11-23 T-0032 tester: the unzip tests built their zips only with `zipSync` (sizes in the header), so they missed that fflate's streaming `Unzip` splits data-descriptor entries at any `PK` signature in the data. Test a file-format reader on every variant real tools write (here: data descriptors, stored and deflated) with data that contains the format's own markers.
- 2026-11-24 T-0036 developer: the branch was cut from a stale main, so its task and decision took numbers (T-0029, D-0031) that main had already used, and the new behaviour clashed with main's newest-first order; it needed a renumber and a rework. Fetch and merge origin/main before raising a task or starting a build, and again before opening the pull request.
- 2026-11-24 T-0038 tester: the new sync step read a 404 as "not on the NAS" and marked photos done for good, while PocketBase answers 404 to a refused token too; the rest of sync already asks the sign-in after a 400/404. A step that turns a 404 into a lasting state must confirm the sign-in first, with a test that revokes it mid-step on a private record.
- 2026-11-24 T-0039 architect: jagged covers came back in production after T-0037 and T-0038 passed, because their e2e checks measured only freshly imported, already measured photos after a fresh page load. A check that an image picks the right file must also run in the states the app passes through after an update: unmeasured or downloaded records, a background rebuild, and writes to the table while the page stays open.
- 2026-11-24 T-0037 architect: the measured-ratio check allowed a downscale of up to 3x and ran at DPR 1.5 and 2.625 only, so a 1280 px thumbnail drawn 4x down into a 320 px card at DPR 1 (Sander's laptop) was never measured, and 2.7x passed while still aliasing in Chrome. Bound a downscale check at about 2x and always include DPR 1.
