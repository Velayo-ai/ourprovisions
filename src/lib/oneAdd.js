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
// The live count on the feeders' Done pill: "Done · N" after the first add (adds this visit, minus undos),
// plain "Done" at 0.
export const doneCountLabel = (n) => (n > 0 ? `Done · ${n}` : "Done");

// The List feeder's search create (Dan's household test): a typed name with no exact match is added from a
// "+ Add '{query}'" row whose aisle is GUESSED from the household's own catalog and shown as a pill that can
// be changed before adding. The guess: the aisle of the catalog item sharing the most words with the typed
// name (words of 3+ letters, a plural folded to its singular on both sides — "apples" / "Gala apple"); then
// the item whose whole name the typed name covers ("cherry tomatoes": "Tomatoes" in Produce beats "Canned
// Tomatoes" in Pantry); then the aisle with more such items. No shared word → the fallback ("Other").
// items: [{ name, rawCategory }]; skip: aisles never to guess (the staples pseudo-aisle).
const guessWords = (s) => String(s || "").toLowerCase().split(/[^a-z0-9]+/)
  .filter((w) => w.length >= 3)
  .map((w) => (w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.endsWith("oes") ? w.slice(0, -2) : w.endsWith("ss") ? w : w.endsWith("s") ? w.slice(0, -1) : w));
export function guessAisle(query, items, { fallback = "Other", skip = [] } = {}) {
  const q = new Set(guessWords(query));
  if (!q.size) return fallback;
  const best = {};
  for (const it of items || []) {
    if (!it || !it.rawCategory || skip.includes(it.rawCategory)) continue;
    const words = guessWords(it.name);
    const hit = words.filter((w) => q.has(w)).length;
    if (!hit) continue;
    const cov = hit / words.length;
    const b = best[it.rawCategory] || { hit: 0, cov: 0, n: 0 };
    const better = hit > b.hit || (hit === b.hit && cov > b.cov);
    best[it.rawCategory] = { hit: better ? hit : b.hit, cov: better ? cov : b.cov, n: b.n + 1 };
  }
  const ranked = Object.entries(best).sort((a, b) => b[1].hit - a[1].hit || b[1].cov - a[1].cov || b[1].n - a[1].n);
  return ranked.length ? ranked[0][0] : fallback;
}

// THE RAIL RULE (both feeders): a category chip is single-select — a tap on another switches to it, a tap on
// the selected one clears it. Staples toggles on its own and combines with the category (the intersection);
// Ask is an action, never selected. Several categories at once come only from View & filter, so a tap on one of
// several selected clears just that one.
export function railCategoryTap(selected, raw) {
  if (selected.has(raw)) { const next = new Set(selected); next.delete(raw); return next; }
  return new Set([raw]);
}

// THE LANDSCAPE TIP (Dan's household test): on the empty List — and in Home's list card while the list is empty —
// a phone whose household has 8+ staples, with no Ask run going, is told it can turn sideways for the staples.
// One record per device, shared by both places: it stops for good after the first landscape use or 3 shows.
// Storage that can't be read or written shows nothing (never nags forever).
export const LANDSCAPE_TIP_KEY = "op_one_add_landscape_tip";
export const LANDSCAPE_TIP_SHOWS = 3;
export const LANDSCAPE_TIP_MIN_STAPLES = 8;
export const LANDSCAPE_TIP = "Tip: turn your phone sideways to add our staples.";
export const LANDSCAPE_TIP_HOME = "or turn your phone sideways for our staples";
export function landscapeTipRead(storage) {
  try {
    const v = JSON.parse(storage.getItem(LANDSCAPE_TIP_KEY) || "{}") || {};
    return { shows: Number(v.shows) || 0, used: !!v.used, ok: true };
  } catch {
    return { shows: 0, used: false, ok: false };
  }
}
const landscapeTipWrite = (storage, v) => { try { storage.setItem(LANDSCAPE_TIP_KEY, JSON.stringify({ shows: v.shows, used: v.used })); return true; } catch { return false; } };
export const landscapeTipDue = (state) => !!state && state.ok && !state.used && state.shows < LANDSCAPE_TIP_SHOWS;
export function landscapeTipShown(storage) { const v = landscapeTipRead(storage); return v.ok && landscapeTipWrite(storage, { ...v, shows: v.shows + 1 }); }
export function landscapeTipUsed(storage) { const v = landscapeTipRead(storage); return v.ok && landscapeTipWrite(storage, { ...v, used: true }); }
// Who sees it at all: a phone (coarse pointer, short screen side ≤ 500 — landscape staples' own measure), 8+
// staples, no Ask run.
export const landscapeTipEligible = ({ phone, staples, askRun }) => !!phone && staples >= LANDSCAPE_TIP_MIN_STAPLES && !askRun;
