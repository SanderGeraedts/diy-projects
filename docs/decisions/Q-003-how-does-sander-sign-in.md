---
id: Q-003
title: "How does Sander sign in to PocketBase, and what happens when the sign-in expires offline?"
description: "Sync needs a PocketBase sign-in (D-0005: sign-up closed, owner-only records); decide the sign-in method, how long a sign-in lasts, and that an expired sign-in never blocks offline use."
status: Open
raised_on: 2026-11-17
raised_by: claude-code/opus-5.5
blocks: [T-0015]
resolved_by: []
tags: [auth, sync, security]
---

# Question

D-0005 says sign-up is closed and every record is owner-only, so the app needs one user who
signs in before it can sync. Not decided: how he signs in, how long a sign-in lasts, and what
the app does when it expires while the phone has been offline for weeks. The PocketBase
token lives in the browser (D-0005 notes the XSS risk), and offline-first means the app
must keep working without it.

# Options

1. **Email and password, long-lived token, never blocks local use. (Recommended)** One
   user in PocketBase's `users` collection, created by hand in the admin screen. The token
   lasts 90 days and is refreshed on every successful sync. When it has expired, the app
   keeps working locally, shows "Opnieuw inloggen om te synchroniseren", and keeps the
   outbox until he signs in. No email server needed; Android's password manager fills it.
2. **One-time code by email (OTP).** No password to remember, but PocketBase on the NAS
   needs an SMTP account to send mail, and signing in needs a mailbox at hand.
3. **Google sign-in (OAuth2).** One tap on the Pixel, but adds Google as a dependency, and
   the OAuth redirect has to pass the Funnel path allowlist (D-0005).

# Answer

Open.
