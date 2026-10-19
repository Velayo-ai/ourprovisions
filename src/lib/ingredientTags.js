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
// Soft-deleted bought rows count (A2-R §2): home from the store is after wrap-up —
// those read "bought"; a live bought row is still in the cart ("cart vs bought").
//
// The first matching row wins (A2; "cart vs bought" correction, 2026-10-18 — a
// check puts an item in the cart, wrap-up is the purchase):
//   1  bought for this meal — archived as bought at wrap-up (status bought, deleted_at set)
//        solo household          → "Bought"
//        buyer is the viewer     → "You bought it"
//        buyer is a member       → "{First name} bought it"
//        no qualifying event     → "Bought"            (never guess a person)
//   2  in the cart — checked on the open trip, not wrapped up (status bought, live row)
//        solo household          → "In cart"
//        checker is the viewer   → "In your cart"
//        checker is a member     → "In {First name}'s cart"
//        no qualifying event     → "In cart"
//   3  on the list, not bought (live pending row with quantity) → "On the shopping list"
//   4  meal_ingredients.on_hand                                 → "Already have it"
//   5  anything else                                            → null
export function ingredientTag({ onWeek, link, onHand, viewerUserId, solo, firstNameOf, addedThisPlan = true }) {
  if (!onWeek) return null;
  // Re-plan edge (A2 follow-up, 2026-10-18): a bought row counts for THIS cook
  // only when its purchase is inside the window — boughtInWindow false means the
  // link and its purchase predate the meal's last cook, so the row falls through.
  // Backstop (2026-10-18 correction): no "bought" tag at all unless THIS plan was
  // added to Shop — at least one link made after the meal's most recent cook. A
  // meal that is not on the list this time round had nothing bought for it.
  if (addedThisPlan && link && link.status === "bought" && link.boughtInWindow !== false) {
    // Rows 1 and 2 share the window and the buyer resolution; only the wording differs.
    // A live bought row is in the cart (checked on the open trip); an archived one
    // (deleted_at set at wrap-up) was bought.
    const inCart = !link.deletedAt;
    const kind = inCart ? "cart" : "bought";
    const nameless = inCart ? "In cart" : "Bought";
    if (solo) return { kind, text: nameless };
    const buyer = link.buyerUserId || null;
    if (!buyer) return { kind, text: nameless };
    if (viewerUserId && buyer === viewerUserId) return { kind, text: inCart ? "In your cart" : "You bought it" };
    const name = firstNameOf ? firstNameOf(buyer) : "";
    if (!name) return { kind, text: nameless };
    return { kind, text: inCart ? `In ${name}'s cart` : `${name} bought it` };
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
// at or after the anchor (any link counts when there is no anchor at all).
export function wasAddedThisPlan(links, anchor) {
  return (links || []).some((l) => !!l.linkCreatedAt && (!anchor || l.linkCreatedAt >= anchor));
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

// THE ANCHOR — the moment this plan began (A2-R correction, 2026-10-18, 063):
// the placement's planned_at, stamped by the plan upsert on every plan or
// re-plan. meal_cooks is the BACKSTOP for rows older than 063 (planned_at
// null): the meal's most recent cook. The earlier Add-to-Shop-link anchor was
// wrong because a re-plan without a cook kept the old links. ISO strings
// compare as text.
export function planAnchor(plannedAt, lastCookedAt) {
  return plannedAt || lastCookedAt || null;
}

// Row 1's window starts at the LATER of the link's created_at (the Add-to-Shop
// moment) and the anchor: a purchase before this plan began never reads as
// bought for it.
export function rowWindowStart(linkCreatedAt, anchor) {
  if (!anchor) return linkCreatedAt || null;
  if (!linkCreatedAt) return anchor;
  return anchor > linkCreatedAt ? anchor : linkCreatedAt;
}

// Does a bought row count for THIS plan, and who bought it? Known-inside when
// the link itself was made at or after the anchor (any purchase on it is
// later), or when a checked event sits at or after the window's start. A row
// whose link predates the anchor with no event after it is a purchase for an
// earlier plan — not row 1.
export function boughtForThisMeal({ status, linkCreatedAt }, events, anchor) {
  if (status !== "bought") return { boughtInWindow: false, buyerUserId: null };
  const start = rowWindowStart(linkCreatedAt, anchor);
  const buyerUserId = buyerFromEvents(events, start);
  const latest = events && events[0];
  const checkedInWindow = !!latest && latest.event_type === "checked" && (!start || latest.created_at >= start);
  const linkInWindow = !anchor || !linkCreatedAt || linkCreatedAt >= anchor;
  return { boughtInWindow: linkInWindow || checkedInWindow, buyerUserId };
}

export default ingredientTag;
