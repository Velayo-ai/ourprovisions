// The List's quick picker (SPEC_one_list R7–R9): what it lists, what each row says, and the counts its
// telemetry carries. Pure, so it is tested here and App only wires it.

// Exact-normalized name key (F1b): lowercase + trim + collapse internal whitespace. NEVER fuzzy — it gates
// a household-wide un-hide, so it must match exactly.
export const normalizeName = (s) => (s || "").trim().toLowerCase().replace(/\s+/g, " ");

// The person's Browse catalog, flat, A–Z: Browse's categories (hidden items are already out of the catalog
// map, a browse-layer lens), each item with its id and raw category for the add.
export function pickerItems(categories, catalogMap) {
  const out = [];
  (categories || []).forEach((cat) => (cat.items || []).forEach((it) => {
    const row = catalogMap ? catalogMap[it.name] : null;
    if (!row || !row.id) return;
    out.push({ id: row.id, name: it.name, category: cat.name, rawCategory: cat.rawName });
  }));
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// Typed text → the matching items (a substring, case-insensitive), or every item for no text.
export function filterItems(items, query) {
  const q = (query || "").trim().toLowerCase();
  return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
}

// A–Z with letter headers. Anything that doesn't start with a letter goes under "#", first.
export function letterGroups(items) {
  const groups = [];
  let cur = null;
  items.forEach((it) => {
    const c = (it.name || "").trim().charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(c) ? c : "#";
    if (!cur || cur.letter !== letter) { cur = { letter, items: [] }; groups.push(cur); }
    cur.items.push(it);
  });
  const hash = groups.filter((g) => g.letter === "#");
  return [...hash, ...groups.filter((g) => g.letter !== "#")];
}

// What the shown list says about one catalog item (R8), overlay included (useProvisions' shown state):
//   "on"   — live, quantity > 0, not checked: ✓ "On the list", inert.
//   "cart" — live but checked this trip: shows +; a tap is 085's renewal (a new need of 1).
//   "off"  — not on the list: +.
// An add in flight shows as "on" at once: adjustQty moves the shown quantity (the row's id, or
// pre:<catalog id> before the row exists) and takes a renewed row out of the cart.
export function itemStatus(catalogItemId, { listRows, quantities, checked }) {
  const row = (listRows || []).find((r) => r.catalogItemId === catalogItemId);
  const q = quantities || {};
  const qty = row ? (row.id in q ? q[row.id] : row.quantity) : (q[`pre:${catalogItemId}`] || 0);
  if (!qty || qty <= 0) return "off";
  if (row && (checked || {})[row.id]) return "cart";
  return "on";
}

// A HIDDEN item whose name exactly matches the typed text, live on the list or not (F1b Layer 1): the
// picker's list is built from the catalog map, which excludes hidden items, so such an item would read as
// "no match" and fall through to a create that forks the catalog row. live → un-hide only (never write
// quantity across the person boundary); not live → un-hide and add at 1.
export function hiddenMatchFor(typed, hiddenItems, listRows) {
  const norm = normalizeName(typed);
  if (!norm) return null;
  const hidden = (hiddenItems || []).find((h) => normalizeName(h.name) === norm);
  if (!hidden) return null;
  const liveRow = (listRows || []).find((r) => r.catalogItemId === hidden.id && (r.quantity || 0) > 0);
  return { item: hidden, qty: liveRow ? liveRow.quantity : 0, live: !!liveRow };
}

// picker_closed's open_s: a bucket, never a raw duration.
export function openBucket(ms) {
  const s = Math.max(0, (ms || 0) / 1000);
  if (s < 10) return "lt10";
  if (s < 30) return "10_30";
  if (s < 60) return "30_60";
  if (s < 180) return "60_180";
  return "180plus";
}

// The picker's toast (R8 revised, R14): only what a row can't say. A plain add or its undo has none: the row
// is the confirmation. Item names are household text: they stay off every allow-list.
export const PICKER_COPY = {
  renewed: (name) => `${name} added again · it was in your cart`,
  needsSignal: "Adding items needs signal for now.",
  error: "That didn't save. Try again.",
};
