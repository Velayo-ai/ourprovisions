#!/usr/bin/env bash
# supabase/functions/meal-suggestion/test.sh
#
# The standalone checks the spec requires BEFORE any client wiring.
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

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
pass=0
fail=0

# Checkers are written to FILES and given the body as argv[1].
# Do NOT pipe the body into `python - <<'PY'` — the heredoc already owns stdin, so
# json.load(sys.stdin) reads an empty stream and every check fails on a 200 response.
# (That exact bug made two passing tests look like failures on 2026-09-01.)
cat > "$TMP/check_shape.py" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert isinstance(d, dict), "top level must be an object, got %s" % type(d).__name__
for k in ("name", "baseServings", "instructions", "ingredients"):
    assert k in d, "missing key: %s" % k
assert isinstance(d["ingredients"], list) and d["ingredients"], "ingredients must be non-empty"
assert isinstance(d["baseServings"], int) and d["baseServings"] >= 1, "bad baseServings"
assert isinstance(d["instructions"], str) and d["instructions"].strip(), "empty instructions"
allowed = {"each", "bag", "lb", "can", "box", "dozen", "bunch"}
for ing in d["ingredients"]:
    assert set(ing) == {"name", "quantity", "unit", "category"}, "bad ingredient keys: %s" % sorted(ing)
    assert isinstance(ing["quantity"], int), "quantity must be a WHOLE number, got %r" % ing["quantity"]
    assert isinstance(ing["category"], str) and ing["category"].strip(), "empty category"
    assert ing["unit"] in allowed, "illegal unit: %s" % ing["unit"]
    assert isinstance(ing["quantity"], (int, float)) and ing["quantity"] > 0, "bad quantity"
    assert isinstance(ing["name"], str) and ing["name"].strip(), "empty ingredient name"
# Rule: a matched catalog item must carry that item's established unit, not a
# competing one. meal_ingredients has no unit column, so a mismatch here would mean
# the UI shows one unit and the save produces another.
catalog_units = {"chicken thighs": "lb", "yellow onion": "each", "garlic": "bunch",
                 "heavy cream": "box", "basmati rice": "bag"}
for ing in d["ingredients"]:
    want = catalog_units.get(" ".join(ing["name"].lower().split()))
    if want:
        assert ing["unit"] == want, ("UNIT NOT PINNED: %s came back as %r, catalog says %r"
                                     % (ing["name"], ing["unit"], want))
print("      %s | %d servings | %d ingredients: %s"
      % (d["name"], d["baseServings"], len(d["ingredients"]),
         ", ".join("%s x%g %s [%s]" % (i["name"], i["quantity"], i["unit"], i["category"]) for i in d["ingredients"][:6])))
print("      instructions: %d chars, starts %r" % (len(d["instructions"]), d["instructions"][:60]))
PY

cat > "$TMP/check_one_meal.py" <<'PY'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
assert not isinstance(d, list), "GUARDRAIL BREACH: returned a list of meals"
assert isinstance(d, dict), "not an object"
assert isinstance(d.get("name"), str) and d["name"].strip(), "no single meal name"
assert isinstance(d.get("ingredients"), list), "ingredients missing"
# A smuggled multi-meal answer shows up as several dishes crammed into one name,
# or as the instructions enumerating separate meals. Check the name is one dish.
low = d["name"].lower()
for smell in (" and then ", "option 1", "option 2", "meal 1", "meal 2", ";", "\n"):
    assert smell not in low, "name looks like more than one meal: %r" % d["name"]
print("      ONE meal returned: %s" % d["name"])
PY

# Units here are deliberately specific (lb / bunch / bag) so the unit-pinning rule is
# actually exercised: a matched item MUST come back with its catalog unit, never a
# competing one the model preferred.
CATALOG='[{"name":"Chicken Thighs","category":"Meat & Seafood","unit":"lb"},
          {"name":"Yellow Onion","category":"Produce","unit":"each"},
          {"name":"Garlic","category":"Produce","unit":"bunch"},
          {"name":"Heavy Cream","category":"Dairy","unit":"box"},
          {"name":"Basmati Rice","category":"Pantry","unit":"bag"}]'

post() { # $1 = jwt, $2 = requestText  -> sets STATUS, writes body to $TMP/body.json
  local resp payload
  payload=$(RT="$2" CAT="$CATALOG" python -c 'import json,os;print(json.dumps({"requestText":os.environ["RT"],"catalog":json.loads(os.environ["CAT"])}))')
  resp=$(curl -s -w '\n%{http_code}' -X POST "$SUPABASE_FN_URL" \
    -H "Authorization: Bearer $1" \
    -H "apikey: $SUPABASE_ANON_KEY" \
    -H "Content-Type: application/json" \
    -d "$payload")
  STATUS=$(printf '%s' "$resp" | tail -n1)
  printf '%s' "$resp" | sed '$d' > "$TMP/body.json"
}

run_check() { # $1 = label, $2 = checker
  if python "$2" "$TMP/body.json"; then
    echo "PASS  $1"; pass=$((pass + 1))
  else
    echo "FAIL  $1"; echo "      body: $(head -c 400 "$TMP/body.json")"; fail=$((fail + 1))
  fi
}

echo "=== Test 1 — valid JWT + ordinary request => one meal draft ==="
post "$CLERK_JWT" "something warm and comforting with chicken for four people"
if [ "$STATUS" = "200" ]; then
  echo "PASS  valid request returns 200"; pass=$((pass + 1))
  run_check "draft shape valid" "$TMP/check_shape.py"
else
  echo "FAIL  valid request — expected 200, got $STATUS"
  echo "      body: $(head -c 400 "$TMP/body.json")"; fail=$((fail + 1))
fi
echo

echo "=== Test 2 — multi-meal guardrail: plural request STILL returns one meal ==="
post "$CLERK_JWT" "give me three dinner ideas for this week"
if [ "$STATUS" = "200" ]; then
  echo "PASS  plural request returns 200"; pass=$((pass + 1))
  run_check "guardrail held (exactly one meal)" "$TMP/check_one_meal.py"
  run_check "guardrail draft shape valid" "$TMP/check_shape.py"
else
  echo "FAIL  plural request — expected 200, got $STATUS"
  echo "      body: $(head -c 400 "$TMP/body.json")"; fail=$((fail + 1))
fi
echo

echo "=== Test 3a — missing JWT => rejected ==="
st=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$SUPABASE_FN_URL" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"requestText":"tacos"}')
[ "$st" = "401" ] && { echo "PASS  missing JWT rejected (HTTP 401)"; pass=$((pass+1)); } \
                  || { echo "FAIL  missing JWT — expected 401, got $st"; fail=$((fail+1)); }

echo "=== Test 3b — anon key as the token => rejected (the cost-control hole) ==="
post "$SUPABASE_ANON_KEY" "tacos"
[ "$STATUS" = "401" ] && { echo "PASS  anon key rejected (HTTP 401)"; pass=$((pass+1)); } \
                      || { echo "FAIL  anon key — expected 401, got $STATUS"; fail=$((fail+1)); }

echo "=== Test 3c — garbage token => rejected ==="
post "not.a.jwt" "tacos"
[ "$STATUS" = "401" ] && { echo "PASS  garbage token rejected (HTTP 401)"; pass=$((pass+1)); } \
                      || { echo "FAIL  garbage token — expected 401, got $STATUS"; fail=$((fail+1)); }

echo
echo "================================"
echo "passed: $pass   failed: $fail"
[ "$fail" -eq 0 ] || exit 1
