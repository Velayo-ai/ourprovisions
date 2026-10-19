// A meal's provenance links (list_item_meals) — the release rule and the row counts
// every meal surface reads.
//
// REPLANNING STARTS OVER (Dan, 2026-10-19 — the Beef and Broccoli repro on the dev
// walk). A meal that leaves This Week (⋯ → Remove, or Cooked it) lets go of its
// list_item_meals links, so nothing from that trip counts toward a later
// placement in ANY reader: the board, the library's stage, Home's deck and the
// recipe view (all through rowCountsFromProvenance below), and close_cycle's
// ready_at stamping (052: "an open placement with a link into the closing cycle
// and none of those rows pending" — with no link left, it cannot match).
//
// Only the LINK goes. The list_items row — its quantity, its status, its place in
// the cart — is never written here: an item in the cart stays in the cart as a
// plain item until wrap-up archives it. (The pending rows Remove takes off Shop
// go through removeMealFromList's own quantity math, unchanged.) No inventory
// or leftover logic ("you bought lemons yesterday") — a future feature.
//
// list_item_meals_delete is membership-scoped (is_member_of on the row's
// list_item household), so this is a plain client delete — no RPC, no migration.

// The live links a release lets go of. Remove (removeMealFromList) passes
// { onlyBought: true }: its pending rows are already handled — quantity
// subtracted, link dropped — by the existing loop. Cooked it releases every live
// link the meal still holds.
export function linksToRelease(links, { onlyBought = false } = {}) {
  return (links || [])
    .filter((l) => l && l.list_items && l.list_items.deleted_at == null)
    .filter((l) => !onlyBought || l.list_items.status === "bought")
    .map((l) => l.list_item_id);
}

// This meal's links whose list row is live, household-scoped (belt-and-suspenders
// alongside RLS, as removeMealFromList does).
export async function fetchLiveMealLinks(db, { householdId, mealId }) {
  const { data, error } = await db
    .from("list_item_meals")
    .select("list_item_id, list_items!inner(status, household_id, deleted_at)")
    .eq("meal_id", mealId)
    .eq("list_items.household_id", householdId)
    .is("list_items.deleted_at", null);
  if (error) throw error;
  return data || [];
}

// Delete exactly these links of exactly this meal. Never touches list_items.
// Returns the number of ids handed in (0 when there was nothing to release).
export async function releaseMealLinks(db, { mealId, listItemIds }) {
  const ids = (listItemIds || []).filter(Boolean);
  if (ids.length === 0) return 0;
  const { error } = await db
    .from("list_item_meals")
    .delete()
    .eq("meal_id", mealId)
    .in("list_item_id", ids);
  if (error) throw error;
  return ids.length;
}

// Per-meal live list rows { total, bought } from the provenance map
// (fetchMealProvenance: catalog_item_id → [{ mealId, status, … }]). The card's
// state while it is to-buy ("2 of 4 in cart", "4 to buy"); readiness itself is
// placement.readyAt. Lifted out of App.js unchanged so the release rule can be
// proven through the same counts the board reads.
export function rowCountsFromProvenance(provenance) {
  const map = {};
  Object.values(provenance || {}).flat().forEach((pr) => {
    const c = map[pr.mealId] || (map[pr.mealId] = { total: 0, bought: 0 });
    c.total += 1;
    if (pr.status === "bought") c.bought += 1;
  });
  return map;
}
