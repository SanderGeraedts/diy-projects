#!/usr/bin/env bash
# T-0013: smoke test for the PocketBase image, run by .github/workflows/backend.yml against a
# container named `pb` on an empty database at http://127.0.0.1:8090. Needs curl and jq.
# Never point this at the real NAS (D-0006).
set -euo pipefail

B=http://127.0.0.1:8090
APP=https://projects.sanderg.nl
PASS='ci-only-password-123456'

fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { echo "ok: $*"; }

# req METHOD PATH [TOKEN] [JSON]: prints "<status>\n<body>"; retries on 429 (rate limits are on).
req() {
  local method=$1 path=$2 token=${3:-} body=${4:-} out code
  local args=(-sS -o /tmp/body -w '%{http_code}' -X "$method" "$B$path")
  [ -n "$token" ] && args+=(-H "Authorization: $token")
  [ -n "$body" ] && args+=(-H 'Content-Type: application/json' -d "$body")
  for _ in 1 2 3 4 5; do
    code=$(curl "${args[@]}")
    [ "$code" != 429 ] && break
    sleep 3
  done
  echo "$code"
  cat /tmp/body
}
status() { head -n1 <<<"$1"; }
body() { tail -n +2 <<<"$1"; }
expect() { # expect RESPONSE CODE WHAT
  [ "$(status "$1")" = "$2" ] || fail "$3: expected $2, got $(status "$1"): $(body "$1")"
}
token() { # token COLLECTION EMAIL
  local r
  r=$(req POST "/api/collections/$1/auth-with-password" "" "{\"identity\":\"$2\",\"password\":\"$PASS\"}")
  expect "$r" 200 "sign in to $1 as $2"
  body "$r" | jq -r .token
}

# Superuser, made the way it's done on the NAS (docs/deploy/pocketbase-on-the-nas.md, 6).
docker exec pb pocketbase superuser upsert admin@ci.invalid "$PASS" --dir=/pb_data >/dev/null
SU=$(token _superusers admin@ci.invalid)

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
# T-0017: photo files need a file token, like their owner-only records (D-0005).
for f in original copy thumbnail; do
  [ "$(jq -r ".fields[] | select(.name==\"$f\") | .protected" <<<"$photos")" = true ] || fail "photos.$f is not protected"
done
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

# CORS: only the app's origin gets an Access-Control-Allow-Origin header (D-0005).
curl -sS -i -H "Origin: $APP" "$B/api/health" | grep -i "^access-control-allow-origin: $APP" >/dev/null ||
  fail "no CORS header for $APP"
if curl -sS -i -H 'Origin: https://evil.example' "$B/api/health" | grep -i '^access-control-allow-origin' >/dev/null; then
  fail "CORS header for another origin"
fi
ok "CORS allows $APP only"

echo "All smoke tests passed."
