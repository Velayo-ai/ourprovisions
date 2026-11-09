// The wagon's rules on the shelf screen (SPEC_ask amendment A16; mockup_ask_cart.html governs the
// behaviour). Pure, so each rule has a test beside it; AskRun holds the state and the motion.
//
// Picks live in the wagon, in tap order, until "That's it!". He can change his mind three ways:
// tap the tile again, tap the item in the wagon, or ↶ (the last pick out). A new tile when the
// wagon is full changes nothing; the wagon shakes. Nothing reaches the list before the confirm.

// A tile tap → { picks, effect }: "added", "removed" (it was already in), or "full" (unchanged).
export function tapTile(picks, id, target) {
  if (picks.includes(id)) return { picks: picks.filter((p) => p !== id), effect: "removed" };
  if (picks.length >= target) return { picks, effect: "full" };
  return { picks: [...picks, id], effect: "added" };
}

// A tap on the item in the wagon.
export function takeOut(picks, id) {
  return picks.filter((p) => p !== id);
}

// ↶ — the last pick out.
export function undoLast(picks) {
  return picks.slice(0, -1);
}

// "That's it!" shows, and the confirm runs, only with the wagon exactly full (land_ask_picks
// refuses any other count, 077).
export function canConfirm(picks, target) {
  return picks.length === target;
}

// The shelf screen's title before the name: "Pick 3, " / "Pick one, " (A14; the mockup's form).
// The caller renders the name in .op-name and the "!" after it.
export function shelfTitlePrefix(target) {
  return target === 1 ? "Pick one, " : `Pick ${target}, `;
}

// What a tile shows (Dan, C3b.1, 2026-11-07): the household's photo; else the ITEM's own glyph,
// if the catalog has one; else a plain name tile. Never the aisle's glyph — Bananas is not 🥦.
// Applies wherever a tile is drawn: the shelf grid, the wagon, Great picks, the Browse photo strip.
export function tileFace({ photoUrl, glyph }) {
  if (photoUrl) return "photo";
  if (glyph) return "glyph";
  return "name";
}

// Whether this shelf can be run today: it needs at least as many tiles as the target. A
// catalog-item delete can shrink a shelf under its target (the spec's WATCH item), and a tile
// hidden from this person's Browse is not offered; the run screen says so instead of starting.
export function shelfCanRun(tiles, target) {
  return (tiles || []).length >= target;
}

// A26 resume (SPEC_ask_slice3 S3-6). iOS can discard a backgrounded page and reload it in the same
// tab; the run comes back from ONE sessionStorage key. It holds the ask's id, the screen ("turn" or
// "shelf") and the picks' catalog ids — never the label, an item name or the style. Great picks
// is not resumable: its picks have landed, so the key is gone by then.
export const HELD_ASK_KEY = "op_ask_held";

// The key's value for this run.
export function heldAskWrite(askId, screen, ids) {
  return JSON.stringify({ ask_id: askId, screen: screen === "shelf" ? "shelf" : "turn", catalog_item_ids: [...(ids || [])] });
}

// The held run → { askId, screen, ids }, or null when there is nothing to resume: a bad value, or
// an ask that isn't one of liveAsks (this place's, loaded). The picks are filtered to ids still on
// that ask's shelf, deduplicated and capped at its target; an unknown screen reads as "turn".
export function heldAskRead(raw, liveAsks) {
  let held;
  try { held = JSON.parse(raw); } catch (_e) { return null; }
  if (!held || typeof held !== "object" || typeof held.ask_id !== "string") return null;
  const ask = (liveAsks || []).find((a) => a.id === held.ask_id);
  if (!ask) return null;
  const shelf = new Set(ask.itemIds || []);
  const ids = [];
  for (const id of Array.isArray(held.catalog_item_ids) ? held.catalog_item_ids : []) {
    if (shelf.has(id) && !ids.includes(id)) ids.push(id);
  }
  return { askId: ask.id, screen: held.screen === "shelf" ? "shelf" : "turn", ids: ids.slice(0, ask.pickTarget) };
}

// The key's storage: the one impure pair here. Blocked storage (a private window) means no resume,
// never a broken run. A null value clears the key.
export function storeHeldAsk(value) {
  try {
    if (value == null) sessionStorage.removeItem(HELD_ASK_KEY);
    else sessionStorage.setItem(HELD_ASK_KEY, value);
  } catch (_e) { /* storage blocked */ }
}
export function loadHeldAsk() {
  try { return sessionStorage.getItem(HELD_ASK_KEY); } catch (_e) { return null; }
}
