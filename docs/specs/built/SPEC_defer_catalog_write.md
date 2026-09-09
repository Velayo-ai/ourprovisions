# SPEC — Defer catalog write until Save (meal builder)

**Status:** active
**Scope:** OurProvisions, client-only (no migration)
**Origin:** raised while testing on-hand ingredients (2026-09-06 session), scoped
in conversation, never drafted until now (2026-09-08).

---

## The bug

`createCatalogItem` (in `useProvisions.js`) is the single shared resolver both
meal-builder ingredient paths call:

- **Manual "no results" path** (`createAndStage` in `App.js`'s `MealSheet`) —
  tapping a category pill on an unmatched typed ingredient.
- **AI path** (`handleAskAI`'s ingredient loop) — each ingredient in a returned
  draft that doesn't match an existing catalog item.

Both call it **immediately**, once per unmatched ingredient, the moment the
pill is tapped or the draft returns — not when the user commits the meal.
`createCatalogItem` calls `insert_custom_catalog_item` synchronously and
writes a real, live `catalog_items` row (migration 018's idempotent-reuse
logic prevents *duplicate* rows on repeat, but does nothing here — a
genuinely new name still mints a new row on first mention, every time).

If the user then taps **Cancel** instead of **Save Meal**, that catalog row
is left behind: no meal references it, no list item references it, nothing
points to it. It just sits in the household's catalog permanently.

**This reproduces on both paths independently** — a cancelled AI draft with
2 unmatched ingredients orphans 2 rows; a manual create-meal session where
someone tries three ingredient names before abandoning the sheet orphans 3.

## Why this matters

Violates the standing principle already in `ARCHITECTURE.md`:

> **★ Naming is claiming.** A machine-created resource may be silently
> cleaned up *only* while it is provably unclaimed — never named, never
> stocked, never shared, and created in the same session — and only at a
> user-initiated pivot moment.

An orphaned catalog row is exactly the unclaimed case that principle
describes — except right now nothing does the cleanup. It just persists
silently, forever, polluting Browse/search results for the household with
items nobody actually wanted.

## The fix — stage client-side, write on Save

Move the catalog-item *creation* into the same local-state staging that
already governs everything else in the meal sheet (name, ingredients,
quantities — per `SPEC_create_meal_ui.md`, "nothing writes to the DB until
Save commits"). Catalog items were the one piece of that flow that broke the
rule; this brings them into it.

### Truth table — what should happen per path × outcome

| Path | Outcome | Current behavior | Fixed behavior |
|---|---|---|---|
| Manual, new name | Save | RPC already fired pre-save; row exists, meal references it | RPC fires at Save; row created, meal references it |
| Manual, new name | Cancel | Row orphaned, never cleaned up | No RPC ever fires; nothing to clean up |
| AI draft, new ingredient | Save | RPC already fired pre-save; row exists, meal references it | RPC fires at Save; row created, meal references it |
| AI draft, new ingredient | Cancel | Row orphaned, never cleaned up | No RPC ever fires; nothing to clean up |
| Either path, name matches existing catalog item | either | No RPC call (existing-match short-circuit already skips it) | Unchanged — this case was already correct |

### Shape of the change

`createCatalogItem`'s existing-match short-circuit (exact-normalized match
against `catalogRef`, then against the hidden set) stays exactly as-is — that
logic is correct today and doesn't touch the RPC.

What changes: when no match is found, **don't call the RPC**. Instead return
a client-only staged placeholder — a plain object shaped enough like a real
catalog row for the sheet's local state to hold it (`{ name, category,
is_global: false, __pending: true }`, no `id` yet, or a temporary local id if
the staging list needs one to key React rows). The sheet already stages rows
by `catalog_item_id`; pending rows need a way to be recognized as "not a real
id yet" so Save knows which ones still need the RPC call.

At Save time, before (or as part of) `createMeal`/`updateMeal`: walk the
staged ingredient rows, and for every row still carrying a pending
placeholder instead of a real catalog id, call `insert_custom_catalog_item`
then, in order, and substitute the real id before building the
`meal_ingredients` insert payload. Only then commit the meal.

### What does NOT change

- The idempotent-reuse behavior in `insert_custom_catalog_item` itself
  (migration 018/019) — untouched, still the right backstop for genuinely
  concurrent/repeated real writes.
- `delete_custom_catalog_item` — no new cleanup RPC needed; if nothing is
  ever written on cancel, there's nothing to delete.
- The "isNew" badge logic (`wasKnown` snapshot) — still works the same way,
  it just needs to key off "was this name found in the existing catalog
  snapshot," which is unaffected by when the RPC actually fires.

### Confirmed: this is the ONLY no-results panel — no separate Browse flow

There is no distinct Browse-level "no results" add-item panel outside the
meal builder. `MealSheet`'s no-results panel (`App.js`, the component
`createAndStage` belongs to) is the only one, and it is already fully
covered by this spec — both create-meal's manual path and the AI path are
inside the same `MealSheet`. Nothing else to check or fix separately.

### A load-bearing comment this spec deliberately overturns

`MealSheet`'s header comment (`App.js` ~line 907-911) currently reads:

> "The whole draft lives in local state: nothing touches `meals` or
> `meal_ingredients` until Save. The ONE exception is creating a brand-new
> catalog item from the no-results panel, **which must persist immediately
> so the meal can reference its id** — that writes `catalog_items` only,
> never `list_items`."

That reasoning is correct *today* — a staged row can currently only hold a
real `catalog_item_id`, so the only way to get one is to write it
immediately. This spec removes that constraint (staged rows can hold a
placeholder until Save resolves it), which means the stated exception no
longer needs to exist. **Build must update or remove this comment** — after
the fix ships, "the whole draft lives in local state" becomes true without
exception, and a comment describing an exception that no longer exists will
mislead the next person who reads it. This isn't cleanup; the comment is
currently the single place in the codebase that documents *why* the bug's
behavior was considered acceptable, so leaving it unedited would contradict
the code around it.

## Open questions to resolve before/at build

1. **Save-time RPC failure mid-loop.** If the meal has 3 pending ingredients
   and the 2nd `insert_custom_catalog_item` call fails, what happens to the
   1st (already-created) row and the meal as a whole? Two options:
   - Accept the partial state (1st row now exists but unclaimed if the meal
     save itself is then aborted) — reintroduces a smaller version of the
     original bug.
   - Wrap the whole Save in a single transaction so a mid-loop failure rolls
     back any catalog rows already created this Save. Cleaner, but changes
     Save from "a sequence of RPC calls" to "needs a single transactional
     RPC" — larger surface than a pure client-side staging change.

   **Recommendation:** don't solve this speculatively — `insert_custom_catalog_item`
   failing mid-Save should be rare (it's a simple insert), and the current
   codebase's general error-handling pattern (surface via `setError`, let the
   user retry) may be an acceptable interim answer. Flag as a known residual
   risk rather than blocking the fix on it.

2. **Pending-row shape.** Exact fields the placeholder object needs so
   existing render code (item name, category, quantity stepper) doesn't
   choke on a missing `id`. Decide at build time by reading how staged rows
   are actually rendered today.

## Verification (deployed dev preview, not localhost)

1. Open create-meal, type an unmatched ingredient name, tap a category pill
   to stage it. **Before Save**, query `catalog_items` directly (Supabase
   dashboard or SQL) for that name in the household — confirm **no row
   exists yet**.
2. Tap **Cancel**. Re-query — confirm still no row. This is the core fix:
   the orphan is gone because the write never happened.
3. Repeat steps 1, but this time tap **Save Meal**. Re-query — confirm the
   row **now exists**, and the new `meal_ingredients` row references its
   real id (not a placeholder).
4. Repeat with the AI path: ask for a suggestion that includes at least one
   ingredient not already in the household's catalog, cancel without
   saving, confirm no orphaned row. Then repeat and save, confirm the row
   lands correctly.
5. Confirm the existing-match path is unaffected: type/suggest an
   ingredient name that already matches a real catalog item, confirm no RPC
   call happens at any point (Save or Cancel) — Network tab, zero
   `insert_custom_catalog_item` calls for that name.
