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

// Whether this shelf can be run today: it needs at least as many tiles as the target. A
// catalog-item delete can shrink a shelf under its target (the spec's WATCH item), and a tile
// hidden from this person's Browse is not offered; the run screen says so instead of starting.
export function shelfCanRun(tiles, target) {
  return (tiles || []).length >= target;
}
