// Manage Categories → Delete: the rules, out of ProvisionsApp so they can be tested (2026-11-05).
//
// A stopgap before SPEC_manage_categories.md's redesign. Deleting a category NEVER deletes items:
// the old flow's untouched picker read "— delete all items too —" and an empty choice ran
// deleteItem on every item in the category. Now a category with items can only be moved-and-
// deleted, the picker is required and preselected, and the function refuses a delete without a
// target. Anyone who wants items gone deletes them as items.

// The default home for a deleted category's items: Other when Other is a standard category,
// otherwise the first standard category (Other is not in CATEGORY_ORDER today, so: Produce).
// Falls back to any standard category on offer, then to the first target, then to none.
export function defaultMoveTarget(categories, deletingRawName, categoryOrder) {
  const targets = categories.filter((c) => c.rawName !== deletingRawName);
  const preferred = categoryOrder.includes("Other") ? "Other" : categoryOrder[0];
  const pick = targets.find((c) => c.rawName === preferred)
    || targets.find((c) => categoryOrder.includes(c.rawName))
    || targets[0];
  return pick ? pick.rawName : "";
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
