---
id: T-0015
title: "Sign in to PocketBase with email and password"
description: "The sign-in screen and token handling in src/auth/, production only: a 90-day token renewed on sync, an expired sign-in that only pauses sync, and a sign-out that syncs, warns, then clears the device."
status: Doing
guarded: true
depends_on: [T-0003, T-0013]
decisions: [D-0002, D-0005, D-0006, D-0013]
raised_on: 2026-11-17
done_on: ""
result: ["https://github.com/SanderGeraedts/diy-projects/pull/27"]
---

# Goal

D-0013's sign-in:

- **Sign in:** email and password against PocketBase's `users` collection, from a production
  build with sync enabled only (`src/sync/config.ts`); previews and dev never show it
  (D-0006). Fields marked up for Android's password manager (`autocomplete="username"` and
  `"current-password"`).
- **Token:** kept the way the PocketBase JS SDK keeps it; refreshed after each successful
  sync. The 90-day lifetime is set on the NAS in T-0013's migrations (this task checks it).
- **Expired or revoked:** the app keeps working; sync pauses and reports
  "Opnieuw inloggen om te synchroniseren" (shown by T-0018); the outbox stays.
- **Sign-out:** try to sync; if anything is still unsynced, warn with the count and ask
  again; then clear the local database (records, photos, outbox) and the token.

# Done when

- `pnpm run typecheck`, `pnpm test`, `pnpm run build` and `pnpm run test:e2e` pass.
- Tests against a throwaway PocketBase (local or CI, never the NAS, D-0006): sign in; a
  wrong password; an expired token leaves local data editable and the outbox intact; sign-out
  with unsynced changes needs a second confirmation and then leaves an empty database.
- Sander signs in on the production app on his phone.
- Sander reviews the PR (guarded).

# Notes

- Auth code lives in `src/auth/` (guarded); clearing the database goes through `src/db/`.
- Add the PocketBase JS SDK here if nothing earlier did (D-0007).
- If T-0013 didn't set the 90-day token lifetime, add it as a migration in `deploy/nas/`.

# Log

- 2026-11-17 claude-code/opus-5.5: Built on #14 (T-0002) and #17 (T-0013). Added the
  PocketBase JS SDK 0.29.0; `src/auth/` (sign-in, `refreshAfterSync` and `markExpired` for
  T-0016, `setSyncNow` hook, sign-out with second confirmation, `useAuthState`, the
  `/account` page registered only when sync is on), `clearLocalData()` in `src/db/write.ts`.
  T-0013 already sets the 90-day lifetime; the CI job `pocketbase-auth` checks it on a token.
  Locally: typecheck, `pnpm test` (120 passed, 5 skipped = the real-PocketBase file), build,
  e2e on private port 4791 (8 passed, 2 screenshot tests skipped on Windows).
  Open for Sander: the form's inputs and buttons are a new component style (D-0020 asks for a
  decision); they use tokens only, with `rounded-card` corners.
- 2026-11-17 claude-code/opus-5.5: The first CI run showed the SDK clears its auth store on
  any 401, which turned a revoked sign-in into "signed out"; auth now remembers the account
  so it reads as `expired`. CI run 44095495434 green: `checks` (Linux screenshots 10/10)
  and `pocketbase-auth` 5/5. Draft PR #27.
