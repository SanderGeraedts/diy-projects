---
id: D-0013
title: "Sander signs in with email and password; a sign-in lasts 90 days and never blocks offline use; signing out clears the device"
description: "One PocketBase user with email and password, a 90-day token renewed on every sync, an expired sign-in only pauses sync, and sign-out syncs, warns about anything unsynced, then clears the device's local copy."
status: Accepted
date: 2026-11-17
decided_by: sander
replaces: []
replaced_by: []
resolves: [Q-003]
tags: [auth, sync, security]
---

# Context

Sync needs a PocketBase sign-in: sign-up is closed and every record is owner-only (D-0005).
The app is offline-first (D-0002), so a device may go weeks without reaching the NAS, and
the token lives in the browser (D-0005). Q-003 asked how to sign in, how long a sign-in
lasts, and what happens when it runs out. Answered in a design interview on 2026-11-17.

# Decision

- **Method:** email and password. One user in PocketBase's `users` collection, created by
  hand in the admin screen; no sign-up, no email server, no outside provider.
- **Lifetime:** the auth token lasts 90 days and is renewed on every successful sync.
- **Expired or revoked sign-in:** the app keeps working locally. Sync pauses, the sync
  status says "Opnieuw inloggen om te synchroniseren", and the outbox waits until Sander
  signs in again. Nothing local is deleted.
- **Sign-out:** first tries to sync. If anything is still unsynced, it warns and needs a
  second confirmation. Then it clears the device's local copy (records, photos, outbox)
  and the token.
- Changing the password in PocketBase is how a lost device is cut off.

# Rationale

Email and password needs nothing beyond PocketBase, and Android's password manager fills it
in. Ninety days keeps a laptop that's rarely used from nagging, while a password change still
revokes a lost device. Never blocking local use keeps D-0002's promise; clearing on sign-out
means a lent or sold device keeps nothing.

# Consequences

- A stolen, unlocked device can read the local copy until it's signed out or wiped; the
  password change only stops it syncing.
- Sign-out is destructive, so it must sync first and warn clearly.

# Guidance for agents

- Never block reading or editing local data on the sign-in state.
- Never drop outbox items because a sign-in expired.
- Sign-out clears local data only after a sync attempt and an explicit second confirmation
  when anything is unsynced.
- Don't add sign-up, other sign-in methods or a second user without a decision.
