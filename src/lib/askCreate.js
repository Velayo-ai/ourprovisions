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
export const ASK_SIMPLE_MAX = 4;   // Simple (on screen: Explorer) shows at most 4 tiles, 2×2 (SPEC_ask_slice3 S3-1)
export const ASK_STYLE_DEFAULT = "standard";   // asks.screen_style: standard | simple (077)
// The Explorer shelf cap, as askDraftProblem says it. The sheet shows it under the shelf (with how
// many to remove) instead of in the footer.
export const ASK_SIMPLE_CAP_MESSAGE = `Explorer shows ${ASK_SIMPLE_MAX} at most.`;

// The label as it will be saved (Dan, 2026-11-11): trimmed, then any leading "Ask " taken off,
// case-insensitive and repeated ("ask ask Test" → "Test"), because the screen already says "Ask
// {Label}" everywhere. A bare "Ask" with nothing after it stays as typed. The duplicate check and
// the save both read this, never the raw field.
export function cleanAskLabel(raw) {
  let l = (raw || "").trim();
  for (;;) {
    const m = /^ask\s+(\S.*)$/i.exec(l);
    if (!m) return l;
    l = m[1].trim();
  }
}

// "To pick 3, the shelf needs at least 3 items." — the target-vs-tiles message, shared by the
// sheet's own check and create_ask's 22023.
export function targetTilesMessage(target) {
  return target === 1
    ? "The shelf needs at least one item."
    : `To pick ${target}, the shelf needs at least ${target} items.`;
}

// null when the draft can be saved, else the first problem, in the order the sheet reads.
export function askDraftProblem({ label, noun, target, itemIds, style }) {
  const l = (label || "").trim();
  const n = (noun || "").trim();
  const count = (itemIds || []).length;
  if (!l) return "Who's picking? Add a name.";
  if (l.length > ASK_LABEL_MAX) return `A name is ${ASK_LABEL_MAX} characters at most.`;
  if (n.length > ASK_NOUN_MAX) return `"What they're picking" is ${ASK_NOUN_MAX} characters at most.`;
  if (!Number.isInteger(target) || target < ASK_TARGET_MIN || target > ASK_TARGET_MAX) return "Choose how many to pick.";
  if (count === 0) return "Put at least one item on the shelf.";
  if (count > ASK_SHELF_MAX) return `A shelf holds ${ASK_SHELF_MAX} items at most.`;
  if (style === "simple" && count > ASK_SIMPLE_MAX) return ASK_SIMPLE_CAP_MESSAGE;
  if (target > count) return targetTilesMessage(target);
  return null;
}

// create_ask's arguments (078). The style is chosen at create (SPEC_ask_slice3 S3-5); anything
// but "simple" is Standard.
export function createAskArgs(id, householdId, { label, noun, target, itemIds, style }) {
  return {
    p_id: id,
    p_household_id: householdId,
    p_label: (label || "").trim(),
    p_shelf_noun: (noun || "").trim() || null,
    p_screen_style: style === "simple" ? "simple" : ASK_STYLE_DEFAULT,
    p_pick_target: target,
    p_catalog_item_ids: [...(itemIds || [])],
  };
}

// update_ask's arguments (083, S4-3): create_ask's shape with the ask's id in place of a new one.
// The whole form goes every time; last write wins.
export function updateAskArgs(householdId, askId, { label, noun, target, itemIds, style }) {
  return {
    p_household_id: householdId,
    p_ask_id: askId,
    p_label: (label || "").trim(),
    p_shelf_noun: (noun || "").trim() || null,
    p_screen_style: style === "simple" ? "simple" : ASK_STYLE_DEFAULT,
    p_pick_target: target,
    p_catalog_item_ids: [...(itemIds || [])],
  };
}

// The live ask whose label matches this one, trimmed and case-insensitive (K2, 078's
// asks_household_label_live_uq), or null. The sheet checks it as the name is typed and shows the
// EXISTING ask's spelling; create_ask's 23505 is the backstop for a race with another member.
export function findDuplicateAsk(label, asks) {
  const l = (label || "").trim().toLowerCase();
  if (!l) return null;
  return (asks || []).find((a) => (a.label || "").trim().toLowerCase() === l) || null;
}

// The sheet's copy for a failed create. NEVER the server's message: create_ask's 23505 text names
// the label, and an error string is the kind of thing that ends up in a console line or a span.
// hasName says the message carries the label, so the sheet renders it inside .op-name (K3);
// field is the part of the sheet to bring into view (null: nothing to fix there).
export function createAskFailure(code, { label, target, itemIds }) {
  const l = (label || "").trim();
  if (code === "23505") return { message: `You already have Ask ${l}.`, hasName: true, field: "label" };
  if (code === "22023") {
    if (target > (itemIds || []).length) return { message: targetTilesMessage(target), hasName: false, field: "shelf" };
    return { message: "Something on the shelf isn't available any more. Check the items and try again.", hasName: false, field: "shelf" };
  }
  if (code === "42501") return { message: "Only members of this place can make a shelf.", hasName: false, field: null };
  return { message: "Couldn't save the shelf. Check your connection and try again.", hasName: false, field: null };
}

// The asks read (asks + embedded ask_shelf_items, each with its catalog item) → [{ id, householdId,
// label, shelfNoun, screenStyle, pickTarget, createdAt, itemIds, shelf }], oldest first (the rail's
// order), each shelf in position order. `shelf` carries what the live-tile rule reads (S4-9,
// liveTiles in src/lib/askRun.js): the tiles come from the shelf rows, never from Browse's list.
// `itemIds` is every shelf id, live or not. A shelf row whose catalog item didn't come back
// (`item: null`) is not live.
export function shapeAsks(rows) {
  return (rows || [])
    .map((r) => {
      const shelf = [...(r.ask_shelf_items || [])]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({
          id: s.catalog_item_id,
          item: s.catalog_items ? {
            name: s.catalog_items.name,
            category: s.catalog_items.category ?? null,
            isGlobal: !!s.catalog_items.is_global,
            householdId: s.catalog_items.household_id ?? null,
            deletedAt: s.catalog_items.deleted_at ?? null,
          } : null,
        }));
      return {
        id: r.id,
        householdId: r.household_id ?? null,
        label: r.label,
        shelfNoun: r.shelf_noun ?? null,
        screenStyle: r.screen_style,
        pickTarget: r.pick_target,
        createdAt: r.created_at,
        itemIds: shelf.map((s) => s.id),
        shelf,
      };
    })
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
