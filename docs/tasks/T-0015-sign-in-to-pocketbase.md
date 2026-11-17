---
id: T-0015
title: "Sign in to PocketBase, as Q-003 decides"
description: "The sign-in screen and token handling in src/auth/, production only, that never blocks offline use."
status: Open
guarded: true
depends_on: [T-0013]
decisions: [D-0002, D-0005, D-0006]
raised_on: 2026-11-17
done_on: ""
result: []
---

# Goal

**Blocked by Q-003.** Don't start until a decision answers it; then add that decision to
`decisions` above and rewrite this goal from it.

Whatever the method, these hold:

- Only a production build with sync enabled (`src/sync/config.ts`) shows sign-in; previews
  and dev never do (D-0006).
- Signing in, or its expiry, never blocks reading or editing local data (D-0002).
- The token is kept the way PocketBase's SDK keeps it, and cleared on sign-out; sign-out
  warns when there are unsynced changes.
- Auth code lives in `src/auth/` (guarded).

# Done when

- `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` pass.
- Tests against a throwaway PocketBase (local or CI, never the NAS, D-0006): sign in, an
  expired token leaves the app usable and asks to sign in again, sign out.
- Sander signs in on the production app on his phone.
- Sander reviews the PR (guarded).

# Notes

- Add the PocketBase JS SDK here if nothing earlier did (D-0007).

# Log
