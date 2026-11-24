#!/usr/bin/env bash
# T-0013: smoke test for the PocketBase image, on an empty database. Needs curl and jq.
# Run by .github/workflows/backend.yml against a container named `pb`, and on a machine
# without Docker by `pnpm exec harness backend smoke` (G-0032, T-0035), which sets
# BACKEND_TEST_URL. Never point this at the real NAS (D-0006, G-0019): it refuses any
# address that isn't this machine.
set -euo pipefail

B=${BACKEND_TEST_URL:-http://127.0.0.1:8090}
# The app's origin PocketBase was started with (--origins); backend.yml sets a test one.
APP=${APP_ORIGIN:-https://app.example}
PASS='ci-only-password-123456'
# The superuser: made below in the `pb` container, or already made by harness backend or
# backend/throwaway.sh with these settings and defaults.
SU_EMAIL=${BACKEND_TEST_SUPERUSER_EMAIL:-admin@throwaway.invalid}
SU_PASS=${BACKEND_TEST_SUPERUSER_PASSWORD:-throwaway-only-password}

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

case "$B" in
  http://127.0.0.1:* | http://localhost:*) ;;
  *) fail "$B is not on this machine; the smoke test runs against a throwaway backend only" ;;
esac

# Scratch files. On Windows a path both Git's bash and curl.exe read (C:/...).
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
if command -v cygpath >/dev/null 2>&1; then TMP=$(cygpath -m "$TMP"); fi

# req METHOD PATH [TOKEN] [JSON]: prints "<status>\n<body>"; retries on 429 (rate limits are on).
req() {
  local method=$1 path=$2 token=${3:-} body=${4:-} out code
  local args=(-sS -o "$TMP/body" -w '%{http_code}' -X "$method" "$B$path")
  [ -n "$token" ] && args+=(-H "Authorization: $token")
  # The JSON goes through a file: curl.exe on Windows doesn't get UTF-8 command-line arguments.
  [ -n "$body" ] && printf '%s' "$body" >"$TMP/request" && args+=(-H 'Content-Type: application/json' --data-binary "@$TMP/request")
  for _ in 1 2 3 4 5; do
    code=$(curl "${args[@]}")
    [ "$code" != 429 ] && break
    sleep 3
  done
  echo "$code"
  cat "$TMP/body"
}
status() { head -n1 <<<"$1"; }
body() { tail -n +2 <<<"$1"; }
expect() { # expect RESPONSE CODE WHAT
  [ "$(status "$1")" = "$2" ] || fail "$3: expected $2, got $(status "$1"): $(body "$1")"
}
token() { # token COLLECTION EMAIL [PASSWORD]
  local r
  r=$(req POST "/api/collections/$1/auth-with-password" "" "{\"identity\":\"$2\",\"password\":\"${3:-$PASS}\"}")
  expect "$r" 200 "sign in to $1 as $2"
  body "$r" | jq -r .token
}

# The `pb` container of backend.yml, when that is what runs.
in_container() { command -v docker >/dev/null 2>&1 && [ "$(docker inspect -f '{{.State.Running}}' pb 2>/dev/null)" = true ]; }

# Superuser, made the way it's done on the NAS (docs/deploy/pocketbase-on-the-nas.md, 6).
if in_container; then
  docker exec pb pocketbase superuser upsert "$SU_EMAIL" "$SU_PASS" --dir=/pb_data >/dev/null
fi
SU=$(token _superusers "$SU_EMAIL" "$SU_PASS")

# Every collection exists, with the settings the decisions ask for.
for c in users projects entries photos history; do
  expect "$(req GET "/api/collections/$c" "$SU")" 200 "collection $c"
done
ok "collections users, projects, entries, photos, history exist"

users=$(body "$(req GET /api/collections/users "$SU")")
[ "$(jq -r .createRule <<<"$users")" = null ] || fail "users.createRule is not null"
[ "$(jq -r .authToken.duration <<<"$users")" = 7776000 ] || fail "users token is not 90 days"
ok "users: sign-up rule null, token 90 days (D-0013)"

projects=$(body "$(req GET /api/collections/projects "$SU")")
[ "$(jq -c '.fields[] | select(.name=="status") | .values' <<<"$projects")" = '["idea","in progress","paused","done"]' ] ||
  fail "projects.status values"
photos=$(body "$(req GET /api/collections/photos "$SU")")
[ "$(jq -r '.fields[] | select(.name=="original") | .maxSize' <<<"$photos")" = 41943040 ] || fail "photos.original maxSize is not 40 MB"
for f in copy thumbnail; do
  [ "$(jq -r ".fields[] | select(.name==\"$f\") | .type" <<<"$photos")" = file ] || fail "photos.$f is not a file field"
done
# T-0017: the original needs a file token. T-0026: the copy and thumbnail don't, so visitors
# can load them; pb_hooks/photo_files.pb.js decides who gets them (tested below).
[ "$(jq -r '.fields[] | select(.name=="original") | .protected' <<<"$photos")" = true ] || fail "photos.original is not protected"
for f in copy thumbnail; do
  [ "$(jq -r ".fields[] | select(.name==\"$f\") | .protected" <<<"$photos")" = false ] || fail "photos.$f is still protected"
done
# T-0026 (D-0025): the public switch.
[ "$(jq -r '.fields[] | select(.name=="public") | .type' <<<"$projects")" = bool ] || fail "projects.public is not a bool"
history=$(body "$(req GET /api/collections/history "$SU")")
[ "$(jq -c '[.listRule,.viewRule,.createRule,.updateRule,.deleteRule]' <<<"$history")" = '[null,null,null,null,null]' ] ||
  fail "history is not admin-only"
[ "$(body "$(req GET /api/settings "$SU")" | jq -r .rateLimits.enabled)" = true ] || fail "rate limits are off"
ok "status select, 40 MB originals, admin-only history, rate limits on"

# Sign-up is closed: a signed-out create on users is refused.
r=$(req POST /api/collections/users/records "" "{\"email\":\"walk-in@ci.invalid\",\"password\":\"$PASS\",\"passwordConfirm\":\"$PASS\"}")
[ "$(status "$r")" != 200 ] || fail "sign-up is open"
ok "sign-up closed ($(status "$r"))"

# Two users, made by the superuser as in the admin screen (D-0013).
mkuser() {
  local r
  r=$(req POST /api/collections/users/records "$SU" "{\"email\":\"$1\",\"password\":\"$PASS\",\"passwordConfirm\":\"$PASS\",\"verified\":true}")
  expect "$r" 200 "create user $1"
  body "$r" | jq -r .id
}
A_ID=$(mkuser owner@ci.invalid)
S_ID=$(mkuser stranger@ci.invalid)
A=$(token users owner@ci.invalid)
sleep 3 # the default *:auth rate limit allows 2 sign-ins per 3 s
S=$(token users stranger@ci.invalid)
ok "two users signed in"

NOW=2026-11-17T10:00:00.000Z
project() { # project OWNER_ID TITLE
  echo "{\"owner\":\"$1\",\"title\":\"$2\",\"description\":\"\",\"status\":\"idea\",\"tags\":[\"ci\"],\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\"}"
}

# The owner creates a project; nobody can create one for someone else.
r=$(req POST /api/collections/projects/records "$A" "$(project "$A_ID" "Shed door")")
expect "$r" 200 "owner creates a project"
P=$(body "$r" | jq -r .id)
r=$(req POST /api/collections/projects/records "$A" "$(project "$S_ID" "Planted")")
[ "$(status "$r")" != 200 ] || fail "a user created a project owned by someone else"
r=$(req POST /api/collections/projects/records "$A" "$(project "$A_ID" "Bad status" | sed 's/"idea"/"someday"/')")
[ "$(status "$r")" != 200 ] || fail "a status outside D-0004 was accepted"
ok "owner creates a project; not for someone else; status limited to D-0004"

# Signed out and the stranger see nothing: 200 with an empty list, 404 on the record.
r=$(req GET /api/collections/projects/records)
expect "$r" 200 "signed-out list"
[ "$(body "$r" | jq '.items | length')" = 0 ] || fail "signed-out list is not empty"
r=$(req GET /api/collections/projects/records "$S")
expect "$r" 200 "stranger list"
[ "$(body "$r" | jq '.items | length')" = 0 ] || fail "the stranger sees the owner's project"
expect "$(req GET "/api/collections/projects/records/$P" "$S")" 404 "stranger views the project"
r=$(req PATCH "/api/collections/projects/records/$P" "$S" '{"title":"Hijacked"}')
[ "$(status "$r")" != 200 ] || fail "the stranger updated the owner's project"
r=$(req GET /api/collections/projects/records "$A")
[ "$(body "$r" | jq '.items | length')" = 1 ] || fail "the owner doesn't see their project"
ok "signed out and stranger see nothing; owner sees their project"

# An update keeps the previous version in history (D-0002), and can't change hands.
r=$(req PATCH "/api/collections/projects/records/$P" "$A" "{\"owner\":\"$S_ID\"}")
[ "$(status "$r")" != 200 ] || fail "the owner gave the project away"
r=$(req PATCH "/api/collections/projects/records/$P" "$A" '{"title":"Shed door, painted","updatedAt":"2026-11-17T11:00:00.000Z"}')
expect "$r" 200 "owner updates the project"
r=$(req GET "/api/collections/history/records?filter=(recordId='$P')" "$SU")
expect "$r" 200 "superuser lists history"
[ "$(body "$r" | jq -r '[.items[] | select(.data.title=="Shed door")] | length')" -ge 1 ] ||
  fail "no history row with the previous title: $(body "$r")"
[ "$(body "$r" | jq -r '.items[0].sourceCollection')" = projects ] || fail "history row has the wrong collection"
ok "update wrote a history row with the previous version"

# The same for entries.
r=$(req POST /api/collections/entries/records "$A" "{\"owner\":\"$A_ID\",\"projectId\":\"$P\",\"date\":\"2026-11-17\",\"note\":\"Sanded\",\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\"}")
expect "$r" 200 "owner creates an entry"
E=$(body "$r" | jq -r .id)
expect "$(req PATCH "/api/collections/entries/records/$E" "$A" '{"note":"Sanded and primed"}')" 200 "owner updates the entry"
r=$(req GET "/api/collections/history/records?filter=(recordId='$E')" "$SU")
[ "$(body "$r" | jq -r '.items[0].data.note')" = Sanded ] || fail "no history row for the entry: $(body "$r")"
ok "entry update wrote a history row"

# history is unreadable by a user, even the owner of the record.
r=$(req GET /api/collections/history/records "$A")
if [ "$(status "$r")" = 200 ]; then
  [ "$(body "$r" | jq '.items | length')" = 0 ] || fail "a user can read history"
fi
r=$(req POST /api/collections/history/records "$A" "{\"sourceCollection\":\"projects\",\"recordId\":\"$P\"}")
[ "$(status "$r")" != 200 ] || fail "a user can write history"
ok "history unreadable and unwritable by a user"

# --- T-0026 (D-0023, D-0025): what a guest (not signed in) may read, and nothing else. ---

# file RECORD_ID FILENAME [TOKEN]: downloads a photo file; prints "<status>\n<body>".
file() {
  local url="$B/api/files/photos/$1/$2" code
  [ -n "${3:-}" ] && url="$url?token=$3"
  for _ in 1 2 3 4 5; do
    code=$(curl -sS -o "$TMP/file" -w '%{http_code}' "$url")
    [ "$code" != 429 ] && break
    sleep 3
  done
  echo "$code"
  cat "$TMP/file"
}
refused() { # refused RESPONSE WHAT: anything but a 2xx
  case "$(status "$1")" in 2*) fail "$2: got $(status "$1"): $(body "$1")" ;; esac
}
mk() { # mk COLLECTION JSON: created by the owner; prints the id
  local r
  r=$(req POST "/api/collections/$1/records" "$A" "$2")
  expect "$r" 200 "owner creates in $1"
  body "$r" | jq -r .id
}
pproject() { # pproject TITLE PUBLIC [DELETED_AT]
  echo "{\"owner\":\"$A_ID\",\"title\":\"$1\",\"description\":\"\",\"status\":\"idea\",\"tags\":[],\"public\":$2,\"deletedAt\":\"${3:-}\",\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\"}"
}
pentry() { # pentry PROJECT [DELETED_AT]
  echo "{\"owner\":\"$A_ID\",\"projectId\":\"$1\",\"date\":\"2026-11-18\",\"note\":\"Note\",\"deletedAt\":\"${2:-}\",\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\"}"
}
pphoto() { # pphoto PROJECT ENTRY [DELETED_AT]
  echo "{\"owner\":\"$A_ID\",\"projectId\":\"$1\",\"entryId\":\"$2\",\"takenAt\":\"$NOW\",\"width\":4,\"height\":3,\"deletedAt\":\"${3:-}\",\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\"}"
}
printf 'original bytes' >"$TMP/original.jpg"
printf 'copy bytes' >"$TMP/copy.webp"
printf 'thumbnail bytes' >"$TMP/thumbnail.webp"
upload() { # upload PHOTO_ID: the owner uploads all three files; prints the record
  local code
  for _ in 1 2 3 4 5; do
    code=$(curl -sS -o "$TMP/body" -w '%{http_code}' -X PATCH -H "Authorization: $A" \
      -F "original=@$TMP/original.jpg;type=image/jpeg" -F "copy=@$TMP/copy.webp;type=image/webp" \
      -F "thumbnail=@$TMP/thumbnail.webp;type=image/webp" "$B/api/collections/photos/records/$1")
    [ "$code" != 429 ] && break
    sleep 3
  done
  [ "$code" = 200 ] || fail "upload the files of $1: $code $(cat "$TMP/body")"
  cat "$TMP/body"
}

# A public project, a private one and a tombstoned public one; live and tombstoned entries
# and photos. The project made above without `public` is private (a bool's zero value).
PUB=$(mk projects "$(pproject Public true)")
PRIV=$(mk projects "$(pproject Private false)")
GONE=$(mk projects "$(pproject Deleted true "$NOW")")
PUB_E=$(mk entries "$(pentry "$PUB")")
PUB_E_GONE=$(mk entries "$(pentry "$PUB" "$NOW")")
PRIV_E=$(mk entries "$(pentry "$PRIV")")
GONE_E=$(mk entries "$(pentry "$GONE")")
PUB_F=$(mk photos "$(pphoto "$PUB" "$PUB_E")")
PUB_F_GONE=$(mk photos "$(pphoto "$PUB" "$PUB_E" "$NOW")")
PRIV_F=$(mk photos "$(pphoto "$PRIV" "$PRIV_E")")
GONE_F=$(mk photos "$(pphoto "$GONE" "$GONE_E")")
pub_f=$(upload "$PUB_F")
pub_f_gone=$(upload "$PUB_F_GONE")
priv_f=$(upload "$PRIV_F")
gone_f=$(upload "$GONE_F")
ok "public, private and tombstoned projects, entries and photos with files"

# A guest lists exactly the public, live records; a filter can't widen that.
ids() { body "$1" | jq -c '[.items[].id] | sort'; }
r=$(req GET /api/collections/projects/records)
expect "$r" 200 "guest lists projects"
[ "$(ids "$r")" = "[\"$PUB\"]" ] || fail "guest's projects: $(ids "$r"), expected only $PUB"
r=$(req GET "/api/collections/projects/records?filter=(public=false||deletedAt!='')")
[ "$(ids "$r")" = "[]" ] || fail "a guest's filter widened the list: $(ids "$r")"
r=$(req GET /api/collections/entries/records)
expect "$r" 200 "guest lists entries"
[ "$(ids "$r")" = "[\"$PUB_E\"]" ] || fail "guest's entries: $(ids "$r"), expected only $PUB_E"
r=$(req GET /api/collections/photos/records)
expect "$r" 200 "guest lists photos"
[ "$(ids "$r")" = "[\"$PUB_F\"]" ] || fail "guest's photos: $(ids "$r"), expected only $PUB_F"
expect "$(req GET "/api/collections/projects/records/$PUB")" 200 "guest views the public project"
expect "$(req GET "/api/collections/entries/records/$PUB_E")" 200 "guest views the public entry"
expect "$(req GET "/api/collections/photos/records/$PUB_F")" 200 "guest views the public photo"
ok "guest sees the public project, its entry and its photo record"

for c_id in "projects $P" "projects $PRIV" "projects $GONE" "entries $E" "entries $PRIV_E" "entries $GONE_E" \
  "entries $PUB_E_GONE" "photos $PRIV_F" "photos $GONE_F" "photos $PUB_F_GONE"; do
  set -- $c_id
  expect "$(req GET "/api/collections/$1/records/$2")" 404 "guest views $1 $2"
done
ok "guest gets nothing of a private project, a tombstoned project or tombstoned entries and photos"

# history: admin only, also for a guest.
HID=$(body "$(req GET "/api/collections/history/records?perPage=1" "$SU")" | jq -r '.items[0].id')
[ -n "$HID" ] && [ "$HID" != null ] || fail "no history row to test with"
r=$(req GET /api/collections/history/records)
if [ "$(status "$r")" = 200 ]; then
  [ "$(body "$r" | jq '.items | length')" = 0 ] || fail "a guest can list history"
fi
refused "$(req GET "/api/collections/history/records/$HID")" "guest views a history row"
ok "guest can't read history"

# Files: a guest loads the public photo's copy and thumbnail, byte for byte.
r=$(file "$PUB_F" "$(jq -r .copy <<<"$pub_f")")
expect "$r" 200 "guest loads the public copy"
[ "$(body "$r")" = 'copy bytes' ] || fail "the public copy's bytes differ"
r=$(file "$PUB_F" "$(jq -r .thumbnail <<<"$pub_f")")
expect "$r" 200 "guest loads the public thumbnail"
[ "$(body "$r")" = 'thumbnail bytes' ] || fail "the public thumbnail's bytes differ"
ok "guest loads the public photo's copy and thumbnail"

# No original for anyone but the owner: not a guest, not another account with a file token.
ftoken() { # ftoken AUTH_TOKEN
  local r
  r=$(req POST /api/files/token "$1")
  expect "$r" 200 "file token"
  body "$r" | jq -r .token
}
A_FT=$(ftoken "$A")
S_FT=$(ftoken "$S")
for rec in "$PUB_F $pub_f" "$PRIV_F $priv_f" "$GONE_F $gone_f" "$PUB_F_GONE $pub_f_gone"; do
  id=${rec%% *}
  json=${rec#* }
  name=$(jq -r .original <<<"$json")
  refused "$(file "$id" "$name")" "guest loads the original of $id"
  refused "$(file "$id" "$name" "$S_FT")" "another account loads the original of $id"
done
r=$(file "$PUB_F" "$(jq -r .original <<<"$pub_f")" "$A_FT")
expect "$r" 200 "owner loads the public photo's original"
[ "$(body "$r")" = 'original bytes' ] || fail "the original's bytes differ"
ok "no original for a guest or another account, also not of a public photo; the owner gets it"

# Copies and thumbnails of private or tombstoned photos: not even with the address.
for rec in "$PRIV_F $priv_f" "$GONE_F $gone_f" "$PUB_F_GONE $pub_f_gone"; do
  id=${rec%% *}
  json=${rec#* }
  for f in copy thumbnail; do
    refused "$(file "$id" "$(jq -r ".$f" <<<"$json")")" "guest loads the $f of $id"
  done
done
expect "$(file "$PRIV_F" "$(jq -r .copy <<<"$priv_f")" "$A_FT")" 200 "owner loads a private copy"
ok "guest can't load a private or tombstoned photo's copy or thumbnail; the owner can"

# A guest can't create or change anything, and neither can another account.
LATER=2026-11-18T12:00:00.000Z
refused "$(req POST /api/collections/projects/records "" "$(pproject Walk-in true)")" "guest creates a project"
refused "$(req POST /api/collections/entries/records "" "$(pentry "$PUB")")" "guest creates an entry"
refused "$(req POST /api/collections/photos/records "" "$(pphoto "$PUB" "$PUB_E")")" "guest creates a photo"
for who in "" "$S"; do
  refused "$(req PATCH "/api/collections/projects/records/$PUB" "$who" "{\"title\":\"Hijacked\",\"updatedAt\":\"$LATER\"}")" "update the public project"
  refused "$(req PATCH "/api/collections/entries/records/$PUB_E" "$who" "{\"note\":\"Hijacked\",\"updatedAt\":\"$LATER\"}")" "update the public entry"
  refused "$(req PATCH "/api/collections/photos/records/$PUB_F" "$who" "{\"deletedAt\":\"$LATER\",\"updatedAt\":\"$LATER\"}")" "update the public photo"
  refused "$(req DELETE "/api/collections/projects/records/$PUB" "$who")" "delete the public project"
  refused "$(req DELETE "/api/collections/entries/records/$PUB_E" "$who")" "delete the public entry"
  refused "$(req DELETE "/api/collections/photos/records/$PUB_F" "$who")" "delete the public photo"
done
code=$(curl -sS -o "$TMP/body" -w '%{http_code}' -X PATCH -F "copy=@$TMP/original.jpg;type=image/jpeg" \
  "$B/api/collections/photos/records/$PUB_F")
case "$code" in 2*) fail "guest replaced the public photo's copy" ;; esac
r=$(req GET "/api/collections/projects/records/$PUB" "$A")
[ "$(body "$r" | jq -r .title)" = Public ] || fail "the public project changed: $(body "$r")"
[ "$(body "$(req GET "/api/collections/photos/records/$PUB_F" "$A")" | jq -r .deletedAt)" = "" ] || fail "the public photo was tombstoned"
[ "$(body "$(file "$PUB_F" "$(jq -r .copy <<<"$pub_f")")")" = 'copy bytes' ] || fail "the public copy changed"
ok "guest and another account can't create, update or delete"

# Switching a project off hides it, its entries and its photos' files from guests at once.
expect "$(req PATCH "/api/collections/projects/records/$PUB" "$A" "{\"public\":false,\"updatedAt\":\"$LATER\"}")" 200 "owner switches the project off"
[ "$(ids "$(req GET /api/collections/projects/records)")" = "[]" ] || fail "a switched-off project still lists"
[ "$(ids "$(req GET /api/collections/entries/records)")" = "[]" ] || fail "a switched-off project's entries still list"
[ "$(ids "$(req GET /api/collections/photos/records)")" = "[]" ] || fail "a switched-off project's photos still list"
refused "$(file "$PUB_F" "$(jq -r .copy <<<"$pub_f")")" "guest loads a switched-off project's copy"
ok "switching a project off hides it from guests, files included"

# --- T-0022 (D-0014): the bin. Restore is a plain update (deletedAt back to ""), covered by
# src/sync/sync.pocketbase.test.ts; the permanent delete runs here, in pb_hooks/bin.pb.js. ---

PHOTOS_ID=$(jq -r .id <<<"$photos")
# The backend's data folder, when it isn't the `pb` container: BACKEND_TEST_DATA_DIR, or the
# one harness backend started this address with (its state, in the cache that holds the jq it
# put on the PATH).
DATA=${BACKEND_TEST_DATA_DIR:-}
if ! in_container && [ -z "$DATA" ]; then
  JQ_PATH=$(command -v jq)
  case "$JQ_PATH" in
    */tools/*)
      for state in "${JQ_PATH%/tools/*}"/backends/*/state.json; do
        [ -f "$state" ] || continue
        DATA=$(jq -r --arg u "$B" 'select(.url == $u) | .dataDir' "$state")
        [ -n "$DATA" ] && break
      done
      ;;
  esac
  [ -n "$DATA" ] || fail "can't find the backend's data folder to check its files on disk; set BACKEND_TEST_DATA_DIR"
  DATA=${DATA//\\//}
fi
on_disk() { # on_disk PHOTO_ID: the photo's files in the NAS's storage folder (without the .attrs sidecars)
  if in_container; then
    docker exec pb sh -c "ls /pb_data/storage/$PHOTOS_ID/$1 2>/dev/null || true"
  else
    ls "$DATA/storage/$PHOTOS_ID/$1" 2>/dev/null || true
  fi | grep -v -e '^thumbs_' -e '\.attrs$' || true
}
tomb() { # tomb COLLECTION ID: the owner tombstones a record, as the app's delete does
  expect "$(req PATCH "/api/collections/$1/records/$2" "$A" "{\"deletedAt\":\"$LATER\",\"updatedAt\":\"$LATER\"}")" 200 "tombstone $1 $2"
}
BIN=$(mk projects "$(pproject Binned true)")
BIN_E=$(mk entries "$(pentry "$BIN")")
BIN_F=$(mk photos "$(pphoto "$BIN" "$BIN_E")")
bin_f=$(upload "$BIN_F")
KEEP=$(mk projects "$(pproject Kept true)")
KEEP_E=$(mk entries "$(pentry "$KEEP")")
KEEP_F=$(mk photos "$(pphoto "$KEEP" "$KEEP_E")")
keep_f=$(upload "$KEEP_F")
# Edits, so the project and the entry have history rows.
expect "$(req PATCH "/api/collections/projects/records/$BIN" "$A" "{\"title\":\"Binned, renamed\",\"updatedAt\":\"$LATER\"}")" 200 "rename the project"
expect "$(req PATCH "/api/collections/entries/records/$BIN_E" "$A" "{\"note\":\"Secret note\",\"updatedAt\":\"$LATER\"}")" 200 "edit the entry"
[ "$(on_disk "$BIN_F" | wc -l)" = 3 ] || fail "the photo's three files aren't on disk: $(on_disk "$BIN_F")"
ok "a project with an entry, a photo with three files on disk, and history rows"

# Only what is in the bin can be deleted for good.
expect "$(req DELETE "/api/collections/projects/records/$BIN" "$A")" 400 "delete a live project for good"
[ "$(body "$(req GET "/api/collections/projects/records/$BIN" "$A")" | jq -r .purgedAt)" = "" ] || fail "a live project was purged"
ok "a live project can't be deleted for good (400)"

tomb photos "$BIN_F"
tomb entries "$BIN_E"
tomb projects "$BIN"

# A guest or another account can't see the bin or reach the permanent delete.
for f in 'deletedAt!=""' 'purgedAt!=""'; do
  r=$(req GET "/api/collections/projects/records?filter=($f)")
  [ "$(ids "$r")" = "[]" ] || fail "a guest lists the bin ($f): $(ids "$r")"
  r=$(req GET "/api/collections/projects/records?filter=($f)" "$S")
  [ "$(ids "$r")" = "[]" ] || fail "another account lists the bin ($f): $(ids "$r")"
done
for who in "" "$S"; do
  refused "$(req DELETE "/api/collections/projects/records/$BIN" "$who")" "delete the binned project for good, not as the owner"
  refused "$(req DELETE "/api/collections/entries/records/$BIN_E" "$who")" "delete the binned entry for good, not as the owner"
  refused "$(req DELETE "/api/collections/photos/records/$BIN_F" "$who")" "delete the binned photo for good, not as the owner"
done
[ "$(on_disk "$BIN_F" | wc -l)" = 3 ] || fail "a refused delete removed files"
[ "$(body "$(req GET "/api/collections/projects/records/$BIN" "$A")" | jq -r .purgedAt)" = "" ] || fail "a refused delete purged the project"
ok "a guest and another account can't list the bin or delete from it"

# The owner deletes the project for good: everything in it goes, a marker stays.
expect "$(req DELETE "/api/collections/projects/records/$BIN" "$A")" 204 "the owner deletes the binned project for good"
[ -z "$(on_disk "$BIN_F")" ] || fail "the purged photo's files are still on disk: $(on_disk "$BIN_F")"
for f in original copy thumbnail; do
  refused "$(file "$BIN_F" "$(jq -r ".$f" <<<"$bin_f")" "$A_FT")" "the owner loads the purged $f"
done
for c_id in "projects $BIN" "entries $BIN_E" "photos $BIN_F"; do
  set -- $c_id
  m=$(body "$(req GET "/api/collections/$1/records/$2" "$A")")
  [ -n "$(jq -r .purgedAt <<<"$m")" ] || fail "no marker for $1 $2: $m"
  [ "$(jq -r .deletedAt <<<"$m")" != "" ] || fail "the marker for $1 $2 isn't tombstoned"
done
m=$(body "$(req GET "/api/collections/projects/records/$BIN" "$A")")
[ "$(jq -c '[.title,.description,.tags,.public]' <<<"$m")" = '["","",[],false]' ] || fail "the project marker keeps content: $m"
[ "$(body "$(req GET "/api/collections/entries/records/$BIN_E" "$A")" | jq -r .note)" = "" ] || fail "the entry marker keeps its note"
m=$(body "$(req GET "/api/collections/photos/records/$BIN_F" "$A")")
[ "$(jq -c '[.original,.copy,.thumbnail]' <<<"$m")" = '["","",""]' ] || fail "the photo marker keeps files: $m"
for id in "$BIN" "$BIN_E" "$BIN_F"; do
  r=$(req GET "/api/collections/history/records?filter=(recordId='$id')" "$SU")
  [ "$(body "$r" | jq '.items | length')" = 0 ] || fail "history of $id is still there: $(body "$r")"
done
[ "$(on_disk "$KEEP_F" | wc -l)" = 3 ] || fail "another project's photo lost files"
expect "$(file "$KEEP_F" "$(jq -r .copy <<<"$keep_f")" "$A_FT")" 200 "another project's copy still loads"
ok "deleted for good: files gone from disk, history gone, a marker per record; the rest untouched"

# A marker refuses a late upload, a late edit and a re-create from another device: 410.
code=$(curl -sS -o "$TMP/body" -w '%{http_code}' -X PATCH -H "Authorization: $A" \
  -F "original=@$TMP/original.jpg;type=image/jpeg" -F "copy=@$TMP/copy.webp;type=image/webp" \
  -F "thumbnail=@$TMP/thumbnail.webp;type=image/webp" "$B/api/collections/photos/records/$BIN_F")
[ "$code" = 410 ] || fail "a late upload of a purged photo: expected 410, got $code $(cat "$TMP/body")"
[ -z "$(on_disk "$BIN_F")" ] || fail "a late upload put files back on disk"
[ "$(body "$(req GET "/api/collections/photos/records/$BIN_F" "$A")" | jq -r .copy)" = "" ] || fail "a late upload set a file"
expect "$(req PATCH "/api/collections/projects/records/$BIN" "$A" '{"title":"Back","deletedAt":"","updatedAt":"2027-01-01T00:00:00.000Z"}')" 410 "a late edit of a purged project"
expect "$(req PATCH "/api/collections/entries/records/$BIN_E" "$A" '{"note":"Back","updatedAt":"2027-01-01T00:00:00.000Z"}')" 410 "a late edit of a purged entry"
expect "$(req POST /api/collections/photos/records "$A" "$(pphoto "$BIN" "$BIN_E" | jq -c --arg id "$BIN_F" '. + {id: $id}')")" 410 "re-create the purged photo"
expect "$(req POST /api/collections/photos/records "$A" "$(pphoto "$BIN" "$BIN_E")")" 410 "a new photo in the purged entry"
expect "$(req POST /api/collections/entries/records "$A" "$(pentry "$BIN")")" 410 "a new entry in the purged project"
[ "$(ids "$(req GET "/api/collections/photos/records?filter=(entryId='$BIN_E')" "$A")")" = "[\"$BIN_F\"]" ] || fail "a purged entry got a new photo"
[ "$(body "$(req GET "/api/collections/projects/records/$BIN" "$A")" | jq -r .title)" = "" ] || fail "a late edit came through"
expect "$(req DELETE "/api/collections/projects/records/$BIN" "$A")" 204 "deleting a purged project again"
refused "$(req PATCH "/api/collections/projects/records/$KEEP" "$A" "{\"purgedAt\":\"$LATER\"}")" "the owner sets purgedAt"
ok "a purged record refuses a late upload, edit or re-create (410)"

# An entry on its own: it and its photos go, its project stays.
ALONE=$(mk entries "$(pentry "$KEEP")")
ALONE_F=$(mk photos "$(pphoto "$KEEP" "$ALONE")")
upload "$ALONE_F" >/dev/null
tomb photos "$ALONE_F"
tomb entries "$ALONE"
expect "$(req DELETE "/api/collections/entries/records/$ALONE" "$A")" 204 "the owner deletes a binned entry for good"
[ -z "$(on_disk "$ALONE_F")" ] || fail "the purged entry's photo files are still on disk"
[ -n "$(body "$(req GET "/api/collections/photos/records/$ALONE_F" "$A")" | jq -r .purgedAt)" ] || fail "no marker for the entry's photo"
m=$(body "$(req GET "/api/collections/projects/records/$KEEP" "$A")")
[ "$(jq -r '.purgedAt + "|" + .deletedAt + "|" + .title' <<<"$m")" = "||Kept" ] || fail "the entry's project changed: $m"
[ "$(on_disk "$KEEP_F" | wc -l)" = 3 ] || fail "the project's other photo lost files"
ok "an entry deleted for good takes its photos, not its project"

# --- T-0027 (D-0029): project slugs. A device picks one offline from the title; the NAS makes
# it unique per owner in pb_hooks/slugs.pb.js (earlier slugs and tombstoned projects count,
# purge markers don't) and keeps a rename's old slug in oldSlugs. ---

projects=$(body "$(req GET /api/collections/projects "$SU")")
[ "$(jq -r '.fields[] | select(.name=="slug") | .type' <<<"$projects")" = text ] || fail "projects.slug is not a text field"
[ "$(jq -r '.fields[] | select(.name=="oldSlugs") | .type' <<<"$projects")" = json ] || fail "projects.oldSlugs is not a json field"
jq -r '.indexes[]' <<<"$projects" | grep -q 'UNIQUE INDEX `idx_projects_owner_slug` ON `projects` (`owner`, `slug`)' ||
  fail "no unique index on (owner, slug): $(jq -c .indexes <<<"$projects")"
ok "projects have slug and oldSlugs, unique per owner"

sproject() { # sproject OWNER_ID TITLE [SLUG] [DELETED_AT]: a project as the app sends it (no slug: an app from before T-0027)
  local slug=""
  [ -n "${3:-}" ] && slug=",\"slug\":\"$3\",\"oldSlugs\":[]"
  echo "{\"owner\":\"$1\",\"title\":\"$2\",\"description\":\"\",\"status\":\"idea\",\"tags\":[],\"public\":true,\"deletedAt\":\"${4:-}\",\"createdAt\":\"$NOW\",\"updatedAt\":\"$NOW\"$slug}"
}
slug_of() { # slug_of ID: "slug oldSlugs" as the owner reads them
  body "$(req GET "/api/collections/projects/records/$1" "$A")" | jq -r '.slug + " " + (.oldSlugs | tojson)'
}
K1=$(mk projects "$(sproject "$A_ID" "Kast für Sanne" kast-fur-sanne)")
K2=$(mk projects "$(sproject "$A_ID" "Kast für Sanne" kast-fur-sanne)")
K3=$(mk projects "$(sproject "$A_ID" "Kast für Sanne" kast-fur-sanne-2)")
OLD=$(mk projects "$(sproject "$A_ID" "Zolder trap")")
[ "$(slug_of "$K1")" = 'kast-fur-sanne []' ] || fail "the first Kast für Sanne: $(slug_of "$K1")"
[ "$(slug_of "$K2")" = 'kast-fur-sanne-2 []' ] || fail "the second device's Kast für Sanne: $(slug_of "$K2")"
[ "$(slug_of "$K3")" = 'kast-fur-sanne-3 []' ] || fail "a third device that picked -2 too: $(slug_of "$K3")"
[ "$(slug_of "$OLD")" = 'zolder-trap []' ] || fail "a project sent without a slug: $(slug_of "$OLD")"
r=$(req POST /api/collections/projects/records "$S" "$(sproject "$S_ID" "Kast für Sanne" kast-fur-sanne)")
expect "$r" 200 "another account makes its own Kast für Sanne"
[ "$(body "$r" | jq -r .slug)" = kast-fur-sanne ] || fail "slugs are per owner: $(body "$r" | jq -r .slug)"
ok "the NAS settles a clash with -2, -3; a slug is made for an app that sends none; per owner"

# A rename: the old slug moves to oldSlugs (also when the device doesn't send it), still leads
# here for a guest, and isn't given to a new project. An older update changes nothing.
expect "$(req PATCH "/api/collections/projects/records/$K1" "$A" "{\"title\":\"Bank\",\"slug\":\"bank\",\"updatedAt\":\"$LATER\"}")" 200 "rename"
[ "$(slug_of "$K1")" = 'bank ["kast-fur-sanne"]' ] || fail "after the rename: $(slug_of "$K1")"
expect "$(req PATCH "/api/collections/projects/records/$K1" "$A" '{"title":"Oud","slug":"oud","updatedAt":"2026-01-01T00:00:00.000Z"}')" 200 "an older rename"
[ "$(slug_of "$K1")" = 'bank ["kast-fur-sanne"]' ] || fail "an older update changed the slug: $(slug_of "$K1")"
K4=$(mk projects "$(sproject "$A_ID" "Kast für Sanne" kast-fur-sanne)")
[ "$(slug_of "$K4")" = 'kast-fur-sanne-4 []' ] || fail "an old slug was given to a new project: $(slug_of "$K4")"
r=$(req GET "/api/collections/projects/records?fields=id,slug&filter=$(jq -rn --arg f 'slug = "kast-fur-sanne" || oldSlugs ~ "\"kast-fur-sanne\""' '$f|@uri')")
expect "$r" 200 "a guest looks up an old slug"
[ "$(body "$r" | jq -c '[.items[] | select(.id == "'"$K1"'") | .slug]')" = '["bank"]' ] || fail "a guest doesn't find the renamed project by its old slug: $(body "$r")"
ok "a rename keeps the old slug in oldSlugs, found by a guest, never reused; an older update is ignored"

# The bin: a tombstoned project keeps its slug; a purge marker frees it.
tomb projects "$OLD"
mk projects "$(sproject "$A_ID" "Zolder trap" zolder-trap)" >/dev/null
[ "$(body "$(req GET "/api/collections/projects/records?filter=$(jq -rn --arg f 'slug = "zolder-trap-2"' '$f|@uri')" "$A")" | jq '.items | length')" = 1 ] ||
  fail "a tombstoned project's slug was given away"
expect "$(req DELETE "/api/collections/projects/records/$OLD" "$A")" 204 "the owner deletes the old project for good"
[ "$(slug_of "$OLD")" = ' []' ] || fail "the purge marker keeps a slug: $(slug_of "$OLD")"
FREE=$(mk projects "$(sproject "$A_ID" "Zolder trap" zolder-trap)")
[ "$(slug_of "$FREE")" = 'zolder-trap []' ] || fail "a purged project's slug isn't free: $(slug_of "$FREE")"
ok "a tombstoned project keeps its slug; deleted for good, it's free again"

# CORS: only the app's origin gets an Access-Control-Allow-Origin header (D-0005).
curl -sS -i -H "Origin: $APP" "$B/api/health" | grep -i "^access-control-allow-origin: $APP" >/dev/null ||
  fail "no CORS header for $APP"
if curl -sS -i -H 'Origin: https://evil.example' "$B/api/health" | grep -i '^access-control-allow-origin' >/dev/null; then
  fail "CORS header for another origin"
fi
ok "CORS allows $APP only"

echo "All smoke tests passed."
