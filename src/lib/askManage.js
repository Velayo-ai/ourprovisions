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
  if (k === 0) return "Nothing on this shelf yet";
  if (k < (ask.pickTarget || 0)) return `${k} of ${ask.pickTarget} on the shelf`;
  return null;
}

// One Manage row: "Ask {Label}" (the caller puts the label in .op-name), then the parts after it.
// A whole shelf reads "{k} on the shelf"; a short or empty one reads its note instead.
export function manageRow(ask) {
  const k = liveTiles(ask).length;
  const note = shelfNote(ask);
  return {
    id: ask.id,
    label: ask.label,
    style: styleWord(ask.screenStyle),
    pick: `pick ${ask.pickTarget}`,
    shelf: note || `${k} on the shelf`,
    short: note !== null,
  };
}
