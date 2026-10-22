// The recipe view's plan action (SPEC_recipe_view D9 / D9a), as a pure mapping
// over boardCardState's flags so it can be proven in jest without App.js.
// Lifted out on 2026-10-18 after the first phone check: Ground Beef Tacos read
// "TO BUY · 10 to buy" on the board and "Cooked it" in the view. The view had
// the board's exact inputs and the same derivation; the mapping tested
// `!canAdd` before `toBuy`, and canAdd is false for every To-buy card (it is
// "planned AND has ingredients"), so a To-buy meal fell into the Cooked it
// branch. The rule is now stated in the order the spec states it:
//   null state       not on This Week          → "add"     + Add to This Week
//   null state + cookedBefore                  → "cooked"  + Plan again — a meal with any cook
//                    (Dan, 2026-10-21: A5's "Cooked → + Plan again" is the meal's history, not
//                    this load; before this, reopening the view after the afterglow ended read
//                    "+ Add to This Week" for a meal that just read "+ Plan again")
//   cooked           cooked this load          → "cooked"  + Plan again (A5 revision: acts,
//                                                          the same handler as Add)
//   ready            everything is in          → "cookIt"  Cooked it (teal)
//   toBuy, 0 left    everything is in the cart → "wrapUp"  Wrap up → (Amendment C, 2026-10-19:
//                                                          supersedes A5 / R1 — a meal is ready to
//                                                          cook only after wrap-up; the nudge opens
//                                                          Shop, where the wrap-up ritual lives)
//   toBuy            still to buy              → "toBuy"   "{n} left to buy · See list"
//   planned, canAdd  on the week, not on Shop  → "onWeek"  (Amendment B: the action block
//                                                          offers Add to Shop here)
//   planned, !canAdd nothing to shop for       → "cookIt"  Cooked it (teal)
// Cooked it is never offered while anything is still to buy (D9a), nor before
// wrap-up (Amendment C2): only Ready, or nothing to shop for. Every pill acts;
// information lives in text (A5 revision, 2026-10-18).
export function planActionFor(state, { cookedBefore = false } = {}) {
  if (!state) return cookedBefore ? "cooked" : "add";
  if (state.cooked) return "cooked";
  if (state.ready) return "cookIt";
  if (state.toBuy) return leftToBuy(state) === 0 ? "wrapUp" : "toBuy";
  if (state.planned && !state.canAdd) return "cookIt";
  return "onWeek";
}

// The board's own number: live rows for the meal minus those in the cart
// (boardCardState's rc — "{n} to buy" / "{b} of {n} in cart"), one source.
export function leftToBuy(state) {
  const rc = state?.rc || { total: 0, bought: 0 };
  return Math.max(0, (rc.total || 0) - (rc.bought || 0));
}

// THE ACTION BLOCK (SPEC_recipe_view Amendment B + Step 0 rulings, 2026-10-19). Three
// parts, by state: a status line that never acts, ONE main action, and a quiet remove
// link worded as the board's own ⋯ → Remove. Built on planActionFor, so the main action
// is the D9 mapping above — B2 with no exception since Amendment C (everything in the
// cart nudges to wrap up, as the board card does); the soft half of the status line and
// the remove wording come from the same board flags.
//   null / cooked          → no status, no remove; "add" / "cooked" (+ Plan again)
//   planned, canAdd        → ✓ On This Week                        · Add to Shop        · week
//   toBuy, n left          → ✓ On This Week                        · {n} left · See list · shop
//   toBuy, 0 left (C1)     → ✓ On This Week · All in your cart     · Wrap up →          · shop
//   ready                  → ✓ On This Week · Everything's in      · Cooked it          · week
//   planned, !canAdd (R2)  → ✓ On This Week · Nothing to shop for  · Cooked it          · week
export const REMOVE_LABEL = {
  week: "Remove from This Week",
  shop: "Remove (and take its items off Shop)",
};
export function recipeBlockFor(state, opts = {}) {
  const action = planActionFor(state, opts);
  if (!state || state.cooked) return { onWeek: false, soft: null, action, remove: null };
  const soft = state.ready ? "Everything's in"
    : state.toBuy ? (leftToBuy(state) === 0 ? "All in your cart" : null)
    : !state.canAdd ? "Nothing to shop for"
    : null;
  return {
    onWeek: true,
    soft,
    action: action === "onWeek" ? "addToShop" : action,
    // R3: the board's ⋯ → Remove words, keyed on the same flag its handler takes.
    remove: state.toBuy ? "shop" : "week",
  };
}

export default planActionFor;
