// Edit item → Category (2026-11-05): a household moves an item it added to another aisle, nothing
// deleted. Custom items only (is_global === false); a standard item's category is the household-
// wide RPC in SPEC_manage_categories.md's redesign, so it stays read-only here. Ask shelves are a
// join on catalog_item_id and do not move.

// Every category the picker offers: the standard ones in CATEGORY_ORDER (always, even with no
// items on view), then the household's own from `categories` (custom and empty-created).
export function editCategoryOptions(categories, categoryOrder, display = {}) {
  const standard = categoryOrder.map((raw) => ({ rawName: raw, name: display[raw] || raw }));
  const own = categories.filter((c) => !categoryOrder.includes(c.rawName));
  return [...standard, ...own];
}

// The one write: that row's category, by id, scoped to the household, custom and live only.
// Returns { ok, error }. ok only when exactly one row changed.
export async function updateItemCategory(db, householdId, item, category) {
  if (!db || !householdId) return { ok: false, error: "Not connected." };
  if (!item || item.is_global !== false || !item.id) return { ok: false, error: "Only items your place added can change category." };
  if (!category) return { ok: false, error: "Pick a category." };
  if (item.category === category) return { ok: true, error: null };
  const { data, error } = await db
    .from("catalog_items")
    .update({ category })
    .eq("id", item.id)
    .eq("household_id", householdId)
    .eq("is_global", false)
    .is("deleted_at", null)
    .select("id");
  if (error) return { ok: false, error: `Could not change category: ${error.message}` };
  if (!data || data.length !== 1) return { ok: false, error: "Could not change category: the item was not found." };
  return { ok: true, error: null };
}

// catalogMap after the write: only that entry's category changes.
export function applyItemCategory(map, itemName, category) {
  const item = map[itemName];
  if (!item || item.category === category) return map;
  return { ...map, [itemName]: { ...item, category } };
}

// Save order: the name first (so the category lands on the row under its new name), then the
// category. A failed step stops the save and is reported; nothing after it runs.
// rename(old, new) → boolean; setCategory(name, category) → { ok, error }.
export async function saveItemEdits({ oldName, newName, isCustom, oldCategory, newCategory }, { rename, setCategory }) {
  let name = oldName;
  if (!isCustom) return { ok: true, name, error: null };
  if (newName && newName !== oldName) {
    const renamed = await rename(oldName, newName);
    if (!renamed) return { ok: false, name, error: "Could not rename the item." };
    name = newName;
  }
  if (newCategory && newCategory !== oldCategory) {
    const r = await setCategory(name, newCategory);
    if (!r.ok) return { ok: false, name, error: r.error };
  }
  return { ok: true, name, error: null };
}
