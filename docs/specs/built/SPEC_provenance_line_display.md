# SPEC: Shared-List Provenance Line — Display Rule

**Status:** active — decided 2026-08-20 (design chat). Display-only. No data/schema change.
**Scope:** OurProvisions
**Touches:** `App.js` SHOP row rendering only — `mealOriginBadge` (~line 1295) and the
contributor name-line / avatar block (~lines 3730-3762 and the near-identical
~3796-3822). The underlying data (Parts 1-3 of `SPEC_unified_meal_user_provenance.md`,
already built + verified on dev) feeds this unchanged.

---

## Why this exists

The shipped provenance display was mechanically true but read as a lie to anyone who
didn't build the data model. On a merged item it showed "from {meal}" and a separate
contributor name stacked in two different colors, with no grammar connecting them —
and worse, it implied the named person added the *ingredient* when in fact they added
the *meal* that pulled the ingredient in. On a shared list the question a stranger
actually asks is "who put this here, and why" — the display must answer that honestly,
never claim a direct add that didn't happen, and never let one person's name bleed
onto another person's origin.

Arrived at by eye-testing five phrasings against the real row on a canvas (design chat
2026-08-20). The winning model: **two facets, each on its own line, each owning its own
name, ordered and colored the same way every time.**

## The rule

Every list item's provenance renders as up to **two facets**, always in this order,
each shown ONLY when it applies:

1. **Catalog / human facet (clay `#A0724A`) — always first.** Who added the item
   directly to the list. This is the `list_item_contributors` ledger.
   - One contributor: `Added by {name}`
   - Multiple: `Added by {name} & {name}` (and-joined; 3+ → `{name}, {name} & {name}`)
   - **When a contributor is the current viewer, their name renders as `you`** —
     `Added by you`, `Added by you & Elly`. Viewer-dependent, exactly like the existing
     single-contributor name-line already is (`!item.isOwnItem` logic today).

2. **Meal facet (teal `#0D9488`) — always second.** Which meal(s) pulled the item onto
   the list, and who added those meals. This is the `list_item_meals` +
   `mealProvenance` ledger.
   - One meal: `For {meal name} · {adder name}`
   - Multiple meals: **name them, and-joined** — `For Taco Night & Chili Night · {names}`
     — NOT a count. This **replaces** today's "Multiple meals" collapse string; the
     retirement is deliberate, not a regression. `mealProvenance` already carries the
     meal names (they power today's "from {meal}"), so no new data is needed.
   - The meal adder(s) follow the same name/`you`/`&` rules as the catalog facet.

**Color is the meal signal.** Teal appears if and ONLY if a meal is involved. A pure
catalog add (no meal) never shows teal — it's clay only. Nothing else in the row uses
teal, so its presence alone tells the eye "a meal is in play." This is the load-bearing
signal; keep it pure.

**Degradation is automatic:**
- Catalog only → one clay line.
- Meal only → one teal line.
- Both → clay line then teal line (two lines, only for genuinely dual-origin items).

So the common single-origin rows stay one line; only true dual-origin items spend two.

## Ordering rationale (do not reorder)

Catalog-first because the direct human add is the primary accountability fact on a
shared list — "someone deliberately put this here." The meal is the secondary reason.
Leading with the catalog facet also structurally prevents the misread that sank the
single-line versions: because each facet is its own line with its own name, no name can
attach to the wrong origin. "Added by Dan" / "For Taco Night · Elly" can never be
misparsed as "Dan added Taco Night" or "Elly added the item."

## What NOT to do

- Do NOT merge the two facets onto one line with a separator ("Dan & Taco Night
  (Elly)") — tested and rejected; punctuation becomes load-bearing and names bleed
  across origins.
- Do NOT write a `list_item_contributors` row from the meal-add path to unify them in
  data — they stay two ledgers; they unify only in this display rule. (Already a
  standing rule from `SPEC_unified_meal_user_provenance.md` Part 2.)
- Do NOT keep the "Multiple meals" count string — it's replaced by named meals.
- Do NOT reintroduce the leading "◆" diamond as the meaning-carrier — color carries the
  meal signal now. (The diamond may stay as a small quiet bullet if it reads well, but
  it is decorative, not semantic — do not rely on it. Flagged against the house "no
  repeated glyphs" principle; builder's call whether to drop it entirely.)

## Accessibility note

Meal-vs-catalog is signaled by color (teal vs clay). That's a color-only distinction,
which is a mild a11y cost. The label text ("Added by" vs "For") also distinguishes
them, so it is not color-ALONE — the words carry the same signal. Acceptable as-is;
noted so a future pass knows the words are doing real work and shouldn't be dropped in
favor of color alone.

## Verification (dev, real auth, two accounts)

Walk each case and confirm the line reads honestly:
1. Catalog only, one person → `Added by {name}` / `Added by you`, clay, no teal.
2. Catalog only, multiple → `Added by Dan & Elly`, clay.
3. Meal only → `For {meal} · {adder}`, teal, no clay line.
4. Catalog + one meal (the DH-Apples + DT-meal case) → clay `Added by you` line THEN
   teal `For {meal} · {adder}` line; neither name bleeds onto the other facet.
5. Catalog + multiple meals → meal facet names both meals, and-joined, teal.
6. Confirm no row ever shows teal without a meal actually involved.
7. Both SHOP render sites (pending list ~3730 AND bought list ~3796) get the rule —
   grep `mealOriginBadge` to catch every call site so they can't drift.
