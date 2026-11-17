# PocketBase with the schema and hooks baked in (D-0005, docs/deploy/pocketbase-on-the-nas.md).
# PocketBase is pre-1.0: read its changelog before bumping, and treat a bump like a schema change.
FROM ghcr.io/muchobien/pocketbase:0.40.6
COPY pb_migrations /pb_migrations
COPY pb_hooks /pb_hooks
LABEL org.opencontainers.image.source="https://github.com/SanderGeraedts/diy-projects"
