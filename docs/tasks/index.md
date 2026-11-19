# Tasks

Generated from the task files by `pnpm run tasks:index`; don't edit by hand (D-0024).
One file per task (D-0008), from [_template.md](_template.md). Pick from *Open* a task whose
`depends_on` are all Done. One task per session.

## Open

- [T-0021 Prepare the repository to go public under MIT](T-0021-prepare-the-repository-to-go-public.md): Once v1 works, make the deploy docs generic, check the history for secrets, tailnet names and real photos, add the MIT licence and a README, and turn on branch protection.
- [T-0022 Add the bin: restore or permanently delete deleted projects and entries (after v1)](T-0022-add-the-bin.md): A bin screen listing deleted projects and entries, with restore, and a permanent delete that removes the files and history from the NAS but keeps a marker that refuses late uploads.
- [T-0026 Show public projects read-only to visitors who aren't signed in](T-0026-public-read-only-view.md): A per-project public switch (off by default), PocketBase rules that let anyone read public projects, their entries and photo copies and thumbnails but never originals, and a read-only online view for visitors.

## Doing

- [T-0007 Import photos from the gallery into a project's entries](T-0007-import-photos-from-the-gallery.md): A multi-select picker that adds photos to a project, grouped into one entry per day taken, storing the 2560 px copy, a thumbnail and the original until it's uploaded.
- [T-0008 View photos full screen](T-0008-view-photos-full-screen.md): A full-screen photo viewer with swipe between an entry's photos and pinch zoom, sized for the open Pixel Fold.
- [T-0016 Sync projects and entries with PocketBase](T-0016-sync-records.md): The sync engine in src/sync/: push the outbox, pull changes since the last sync, last-write-wins with history kept on the NAS, tested in CI against a throwaway PocketBase.
- [T-0017 Sync photo files: upload the original, copy and thumbnail; other devices fetch copy and thumbnail](T-0017-sync-photos.md): Upload each photo's untouched original, its 2560 px copy and its thumbnail in the background, resuming after interruptions; drop the device's original once confirmed; other devices download only the copy and thumbnail.

## Done

- [T-0001 Scaffold the app, CI and the auto-merge gate](T-0001-scaffold-the-app-and-ci.md): An installable, empty React + Vite PWA with seeded demo data, deployed to Netlify with previews, and CI that runs checks and enforces the guarded-path auto-merge rule.
- [T-0002 Apply the sanderg.nl-based design system](T-0002-apply-the-design-system.md): Replace T-0001's placeholder look with D-0011's design system in Tailwind: tokens, Poppins, the header, card, badge and entry components, the Dutch interface, the new icon, and a /design page with screenshot tests.
- [T-0003 Prepare the local database for sync: change tracking, soft deletes, the outbox and a write API](T-0003-prepare-the-local-database-for-sync.md): Dexie schema v2 with updatedAt and tombstones on every record, an outbox of unsynced changes, photo originals kept until uploaded, persistent storage, and the one write API every screen uses.
- [T-0004 Create and edit projects](T-0004-create-and-edit-projects.md): A form to add a project and edit its title, description, status and tags, through the local write API, working offline.
- [T-0005 Add and edit timeline entries](T-0005-add-and-edit-entries.md): Add an entry with a date and a note to a project, and edit its note, offline, through the local write API.
- [T-0006 Process photos on the device: date taken, the 2560 px copy and a thumbnail](T-0006-process-photos-on-the-device.md): A tested module that reads a photo's EXIF date taken and makes its 2560 px WebP copy and a thumbnail in a worker, leaving the original untouched.
- [T-0009 Choose a project's cover photo and delete photos](T-0009-choose-a-cover-and-delete-photos.md): Set any of a project's photos as its cover, and delete a photo as a tombstone that syncs, from the photo viewer.
- [T-0010 Delete projects and entries as soft deletes that cascade to their photos](T-0010-delete-projects-and-entries.md): 'Verwijderen' on an entry or project tombstones it and its photos in one transaction, after a confirmation naming the photo count; nothing is removed from the NAS.
- [T-0011 Filter the overview by status and tag](T-0011-filter-the-overview.md): Status and tag filters on the overview, combinable, kept in the URL, working offline on the local data.
- [T-0012 Search projects and notes offline](T-0012-search-offline.md): One search field over project titles, descriptions, entry notes and tags, run on the device's local copy, with results that open the matching project or entry.
- [T-0013 Build the PocketBase image: schema, rules, history and the publish workflow](T-0013-build-the-pocketbase-image.md): The PocketBase backend in deploy/nas/: migrations for projects, entries, photos and history, owner-only rules, CORS, the photo size limit, a history hook, and a GitHub Actions workflow that checks the migrations and publishes the image.
- [T-0014 Run PocketBase on the NAS behind Tailscale Funnel](T-0014-run-pocketbase-on-the-nas.md): Compose files, the Funnel serve.json allowlist and the step-by-step setup in deploy/nas/, so Sander can run the image on the NAS, reachable only through Funnel, updated by Watchtower.
- [T-0015 Sign in to PocketBase with email and password](T-0015-sign-in-to-pocketbase.md): The sign-in screen and token handling in src/auth/, production only: a 90-day token renewed on sync, an expired sign-in that only pauses sync, and a sign-out that syncs, warns, then clears the device.
- [T-0018 Show sync status: unsynced changes, last sync and storage warnings](T-0018-show-sync-status.md): A small status in the header with the number of unsynced changes and photos, the last successful sync, errors, and a warning when the browser hasn't granted persistent storage.
- [T-0019 Offer app updates safely](T-0019-prompt-for-app-updates.md): When a new version is ready, show 'Nieuwe versie beschikbaar' and switch to it on a tap, never in the middle of an import or sync.
- [T-0023 Add the local guard: no agent merges or pushes to main](T-0023-add-the-local-merge-and-push-guard.md): Claude Code permissions denying gh pr merge, the merge API and pushes to main, a versioned pre-push hook refusing pushes to main, and .claude/ and .githooks/ added to the guarded paths.
- [T-0024 Switch the project to pnpm](T-0024-switch-to-pnpm.md): Move from npm to pnpm (D-0019): pnpm-lock.yaml converted from the npm lockfile, packageManager pinned, CI, Netlify and Playwright on pnpm, npm installs refused, and the docs' commands updated.
- [T-0025 Check whether the repository can go public](T-0025-check-whether-the-repo-can-go-public.md): Audit the whole git history, every branch and the open PRs for secrets, personal and infrastructure details, real photos and licence problems, and write a findings report with a proposed fix for each, so Sander can decide what blocks going public.

## Dropped

- [T-0020 Back up the NAS data, as Q-005 decides, and test a restore](T-0020-back-up-the-nas-data.md): The backup of PocketBase's data and the photo originals as Q-005's decision describes, with a restore tested once and written down in deploy/nas/.
