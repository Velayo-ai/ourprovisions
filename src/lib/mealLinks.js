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

// THE ONE PATH OFF THE LIST when a meal stops needing items — whether it left This Week
// (⋯ → Remove on a To-buy card), was deleted, or an edit dropped ingredients (2026-10-19,
// Dan: "When a meal stops needing an item, whether by Remove, Cooked it or an edit:
// pending comes off Shop; in-cart stays until wrap-up, unlinked."). Moved VERBATIM out of
// useProvisions' removeMealFromList (deleteMeal's reconciliation block before it), with one
// addition: an optional catalogItemIds scope, so an edit takes off exactly the removed
// ingredients and nothing else.
//
// Pending rows: this meal's recorded share (039 quantity_contributed) is subtracted —
// SHARED items survive to the extent another meal still needs them, the other meal's
// share is never read or written — or the row is removed through remove_list_item when
// it is fully spent; then this meal's link goes. BOUGHT rows are never touched here: they
// are returned so the caller releases their LINK only (linksToRelease { onlyBought }).
// Returns the in-scope live links (pending and bought) it read.
export async function takeMealOffList(db, { householdId, mealId, catalogItemIds = null }) {
  const scope = catalogItemIds ? new Set(catalogItemIds) : null;
  if (scope && scope.size === 0) return [];
  // This meal's LIVE list rows, each carrying the amount THIS meal put
  // there (039). Household-scoped explicitly as belt-and-suspenders
  // alongside RLS, same as updateMeal.
  const { data, error: lErr } = await db
    .from("list_item_meals")
    .select("list_item_id, quantity_contributed, list_items!inner(id, catalog_item_id, quantity, status, household_id, deleted_at)")
    .eq("meal_id", mealId)
    .eq("list_items.household_id", householdId)
    .is("list_items.deleted_at", null);
  if (lErr) throw lErr;
  const links = (data || []).filter((r) => !scope || scope.has(r.list_items?.catalog_item_id));

  // Bought rows drop out HERE and are never handed to the quantity math
  // below — the never-un-buy guarantee, enforced by filter rather than
  // left to fall out of a downstream implementation.
  const pending = links.filter((r) => r.list_items?.status === "pending");

  for (const row of pending) {
    const li = row.list_items;
    const contributed = Number(row.quantity_contributed) || 0;

    // LEGACY ROW (written before 039, never backfilled): contributed is 0,
    // so there is no recorded basis to subtract. Drop the provenance link
    // and leave the quantity untouched.
    if (contributed > 0) {
      const remaining = Number(li.quantity) - contributed;
      if (remaining > 0) {
        const { error: qErr } = await db
          .from("list_items")
          .update({ quantity: remaining, updated_at: new Date().toISOString() })
          .eq("id", li.id)
          .eq("household_id", householdId);
        if (qErr) throw qErr;
      } else {
        // Fully spent. Same removal path updateQty's qty<=0 branch uses,
        // so the list keeps ONE removal implementation.
        const { error: rErr } = await db.rpc("remove_list_item", {
          p_household_id: householdId,
          p_catalog_item_id: li.catalog_item_id,
        });
        if (rErr) throw rErr;
      }
    }

    const { error: uErr } = await db
      .from("list_item_meals")
      .delete()
      .eq("meal_id", mealId)
      .eq("list_item_id", row.list_item_id);
    if (uErr) throw uErr;
  }
  return links;
}

// The ingredients an edit dropped: live before, absent after (by catalog item). An item
// removed and re-added in the same edit is not dropped. Added ingredients are never
// returned — an edit never puts anything on Shop.
export function droppedIngredientIds(beforeRows, afterRows) {
  const keep = new Set((afterRows || []).map((r) => r.catalog_item_id));
  return [...new Set((beforeRows || []).map((r) => r.catalog_item_id))].filter((id) => id && !keep.has(id));
}
