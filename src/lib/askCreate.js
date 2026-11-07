// Ask creation (SPEC_ask_slice2 C2; 078 create_ask). Pure helpers for the + New shelf sheet and
// useProvisions: the draft's limits (077's checks, so the sheet refuses what the server would),
// the one RPC's arguments, the read's shape, and the failure copy. Kept out of App.js /
// useProvisions so each rule has a test beside it.

export const ASK_LABEL_MAX = 16;   // asks_label_valid (077)
export const ASK_NOUN_MAX = 16;    // asks_shelf_noun_valid (077)
export const ASK_TARGET_MIN = 1;   // asks_pick_target_range (077)
export const ASK_TARGET_MAX = 6;
export const ASK_SHELF_MAX = 48;   // ask_shelf_items_position_range: 0–47 (077)
export const ASK_TARGET_DEFAULT = 3;

// "To pick 3, the shelf needs at least 3 items." — the target-vs-tiles message, shared by the
// sheet's own check and create_ask's 22023.
export function targetTilesMessage(target) {
  return target === 1
    ? "The shelf needs at least one item."
    : `To pick ${target}, the shelf needs at least ${target} items.`;
}

// null when the draft can be saved, else the first problem, in the order the sheet reads.
export function askDraftProblem({ label, noun, target, itemIds }) {
  const l = (label || "").trim();
  const n = (noun || "").trim();
  const count = (itemIds || []).length;
  if (!l) return "Who's picking? Add a name.";
  if (l.length > ASK_LABEL_MAX) return `A name is ${ASK_LABEL_MAX} characters at most.`;
  if (n.length > ASK_NOUN_MAX) return `"What they're picking" is ${ASK_NOUN_MAX} characters at most.`;
  if (!Number.isInteger(target) || target < ASK_TARGET_MIN || target > ASK_TARGET_MAX) return "Choose how many to pick.";
  if (count === 0) return "Put at least one item on the shelf.";
  if (count > ASK_SHELF_MAX) return `A shelf holds ${ASK_SHELF_MAX} items at most.`;
  if (target > count) return targetTilesMessage(target);
  return null;
}

// create_ask's arguments (078). Slice 2 is Standard only; Simple arrives with Slice 3.
export function createAskArgs(id, householdId, { label, noun, target, itemIds }) {
  return {
    p_id: id,
    p_household_id: householdId,
    p_label: (label || "").trim(),
    p_shelf_noun: (noun || "").trim() || null,
    p_screen_style: "standard",
    p_pick_target: target,
    p_catalog_item_ids: [...(itemIds || [])],
  };
}

// The sheet's copy for a failed create. NEVER the server's message: create_ask's 23505 text names
// the label, and an error string is the kind of thing that ends up in a console line or a span.
// hasName says the message carries the label, so the sheet renders it inside .op-name (K3).
export function createAskFailure(code, { label, target, itemIds }) {
  const l = (label || "").trim();
  if (code === "23505") return { message: `You already have Ask ${l}.`, hasName: true };
  if (code === "22023") {
    if (target > (itemIds || []).length) return { message: targetTilesMessage(target), hasName: false };
    return { message: "Something on the shelf isn't available any more. Check the items and try again.", hasName: false };
  }
  if (code === "42501") return { message: "Only members of this place can make a shelf.", hasName: false };
  return { message: "Couldn't save the shelf. Check your connection and try again.", hasName: false };
}

// The asks read (asks + embedded ask_shelf_items) → [{ id, label, shelfNoun, screenStyle,
// pickTarget, createdAt, itemIds }], oldest first (the rail's order), each shelf in position order.
export function shapeAsks(rows) {
  return (rows || [])
    .map((r) => ({
      id: r.id,
      label: r.label,
      shelfNoun: r.shelf_noun ?? null,
      screenStyle: r.screen_style,
      pickTarget: r.pick_target,
      createdAt: r.created_at,
      itemIds: [...(r.ask_shelf_items || [])]
        .sort((a, b) => a.position - b.position)
        .map((s) => s.catalog_item_id),
    }))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

// The preview line under the noun field: "Pick 3 snacks for our list." / "Pick 3 for our list."
// (A14 / A25). A target of one reads "Pick one for our list." with or without a noun: the noun is
// a plural ("snacks") and A14 gives n = 1 its own line. Carries no label.
export function pickLine(target, noun) {
  if (target === 1) return "Pick one for our list.";
  const n = (noun || "").trim();
  return n ? `Pick ${target} ${n} for our list.` : `Pick ${target} for our list.`;
}
