#!/usr/bin/env bash
# supabase/functions/meal-suggestion/test.sh
#
# The three standalone checks the spec requires BEFORE any client wiring.
# Run against the DEV project only.
#
#   export SUPABASE_FN_URL="https://zxwtxjjmssykhqrghouf.supabase.co/functions/v1/meal-suggestion"
#   export SUPABASE_ANON_KEY="<dev anon key>"
#   export CLERK_JWT="<a real end-user token — see README, 'Getting a test JWT'>"
#   bash supabase/functions/meal-suggestion/test.sh
#
# Exits non-zero if any check fails.

set -uo pipefail

: "${SUPABASE_FN_URL:?set SUPABASE_FN_URL}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"
: "${CLERK_JWT:?set CLERK_JWT}"

pass=0
fail=0

check() { # name, expected_status, actual_status, body
  if [ "$2" = "$3" ]; then
    echo "PASS  $1 (HTTP $3)"
    pass=$((pass + 1))
  else
    echo "FAIL  $1 — expected HTTP $2, got $3"
    echo "      $4"
    fail=$((fail + 1))
  fi
}

CATALOG='[{"name":"Chicken Thighs","category":"Meat & Seafood"},
          {"name":"Yellow Onion","category":"Produce"},
          {"name":"Garlic","category":"Produce"},
          {"name":"Heavy Cream","category":"Dairy"},
          {"name":"Basmati Rice","category":"Pantry"}]'

post() { # jwt, requestText -> writes body to $BODY, status to $STATUS
  local resp
  resp=$(curl -s -w '\n%{http_code}' -X POST "$SUPABASE_FN_URL" \
    -H "Authorization: Bearer $1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"requestText\": $(printf '%s' "$2" | python -c 'import json,sys; print(json.dumps(sys.stdin.read()))'), \"catalog\": $CATALOG}")
  STATUS=$(printf '%s' "$resp" | tail -n1)
  BODY=$(printf '%s' "$resp" | sed '$d')
}

echo "=== Test 1 — valid JWT + ordinary request => one meal draft ==="
post "$CLERK_JWT" "something warm and comforting with chicken for four people"
check "valid request returns 200" 200 "$STATUS" "$BODY"
if [ "$STATUS" = "200" ]; then
  printf '%s' "$BODY" | python - <<'PY'
import json, sys
d = json.load(sys.stdin)
assert isinstance(d, dict), "top level must be an object, got %s" % type(d).__name__
for k in ("name", "baseServings", "instructions", "ingredients"):
    assert k in d, "missing key: %s" % k
assert isinstance(d["ingredients"], list) and d["ingredients"], "ingredients must be a non-empty list"
assert isinstance(d["baseServings"], int) and d["baseServings"] >= 1
allowed = {"each", "bag", "lb", "can", "box", "dozen", "bunch"}
for ing in d["ingredients"]:
    assert set(ing) == {"name", "quantity", "unit"}, "bad ingredient keys: %s" % sorted(ing)
    assert ing["unit"] in allowed, "illegal unit: %s" % ing["unit"]
    assert ing["quantity"] > 0
print("      shape OK — %s, %d servings, %d ingredients"
      % (d["name"], d["baseServings"], len(d["ingredients"])))
PY
  if [ $? -eq 0 ]; then pass=$((pass + 1)); echo "PASS  draft shape valid"; else fail=$((fail + 1)); echo "FAIL  draft shape invalid"; fi
fi
echo

echo "=== Test 2 — multi-meal guardrail: plural request STILL returns one meal ==="
post "$CLERK_JWT" "give me three dinner ideas for this week"
check "plural request returns 200" 200 "$STATUS" "$BODY"
if [ "$STATUS" = "200" ]; then
  printf '%s' "$BODY" | python - <<'PY'
import json, sys
d = json.load(sys.stdin)
assert not isinstance(d, list), "GUARDRAIL BREACH: returned a list of meals"
assert isinstance(d, dict) and isinstance(d.get("name"), str), "not a single meal object"
assert isinstance(d.get("ingredients"), list), "ingredients missing"
# A single meal has one name; a smuggled list-in-a-string would show up here.
print("      one meal only — %s" % d["name"])
PY
  if [ $? -eq 0 ]; then pass=$((pass + 1)); echo "PASS  guardrail held (exactly one meal)"; else fail=$((fail + 1)); echo "FAIL  guardrail breached"; fi
fi
echo

echo "=== Test 3a — missing JWT => rejected ==="
resp=$(curl -s -w '\n%{http_code}' -X POST "$SUPABASE_FN_URL" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"requestText":"tacos"}')
st=$(printf '%s' "$resp" | tail -n1)
[ "$st" = "401" ] && { echo "PASS  missing JWT rejected (HTTP 401)"; pass=$((pass+1)); } \
                  || { echo "FAIL  missing JWT — expected 401, got $st"; fail=$((fail+1)); }

echo "=== Test 3b — anon key as the token => rejected (this is the cost-control hole) ==="
post "$SUPABASE_ANON_KEY" "tacos"
[ "$STATUS" = "401" ] && { echo "PASS  anon key rejected (HTTP 401)"; pass=$((pass+1)); } \
                      || { echo "FAIL  anon key — expected 401, got $STATUS: $BODY"; fail=$((fail+1)); }

echo "=== Test 3c — garbage token => rejected ==="
post "not.a.jwt" "tacos"
[ "$STATUS" = "401" ] && { echo "PASS  garbage token rejected (HTTP 401)"; pass=$((pass+1)); } \
                      || { echo "FAIL  garbage token — expected 401, got $STATUS: $BODY"; fail=$((fail+1)); }

echo
echo "================================"
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ] || exit 1
