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

---

## Build notes (dated)

- **2026-10-24 — §3 deployed to dev, and one unrelated sentence rode along (Dan's ruling: option A).** `recipe-import` was deployed from the repo at `049c7dc` (`npx supabase functions deploy recipe-import --project-ref zxwtxjjmssykhqrghouf --no-verify-jwt`): dev version 9 → **10**, bundle `e4b6239c…` → `4558ae0c…`, `verify_jwt` false kept, a no-token POST answers 401. Before it, dev v9 and prod v2 ran the same bundle (`e4b6239c…`), built before `cbc4d19` (2026-10-16). So this deploy also ships `cbc4d19`'s one-sentence casing rule in the prompt's **name** rule ("Title case keeps these small words lower-case when they are not the first word: and, or, with, of, the, a, an, in, on, to, for, alla, al, con, de"), never deployed until now. It matches the client's `displayTitle()`. To be verified on dev by Dan's Galley import of a drink recipe (it tags Drink and the casing holds) — not yet walked at the time of this note; **it ships to prod with Drink** in step 4.
- **Migration number:** 069 (`migrations/069_meals_occasion_drink.sql`), applied on dev 2026-10-25 00:45 UTC over the dev MCP, ledger `20261025004543`.
- **Client:** `399a445` (tint Sky `#D8E4F2` / `#4A6A8C`, the glass-and-bubbles mark with no head line, Drink last in the rail and chips — Dan's picks 2026-10-24); live on the dev preview as `main.f27e1a5a.js` (`dpl_GowpL7T9pztktQhnjgPdkPXoVqqi`).
- **2026-10-25 (02:36–02:39 UTC) — dev walk by Dan.** (1) A test meal set to Drink saves: "Test Lemonade" (Madbury) read back as `occasion {drink}`. (2) The Library card shows the Sky band and the glass, "Drink · N items"; Drinks is last in the rail and the chips. (3) Existing meals unchanged. (4) A Galley Photo import of "Old Fashioned" (liquor.com, 4 screenshots) landed in the form with Drink as the on-card chip — `recipe-import` v10 logged `ok … images=4 ingredients=4 attribution=yes occasion=1` — but the meal was **not saved** (no `meals` POST after the import, no error), so the tag is not yet confirmed in the database. **Casing: pending** — "Old Fashioned" has no small words; Dan imports a title with "and" / "with" next. Prod untouched.
- **2026-10-25 02:49 UTC — step 4 closed on dev.** The two earlier imports were never saved (the app was switched away before Save — Dan; no client fault). A Photo import of **"Dark and Stormy"**, saved, read back from dev: `occasion {drink}`, name stored as **"Dark and Stormy"** (small word lower-case, as `cbc4d19`'s rule asks), attribution **"Liquor.com"**, 4 ingredients. `recipe-import` v10's `drink` tag and the casing sentence are verified on dev. One honest limit: a single title can't tell whether the model lower-cased "and" or the source already had it that way; the rule and the result agree. **Dev is done; prod (steps 3–4) waits for Dan's go.**
