# SPEC — Board v1, amendment 2: the board is a queue (membership from placements)

**Scope:** OurProvisions
**Status:** Design approved 2026-09-13. Ready for BUILD (dev). Follows the board build
(`047`, commits `292749b..cbfefc7` + the "Ready to cook" follow-up).
**Amends:** `SPEC_meal_planning_v1_board.md` (2026-09-12). That spec's storage decision,
control row, drag rules and reservations all stand. What changes: **where board membership
comes from**, and **how a card leaves**.
**Companion:** `SPEC_add_meal_bought_row.md` — the list-side fix for the same walk. Build
that first; it's prod-bound and independent.

---

## What the first walk found

Two things, both from Dan's 2026-09-13 walk on dev:

1. **Wrap up erased the plan.** Board membership was derived from the list ("has list
   rows"). Wrap up closes the cycle and the rows go with it — so the moment Pizza was fully
   shopped, the moment it was most planned, its card vanished. Backwards.
2. **"Ready to cook" regressed when another meal touched a shared ingredient.** Derived live
   from row status, Pizza's readiness couldn't survive Taco Night re-opening the mozzarella
   row. (The list side of that is `SPEC_add_meal_bought_row.md`; this spec fixes the board side.)

Dan's correction on the label: **putting an item in the cart is an in-store action, not a
kitchen fact.** "Ready to cook" mid-trip overclaims. Readiness is earned at Wrap up.

The 08-20 simplification — planned = active = on the list — existed so v1 needed no table.
`047` gave it a table. That reason expired.

---

## The model

**The board is a queue of open placements.** A meal is on the board iff its
`meal_placements` row is open (`cooked_at IS NULL`). Position 0 is *up next*. The drag
order is the plan; the list only supplies each card's *state*.

**Card state is derived from the list; card membership is not.**

| card shows | when |
|---|---|
| `2 of 4 in cart` (or `4 to buy`) | placement open, `ready_at` null — the meal still has pending rows this cycle |
| `Ready` | `ready_at` set — set at **Wrap up** for every open placement whose ingredients are all bought (or that had no pending rows) |
| — | never "Ready to cook" from an in-cart tap; the in-store label is only the count |

**A card leaves the board by a tap, never by side effect.**
- **Cooked it** — on a `Ready` card. Sets `cooked_at`. Card leaves; next card rises.
- **X (skip)** — on any card. Closes the placement (`cooked_at` stays null,
  `skipped_at` set). On a to-buy card it also zeros the meal's pending rows via the
  existing `removeMealFromList` (as built). On a Ready card it only closes the placement.
  Cooked vs skipped is recorded because that's the consumption signal —
  intention (list) → ground truth (receipt) → **outcome (cooked)**.
- Wrap up, stepper decrements, and other meals' adds never remove a card.

**Re-add reopens.** Adding a meal whose placement is closed (`cooked_at` or `skipped_at`
set) clears both, clears `ready_at`, and appends (`max+1`). Append-on-add holds. A stepper
bump on an open card keeps its slot (as built — a servings change is not a re-plan).

**Home reads the head of the queue as *Up next*.** Behaviour before label: without a day
the eyebrow is *Up next*, never *Tonight*. "Tonight" is earned in Days v2 when
`planned_for = today`. HOME v1 is its own build; this spec only guarantees its data: the
first open placement by `sort_order`, its state, and (Galley Phase B) its cook time.

**Honest disagreement that is correct:** after Wrap up the library stepper shows *Add*
(nothing on the list) while the board shows Pizza *Ready*. Different facts — the list is
what's left to buy, the board is what's planned. Walk it once; if it reads wrong on the
phone, the library card gets a "planned" tick, not the other way round.

---

## Schema delta (one additive migration, number at build — `049` expected after 048)

```sql
alter table public.meal_placements
  add column ready_at   timestamptz null,
  add column cooked_at  timestamptz null,
  add column skipped_at timestamptz null;
```

No policy change (SELECT/INSERT/UPDATE to authenticated already; still no DELETE — rows
close, they don't die). `planned_for` and `slot` remain **reserved and absent**.

**Where `ready_at` gets set — the one server-side touch:** at Wrap up, alongside cycle
close, for the household's open placements whose meal has zero pending rows. Put it in
the cycle-close RPC path (the `038` family) rather than the client, so a wrap-up from
either device stamps it once. If the close path is a client sequence today, stamp it in
the same call chain immediately after close and say so in the commit — but prefer the RPC.
`cooked_at` / `skipped_at` are client writes (one row, own household, RLS covers it).

---

## Build scope (delta)

**Migration** — three nullable columns; `ready_at` stamping at cycle close.

**`useProvisions.js`**
- `boardMeals` source flips from "has list rows" to "placement open" (`cooked_at IS NULL
  AND skipped_at IS NULL`), ordered by `sort_order`. Card state from `plannedMealCounts` /
  provenance + `ready_at`.
- `markCooked(mealId)`, `skipMeal(mealId)` — the two exits. `skipMeal` on a to-buy card
  calls `removeMealFromList` first, then closes.
- Add path: on re-add of a closed placement, clear `ready_at`/`cooked_at`/`skipped_at`
  and append.
- Expose `upNext` — the head of the open queue — for Home.

**`App.js`**
- Card: count label while to-buy; `Ready` after wrap-up; **Cooked it** on Ready cards;
  X on all. No "Ready to cook" mid-trip.
- Remove the fully-bought → "Ready to cook" derivation from the follow-up commit; readiness
  is `ready_at` only.

---

## Verification (dev, real auth, two accounts)

1. **Wrap up keeps the plan:** Add Pizza → buy all → Wrap up → Pizza still on the board,
   card reads *Ready*, `ready_at` set; the list is empty; library stepper reads *Add*.
2. **Readiness is earned at Wrap up, not in-cart:** buy all of Pizza's items *without*
   wrapping up → card reads `4 of 4 in cart`, not Ready. `ready_at` null.
3. **Readiness survives a shared-ingredient add:** with `SPEC_add_meal_bought_row.md`
   applied, Pizza Ready (post-wrap-up) → Add Taco Night → Pizza stays Ready; Taco Night
   is to-buy; mozzarella ×1 pending.
4. **Cooked it:** tap on the Ready card → `cooked_at` set, card gone, next card is head.
   Second account sees it within a poll tick.
5. **Skip, to-buy card:** X → pending rows zeroed (shared rows stay if another meal needs
   them — the Bread case), `skipped_at` set, card gone.
6. **Skip, Ready card:** X → `skipped_at` set, list untouched, card gone.
7. **Re-add reopens and appends:** after 4 or 5, Add the meal again → placement open,
   timestamps cleared, card is last.
8. **Stepper bump keeps slot:** + on an open card → count changes, position unchanged.
9. **Up next:** `upNext` equals the top card; reorder → it changes.
10. **Never un-buys / never removes by side effect:** Wrap up, another meal's add, and a
    stepper decrement never remove a card.
11. **Column read-back:** three new nullable columns, policies unchanged, no DELETE.
12. Console clean.

**Done when:** all twelve pass on dev. Prod is a separate gate (migration first, then
client), taken with `048` or after it — never before.

---

## Deferred (with reasons)

- **Days v2** — now *smaller*: optional day pins on queue items and the earned "Tonight."
  The queue does the planning; days add precision.
- **"In the house"** — bought rows surviving wrap-up as a shelf state. The successor to
  the bought-row RPC branch; owned by the quantity-accounting session (see the companion
  spec's Deferred). Not `on_hand` — that name is a recipe-level default (044).
- **Library "planned" tick** — only if the stepper-says-Add / board-says-Ready disagreement
  reads wrong on a real walk.
- **Cook-time on the card** — Galley Phase B.

---

## DECISIONS (for ROADMAP)

| date | decision + rationale |
|---|---|
| 2026-09-13 | **Board membership comes from placements, not the list.** The 08-20 "derived, not stored" rule existed to avoid a table; `047` is the table. Wrap up erasing the plan was the proof. |
| 2026-09-13 | **The board is a queue.** Position 0 is up next; Home shows it as *Up next* — *Tonight* is earned in Days v2. Days shrinks to optional precision. |
| 2026-09-13 | **Readiness is earned at Wrap up** (`ready_at`), never at an in-cart tap. Cart is a store action, not a kitchen fact. |
| 2026-09-13 | **Cards leave by a tap** — Cooked it (`cooked_at`) or skip (`skipped_at`); never by wrap-up, decrement, or another meal's add. Cooked-vs-skipped is recorded as the outcome half of the consumption signal. |
| 2026-09-13 | **Re-add reopens and appends;** stepper bump keeps slot. |

---

## Build prompt for Claude Code

> Build `handoff/SPEC_meal_planning_v1_board_queue.md` after `SPEC_add_meal_bought_row.md`
> is on dev. Route it to `docs/specs/active/`. Commits: (1) migration — three nullable
> columns on `meal_placements` plus `ready_at` stamping at cycle close (prefer the RPC
> path; say where it landed); (2) hook — board from open placements, `markCooked`,
> `skipMeal`, re-add reopen, `upNext`; (3) App — card states and the two exits, and
> remove the in-cart "Ready to cook" derivation from the follow-up commit. Walk the twelve
> items on dev under real auth with two accounts. Nothing to prod. Do not run SESSION END.
