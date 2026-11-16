# Decisions

Read this list first, then only the records your work touches. How the registry works is in
[README.md](README.md).

## Accepted

### Process

- [D-0001 Decisions and open questions live as files in this repository](D-0001-decisions-live-in-a-registry-in-the-repo.md): Every lasting choice is a D-NNNN file and every unanswered one a Q-NNN file under docs/decisions/, listed in its index, so agents work from recorded decisions instead of chat history.
- [D-0008 Tasks are T-NNNN files in docs/tasks, each with a check that proves it done](D-0008-tasks-are-files-in-the-repo.md): Work for agents is one file per task under docs/tasks, listed in its index, with a Done-when check and the decisions it must follow; there is no claim mechanism while Sander is the only contributor.
- [D-0009 Agents may auto-merge a green PR, except one that touches a guarded path](D-0009-agents-auto-merge-except-guarded-paths.md): An agent's PR merges itself when CI is green, unless it touches the NAS backend, the sync engine or local database, the service worker or auth, or the decisions, CI and agent rules; those always need Sander's review, enforced by CI from the changed paths.
- [D-0010 The repo is SanderGeraedts/diy-projects, private until v1 works, then public under MIT](D-0010-private-personal-repo-mit-later.md): The code lives on Sander's personal GitHub account as diy-projects, private while it's rough; once v1 works and the deploy docs are generic it goes public under the MIT licence.

### Architecture

- [D-0002 The app is an offline-first PWA; PocketBase on the NAS is the source of truth](D-0002-offline-first-pwa-with-the-nas-as-source-of-truth.md): Each device keeps a full local copy plus an outbox of changes and works with no connection; PocketBase on the NAS is the master, photos are append-only, and text edits are last-write-wins with the overwritten version kept in history.
- [D-0005 The front end is on Netlify at projects.sanderg.nl; the browser talks directly to PocketBase on the NAS through Tailscale Funnel](D-0005-netlify-front-end-pocketbase-on-the-nas-behind-funnel.md): The static PWA is hosted on Netlify at projects.sanderg.nl with deploy previews; data and photos go straight from the browser to PocketBase on the NAS via a Funnel ts.net address with a path allowlist; the backend deploys through GitHub Actions and Watchtower as in Hanna's Reading List.
- [D-0006 Deploy previews and local dev run offline with seeded data; only production syncs](D-0006-previews-and-dev-run-offline-with-seeded-data.md): Netlify PR previews and the local dev server use seeded demo projects in the browser with sync switched off; only the production build can reach the NAS, and CI tests sync against a throwaway PocketBase.
- [D-0007 The stack is a React + Vite SPA with TanStack Router, vite-plugin-pwa and Dexie, against PocketBase](D-0007-react-vite-spa-with-dexie-and-pocketbase.md): A static single-page app in React and TypeScript, built with Vite, routed with TanStack Router, made installable and offline with vite-plugin-pwa, storing records and photos in IndexedDB through Dexie; PocketBase is the backend.

### Product

- [D-0003 Photos are added from the gallery, grouped by date taken, kept offline at 2560 px, with originals only on the NAS](D-0003-photos-come-from-the-gallery-with-a-phone-sized-copy-offline.md): Photos taken in the Pixel camera app are added later through a multi-select picker and grouped into entries by EXIF date taken; the phone keeps every photo as a 2560 px WebP/AVIF copy and the untouched original lives only on the NAS.
- [D-0004 v1 is projects with status and tags, dated photo entries, and offline search](D-0004-v1-is-projects-entries-tags-and-search.md): A project has a title, description, status, tags and cover photo and a timeline of entries (date, photos, note); search over titles, notes and tags runs on the device; materials, costs, checklists, sharing and multiple users are out of v1.
- [D-0011 The app's look follows sanderg.nl: Poppins, a pink/orange accent, the system theme, Dutch, built with Tailwind](D-0011-design-system-follows-sanderg-nl.md): A small design system modelled on sanderg.nl (palette, Poppins, accent bars, 25px corners), adapted for an offline phone app: self-hosted font, system light/dark only, four status hues, Dutch interface, Tailwind v4 tokens, and a /design page with screenshot tests.

## Open questions

- [Q-001 How should the guarded-path review be enforced while the repo is private on a free plan?](Q-001-how-to-enforce-review-of-guarded-prs-on-a-private-free-repo.md): GitHub Free offers no branch protection, rulesets or code-owner reviews on private repos, so nothing on GitHub stops anyone with write access from merging a guarded PR; decide whether to accept that until the repo goes public, pay for Pro, or add a local guard.

## Resolved questions

None yet.

## Replaced

None yet.
