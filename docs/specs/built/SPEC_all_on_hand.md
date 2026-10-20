# SPEC — All on hand: a meal you don't need to shop for is ready

*Design chat, 2026-10-19. For Claude Code. Dev first. Likely migration 064.*

---

## Why

Today, choosing **Add to Shop** and marking every item "I have this" adds nothing to the list, and the meal loops back to "Add to Shop" on every surface. The only exit is the hidden freezer-pizza Cooked it in the board's ⋯ menu.

What it should mean: **everything is already in the house, there's no trip, so the meal is ready to cook.** That fits Dan's C2 rule exactly: no trip exists, so no wrap-up is skipped.

**Longer-term, this is a moment worth celebrating** (Dan, 2026-10-19). Once OurProvisions has a good view of inventory, planning the next few dinners without going to the store is healthier, happier and kinder to the earth: Velayo's thesis in one moment. This change makes that moment work correctly today and records it so Phase 4 can celebrate it later.

## Decisions

**D1 — "All on hand" stamps the placement Ready, on the server.**
- `add_meal_to_list` sets `ready_at = now()` on the meal's open placement when **all** of these are true:
  - an open placement exists (`cooked_at` and `ready_at` both null);
  - the meal has at least one ingredient;
  - the call adds **zero** rows because every ingredient was on hand or skipped;
  - the meal has **no** live linked rows on the list afterwards.
- It's done in the RPC, so the add and the stamp are one atomic step.
- **Every reader follows with no screen changes.** The board, Home's deck and the recipe view already read `ready_at` → "Everything's in — go cook" plus Cooked it, which satisfies C2.
- **Replanning starts over:** the stamp belongs to this placement, and a new placement starts unstamped.
- `close_cycle` only stamps placements where `ready_at` is null, so it leaves these alone. Confirm this.

**D2 — The meaning of `ready_at` widens (record in ARCHITECTURE).**
`ready_at` = *the moment this meal became cookable*: either at wrap-up (every item bought or removed), or at Add to Shop when everything was on hand. The wrap-up principle still holds: no surface offers a shortcut around a **trip**; this path just has no trip.

**D3 — Mark the moment; keep the signal for Phase 4.**
- The toast that currently reads "Nothing added — you have it all on hand" becomes **"Everything's on hand — no trip needed."**
- Record the moment so Phase 4 (savings and earth-kind gamification) can count no-trip meals later. Step 0 decides how: an existing event log if the app has one, otherwise the smallest durable marker you'd recommend (e.g. a `ready_source` value). **Build no counter or UI for it now.**

**D4 — Take "Remove" out of the on-hand prompt (pending Dan's confirmation in Step 0).**
- The prompt asks one question, *do you need to buy this?*, so it should have two answers: **Buy it / I have it**.
- Today its per-item "Remove" **deletes the ingredient from the recipe**, which is a trap. Changing a recipe belongs in Edit.
- Step 0 reports exactly what Remove does today and where else it's used, then waits for Dan's yes.

## Step 0 — Read-only report, then stop

1. The current `add_meal_to_list` definition on dev and on prod: its signature, what it returns, and how it decides on-hand vs include. Check the two databases match.
2. How `confirmOnHandPrompt` calls it and handles the result; the prompt's default (every item skipped) and its Remove path.
3. Whether the RPC can see the placement (its RLS / `SECURITY DEFINER` context) and safely set `ready_at`. Show the proposed 064 diff.
4. Any reader or analytics that assumes `ready_at` came from wrap-up (e.g. shopping-session learning, `close_cycle`, metrics). List each one, or say there are none.
5. D3: the event log question, and your recommendation.
6. D4: the facts above.

## Step 1 — Build (after Dan's go)

- **Migration 064 on dev:** `CREATE OR REPLACE add_meal_to_list` with the same signature and the same ACL. Include a VERIFY row (the function's ACL is unchanged, and a dry-run case stamps `ready_at`).
- Client: the D3 toast copy, the D3 signal, and the D4 prompt change if approved.
- **Tests:**
  - all on hand → stamped and Cooked it on all four surfaces;
  - partly on hand → normal To-buy (state B), not stamped;
  - replan → unstamped;
  - Remove from This Week on a stamped meal → state D;
  - `ReplayLabels` still clean.
- ESLint 0, `CI=true` clean, LF line endings. Harness the prompt at 320 / 375 / 390, Default and XXL.

## Dev walk (Dan)

1. Plan the Pizza meal → Add to Shop → "I have it" for all four items → the toast reads "Everything's on hand — no trip needed." The board, Home and the recipe view all show "Everything's in" with **Cooked it**.
2. Plan a meal → mark half of it on hand → normal "{n} left to buy". Nothing is stamped.
3. Cooked it on the all-on-hand meal → Last cooked today. Replan it → back to Add to Shop.
4. The prompt shows only Buy it / I have it (if D4 is approved). The recipe's ingredients are untouched.

## Done when

- [ ] Step 0 is reported and Dan has given his go (including D4).
- [ ] 064 is on dev and verified; all four surfaces agree in every case above.
- [ ] The `ready_at` meaning is recorded in ARCHITECTURE, and the Phase 4 signal is recorded in ROADMAP.
- [ ] Dan's dev walk passes. Prod is a later promotion, with 064 applied before the client.
