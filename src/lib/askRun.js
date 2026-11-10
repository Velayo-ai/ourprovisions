// The wagon's rules on the shelf screen (SPEC_ask amendment A16; mockup_ask_cart.html governs the
// behaviour). Pure, so each rule has a test beside it; AskRun holds the state and the motion.
//
// Picks live in the wagon, in tap order, until "That's it!". He can change his mind two ways: tap
// the tile again, or tap the item in the wagon (A16, amended 2026-11-09: ↶ is gone). A new tile
// when the wagon is full changes nothing; the wagon shakes. Nothing reaches the list before the
// confirm.

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

// THE LIVE-TILE RULE (SPEC_ask_slice4 S4-9; 083's create_ask / update_ask / land_ask_picks compute
// the same): a shelf tile is live when its catalog item is not deleted and is global or this
// household's own. One person's Hide never narrows a shelf — the shelf is the household's, so a
// tile the runner hid in Browse is still offered. Every client site reads these two: the Browse
// blocks, the run, the Browse header note, the Manage row and the edit prefill. A catalog-item
// delete can still shrink a shelf (077's CASCADE); the run then lowers its target (S4-5).
export function liveTiles(ask) {
  return (ask?.shelf || [])
    .filter((t) => t.item && t.item.deletedAt == null && (t.item.isGlobal || t.item.householdId === ask.householdId))
    .map((t) => ({ id: t.id, name: t.item.name, category: t.item.category ?? null }));
}

// What the run asks for: the target, or the live tiles when there are fewer (S4-5). 0 = the ask
// can't run today; nothing offers it.
export function effectiveTarget(ask, tiles) {
  return Math.max(0, Math.min(ask?.pickTarget || 0, (tiles || []).length));
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

// The held run → { askId, screen, ids }, or null when there is nothing to resume: a bad value, an
// ask that isn't one of liveAsks (this place's, loaded), or one with no live tile (it can't run).
// The picks are filtered to the ask's LIVE tiles, deduplicated and capped at the effective target;
// an unknown screen reads as "turn".
export function heldAskRead(raw, liveAsks) {
  let held;
  try { held = JSON.parse(raw); } catch (_e) { return null; }
  if (!held || typeof held !== "object" || typeof held.ask_id !== "string") return null;
  const ask = (liveAsks || []).find((a) => a.id === held.ask_id);
  if (!ask) return null;
  const live = liveTiles(ask);
  const target = effectiveTarget(ask, live);
  if (target === 0) return null;
  const shelf = new Set(live.map((t) => t.id));
  const ids = [];
  for (const id of Array.isArray(held.catalog_item_ids) ? held.catalog_item_ids : []) {
    if (shelf.has(id) && !ids.includes(id)) ids.push(id);
  }
  return { askId: ask.id, screen: held.screen === "shelf" ? "shelf" : "turn", ids: ids.slice(0, target) };
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
