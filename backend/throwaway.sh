#!/usr/bin/env bash
# A throwaway backend for tests (G-0019, G-0032): builds this folder's image and starts it on
# an empty database, with the NAS's command line (docs/deploy/pocketbase-on-the-nas.md, 1)
# except for the address it listens on. Nothing it holds is kept. Never the NAS.
#
#   bash backend/throwaway.sh         build, start, wait until healthy, make the superuser
#   bash backend/throwaway.sh stop    remove the container
#
# Needs Docker. Without Docker, `pnpm exec harness backend` starts the same throwaway from
# the PocketBase version the Dockerfile pins, with the flags below. Settings, all optional:
#   BACKEND_TEST_PORT                 the local port (8090)
#   APP_ORIGIN                        the one origin CORS answers (https://app.example)
#   BACKEND_TEST_SUPERUSER_EMAIL      the superuser (admin@throwaway.invalid)
#   BACKEND_TEST_SUPERUSER_PASSWORD   its password (throwaway-only-password)
set -euo pipefail
cd "$(dirname "$0")"

PORT=${BACKEND_TEST_PORT:-8090}
APP=${APP_ORIGIN:-https://app.example}
EMAIL=${BACKEND_TEST_SUPERUSER_EMAIL:-admin@throwaway.invalid}
PASS=${BACKEND_TEST_SUPERUSER_PASSWORD:-throwaway-only-password}
IMAGE=backend-throwaway
NAME=backend-throwaway

docker rm -f "$NAME" >/dev/null 2>&1 || true
[ "${1:-}" = stop ] && exit 0

docker build -t "$IMAGE" .
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:8090" "$IMAGE" serve --http=0.0.0.0:8090 \
  --dir=/pb_data --migrationsDir=/pb_migrations --hooksDir=/pb_hooks \
  --automigrate=false --origins="$APP" >/dev/null

# A migration that throws makes PocketBase exit: stop waiting as soon as it has.
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    docker exec "$NAME" pocketbase superuser upsert "$EMAIL" "$PASS" --dir=/pb_data >/dev/null
    echo "The throwaway backend is at http://127.0.0.1:$PORT, for $APP"
    exit 0
  fi
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME")" != true ]; then
    echo "The backend stopped while starting:" >&2
    docker logs "$NAME" >&2 || true
    exit 1
  fi
  sleep 1
done
echo "The backend was not healthy after 30 seconds:" >&2
docker logs "$NAME" >&2 || true
exit 1
