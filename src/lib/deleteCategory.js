// Manage Categories → Delete: the rules, out of ProvisionsApp so they can be tested (2026-11-05).
//
// A stopgap before SPEC_manage_categories.md's redesign. Deleting a category NEVER deletes items:
// the old flow's untouched picker read "— delete all items too —" and an empty choice ran
// deleteItem on every item in the category. Now a category with items can only be moved-and-
// deleted, the picker is required and preselected, and the function refuses a delete without a
// target. Anyone who wants items gone deletes them as items.

// The default home for a deleted category's items: Pantry (Dan, 2026-11-05), or the first
// standard category if Pantry ever leaves CATEGORY_ORDER. Falls back to any standard category
// on offer, then to the first target, then to none.
export function defaultMoveTarget(categories, deletingRawName, categoryOrder) {
  const targets = categories.filter((c) => c.rawName !== deletingRawName);
  const preferred = categoryOrder.includes("Pantry") ? "Pantry" : categoryOrder[0];
  const pick = targets.find((c) => c.rawName === preferred)
    || targets.find((c) => categoryOrder.includes(c.rawName))
    || targets[0];
  return pick ? pick.rawName : "";
}

// A custom category's row in Manage categories & asks (Dan, 2026-11-10): "{n} items".
export function categoryCountText(itemCount) {
  return itemCount === 1 ? "1 item" : `${itemCount} items`;
}

export function deleteCategoryLabel(itemCount) {
  return itemCount > 0 ? "Move & Delete Category" : "Delete Category";
}

// What a delete is allowed to do: "move" (items re-homed, then the category goes), "delete"
// (no items: the category goes directly) or "refuse" (items and no target: nothing happens).
export function categoryDeletePlan(itemCount, moveTo) {
  if (itemCount > 0) return moveTo ? "move" : "refuse";
  return "delete";
}

// The one database write a category delete makes: re-home the household's live items. An empty
// category is household state only (no rows to touch). Never deletes a catalog row.
// Returns { plan, error }.
export async function runCategoryDelete(db, householdId, rawName, moveTo, itemCount) {
  const plan = categoryDeletePlan(itemCount, moveTo);
  if (plan !== "move") return { plan, error: null };
  const { error } = await db
    .from("catalog_items")
    .update({ category: moveTo })
    .eq("household_id", householdId)
    .eq("category", rawName)
    .is("deleted_at", null);
  return { plan, error: error || null };
}

// A category's name, renamed wherever a set of names holds it (2026-11-14). The household's created
// categories and the Browse filter both keep names; a rename that moved the items but left the old
// name in either showed a stale "0 items" row in View & organize (found in the flag-off walk: the old
// Manage sheet closed on rename and its open-time prune hid it). Returns the same set when the old
// name isn't in it, so a state setter can bail out.
export function renameInSet(set, oldName, newName) {
  if (!set.has(oldName)) return set;
  const next = new Set(set);
  next.delete(oldName);
  next.add(newName);
  return next;
}
