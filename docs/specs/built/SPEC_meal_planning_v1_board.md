# SPEC — Meal Planning v1, amended: the single-surface PLAN (Board)

**Scope:** OurProvisions
**Status:** Design approved 2026-09-12 (design chat). Ready for BUILD.
**Amends:** `docs/specs/active/SPEC_meal_planning_v1.md` (2026-08-20). Everything in that
spec stands except where this file says otherwise. Claude Code merges this into it (or
files it beside it) — this is the decision trail, not a replacement.
**Mockup of record:** `docs/mockups/mockup_plan_single_surface.html` — **shows v2 (Board | Days).**
v1 is the Board half of that mockup with the lens control absent. Where the mockup shows
a lens toggle, a day column, or an "Any day" row, it is showing v2.

---

## What changed since 08-20, and what didn't

The 08-20 spec designed PLAN as two sub-tabs, **Meals | This Week**. Since then:

- **The helm shipped** (`SPEC_nav_helm.md`, live on prod `1f0dcbd`). Every door now has one
  grammar: a control row at the top of the content, the pill compacting when that row
  scrolls off, and a `+` in the pill that does the door's add. Plan's `+` already opens
  New meal. Sub-tabs are the old header-strip vocabulary; they don't belong under the helm.
- **Most of v1's backend is already built.** `removeMealFromList` and `deleteMeal` shipped
  and were dev-verified (2026-08-21, on prod since 09-09), including the shared-ingredient
  reverse-merge and the soft-delete provenance fix. `plannedMealCounts` already computes
  the derived "how many times is this meal on the list" per meal. **The 08-20 spec's
  Backend section is DONE; do not rebuild it.**
- **2026-09-12 design chat** replaced the sub-tabs with a **single surface**: the board
  above, the library below, the library feeding the board. A **Board | Days** lens in
  Shop's grammar was designed and mocked for the week view.

**Decision (2026-09-12, Dan): ship Board as v1, Board | Days as v2.** The 08-20 spec already
made this call ("Days out of v1 … layers on later as a view toggle"); yesterday's mockup
drew what "later" looks like without overturning the reasoning. Having the v2 picture in
hand is what lets v1 ship without painting us in.

What stands unchanged from 08-20: add = plan = shop, one tap; "in This Week" is **derived,
not stored** (a meal is on the board iff it has ≥1 unbought ingredient on the list);
removal zeros only pending items and never un-buys; shared ingredients stay when one meal
leaves; delete is soft, behind a confirm.

---

## The surface (v1)

One scrolling page under the Plan door:

```
[ n this week ]                                   [ + ]     ← Plan control row (D9′ sentinel moves here)
┌────────────────────────────────────────────────────────┐
│  BOARD — the meals that are on the list this cycle      │
│  ordered cards, drag to reorder (long-press = drag)     │
│  empty: a dashed strip, "Nothing planned yet" — always  │
│  present, never collapses                               │
└────────────────────────────────────────────────────────┘
  LIBRARY — today's MealsLens, unchanged
  (each meal card: Add ⇄ stepper, as shipped)
```

**Control row:** `[n this week] [+]` — Shop's grammar with the lens slot empty. `n` is the
count of active meals (board cards). The `+` in the row does what the pill's `+` does
(New meal). This row is the **D9′ sentinel** — `controlRowRef` moves off the placeholder
`control-row-end` div in `App.js` (`view === "plan"` block) onto this row, so the pill
compacts exactly when the row leaves the viewport, like Shop.

**In v2** the `[Board | Days]` lens drops into the empty slot: `[n this week] [Board | Days] [+]`.
Same row, no relayout. That slot being reserved is the whole reason the row is shaped
this way in v1.

**Board cards** show: meal name, the count (`×2` etc., same source as the library's
stepper), and a remove affordance. Remove calls the existing `removeMealFromList`. The
card leaves the board because it is no longer active — not because a flag was cleared.

**Add from the library** puts the meal on the board — because `add_meal_to_list` puts
unbought ingredients on the list and the board is derived from that. The placement row
(below) is written in the same action so the card has a slot.

**Drag to reorder:** long-press starts a drag (platform convention); a tap opens the meal.
Long-press is **never** the door to anything else. Order is **shared** — per household,
not per user — the arrangement *is* the collaboration. Reduced-motion: drag still works,
the lift animation is instant.

**Board is always present.** When empty it is a dashed strip with one line of copy, so the
page's shape is stable and a first Add lands somewhere visible rather than causing a
section to appear.

---

## Placement storage — the decision

**Ordered, not x/y.** A freeform x/y canvas on a phone-width board buys nothing over an
ordered grid and makes Days harder. Days is "group by day, order within day," which
reuses a sort order directly.

**One row per (household, meal): `meal_placements`.**

```sql
create table public.meal_placements (
  household_id uuid not null references public.households(id) on delete cascade,
  meal_id      uuid not null references public.meals(id)      on delete cascade,
  sort_order   integer not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.users(id) on delete set null,
  primary key (household_id, meal_id)
);
-- RLS on. SELECT / INSERT / UPDATE: is_member_of(household_id). No DELETE policy
-- (matches household_members / the cycle tables; rows die with the meal or the
-- household by cascade, never by client delete).
-- Revoke ALL from public, anon AND authenticated before granting — the 046 lesson;
-- then grant SELECT, INSERT, UPDATE to authenticated.
```

Migration number: **assign at point of build** (next free — `047` expected; verify
`migrations/` first, the `031`/`027` lesson). Apply dev first, read back `relacl`,
`pg_policies` and both FK actions before the client lands; prod only after the v1
verification passes on dev, migration first, then the client.

**Reserved for v2, absent in v1 — stated so nobody "helpfully" adds them now:**
`planned_for date null` and `slot text null` (breakfast / lunch / dinner / snack).
Both nullable, both one additive migration. Null day = "on the board, no day," which is
what v2's "Any day" row renders. **The 2026-09-12 external-plan reference** (a family
member's personal meal-plan app addresses meals as "Monday's breakfast", "Saturday's
snack 2") is why the reservation is day **and** slot: anything arriving from outside
carries both, and the placement row must be able to hold them the moment we accept
them, whether or not the UI renders them yet.

**Lifecycle rides on the derived-active rule; there is no cleanup machinery.**
- Add a meal → upsert its placement with `sort_order = max(sort_order)+1` for the
  household. **Always append on add**, even if a stale row exists — a re-added meal joins
  the end of the board rather than jumping into the slot it held three weeks ago.
- The board renders placements whose meal is currently active (has unbought list items).
  An inactive meal's row is simply not drawn.
- Remove / delete / wrap-up don't touch `meal_placements`. Rows for inactive meals are
  inert. This is the same zero-cleanup shape as derived-active itself and per-item notes.
- Reorder → one write per moved card's new `sort_order` (renumber the household's active
  set 0..n−1 in a single upsert batch; small n, no gap arithmetic).
- A meal with no placement row but active (legacy data, a race) renders **last**, in
  `meals.created_at` order, and gets a row on its next add or reorder. Never crash on a
  missing row.

**Why not `meals.sort_order`?** Order is a property of the *plan*, not the recipe — the
08-20 spec already flagged this ("order is really per-cycle, not per-meal"). A recipe
that appears in two households via a future give must be able to sit in two different
positions. The join table is the smallest thing that is correct.

**Why not per-cycle?** Cycles close on wrap-up; the board carries across (a meal you
didn't get to this trip is still planned). Per-household is the right owner; the
derived-active rule is what scopes "this week."

---

## Explicitly out of v1 (deferred with reasons; each layers on without a rebuild)

Carried from 08-20: no-shop meal types; shop-the-week batch button; plan/list divergence
reconciliation; shared-ingredient quantity accounting.

Added 2026-09-12:

- **Days lens (`[Board | Days]`)** — v2. Adds `planned_for` + `slot` (one migration), the
  lens toggle in the reserved slot, day-grouped render with an "Any day" row so switching
  lens never loses a meal, and day assignment on drag. Mockup of record already exists.
- **"Any day" row** — exists only because a lens exists. No lens, no row.
- **Import a meal from an external plan** → LATER (own row). Share sheet / paste / photo
  → Galley extraction (the receipt-vision pattern pointed at a recipe card) → the
  give-a-meal doorbell (`meal_shares`, copy at accept, provenance breadcrumb). An external
  app is a giver that isn't a household. Depends on the unit/quantity design doc and a
  free-text → catalog matching step (exact-match-wins can't save "1 slice sourdough or
  quality bread of choice"). Nutrition stays out of scope — that's the source app's job.
- **Haptics on drag / drop** — wait for Expo.
- **Board card art** — cards are text in v1; the library's cards are the reference.

---

## Build scope (delta only — the 08-20 backend is done)

**Migration** (`meal_placements`, RLS, grants) — number at build.

**`useProvisions.js`**
- Load `meal_placements` for the active household alongside `loadMeals` (Plan-only,
  scoped to the visible surface like the existing meals poll — an idle client queries
  nothing new).
- `handleAddMealToList` path: after `add_meal_to_list` succeeds, upsert the placement at
  `max+1`. Failure to write a placement is **non-fatal** (the meal is on the list; it
  renders last) — log it, don't toast it.
- `reorderBoard(orderedMealIds)` → renumber + upsert batch. Optimistic; on failure,
  reload placements.
- Expose `boardMeals` (active meals sorted by placement, then created_at) — derive from
  `meals` + `plannedMealCounts` + placements; no new query for "active."

**`App.js`** (`view === "plan"` block)
- Replace the placeholder sentinel with the real control row `[n this week] [+]` and
  move `controlRowRef` onto it.
- Board section above `MealsLens`: ordered cards, dashed empty strip, remove, drag.
- `MealsLens` unchanged.

**Drag implementation** — keep it boring: pointer events, long-press (≈350ms) to lift,
translateY on the lifted card, reorder on drop. No new dependency. Don't reuse
`SwipeToRemove`'s horizontal machinery; the board is vertical.

---

## Verification (deployed dev preview, real auth, real data)

1. **Add = board:** Add a meal from the library → its ingredients land on Shop **and** a
   card appears at the end of the board. One tap, both effects.
2. **Count agrees:** the board card's `×n` and the library stepper show the same number;
   `[n this week]` equals the number of board cards.
3. **Reorder persists and is shared:** drag a card up; reload → order holds; a second
   account on the same household sees the same order without reloading (poll or realtime,
   whichever the meals path already uses).
4. **Remove (unshared)** → items leave Shop, card leaves the board.
5. **Remove (shared — the Bread case)** → shared item stays on Shop, unshared items go.
   (Re-run of the 08-21 verification; it must still hold from the board's affordance.)
6. **Never un-buys:** mark a meal's item bought, remove the meal → bought item untouched.
7. **Re-add appends:** remove a meal, add it again → it lands **last**, not in its old slot.
8. **Empty board is present:** remove every meal → the dashed strip shows; page shape
   stable; the control row still reads `[0 this week] [+]`.
9. **Helm contract:** the pill is identical at rest; compacts exactly when the control row
   crosses the 8px band; the pill's `+` and the row's `+` both open New meal. Re-run helm
   checks 1–3 headless on dev.
10. **Missing placement is harmless:** delete a placement row by hand for an active meal →
    it renders last, no error; drag it → it gets a row.
11. **Table read-back:** `relacl` on `meal_placements` = `authenticated` SELECT/INSERT/UPDATE
    only; `anon` nothing; both FKs `CASCADE`; RLS on; 3 policies, no DELETE.
12. Console clean.

**Done when:** all twelve pass on dev. Prod is a separate gate — migration first, then the
client by the `578f0b6` pattern, then #1, #3 and #11 re-run against prod.

---

## DECISIONS (for ROADMAP)

| date | decision + rationale |
|---|---|
| 2026-09-12 | **Board ships as v1; Board \| Days is v2.** Reaffirms 08-20; the v2 mockup exists, so v1 can leave the lens slot empty without guessing its shape. |
| 2026-09-12 | **Placement is ordered, not x/y** — `meal_placements (household_id, meal_id, sort_order)`, one row per (household, meal). Order is a property of the plan, not the recipe; per-household not per-cycle because the board carries across wrap-ups. |
| 2026-09-12 | **Reserve `planned_for` + `slot` for v2, don't add them now.** External plans address meals by day *and* occasion; the placement row is where that lands the moment we accept it. |
| 2026-09-12 | **Placements have no cleanup.** Upsert-append on add; board renders active meals only; inactive rows are inert. Same shape as derived-active and per-item notes. |
| 2026-09-12 | **Plan control row is `[n this week] [+]`** in Shop's grammar with the lens slot empty; it is the D9′ sentinel. |
| 2026-09-12 | **Long-press is drag, never a door.** Platform convention; a tap opens the meal. |
| 2026-09-12 | **Import from an external plan is the first OurChef seam with a real use case** → LATER, behind the unit/quantity doc and a matching step. Nutrition is out of scope. |

---

## Build prompt for Claude Code

> Build the single-surface PLAN, v1 (Board only), per
> `handoff/SPEC_meal_planning_v1_board.md`. The 08-20 backend (`removeMealFromList`,
> `deleteMeal`, `plannedMealCounts`) is already shipped — do not rebuild it. Scoped commits
> in this order: (1) migration `meal_placements` — assign the next free number, apply to
> dev by hand, read back `relacl` / `pg_policies` / FK actions and paste them into the
> commit body; (2) `useProvisions.js` — load placements Plan-only, append-on-add, `reorderBoard`,
> `boardMeals`; (3) `App.js` — the `[n this week] [+]` control row with `controlRowRef` moved
> onto it, the board with dashed empty state and remove, then drag as its own commit.
> Walk the twelve verification items on the dev preview and read #11 back from the table.
> Nothing to prod this session. Stop and ask if `planned_for`/`slot` seem needed — they
> are deliberately absent.
