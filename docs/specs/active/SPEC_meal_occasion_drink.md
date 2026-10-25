# SPEC — Add "Drink" meal occasion

**Status:** Active · **Scope:** OurProvisions · **Origin:** 2026-10-24 design chat
**Envs:** dev (`zxwtxjjmssykhqrghouf`) → verify → prod (`parpauldmbetptkmdwbd`)

## Why

Dan logged an invented drink (Black n' Pumpkin) on prod and had to tag it `appetizer`, because no Drink occasion exists. Drinks are a real thing households save and share, especially recipes found while out. Decision: add `drink` as a value in the existing `meals.occasion` list. We considered and rejected a separate `kind` column, because occasion already holds "not dinner" values (appetizer, dessert, side), and a second field would mostly overlap with it.

Note: `occasion` is `text[]`, so a meal can be `{drink}` or `{drink, appetizer}`. No exclusivity rule is added.

## Pre-state (read-only check, 2026-10-24)

- `meals_occasion_values` (migration 061) is identical on dev and prod:
  `CHECK (occasion <@ ARRAY['breakfast','lunch','dinner','snack','side','appetizer','dessert'])`
- On both databases, a save with `drink` fails whatever the client allows.

## Changes

### 1. Migration (number assigned at build time; do not pre-claim 069)
Drop and re-create `meals_occasion_values` with `'drink'` appended. This is purely additive, and existing rows are unaffected. Run it in one transaction.

### 2. Client: three places that must agree
- `MEAL_OCCASIONS`, `src/hooks/useProvisions.js:56`
- `OCCASION_ORDER`, `OCCASION_WORD`, `OCCASION_PILL` (plural **"Drinks"**), `src/components/LibraryCards.js:14-16`
- Tint + icon, see the gate below.

### 3. Galley
- Add `drink` to `ALLOWED_OCCASIONS`, `supabase/functions/recipe-import/prompt.ts:42`.
- Deploy `recipe-import` to each environment where it currently runs. If it isn't on prod yet, the prompt change rides with its eventual prod deploy. Don't deploy early just for this.

## Gate: tint and icon need Dan's approval before build

The Library v2 rule applies: the new tint must be **≥ 6 ΔE2000** from every existing tint, and the icon must be an SVG Dan approves (the appetizer icon set the precedent).
- Claude Code proposes 2–3 tint candidates with their computed ΔE2000 against every existing tint.
- Icon direction: a simple pint/tumbler silhouette in the same stroke style as the appetizer icon. Show it as a mockup before committing.
- No client build until Dan picks a tint and approves the icon.

## Order (not optional)

1. Migration on **dev** → verify.
2. Client + prompt on dev → verify on the **deployed dev preview** (never localhost).
3. Migration on **prod** → verify.
4. Client to prod (Edge Function per §3).

Why the constraint goes first: an old client never offers Drink, so a newer constraint is harmless. The reverse order would let a new client offer a value the database rejects.

## Verification

- **Constraint, each env:** `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'meals_occasion_values';` must list `'drink'`. "Success. No rows returned" doesn't count.
- **Dev preview:** create a test meal, set it to Drink, and save it. It shows the "Drinks" pill, the new tint and the icon in the Library. Existing meals render unchanged.
- **Prod, done when:** Dan sets **Black n' Pumpkin** (`9ad110cb…`, Madbury) to Drink in the app, and it saves and displays correctly.

## Separate from this spec: the "Guiness" fix

Dan renames it in the prod app via Browse → Guiness → edit → "Guinness" → save (`commitEditModal` → `renameItem`). It's one custom item (`5bd3635f…`, Madbury, `is_global false`), used by one ingredient row, and there's nothing to collide with. Claude Code reads it back over prod-readonly afterward. No migration or direct prod write.

## Out of scope (parked)

- Drink-aware copy ("Add a drink photo", "Made it" vs "Cooked it").
- Kids' snack picker must exclude Drink, as a rule from day one of that build.
- "Pairs with" (a drink alongside a meal).
- Restaurant photo → Galley recipe capture, with an optional "Inspired by [place]" credit.
