# SPEC — Meals data model (meals-as-lens, Phase 1 foundation)

**Scope:** OurProvisions
**Status:** Design approved, not built
**Session decision date:** 2026-07-28
**Author:** Design-chat Claude → for Claude Code

---

## Why this exists

Two mockups (`mockup_browse_meals_servings.html`, `mockup_browse_ingredients_meals_filter.html`)
draw a meals feature the schema cannot store. No `meals`/`recipe`/`ingredient` tables exist.
This spec closes that gap: it defines the data model so "plan a meal → ingredients fill the
shared list" becomes real, testable behavior for beta households.

**Build strategy: schema as Option 1 (scaling-ready), behavior as Option 3 (no dial yet).**
The tables support serving-scaling from day one; the UI ships the simpler "add all at flat
quantities" path first. Lighting up the serving dial later is additive — no migration, no
re-model. Rationale: scaling math (ratios, rounding, per-ingredient overrides) is a whole
second thing to get wrong; it does not belong in the same PR as the tables and list-flow.
One tested change before the next.

---

## Decisions locked this session

| Decision | Choice | Rationale |
|---|---|---|
| Meal = recipe or bundle? | Recipe-shaped schema, bundle behavior for now | Schema stores `quantity_per_serving` + `base_servings` so scaling is free later; UI defers the dial |
| Where do meals live? | Household-owned (`meals.household_id`) | Mirrors `catalog_items` ownership. Sharing (invite-only) and marketplace (sell/advertise) are FUTURE — OurChef concerns. Model must not block them; do not build them now. |
| Ingredient = free text or catalog ref? | FK to `catalog_items` | The load-bearing choice. A meal ingredient IS a catalog item; that's what lets it flow into `list_items` (which already keys on `catalog_item_id`). |
| Do list items remember their meal? | Yes | Powers origin badge + "remove whole meal." |
| Same item, two meals — one row or many? | **One row** | Shopper doesn't care which meal a lemon is for; splitting clutters the aisle moment. Badge reads "Multiple meals" when >1. `uq_live_list_item` HOLDS — does not bend. |
| How does an item link to meals? | **Join table** (`list_item_meals`) | Many-to-one requires it. Enforces referential integrity (no dangling meal refs when a meal is deleted); array column would leave ghost ids and tax every future list-reading feature. Chosen for durability on the sacred shared list. |

---

## New tables

### `meals`
```
id              uuid primary key default gen_random_uuid()
household_id    uuid references households(id) not null
name            text not null
base_servings   integer default 1        -- native recipe yield; 1 today, load-bearing for future scaling
created_by      uuid references users(id)
created_at      timestamptz default now()
updated_at      timestamptz default now()
deleted_at      timestamptz              -- soft-delete convention
```
- `photo_url` deferred: generalizes from OurBanner image pipeline; add in a later pass, don't couple now.

### `meal_ingredients`
```
id                   uuid primary key default gen_random_uuid()
meal_id              uuid references meals(id) not null
catalog_item_id      uuid references catalog_items(id) not null
quantity_per_serving numeric not null    -- stored as ratio ALWAYS. base_servings=1 today, so this reads as flat qty. Same column, two readings — this is the seam that makes Option 3→1 free.
created_at           timestamptz default now()
deleted_at           timestamptz
```
- No `override` column yet — that's Option 1's "olive oil stays at 0" behavior; earns its place only once the dial exists. Seam noted, deferred.

### `list_item_meals` (join — provenance)
```
list_item_id  uuid references list_items(id) not null
meal_id       uuid references meals(id) not null
primary key (list_item_id, meal_id)
```
- One row per (item, meal) relationship. "Multiple meals" badge = count(*) > 1 for that list_item.
- FK on meal_id gives referential integrity: a deleted meal cannot leave a dangling provenance link.

---

## Behavior: adding a meal to the list

For each `meal_ingredient` of the meal:
1. Compute `qty = quantity_per_serving × chosen_servings` (chosen_servings = 1 today).
2. Upsert into `list_items` for this household + catalog_item, respecting `uq_live_list_item`
   (one live row per catalog item per household). If the item already lives, INCREMENT quantity.
3. Insert a `list_item_meals` row linking that list_item to this meal (idempotent on PK).

Result: shared item appears once; provenance accrues via join rows.

---

## Behavior: removing a whole meal from the list — TRUTH TABLE

For each `list_item` linked to the meal being removed:

| Item's other meal links? | Item added manually too? | Action |
|---|---|---|
| None | No | Remove the list_item entirely (soft-delete) + drop the join row |
| None | Yes (see note) | Keep item, drop this meal's contributed quantity, drop join row |
| Yes (≥1 other meal) | — | Keep item, decrement by this meal's contributed quantity, drop only this meal's join row |

**Note on "added manually too":** requires knowing the meal-contributed portion of an item's
quantity vs. the manually-added portion. OPEN QUESTION — see below. If we cannot distinguish,
the safe default is: removing a meal decrements by the meal's computed contribution but never
takes the item below its pre-meal baseline, and never below zero.

---

## RLS

New tables inherit the household-scoped policy shape. Identity claim is
`auth.jwt()->>'sub'` (Clerk third-party auth) — NEVER `auth.uid()`.
- `meals`, `meal_ingredients`: readable/writable by members of the owning household.
- `list_item_meals`: gated through the list_item's household membership.
- Migration number assigned at point-of-build, not now (prevents double-claiming).
- Live storage/RLS test required post-merge: the running app must prove a non-member and anon
  are denied — SQL editor runs as postgres and bypasses RLS, so it can only prove policies
  EXIST, not that they WORK.

---

## OPEN QUESTIONS (do not invent resolution)

1. **Meal-contributed vs. manually-added quantity.** The remove truth-table's "keep item,
   drop this meal's quantity" needs to know how much of a list_item's quantity came from the
   meal. Options: (a) store contributed qty on the `list_item_meals` join row; (b) recompute
   from meal_ingredients at removal time. (a) is more robust to later meal edits. NEEDS A
   DECISION before the remove-flow is built — not needed for the ADD path or the badge.
2. **"Multiple meals" badge tap target** — does tapping reveal which meals? UI decision, not
   schema. Deferred to the Browse-lens build session.
3. **Serving dial** — deferred entirely (Option 3). When built: expose the stepper, multiply by
   chosen_servings, add per-ingredient override. No schema change needed to START.

---

## Future seams (noted, NOT built)

- **Meal copy between households — NEAR-TERM DELIVERABLE, buildable on THIS model.**
  Use case: meals built up in Madbury wanted at Sacandaga without re-creating them. Operation:
  duplicate a meal's rows (meal + meal_ingredients) into a different household_id the user is a
  member of. COPY, not reference — Sacandaga gets its own editable duplicate; later Madbury
  edits do NOT silently change Sacandaga's version (a meal is a photocopied recipe card, not a
  shared Google Doc). No context refactor needed; pure household→household. This is the household
  version of the operation that becomes context→context copy once the Context model lands — NOT
  throwaway work. RLS: source read requires membership in source household; write requires
  membership in destination.

- **Copy vs. reference = OurProvisions vs. OurChef — RESOLVED THIS SESSION (closes prior OPEN).**
  These are not competing options; they are the household version and the person version of the
  same idea, and they map onto the ownership split (household owns instance / person owns
  authorship):
  - COPY is a HOUSEHOLD operation (a place). Two kitchens, two recipe cards, allowed to drift.
    Ships in OurProvisions now. No canonical-owner problem because there is no canonical version.
  - REFERENCE is a PERSON operation (an author). "Andrew's tacos are always evolving; when he
    shares them, every household should get his updates." This REQUIRES a person-level home for
    the recipe that outlives any single household — i.e. the personal cookbook — so it ONLY works
    once Andrew signs up for OurChef. The recipe must belong to Andrew-the-author, not
    Madbury-the-place, for "the update reaches everyone" to be coherent.
  Consequence: the thorny RLS/canonical-owner problem that made reference hard in OurProvisions
  simply DOESN'T EXIST in OurChef, where person-owns-recipe is the native premise. Reference isn't
  a deferred hard feature — it's moved to the product where it's easy. This is the payoff of
  keeping `created_by` a real seam (see cookbook seam): OurChef assembles a person's cookbook from
  authored meals across households; that cookbook object is what supports evolving reference-shares.
  BUSINESS NOTE: reference-sharing is a natural OurChef signup driver — Andrew literally cannot get
  cross-household syncing tacos on OurProvisions alone, so the app has an honest reason to point him
  to OurChef. Fleet architecture selling itself, not a bolted-on paywall.


- **THE CONTEXT MODEL — the through-line under three separate requests. ITS OWN DESIGN SESSION.**
  Dan hit the same wall from three angles in one session: (1) personal cookbook (meal follows a
  person), (2) non-household event, (3) Madbury→Sacandaga + Hamptons rental. All three are one
  frustration: a meal is stuck in ONE household and keeps being wanted elsewhere. RESOLUTION
  INSIGHT: a meal doesn't belong to a household — it belongs to a CONTEXT. Household and event
  are two KINDS of context; both own a list, own meals, have members (permanent vs temporary).
  This is the parked "Context/Events model." It dissolves all three: copy = context→context;
  rental = a context with no household parent; cookbook = meals-by-author across contexts.
  COST (why it's a separate session, not built here): `household_id` is the RLS spine of the
  entire app — every policy keys on household membership. Generalizing household→context touches
  that spine and ripples into RLS, the household switcher, OurBanner identity, everything saying
  "household." This is a FOUNDATIONAL refactor, not a meal feature. DISCIPLINE: build the
  household→household copy NOW (delivers Sacandaga, zero refactor); reserve the Hamptons rental
  and standalone events for the dedicated Context session — the rental's destination context does
  not exist in today's model, so it CANNOT ship now without dragging the whole refactor into a
  meals PR. When Context lands, the household→household copy becomes context→context for free.



- **Sharing (invite-only):** later `meal_shares` join or visibility column on `meals`. Model does not block it.

- **Personal cookbook that travels (OurChef seam) — SURFACED THIS SESSION.**
  Dan's instinct: "Jan's meatballs" should feel like Jan's, and ideally follow Jan across
  households (her own + her mother's). RESOLUTION: do NOT build member-ownership in
  OurProvisions. Household owns the meal INSTANCE; the person owns AUTHORSHIP. `created_by`
  is therefore NOT disposable metadata — it is the hook OurChef will use to assemble a
  person's cookbook from meals scattered across households ("show every meal this person
  authored, anywhere"). Display "Jan's meatballs" via created_by; never surface household
  address on a meal (the "30 Town Hall Road Salad" failure mode). Meal survives the author
  leaving the household — that's why household-owned, not member-owned. Same underlying
  object as the marketplace seam.

- **Non-household-hosted events — SURFACED THIS SESSION. CONSTRAINT FLAGGED.**
  Current model assumes a meal hangs off a household (`meals.household_id NOT NULL`). A
  standalone event (Cassie's use case — a gathering not AT any household, pulling in
  non-member people) has NO household parent and nowhere to hang. The `NOT NULL` is correct
  for TODAY and is exactly the constraint the events dimension must renegotiate. This is not
  a bolt-on feature — it's a SECOND KIND OF CONTAINER: today meals live in households; events
  introduce another place meals can live (an event, which may or may not have a household
  parent). This is the parked "Context/Events model" — "household" generalizes to "a context
  that owns provisioning"; an event is another instance. OurBanner's photo work already
  generalizes toward context-identity. REQUIRES ITS OWN DESIGN SESSION — do not wedge into
  meals. When built: relax `meals.household_id` to nullable and/or introduce a polymorphic
  parent + `events` table + temporary non-inheriting members + event-scoped RLS. Flagged here
  so the future session finds the constraint by design, not by surprise.
- **Marketplace (advertise/sell):** OurChef surface. Household-owned meal is the object OurChef will dignify into shareable/sellable.
- **Photo header on meals:** generalizes from OurBanner context-identity work.
