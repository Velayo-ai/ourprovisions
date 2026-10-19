// The recipe view's plan action (SPEC_recipe_view D9 / D9a), as a pure mapping
// over boardCardState's flags so it can be proven in jest without App.js.
// Lifted out on 2026-10-18 after the first phone check: Ground Beef Tacos read
// "TO BUY · 10 to buy" on the board and "Cooked it" in the view. The view had
// the board's exact inputs and the same derivation; the mapping tested
// `!canAdd` before `toBuy`, and canAdd is false for every To-buy card (it is
// "planned AND has ingredients"), so a To-buy meal fell into the Cooked it
// branch. The rule is now stated in the order the spec states it:
//   null state       not on This Week          → "add"     + Add to This Week
//   cooked           cooked this load          → "cooked"  + Plan again (A5 revision: acts,
//                                                          the same handler as Add)
//   ready            everything is in          → "cookIt"  Cooked it (teal)
//   toBuy, 0 left    everything is in the cart → "cookIt"  Cooked it (A5 revision: when n
//                                                          reaches 0 the pill follows D9,
//                                                          in the same render as "All here")
//   toBuy            still to buy              → "toBuy"   "{n} left to buy · See list"
//   planned, canAdd  on the week, not on Shop  → "onWeek"  ✓ On This Week (un-plans)
//   planned, !canAdd nothing to shop for       → "cookIt"  Cooked it (teal)
// Cooked it is never offered while anything is still to buy (D9a). Every pill
// acts; information lives in text (A5 revision, 2026-10-18).
export function planActionFor(state) {
  if (!state) return "add";
  if (state.cooked) return "cooked";
  if (state.ready) return "cookIt";
  if (state.toBuy) return leftToBuy(state) === 0 ? "cookIt" : "toBuy";
  if (state.planned && !state.canAdd) return "cookIt";
  return "onWeek";
}

// The board's own number: live rows for the meal minus those in the cart
// (boardCardState's rc — "{n} to buy" / "{b} of {n} in cart"), one source.
export function leftToBuy(state) {
  const rc = state?.rc || { total: 0, bought: 0 };
  return Math.max(0, (rc.total || 0) - (rc.bought || 0));
}

export default planActionFor;
