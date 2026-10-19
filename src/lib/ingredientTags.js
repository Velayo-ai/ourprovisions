// Ingredient tags for the recipe view (SPEC_recipe_view Amendment A2 + A2-R,
// 2026-10-18): "do we have it?", answered per row only while the meal is on
// This Week and not yet cooked. Pure, so the truth table is jest-proven.
//
// `link` is this meal's list_item_meals link for the ingredient's catalog item,
// as the per-meal read built it (null when the meal never put it on the list):
//   { status: 'pending' | 'bought', deletedAt, quantity, linkCreatedAt,
//     buyerUserId }   — buyerUserId is the latest `checked` event at or after
//                        linkCreatedAt with no later `unchecked`; null when the
//                        event write (best-effort) never landed.
// Soft-deleted bought rows count (A2-R §2): home from the store is after wrap-up.
//
// The first matching row wins (A2):
//   1  bought for this meal (status bought, live or archived)
//        solo household          → "Bought"
//        buyer is the viewer     → "You bought it"
//        buyer is a member       → "{First name} bought it"
//        no qualifying event     → "Bought"            (never guess a person)
//   2  on the list, not bought (live pending row with quantity) → "On the shopping list"
//   3  meal_ingredients.on_hand                                 → "Already have it"
//   4  anything else                                            → null
export function ingredientTag({ onWeek, link, onHand, viewerUserId, solo, firstNameOf }) {
  if (!onWeek) return null;
  if (link && link.status === "bought") {
    if (solo) return { kind: "bought", text: "Bought" };
    const buyer = link.buyerUserId || null;
    if (!buyer) return { kind: "bought", text: "Bought" };
    if (viewerUserId && buyer === viewerUserId) return { kind: "bought", text: "You bought it" };
    const name = firstNameOf ? firstNameOf(buyer) : "";
    return { kind: "bought", text: name ? `${name} bought it` : "Bought" };
  }
  if (link && link.status === "pending" && !link.deletedAt && (link.quantity || 0) > 0) {
    return { kind: "list", text: "On the shopping list" };
  }
  if (onHand) return { kind: "have", text: "Already have it" };
  return null;
}

// The line under INGREDIENTS (A2): "{n} · {k} on the shopping list" while any
// row is still to buy, "{n} · All here" once none is — k is the board's own
// count (live rows minus the cart), so "All here" lands in the same render as
// the pill's Cooked it. Off This Week it is the bare count.
export function ingredientSummary({ n, onWeek, leftToBuy }) {
  if (!onWeek) return `${n}`;
  return leftToBuy > 0 ? `${n} · ${leftToBuy} on the shopping list` : `${n} · All here`;
}

// The buyer of one list item from its checked / unchecked events, newest
// first: the latest event decides; a `checked` at or after the link's
// created_at names its user, anything else names nobody.
export function buyerFromEvents(events, linkCreatedAt) {
  if (!events || events.length === 0) return null;
  const latest = events[0];
  if (latest.event_type !== "checked") return null;
  if (linkCreatedAt && latest.created_at < linkCreatedAt) return null;
  return latest.user_id || null;
}

export default ingredientTag;
