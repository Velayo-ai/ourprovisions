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
export function ingredientTag({ onWeek, link, onHand, viewerUserId, solo, firstNameOf, addedThisPlan = true }) {
  if (!onWeek) return null;
  // Re-plan edge (A2 follow-up, 2026-10-18): a bought row counts for THIS cook
  // only when its purchase is inside the window — boughtInWindow false means the
  // link and its purchase predate the meal's last cook, so the row falls through.
  // Backstop (2026-10-18 correction): no "bought" tag at all unless THIS plan was
  // added to Shop — at least one link made after the meal's most recent cook. A
  // meal that is not on the list this time round had nothing bought for it.
  if (addedThisPlan && link && link.status === "bought" && link.boughtInWindow !== false) {
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

// The line under INGREDIENTS (A2, corrected 2026-10-18): "{n} · {k} on the
// shopping list" while any row is still to buy, "{n} · All here" once none is
// — BOTH only when this plan was added to Shop (addedThisPlan); a planned meal
// never added shows just "{n}", and so does one off This Week. k is the
// board's own count (live rows minus the cart), so "All here" lands in the
// same render as the pill's Cooked it. A meal with no ingredients shows no
// count at all (the section does not render).
export function ingredientSummary({ n, onWeek, leftToBuy, addedThisPlan = true }) {
  if (!(n > 0)) return "";
  if (!onWeek || !addedThisPlan) return `${n}`;
  return leftToBuy > 0 ? `${n} · ${leftToBuy} on the shopping list` : `${n} · All here`;
}

// Was THIS plan added to Shop? At least one of the meal's links was created
// at or after the meal's most recent cook (any link counts when never cooked).
export function wasAddedThisPlan(links, lastCookedAt) {
  return (links || []).some((l) => !!l.linkCreatedAt && (!lastCookedAt || l.linkCreatedAt >= lastCookedAt));
}

// The buyer of one list item from its checked / unchecked events, newest
// first: the latest event decides; a `checked` at or after the window's start
// names its user, anything else names nobody.
export function buyerFromEvents(events, windowStart) {
  if (!events || events.length === 0) return null;
  const latest = events[0];
  if (latest.event_type !== "checked") return null;
  if (windowStart && latest.created_at < windowStart) return null;
  return latest.user_id || null;
}

// Row 1's window starts at the LATER of the link's created_at (the Add-to-Shop
// moment, A2-R §1) and the meal's most recent cook (meal_cooks) — the re-plan
// edge (2026-10-18): a meal re-planned without being re-added keeps its old
// link, and a purchase made for the previous cook must never read as bought
// for this one. ISO strings compare as text.
export function rowWindowStart(linkCreatedAt, lastCookedAt) {
  if (!lastCookedAt) return linkCreatedAt || null;
  if (!linkCreatedAt) return lastCookedAt;
  return lastCookedAt > linkCreatedAt ? lastCookedAt : linkCreatedAt;
}

// Does a bought row count for THIS cook, and who bought it? Known-inside when
// the link itself was made after the last cook (any purchase on it is later),
// or when a checked event sits at or after the window's start. A row whose
// link predates the last cook with no event after it is a purchase for the
// previous cook — not row 1.
export function boughtForThisMeal({ status, linkCreatedAt }, events, lastCookedAt) {
  if (status !== "bought") return { boughtInWindow: false, buyerUserId: null };
  const start = rowWindowStart(linkCreatedAt, lastCookedAt);
  const buyerUserId = buyerFromEvents(events, start);
  const latest = events && events[0];
  const checkedInWindow = !!latest && latest.event_type === "checked" && (!start || latest.created_at >= start);
  const linkInWindow = !lastCookedAt || !linkCreatedAt || linkCreatedAt >= lastCookedAt;
  return { boughtInWindow: linkInWindow || checkedInWindow, buyerUserId };
}

export default ingredientTag;
