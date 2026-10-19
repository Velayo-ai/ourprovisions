// The recipe view's plan action (SPEC_recipe_view D9 / D9a), as a pure mapping
// over boardCardState's flags so it can be proven in jest without App.js.
// Lifted out on 2026-10-18 after the first phone check: Ground Beef Tacos read
// "TO BUY · 10 to buy" on the board and "Cooked it" in the view. The view had
// the board's exact inputs and the same derivation; the mapping tested
// `!canAdd` before `toBuy`, and canAdd is false for every To-buy card (it is
// "planned AND has ingredients"), so a To-buy meal fell into the Cooked it
// branch. The rule is now stated in the order the spec states it:
//   null state       not on This Week          → "add"     + Add to This Week
//   cooked           cooked this load          → "cooked"  ✓ Cooked (inert)
//   ready            everything is in          → "cookIt"  Cooked it (teal)
//   toBuy            still to buy              → "toBuy"   To buy (inert text)
//   planned, canAdd  on the week, not on Shop  → "onWeek"  ✓ On This Week (un-plans)
//   planned, !canAdd nothing to shop for       → "cookIt"  Cooked it (teal)
// Cooked it is never offered while anything is to buy (D9a).
export function planActionFor(state) {
  if (!state) return "add";
  if (state.cooked) return "cooked";
  if (state.ready) return "cookIt";
  if (state.toBuy) return "toBuy";
  if (state.planned && !state.canAdd) return "cookIt";
  return "onWeek";
}

export default planActionFor;
