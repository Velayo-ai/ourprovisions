# SPEC — Board v1, amendment 3: plan first, lock in later

**Scope:** OurProvisions
**Status:** Design approved 2026-09-14. Ready for BUILD (dev).
**Amends:** `SPEC_meal_planning_v1_board_queue.md` (050, commits `4fe94a4..8419cf6`).
Everything there stands. This adds one state before "to buy" and two affordances.

---

## The model, in Dan's words

> When a member selects Add and quantity two, they are driving the building of a
> shopping list. When they put a meal on the board, that object — while associated with
> the meal — is not itself driving the shopping list. Its function is to identify that a
> meal is planned, with or without other meals, during a period of time.

So planning and shopping are separate acts. Today the only way onto the board is Add,
which does both at once. That stays — if you're shopping for it you're planning it. The
new path is the reverse: **plan the week first, look at it, then lock in the groceries —
one meal at a time or all together.**

This is also the "no-shop meal" from the 08-20 deferred list, arriving without a type
system: freezer pizza is a Planned card you never lock in and then mark Cooked.

---

## Card lifecycle

```
Planned ──lock in──► To buy ──(store)──► in cart ──Wrap up──► Ready ──Cooked it──► gone
   │                   │  ▲                                     │
   │                   └──┘ − to zero unlocks back to Planned   │
   └────────────── Cooked it (never locked: freezer pizza) ─────┘
   any state ── X (skip) ──► gone
```

| card state | means | label | affordances |
|---|---|---|---|
| **Planned** | placement open, no links this cycle, `ready_at` null | *Not on the list yet* | **Lock in**, Cooked it, X |
| **To buy** | ≥1 pending row | *3 to buy* → *2 of 3 in cart* | X (stepper lives in the library) |
| **Ready** | `ready_at` set | *Ready* | Cooked it, X |

**Board header gains `Lock in all`** when ≥1 card is Planned. It calls the same add path
per card, in queue order, default quantity 1. Cards already locked are untouched. This is
the shop-the-week batch button from the 08-20 deferred list — deferred then because
nothing needed it; needed now because Planned exists.

**Rules that change:**

- **`ready_at` is stamped only for cards that were locked in.** 050 stamps every open
  placement with "no pending row on any link *or no links at all*." The second clause is
  now wrong: a Planned card that was never locked must not become Ready by a wrap-up it
  took no part in. Condition becomes: open placement **AND ≥1 `list_item_meals` link in
  the closing cycle** AND none of those links' rows pending. Freezer pizza stays Planned
  until Cooked it.
- **Stepper − to zero unlocks, doesn't remove.** Already true after 050 (verification #10
  showed "Not on the list"); now it's the intended state with a name and a Lock in button.
- **Cooked it appears on Planned cards** (was Ready only). Not on to-buy cards.
- **Count hidden at zero.** Cody's ×0 note — a Ready or Planned card shows no count.
  The count is a list fact; when the list has nothing for the meal there's nothing to say.

**Rules that don't change:** library Add auto-places and locks; re-add reopens and
appends; add on an open Ready card clears `ready_at` and keeps its slot; `deleteMeal`
closes as skipped; skip keeps `ready_at` as history (Cody's call, confirmed).

---

## How to plan without adding

Two ways onto the board without touching the list, both creating an open placement at
`max+1` and nothing else:

1. **Library card → "Plan"** — a secondary affordance beside Add. Small text button, not a
   second primary. On a phone this is the one that gets used.
2. **Drag from library onto the board** — desktop/tablet nicety; ships if the existing
   pointer machinery makes it cheap, otherwise deferred without guilt. The tap path is the
   contract.

No schema change: Planned is derivable (open placement, no links this cycle). No new
columns, no new RPC. The `ready_at` condition change is a body edit to `close_cycle`
(ride it on the `SPEC_close_cycle_authorization.md` migration if that lands first;
otherwise its own).

---

## Build scope

**`close_cycle`** — `ready_at` condition tightened (above). Read-back in the commit.

**`useProvisions.js`**
- `planMeal(mealId)` — placement only.
- `lockIn(mealId)` — the existing add path for a card already on the board (keeps slot).
- `lockInAll()` — `lockIn` over Planned cards in queue order; one toast at the end
  ("4 meals on the list"), not one per meal.
- Card state derivation: Planned / To buy / Ready as tabled.

**`App.js`**
- Library card: **Plan** beside Add (hidden when the meal is already on the board).
- Board card: state label per table; Lock in on Planned; Cooked it on Planned + Ready;
  no count at zero.
- Board header: `Lock in all` when any card is Planned.

---

## Verification (dev, real auth, two accounts)

1. **Plan without add:** Plan Pizza from the library → card on the board, *Not on the list
   yet*, list untouched, `list_item_meals` has no Pizza link.
2. **Lock in one:** Lock in on the Pizza card → ingredients on the list, card reads
   *4 to buy*, slot unchanged, library stepper shows 1.
3. **Lock in all:** Plan three meals → Lock in all → all three locked in queue order, one
   toast, shared ingredients merged (the mozzarella row says *For Pizza & Taco Night*, ×1
   owned per 049).
4. **Unlock by stepper:** − to zero on a locked card → rows leave the list (shared rows
   stay if another meal owns them), card returns to *Not on the list yet*, keeps slot.
5. **Never-locked card is not promoted:** Plan Pizza, don't lock, Wrap up another meal's
   trip → Pizza still Planned, `ready_at` null.
6. **Locked card is promoted:** Lock in, buy all, Wrap up → *Ready*, `ready_at` set.
7. **Cooked it on Planned:** freezer pizza — Plan, then Cooked it → `cooked_at` set, gone.
8. **No count at zero:** Ready and Planned cards show no ×n.
9. **Plan hidden when planned:** a meal on the board shows no Plan button in the library.
10. **Second account** sees Planned / locked / Ready transitions within a poll tick.
11. Read-backs: `close_cycle` body, and the 049 invariant on every pending row at the end.
12. Console clean.

**Done when:** all twelve pass on dev. Prod as one promotion with 048–050, after the
authorization fix (`SPEC_close_cycle_authorization.md`) has gone first.

---

## DECISIONS (for ROADMAP)

| date | decision + rationale |
|---|---|
| 2026-09-14 | **Planning and shopping are separate acts.** Add still does both; the board gains plan-first: Plan → Lock in (one / all) → Ready → Cooked. The board's object identifies that a meal is planned in a period; it never drives the list on its own. |
| 2026-09-14 | **Readiness requires having been locked in.** A never-locked card is not promoted by a wrap-up it took no part in. |
| 2026-09-14 | **Stepper − to zero unlocks, never removes** — "changed my mind about shopping" and "changed my mind about cooking" are different gestures. |
| 2026-09-14 | **No-shop meals need no type.** Planned + Cooked it covers freezer pizza and leftovers. "Lock in all" is the shop-the-week button, arriving because Planned exists. |
| 2026-09-14 | **Count hidden at zero** — the count is a list fact. |

---

## Build prompt for Claude Code

> Build `handoff/SPEC_meal_planning_v1_board_planned.md` on dev, after
> `handoff/SPEC_close_cycle_authorization.md`. Route both to `docs/specs/active/`.
> Commits: (1) `close_cycle` — `ready_at` stamped only for placements with ≥1 link in the
> closing cycle and none pending (ride on the 051 migration if it's the same pass, say so);
> (2) hook — `planMeal`, `lockIn`, `lockInAll`, Planned/To buy/Ready derivation;
> (3) App — Plan beside Add in the library (hidden when planned), Lock in / Lock in all,
> Cooked it on Planned + Ready, no count at zero. Drag-from-library only if the existing
> pointer code makes it cheap; otherwise leave it and say so. Walk the twelve items with
> two accounts. Nothing to prod. Do not run SESSION END.
