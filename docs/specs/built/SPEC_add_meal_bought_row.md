# SPEC — `add_meal_to_list`: a live bought row must not be un-bought

**Scope:** OurProvisions
**Status:** Design approved 2026-09-13. Ready for BUILD. **Prod-bound** — this is a live
shared-list correctness bug on prod.
**Touches:** `add_meal_to_list` RPC body only (signature unchanged — the `045` four-arg
form with `p_include_on_hand_ids`). One migration, number assigned at build (`048`
expected — verify `migrations/` first).
**Repro of record:** 2026-09-13, MADBURY, Mozzarella Cheese `1155788d` — Cody's
read-back and fresh walk (dev). Attribution rests on the `026` trigger's `WHEN` clause
(could not fire — `deleted_at` was null), the surviving Pizza link, and the row
`updated_at` matching the Taco Night link `created_at` to the microsecond.

---

## The bug

`add_meal_to_list` upserts each ingredient into `list_items`. Its `ON CONFLICT DO UPDATE`
branch (045, lines ~142–148) does:

```sql
SET quantity   = CASE WHEN list_items.deleted_at IS NOT NULL THEN EXCLUDED.quantity   -- tombstone: reset
                      ELSE list_items.quantity + EXCLUDED.quantity END,               -- live: increment
    status     = 'pending',
    deleted_at = NULL,
```

`status = 'pending'` is unconditional. That's right for a tombstone and for a live
pending row. For a **live row that is already bought** it does two wrong things at once:

1. **Un-buys it.** The household's purchase is erased from the list (Shop went from
   "1 of 2 in cart" to "0 of 3").
2. **Double-counts it.** `quantity` goes 1 → 2, so the shopper sees "Mozzarella ×2" with
   one already in the fridge and buys two.

Walk: Add Pizza → buy mozzarella → Add Taco Night. Mozzarella: `quantity 2, pending`.
Same result in the other order. This also flips the Pizza board card from ready back to
"to buy" — that symptom is fixed separately by `ready_at` in the board amendment; this
spec is the list side only.

---

## The fix — a three-way branch on the conflicting row

| conflicting row | quantity | status | notes |
|---|---|---|---|
| tombstoned (`deleted_at` not null) | `EXCLUDED.quantity` | pending | as today; `026` trigger clears stale links |
| live, `status = 'pending'` | `list_items.quantity + EXCLUDED.quantity` | pending | as today |
| **live, `status = 'bought'`** | **`EXCLUDED.quantity`** | **pending**, `checked_by = NULL` | **new.** The row becomes the *new need*, not the old purchase plus the new need |

Why `EXCLUDED.quantity` and not `old + new`: the household already has one. The new meal
needs its own. What remains to buy is exactly what the new meal contributes. The earlier
purchase is not lost — it is in `list_item_events` as a `checked` event, which is where
ground truth lives (046).

Why the row still goes pending at all (rather than "already on hand, nothing to buy"):
the list can't yet tell whether the bought unit is still in the house, and one live row
can't be "1 bought, 1 to buy" (`uq_live_list_item`). Assuming the shelf covers the new
meal would silently under-buy; making the new need visible over-asks by at most the
on-hand unit and is correctable by the shopper. **Prefer visible over silent.** The real
answer is the "in the house" model — see Deferred.

Everything else in the function is unchanged: cycle stamping, the `list_item_meals`
upsert (`quantity_contributed` + `add_count` move together), `on_hand` skip logic (044/045).

---

## The known cost — ledger vs row

After the bought branch, the row's `quantity` (1) is below the sum of its links'
`quantity_contributed` (2). The ledger records what each meal *asked for*; the row records
what is *still needed*. This gap already exists today for any bought row (removal never
un-buys, so a bought meal's contribution is never subtracted) — but this is the first
time a **pending** row sits below its ledger sum. So the decrement/removal paths must be
walked, not assumed:

- `decrement_meal_from_list` / `removeMealFromList` use `quantity_contributed`. After the
  fix, decrementing the second meal must take the row to **0 and remove it — never
  negative**. Decrementing the first (already-bought) meal must do what it does today for
  a bought contribution on a pending row: confirm on the live DB what that is, and that it
  can't take the row negative. If either clamps wrong, fix the clamp (`GREATEST(0, …)`) in
  the same migration and say so in the commit body.

---

## Migration + promotion

- `CREATE OR REPLACE FUNCTION add_meal_to_list(...)` with the **same four-arg signature**
  as 045. Do NOT change the signature — `037` is why (a new arg = a second function, not
  a replacement). Keep `SECURITY DEFINER`, `SET search_path` (034), and the existing
  grants; re-state them in the migration so a read-back proves them.
- Dev first. Read back `pg_get_functiondef` and confirm exactly one `add_meal_to_list`
  in `pg_proc`.
- Prod after dev verification passes, by the `578f0b6` pattern: migration first, no
  client change needed (the signature and return are unchanged, so the deployed bundle
  keeps working).

---

## Verification (dev, real auth; then re-run 1–3 on prod)

1. **Bought stays bought — quantity is the new need:** Add Pizza → buy mozzarella → Add
   Taco Night → row is `quantity 1, pending, checked_by null`; Shop shows "Mozzarella ×1,
   For Pizza & Taco Night". The `checked` event from the purchase is still in
   `list_item_events`.
2. **Order-independent:** same walk, Taco Night first → same result.
3. **Pending still increments:** Add Pizza → (don't buy) → Add Taco Night → `quantity 2`.
   Unchanged behaviour.
4. **Tombstone still resurrects:** remove mozzarella by swipe → Add a meal that needs it →
   `quantity = contributed`, links reset by `026`. Unchanged behaviour.
5. **Decrement after the fix:** from state (1), decrement Taco Night → row goes to 0 and
   leaves; never negative. Then decrement Pizza from a fresh (1) state → no negative row,
   no error. Report what happens to the bought contribution.
6. **Same meal twice:** Add Pizza twice on a bought mozzarella → `quantity 1` after the
   first re-add (bought branch), `2` after the second (pending branch). `add_count` and
   `quantity_contributed` both move each time.
7. **Function read-back:** one `add_meal_to_list` in `pg_proc`, SECURITY DEFINER,
   `search_path` pinned, grants as before.
8. Console clean.

**Done when:** 1–8 pass on dev; then 1–3 and 7 re-run on prod after the migration.

---

## Deferred — "in the house" (the successor model, not this fix)

The right fix is a row that can be *neither to-buy nor gone*: a bought row survives wrap-up
as "in the house" until the next add for that item, and that add checks the shelf — met
from it (nothing to buy) or topped up (only the shortfall goes pending). That dissolves
this bug instead of branching around it, and it is the first real "what's in the house."

Not now, because it changes what the list *is* — a third row state that every reader has
to understand (Shop, Home, wrap-up counts, waste tracking, the `026` trigger) — and
because without a consumption signal the shelf goes stale: a week-old "in the house"
mozzarella may be gone, and a claim the app can't back teaches people not to trust it
(the false-removal-banner lesson). **Naming:** do not call it `on_hand` — that name is
taken by `meal_ingredients.on_hand` (044, "usually in the pantry, skip unless included"),
which is a *recipe-level default*, not a *shelf state*. This is the quantity-accounting
session's design; the 2026-09-13 mozzarella walk is its test case.

---

## DECISIONS (for ROADMAP)

| date | decision + rationale |
|---|---|
| 2026-09-13 | **A live bought row is never un-bought by an add.** `add_meal_to_list` branches three ways on conflict: tombstone resets, pending increments, **bought becomes the new need** (`quantity = contributed`, pending). Prefer visible over-ask to silent under-buy. Prod-bound. |
| 2026-09-13 | **"In the house" is the successor model**, owned by the quantity-accounting session; named distinctly from `meal_ingredients.on_hand`. The mozzarella walk replaces the hypothetical bread scenario as its test case. |

---

## Build prompt for Claude Code

> Build `handoff/SPEC_add_meal_bought_row.md`. Route it to `docs/specs/active/`. One
> migration, next free number, `CREATE OR REPLACE` on the existing four-arg
> `add_meal_to_list` — same signature, same SECURITY DEFINER and search_path, grants
> re-stated. Only the `ON CONFLICT DO UPDATE` branch changes: add the live-bought case
> (`quantity = EXCLUDED.quantity`, pending, `checked_by = NULL`). Apply to dev by hand,
> read back `pg_get_functiondef` and the `pg_proc` count, paste into the commit body.
> Walk verification 1–8 on the dev preview under real auth — #5 (decrement after the fix)
> is the one that can surprise; report exactly what the bought contribution does. Nothing
> to prod until Dan says so. Do not run SESSION END.
