import { liveTiles } from "./askRun";

// Asks in "Manage categories & asks" and on Browse's ask header (SPEC_ask_slice4 S4-1, S4-5). Pure,
// so each line has a test beside it; App renders the rows and the sheet.
//
// The style's word on screen (Slice 3's names): the stored values stay standard / simple.
export function styleWord(screenStyle) {
  return screenStyle === "simple" ? "Explorer" : "Shopper";
}

// The grown-up's note on a shelf that can't do what it was asked (S4-5). null when the shelf is
// whole; "{k} of {n} on the shelf" when short of its target (n = the pick target: the note says
// how far the shelf is from what the child is asked for, not how many rows it has); "Nothing on
// this shelf yet" with no live tile. The caller adds " · Edit". Quiet text, never the error colour:
// a missing tile is the grown-up's business, not a fault.
export function shelfNote(ask) {
  const k = liveTiles(ask).length;
  if (k === 0) return "Nothing on this ask yet";
  if (k < (ask.pickTarget || 0)) return `${k} of ${ask.pickTarget} on the ask`;
  return null;
}

// One row under Asks in View & organize: "Ask {Label}" (the caller puts the label in .op-name), then
// its summary line (2026-11-14): "Pick {n} of {count} · {look}" — n the pick target, count the live
// tiles — or, with no live tile, "No items yet · {look}". Under it, only when the ask has items but
// fewer than its pick count, a second muted line says what would let the run finish: "Add {k} more
// item(s) so they can finish", k = pick count − live tiles. Exact or over, and empty, have no second
// line (empty is the summary's own message). The parts are kept beside them for callers that want them.
export function manageRow(ask) {
  const k = liveTiles(ask).length;
  const note = shelfNote(ask);
  const style = styleWord(ask.screenStyle);
  const target = ask.pickTarget || 0;
  const missing = target - k;
  return {
    id: ask.id,
    label: ask.label,
    style,
    pick: `pick ${ask.pickTarget}`,
    shelf: note || `${k} on the ask`,
    short: note !== null,
    summary: k === 0 ? `No items yet · ${style}` : `Pick ${ask.pickTarget} of ${k} · ${style}`,
    needMore: k > 0 && missing > 0 ? `Add ${missing} more ${missing === 1 ? "item" : "items"} so they can finish` : null,
  };
}

// The growth moment (S4-6; "growth lives in the move, not the label", 2026-11-09). After a save
// that RAISES the target or moves Explorer → Shopper, the editor sees "{Label}'s ready for more.";
// any other save sees "Saved.". The parent's action is the trigger: nothing here infers anything
// about the person, and the caller sends no span and records nothing. before: the ask as it was
// ({ pickTarget, screenStyle }); draft: the form as saved ({ target, style }).
export function saveOutcome(before, draft) {
  const raised = (draft.target || 0) > (before.pickTarget || 0);
  const opened = before.screenStyle === "simple" && draft.style !== "simple";
  return raised || opened ? "grown" : "saved";
}

// The Explorer photo nudge (S4-7): the hint under the chips naming the shelf items with no household
// photo, in shelf order. A hint, never a block — the parent may have a reader at the Explorer
// stage. null with nothing to name.
export function photoNudge(names) {
  const n = (names || []).filter(Boolean);
  if (n.length === 0) return null;
  const who = n.length === 1 ? n[0]
    : n.length === 2 ? `${n[0]} and ${n[1]}`
    : `${n[0]}, ${n[1]} and ${n.length - 2} more`;
  return `Explorers pick by picture. Add a photo for ${who}.`;
}
