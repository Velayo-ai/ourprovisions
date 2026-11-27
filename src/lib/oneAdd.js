// One add (SPEC_results_feeder_standard, 2026-11-27): an EXPERIMENT on the exp/one-add preview, behind
// REACT_APP_FEATURE_ONE_ADD (src/lib/featureFlags.js). Plan and List start at results and feed them
// through one + Add; Browse moves inside Add and leaves the Helm. Every rule the experiment adds that
// can be pure lives here, each with its flag as an argument so the tests read both builds; App wires
// the bound versions. With the flag off every helper returns today's answer.
import { ONE_ADD_ENABLED } from "./featureFlags";

// R1: Browse is not a door. Its view ("input") and its routes (#/browse, a hand-back from an Ask run)
// land on List with the picker closed: no dead route. null (no door in the hash) stays null.
export const routeViewWith = (on, v) => (on && v === "input" ? "list" : v);
export const routeView = (v) => routeViewWith(ONE_ADD_ENABLED, v);

// R1: the Helm's doors, HOME · PLAN · LIST with the flag on. NAV_DOORS itself is untouched (the RUM
// routes, hashForView and the fleet grammar still read it).
export const helmDoorsWith = (on, doors) => (on ? doors.filter((d) => d.key !== "browse") : doors);
export const helmDoors = (doors) => helmDoorsWith(ONE_ADD_ENABLED, doors);

// R1: Our list's status line, under the title. DRAFT COPY, flagged for Dan: "4 items · 2 aisles"; once
// something is in the cart, "3 to get · 1 in the cart". Counts only, never a name.
export function listStatusLine({ open, cart, aisles }) {
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  if (cart > 0) return open > 0 ? `${open} to get · ${cart} in the cart` : n(cart, "item in the cart", "items in the cart");
  return `${n(open, "item", "items")} · ${n(aisles, "aisle", "aisles")}`;
}

// R3: ONE Ask pill (supersedes askRail.js's two pills + "+N more" in this build). 0 asks → no pill;
// 1 → "Ask {name}", one tap starts it; 2+ → "Ask…", one tap opens the chooser of every ask. Never a
// split pill. `asks` arrive in orderAsks order (the frozen rail order).
export function askPill(asks) {
  const list = (asks || []).filter(Boolean);
  if (list.length === 0) return { kind: "none" };
  if (list.length === 1) return { kind: "one", ask: list[0] };
  return { kind: "many", asks: list };
}

// R3: the staples hint, "Star what you always buy. We'll keep them up front.", while the household has
// no staples, on the first 3 feeder visits on this device (like the landscape hint). The count is this
// device's; storage that can't be read shows nothing rather than nagging forever.
export const STAPLES_HINT_KEY = "op_one_add_staples_hint";
export const STAPLES_HINT_VISITS = 3;
export const STAPLES_HINT = "Star what you always buy. We'll keep them up front.";
export function staplesHintVisit(storage) {
  try {
    const seen = parseInt(storage.getItem(STAPLES_HINT_KEY) || "0", 10) || 0;
    if (seen >= STAPLES_HINT_VISITS) return false;
    storage.setItem(STAPLES_HINT_KEY, String(seen + 1));
    return true;
  } catch {
    return false;
  }
}

// R2: Done → a toast "N added", only when something was added this visit.
export const addedToastText = (n) => (n > 0 ? `${n} added` : null);
