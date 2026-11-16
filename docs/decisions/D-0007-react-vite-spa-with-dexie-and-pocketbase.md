---
id: D-0007
title: "The stack is a React + Vite SPA with TanStack Router, vite-plugin-pwa and Dexie, against PocketBase"
description: "A static single-page app in React and TypeScript, built with Vite, routed with TanStack Router, made installable and offline with vite-plugin-pwa, storing records and photos in IndexedDB through Dexie; PocketBase is the backend."
status: Accepted
date: 2026-11-16
decided_by: sander
replaces: []
replaced_by: []
resolves: []
tags: [stack]
---

# Context

The app is static: it talks to PocketBase directly (D-0005), so it needs no server rendering
or server functions. Hanna's Reading List uses React and TanStack Start; Sander knows that
ecosystem.

# Decision

- React and TypeScript, built with Vite, as a static single-page app.
- TanStack Router for routing.
- vite-plugin-pwa (Workbox) for the manifest, install and the service worker.
- Dexie over IndexedDB for local records, the outbox and photo blobs.
- PocketBase as the backend, with its JS SDK.

# Rationale

Same ecosystem as Reading List, without TanStack Start's server rendering, which adds
nothing here and makes offline caching harder. A static build is the simplest thing to cache
offline and to host.

# Consequences

- The service worker and the Dexie schema are guarded paths (D-0009).

# Guidance for agents

- Don't add server rendering, server functions or a backend other than PocketBase.
- Change the Dexie schema only through a new Dexie version with an upgrade that keeps
  existing data.
