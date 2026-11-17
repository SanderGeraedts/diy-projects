# Decisions

Read this list first, then only the records your work touches. How the registry works is in
[README.md](README.md).

## Accepted

### Process

- [D-0001 Decisions and open questions live as files in this repository](D-0001-decisions-live-in-a-registry-in-the-repo.md): Every lasting choice is a D-NNNN file and every unanswered one a Q-NNN file under docs/decisions/, listed in its index, so agents work from recorded decisions instead of chat history.
- [D-0008 Tasks are T-NNNN files in docs/tasks, each with a check that proves it done](D-0008-tasks-are-files-in-the-repo.md): Work for agents is one file per task under docs/tasks, listed in its index, with a Done-when check and the decisions it must follow; there is no claim mechanism while Sander is the only contributor.
- [D-0010 The repo is SanderGeraedts/diy-projects, private until v1 works, then public under MIT](D-0010-private-personal-repo-mit-later.md): The code lives on Sander's personal GitHub account as diy-projects, private while it's rough; once v1 works and the deploy docs are generic it goes public under the MIT licence.
- [D-0017 Agents may auto-merge a green PR, except one that touches a guarded path; until the repo is public a local guard stops agents merging or pushing to main](D-0017-guarded-paths-enforced-by-ci-and-a-local-guard.md): D-0012's auto-merge rule and question exception, with .claude/ and .githooks/ added to the guarded paths, and a local guard (Claude Code permissions and a versioned pre-push hook) that stops agents merging PRs or pushing to main while GitHub Free offers no branch protection; branch protection replaces it when the repo goes public.

### Architecture

- [D-0002 The app is an offline-first PWA; PocketBase on the NAS is the source of truth](D-0002-offline-first-pwa-with-the-nas-as-source-of-truth.md): Each device keeps a full local copy plus an outbox of changes and works with no connection; PocketBase on the NAS is the master, photos are append-only, and text edits are last-write-wins with the overwritten version kept in history.
- [D-0005 The front end is on Netlify at projects.sanderg.nl; the browser talks directly to PocketBase on the NAS through Tailscale Funnel](D-0005-netlify-front-end-pocketbase-on-the-nas-behind-funnel.md): The static PWA is hosted on Netlify at projects.sanderg.nl with deploy previews; data and photos go straight from the browser to PocketBase on the NAS via a Funnel ts.net address with a path allowlist; the backend deploys through GitHub Actions and Watchtower as in Hanna's Reading List.
- [D-0006 Deploy previews and local dev run offline with seeded data; only production syncs](D-0006-previews-and-dev-run-offline-with-seeded-data.md): Netlify PR previews and the local dev server use seeded demo projects in the browser with sync switched off; only the production build can reach the NAS, and CI tests sync against a throwaway PocketBase.
- [D-0007 The stack is a React + Vite SPA with TanStack Router, vite-plugin-pwa and Dexie, against PocketBase](D-0007-react-vite-spa-with-dexie-and-pocketbase.md): A static single-page app in React and TypeScript, built with Vite, routed with TanStack Router, made installable and offline with vite-plugin-pwa, storing records and photos in IndexedDB through Dexie; PocketBase is the backend.
- [D-0013 Sander signs in with email and password; a sign-in lasts 90 days and never blocks offline use; signing out clears the device](D-0013-sign-in-with-email-and-password-never-blocking-offline-use.md): One PocketBase user with email and password, a 90-day token renewed on every sync, an expired sign-in only pauses sync, and sign-out syncs, warns about anything unsynced, then clears the device's local copy.
- [D-0015 The device that adds a photo uploads its 2560 px copy and thumbnail with the original; other devices download only those](D-0015-the-adding-device-uploads-the-copy-and-thumbnail-with-the-original.md): Each photo on the NAS has three files: the untouched original, the 2560 px WebP copy and a thumbnail, all uploaded by the device that added it; other devices download the copy and thumbnail, never the original, and the NAS does no image processing.
- [D-0016 No separate backup of the NAS data in v1; losing the NAS is an accepted risk](D-0016-no-separate-backup-in-v1.md): v1 relies on the NAS's two-disk redundancy, and on Immich, which already holds the photos; losing the notes, tags and project structure if the NAS dies or the database corrupts is accepted for now.

### Product

- [D-0003 Photos are added from the gallery, grouped by date taken, kept offline at 2560 px, with originals only on the NAS](D-0003-photos-come-from-the-gallery-with-a-phone-sized-copy-offline.md): Photos taken in the Pixel camera app are added later through a multi-select picker and grouped into entries by EXIF date taken; the phone keeps every photo as a 2560 px WebP/AVIF copy and the untouched original lives only on the NAS.
- [D-0004 v1 is projects with status and tags, dated photo entries, and offline search](D-0004-v1-is-projects-entries-tags-and-search.md): A project has a title, description, status, tags and cover photo and a timeline of entries (date, photos, note); search over titles, notes and tags runs on the device; materials, costs, checklists, sharing and multiple users are out of v1.
- [D-0011 The app's look follows sanderg.nl: Poppins, a pink/orange accent, the system theme, Dutch, built with Tailwind](D-0011-design-system-follows-sanderg-nl.md): A small design system modelled on sanderg.nl (palette, Poppins, accent bars, 25px corners), adapted for an offline phone app: self-hosted font, system light/dark only, four status hues, Dutch interface, Tailwind v4 tokens, and a /design page with screenshot tests.
- [D-0014 Deleting a project or entry is a soft delete that cascades to its photos; a bin to restore or permanently delete comes after v1](D-0014-deleting-is-a-soft-delete-that-cascades-a-bin-comes-after-v1.md): In v1, deleting an entry tombstones it and its photos, and deleting a project tombstones it, its entries and their photos, after a confirmation naming the photo count; everything stays on the NAS. After v1, a bin lets Sander restore or permanently delete.

## Open questions

None.

## Resolved questions

- [Q-001 How should the guarded-path review be enforced while the repo is private on a free plan?](Q-001-how-to-enforce-review-of-guarded-prs-on-a-private-free-repo.md): GitHub Free offers no branch protection, rulesets or code-owner reviews on private repos, so nothing on GitHub stops anyone with write access from merging a guarded PR; decide whether to accept that until the repo goes public, pay for Pro, or add a local guard.
- [Q-002 Can projects and entries be deleted, and what happens to their photos?](Q-002-can-projects-and-entries-be-deleted.md): D-0004 doesn't say whether projects and entries can be deleted and D-0002 only defines tombstones for photos; decide whether deleting is allowed, whether it cascades to photos, and whether anything is ever purged from the NAS.
- [Q-003 How does Sander sign in to PocketBase, and what happens when the sign-in expires offline?](Q-003-how-does-sander-sign-in.md): Sync needs a PocketBase sign-in (D-0005: sign-up closed, owner-only records); decide the sign-in method, how long a sign-in lasts, and that an expired sign-in never blocks offline use.
- [Q-004 How does a second device (the laptop, or a reinstalled phone) get the 2560 px copy of each photo?](Q-004-how-do-other-devices-get-the-phone-sized-copy.md): D-0003 has the phone make a 2560 px copy before sync and keeps only originals on the NAS; decide how any other device gets its offline copy without downloading every original.
- [Q-005 How are PocketBase's data and the photo originals on the NAS backed up?](Q-005-how-is-the-nas-data-backed-up.md): The NAS holds the only copy of every photo original (D-0003) and is the source of truth (D-0002), but no decision covers backups; decide what is backed up, where to, how often, and how a restore is tested.

## Replaced

- [D-0009 Agents may auto-merge a green PR, except one that touches a guarded path](D-0009-agents-auto-merge-except-guarded-paths.md): Replaced by D-0012, which adds the exception for PRs that only raise new open questions.
- [D-0012 Agents may auto-merge a green PR, except one that touches a guarded path; raising a new question is allowed](D-0012-agents-auto-merge-except-guarded-paths-new-questions-allowed.md): Replaced by D-0017, which adds .claude/ and .githooks/ to the guarded paths and a local guard against agents merging or pushing to main.
