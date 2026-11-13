# SPEC — Meal Planning v2: Pick, Commit, Cook

**Scope:** OurProvisions
**Status:** Design approved 2026-09-21, ready for BUILD
**Supersedes (UI only):** `SPEC_meal_planning_v1_board_planned.md` — the schema it built (047 → 052) is unchanged and LIVE ON PROD. This spec is a client redesign plus one additive migration.
**Copy amendment 2026-09-21 (build):** "Add to list" → **"Add to Shop"** wherever it appeared (card button, header button, Plan toast, the no-shop foot line). Capital S — it names the tab. "See on list" is unchanged; the subtitle became the ladder below later the same day.
**Mockups:** Design canvas "OurProvisions — Plan: Pick, Commit, Buy" (5 artboards: Board deciding / Board all-on-list / Board after-Wrap-up / Library / Board with leftovers & eating out). Reference-quality render at `docs/mockups/reference/` once Cody files it.

---

## Why this exists

The board shipped plan-first (052) with **two ways on** — Add (locks in + places) and Plan (places only) — side by side on every library card. Beta feedback and a design pass found: two buttons for one intention, "Lock in" reading as an irreversible commitment when it isn't, teal on six controls per screen so it meant nothing, a rail + colour block + text making three columns at phone width (the 430px wrap bug already in ROADMAP), and no way to plan a night that needs no groceries.

v2 fixes all of that without touching the queue model. **Nothing in 047–052 changes.** The board is still `meal_placements` in `sort_order`; the list still supplies each card's state; `ready_at` is still earned at Wrap up.

---

## The mental model (put this in the app's vocabulary everywhere)

**Meals → Board → List → Cook.**
The library is where you decide *what*. The board is where you decide *when*. The list handles what you need. Then the app gets out of the way.

One verb per door:

| door | the one action | what it touches |
|---|---|---|
| Library | **Plan** | `meal_placements` only (`planMeal`) |
| Board, Planned card | **Add to Shop** | `add_meal_to_list` (`lockIn` — internal name unchanged) |
| Board subtitle | **add to Shop →** | `lockInAll`, shown only when N ≥ 2 |
| Shop | Wrap up | unchanged |
| Board, Ready card | **Cooked it** | `cooked_at` |

---

## Decisions locked

| # | Decision | Rationale |
|---|---|---|
| 1 | **Library card has ONE action: Plan.** Add is removed from the library. | Two intentions (pick, commit) happen at different moments; two buttons on one card is UI for a state machine. The double-tap cost is absorbed by Add-all on the board. |
| 2 | **"Lock in" → "Add to Shop"** in all copy. `lockIn` / `lockInAll` keep their names in the hook. | It is literally the same action as adding an item, so it gets the same word. "Lock in" implied finality the action doesn't have. Copy change only — no churn in the hook or in 050/052's comments. |
| 3 | **Mid-trip meal adds stay realtime — no gate, no confirm, no warning.** | A meal add during an open session behaves exactly as a manual item add; the list is live and a meal is a faster way to type N items. Revisit only on observed friction; the tell is items added mid-session that go unbought and roll. |
| 4 | **Teal = the household finished something.** Wrap up in Shop; Cooked it (and its ✓ Cooked afterglow) on the board. Nothing else — no teal on Plan, Add to Shop, filters, links, chips, or counts. | Scarcity by *when*, not by count. A screen of teal after Wrap up is the reward, not dilution. This closes the button-colour question open since 2026-08-20. |
| 5 | **Numbered tile replaces rail + colour block.** One tile per card carries `01` + rail word (Up next / Then / Later) on the meal's colour. Card is two columns. | The block read as a missing photo; the number makes its absence designed and reinforces drag order. Fixes the 430px wrap. A household photo later slides *under* the number — the number is an overlay, not the tile. |
| 6 | **Cooked it leaves the Planned card.** Planned card has one button (Add to Shop); Cooked it and the future recipe sheet live behind ⋯. | The rare path (freezer pizza) was sitting at equal weight to the common one, and two buttons didn't fit at 390px. |
| 7 | **No-shop placements — Leftovers and Eating out.** They hold a night, never touch the list, never become Ready, have no outcome action. × is the only exit. | People who map every night need them. No Cooked it / Ate out until someone asks — that's future analytics, not v2. |
| 8 | **No-shop cards are `meals` rows with `kind`, not a nullable `meal_id` on placements.** | See Architecture — the placements PK is `(household_id, meal_id)` and every reader keys on `meal_id`. Reversal of the design-chat lean; the PK decides it. |
| 10 | **PLAN is a week-of-food board, not a meal planner** (2026-09-21). Every card is a plan for a night; some plans need provisions. Meals, Leftovers, Eating out and Something else are **kinds** of plan, not states. States stay three. | Falls out of the no-shop cards: once two kinds existed, a third ("Something else") cost one CHECK value, and the model reads cleaner with kinds orthogonal to states. |
| 11 | **The board shows no destructive control at rest on a meal card** (2026-09-21). Remove lives behind ⋯; the card's face carries one primary action and the drag grip. No-shop cards keep × because it is their only action. | A week of food should read as plans, not as things to delete. The rare path goes one tap deeper; the common one stays on the face. |
| 12 | **A state chip shows only while the state is incomplete** (2026-09-21): PLANNED and TO BUY. Ready has no chip — the banner and the teal button carry it. | A chip that says "done" is decoration; the teal button already says it. |
| 13 | **Cooked it mutes the card in place until the next board load** (2026-09-21). The placement closes via `cooked_at` exactly as before; upNext, counts and numbering exclude it at once; only the rendered card lingers, at 55%, as ✓ Cooked. **The board remains what's left to cook** — the week's record is a Home/history feature (ROADMAP NEXT), not the queue. | Tapping Cooked it and watching the card vanish reads as a mistake; a moment of afterglow confirms the act without turning the queue into a log. |
| 9 | **Photos stay out.** The library's optional image seam stays; nothing in v2 renders one. | Prove the interaction as type, colour, state and motion first. |

---

## The board — states and copy

| state | when (unchanged from 052) | tile | chip | line | actions |
|---|---|---|---|---|---|
| **Planned** | open placement, no live rows, `ready_at` null | meal colour | PLANNED (muted) | Not on the list yet | **Add to Shop** (outline) · ⋯ (Remove · Cooked it · Open recipe) |
| **To buy** | ≥1 live pending row | meal colour | TO BUY (muted) | "N to buy" / "B of N in cart" | **See on list** (outline) · ⋯ (Remove · Open recipe) |
| **Ready** | `ready_at` set | meal colour | — (no chip: a state chip shows only while the state is incomplete) | Everything's in — go cook | **Cooked it** (teal fill) · ⋯ (Remove · Open recipe) |
| **Cooked** (this board load only) | `cooked_at` set by Cooked it during this load | tile + text at 55% opacity, ✓ in place of the number, no rail word | — | — | **✓ Cooked** (teal outline, disabled) · no grip, no ⋯, no drag. Excluded from upNext, counts and numbering at once; leaves on the next board load |

A meal card's right side is exactly: **chip + grip** on the top row, **action + ⋯** on the bottom row. **No destructive control at rest on a meal card** — Remove lives behind ⋯ (rule logged 2026-09-21). No-shop cards keep their × (it is their only action) and have no ⋯.
| **Leftovers** | `meals.kind = 'leftovers'`, open placement | cream `#EFE9DE`, espresso text, word LEFTOVERS under number; dashed card | — (no chip, no state line) | "From Chicken Curry" / "From Chicken Curry, Pizza" / "From Chicken Curry, Pizza + 1" over `from_meal_ids`, or nothing | × · grip · drag |
| **Eating out** | `meals.kind = 'out'`, open placement | cream, word EATING OUT | — | `meals.name` if given ("Oak House"), else nothing | × · grip · drag |
| **Something else** | `meals.kind = 'other'` (057), open placement | cream, word = the name uppercased, cut at ~10 chars; OTHER when blank | — | title = the free text ("soccer", "Mom's", "takeout", "no idea yet"), else "Something else"; no line | × · grip · drag |

**Header:**
- Title *This Week*. Subtitle = the count ("meals" when every open placement is a meal, "nights" once any no-shop card exists) plus the batch action, as a ladder (N = Planned meals with ingredients):
  - N ≥ 2: `"{n} nights · {N} meals to add to Shop →"` — **"add to Shop →"** is one tap target (underlined, espresso, 44px invisible padding); calls `lockInAll`.
  - N = 1: `"{n} nights · 1 meal to add to Shop"` — plain text, no link; the card's own Add to Shop is the affordance.
  - N = 0, any To buy: `"{n} nights · Everything's in Shop ✓"`.
  - all meals Ready: `"{n} nights · ready"`.
  - no meals at all: `"{n} nights"`.
  No "still". (Amended 2026-09-21.)
- Right side: **+ Meals** (outline) → library, **always** — the board must never lose its door to more meals. The header follows the Browse/Shop pattern: it is the door's control row and the compact sentinel — when it scrolls off, the nav collapses and its + does what the header's + does (on Plan, open the library). The subtitle carries the count and the batch action ("4 nights · 2 meals to add to Shop →" — the ladder above). **No bar of any kind, and no action on the drag prose** — the batch action lives in the subtitle ladder above. The prompt stays two lines: *What sounds good next?* / *Drag meals into the order you want them.* (Amended 2026-09-21, five passes: the first build swapped + Meals for Add-N and left no entry to the library once anything was planned; the second put both in the header; the third had a full-width sand bar; the fourth an outline row; the fifth a link on the drag prose. Premium here means less.)
- Prompt under header: *What sounds good next?* / *Drag meals into the order you want them.* Only when ≥ 1 open placement.

**Banners** (replace the prompt when true):
- All open meals To buy, none Planned: sand, check mark — *All set for the week* / *Everything you need is on your list.*
- All open meals Ready: teal tint, teal check — *Everything's in. Go cook.* / *{N} meals stocked and ready.*
- No-shop cards don't count toward either condition.

**Rail words** by position: 0 → *Up next*; 1..n-2 → *Then*; last → *Later*. Single card → *Up next*. Two cards → *Up next*, *Then*.

**Foot of board:** three dashed buttons **+ Leftovers** / **+ Eating out** / **+ Something else**, and the line *None of these add anything to Shop — they just hold the night.*

**Toasts:**
- Plan (library): *Planned. Add to Shop from the board when you're ready.* with a BOARD action.
- Add to Shop (single): *{Meal} added. {n} items on the list.*
- Add all: *{M} meals added. {n} items on the list.* with a SHOP action.

**Empty board:** keep today's empty state; add the three dashed buttons under it.

**Tile colour:** derived from `meals.category` (hash → one of six house tones) until a stored per-meal colour exists. Same meal, same tone, in the library and on the board. Six tones: espresso `#6f5a45`, sand `#C9A97A`, clay `#A0724A`, stone `#9a9384`, olive `#5f6b4f`, slate `#7d8fa0`. Text on each tile is whichever of `#FAF4EC` / `#2C1A0E` passes 4.5:1. **No-shop kinds (leftovers / out / other) never take a meal tone:** one cream tile, `#EFE9DE` with espresso text — colour means food to cook.

---

## The library

- Header: *Meal Library* / *Discover. Save. Plan for your week.* Back chevron to the board. No "This Week" chip (the board is one tap away and the nav tab is already lit).
- Row card: category tile (word, no number) · name · "{min} · {n} ingredients" · one round **+** (Plan). A meal already on the board shows a small ON THE BOARD tag on the tile and a disabled +.
- Filters: All · Favorites · Made before · Ours. **Favorites needs data that doesn't exist — ship the pill disabled or omit it** (build call; note it). Made before = any closed placement with `cooked_at` for that meal. Ours = `meals.household_id` = active household.
- Ask AI card unchanged. AI-built meals land **Planned** like everything else (same door).
- Every control is espresso/outline. No teal anywhere in the library.

---

## Architecture

### Migrations `055_meals_kind.sql` + `056_meals_from_meal_ids.sql` + `057_meals_kind_other.sql` — additive, dev first, then prod as one promotion

(Spec originally said 053; 053/054 were already taken at build time.)

```sql
-- 055
alter table meals
  add column kind text not null default 'meal'
    check (kind in ('meal', 'leftovers', 'out')),
  add column from_meal_id uuid null
    references meals(id) on delete set null;

-- 056 (amended 2026-09-21): leftovers can name MORE THAN ONE source meal
alter table meals add column from_meal_ids uuid[] null;
update meals set from_meal_ids = array[from_meal_id] where from_meal_id is not null;
alter table meals drop column from_meal_id;

-- 057 (amended 2026-09-21): a fourth kind of plan, "Something else"
alter table meals drop constraint meals_kind_check;
alter table meals add constraint meals_kind_check check (kind in ('meal', 'leftovers', 'out', 'other'));
```

- **`from_meal_ids` carries no FK, deliberately.** Postgres cannot enforce a foreign key over array elements, so 055's `on delete set null` has no equivalent. Harmless by construction: `deleteMeal` is a soft delete, the client resolves ids against the household's live meals and skips any it cannot find, and the caption is a caption, not a join. `null` is the one "none" (never `[]`).

- **Why on `meals`, not `meal_placements`:** placements' PK is `(household_id, meal_id)`; RLS, cascade, `placements[mealId]` in the hook, `upNext`, reorder, `deleteMeal` all key on `meal_id`. A nullable `meal_id` means a new surrogate PK on a table that is live on prod. A `meals.kind` is one column and one `WHERE`.
- Each no-shop card is its **own** `meals` row: `household_id` = the household, `kind`, `name` ("Leftovers" / "Oakhouse" / "Eating out"), `from_meal_ids` (0..n) for leftovers, no `meal_ingredients`, `instructions` null. Created and placed in one client action (`planNoShop(kind, name?, fromMealIds?)` → insert meal → `appendPlacement`).
- **Kinds, not states.** PLAN is a week-of-food board: every card is a plan for a night, and some plans need provisions. `meal`, `leftovers`, `out`, `other` are kinds of plan; the three states (Planned / To buy / Ready) belong to `meal` alone. `other`'s free text lives in `meals.name` (blank stores the label "Something else"); everything else about no-shop rows applies to it unchanged.
- **Library filter:** every library read adds `kind = 'meal'`. Miss this and Leftovers rows show up as recipes.
- **× on a no-shop card:** `skipped_at` on the placement **and** `deleted_at` on the meals row in the same action. They are one-shot; nothing should be able to re-add them. Because `kind` is on the row, a skipped leftovers night stays distinguishable from a skipped dinner in the data.
- **Readiness is already safe.** 052's condition requires ≥ 1 `list_item_meals` link into the closing cycle. A no-shop meal has no links, so `close_cycle` never stamps it. No change to `close_cycle`; no `kind` check needed there. (Do not add one — 052's body is the prod body and the 051 rule applies.)
- `fetchMealProvenance` is untouched — no-shop meals never appear in it.
- **Made before** filter: `exists (select 1 from meal_placements where meal_id = meals.id and cooked_at is not null)`. Read-only; no schema.
- `planned_for` / `slot` remain **reserved and absent**.

### Hook — `src/hooks/useProvisions.js`

- `planNoShop(kind, name, fromMealIds)` — new. Insert `meals` row, then `appendPlacement`. Return the meal id.
- `fetchLeftoverCutoff()` — new, on demand when the Leftovers sheet opens: the start of the earlier of the household's two most recent cycles ("cooked in the last two cycles"); `null` = no cycle yet = no cutoff.
- `skipPlacement(mealId)` — existing × path. Add: if the meal's `kind !== 'meal'`, also soft-delete the meals row.
- `loadMeals` — add `.eq('kind', 'meal')` for the library set; keep a second read (or a join on placements) so the board can render no-shop rows. The board's meal lookup must include all kinds; the library's must not.
- `lockIn` / `lockInAll` — unchanged. Guard: never callable on a no-shop meal (no ingredients → `add_meal_to_list` would no-op, but don't reach it).
- `madeBefore` derived set for the filter.

### App.js

- Library card: remove Add; single + calls `planMeal`. Disabled with ON THE BOARD tag when an open placement exists.
- Board card: new two-column layout per the states table. Planned → Add to Shop; To buy → See on list; Ready → Cooked it. ⋯ holds Remove, Cooked it (Planned only), Open recipe; a meal card shows no × at rest.
- Header logic per "The board" above. **Lock in all button hidden at M = 0** (already true; keep).
- No-shop foot buttons → `planNoShop`. Leftovers opens a one-field sheet: a **multi-select (checkboxes, no minimum)** over the board's open meals + meals with `cooked_at` in the last two cycles. Eating out opens a one-field sheet: optional place name. Something else opens a one-field sheet: a free name (soccer, Mom's, takeout, no idea yet).
- Meal cards: nothing functional removed, but tightened — one line of vertical rhythm between name / chip / line / button; the grip sits in the title row (× only on no-shop cards, same grey). No new decoration.
- Rename every "Lock in" string. `grep -n "Lock in" src/` must return nothing when done.
- Colour: replace teal on Plan / Add / filters / links / chips with espresso or outline. Teal only on Cooked it / ✓ Cooked and the stocked banner. No READY chip (amended 2026-09-21).

---

## Out of v2 (deferred, none require rework)

- Days / `planned_for` — the rail vocabulary holds to ~6 cards; at 7 it wants real days. That's Days v2 arriving on its own evidence.
- Outcome actions on no-shop cards (Ate out, Had leftovers) — wait for someone to ask.
- Expiry of no-shop cards at Wrap up — ship × only; watch whether boards clutter.
- Reservation indicator on Eating out (manual → calendar-aware → booked) — ROADMAP idea (17), v2/3.
- Favorites — needs a table; decide per-user vs per-household when it's next.
- Stored per-meal colour, meal photos, prep-minutes field.
- Drag-from-library (SwipeToRemove owns those rows' pointer handling — unchanged).
- Board-card tap → read-only recipe sheet (already on the record from 09-14).

---

## Verification (deployed dev preview, two accounts, real auth)

1. **Library has one action.** Plan places at `max+1`; nothing lands on Shop. Toast points at the board. The card reads ON THE BOARD with + disabled.
2. **Add to Shop from the board** puts the meal's rows on Shop, card goes To buy. Toast with item count.
3. **add to Shop →** (subtitle, N = 2) runs both Planned cards in queue order, one toast, link gone at N = 0. Subtitle reads "Everything's in Shop ✓". Sand banner appears.
4. **Mid-trip add:** account B plans + adds a meal while account A has an open session. Items appear on A's list live, no prompt on either side.
5. **Wrap up** → every locked-in card Ready, teal banner *Everything's in. Go cook.* A card that was Planned (never added) stays Planned — 052 holds.
6. **Cooked it** closes the placement; the next card becomes Up next; numbers renumber. The cooked card mutes in place (✓ Cooked, teal outline, disabled, grip hidden) until the next board load, then leaves.
7. **Leftovers:** foot button → sheet → card 0N with LEFTOVERS and "From Porterhouse". Not in the library. Never on Shop. Survives Wrap up unchanged (not Ready). × removes it; the meals row is soft-deleted; it cannot be re-added.
8. **Eating out** the same with a place name and without.
9. **Header counts:** "4 meals" with only meals; "6 nights" once a no-shop card exists.
10. **Colour audit:** with the board in Planned/To buy states, zero teal on Plan, Board, Library. After Wrap up, teal on Cooked it (then ✓ Cooked) and the banner only. Shop's Wrap up unchanged.
11. **430px:** no card wraps or overlaps in the desktop frame (the ROADMAP bug).
12. `grep -rn "Lock in" src/` → nothing. Console clean.

**Done when:** all twelve pass on dev with two accounts; 053 applied on dev with its VERIFY select read back; prod promotion (053 + client) held for a fresh-eyes day per the 09-20 rule.
