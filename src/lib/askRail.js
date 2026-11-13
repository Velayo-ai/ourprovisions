// Browse's ask pills at 3+ asks (SPEC_ask_slice2 C4.2; Dan's rail ruling 2026-11-07). Pure helpers so
// each rule has a test beside it:
//   - order: last HAND-OVER first (most recent first), never-handed-over asks after, A–Z by label;
//   - the cap: at most two ask pills, the rest behind one "+N more" pill;
//   - "+ New shelf": right after Staples with no asks (discovery), at the very end with 1+;
//   - the order is frozen while Browse is open (freezeAskOrder) — a hand-over never re-sorts it.
//
// Last-hand-over times live on this device only, in localStorage, keyed by household + ask id —
// never the label (K3). Every read and write is guarded; a missing or unreadable time is "never".
// No migration.

export const ASK_PILL_CAP = 2;

// One glyph for every ask's pill and section (C3), never derived from the name (an initial would
// be a piece of it outside .op-name).
export const ASK_GLYPH = "🧺";

export function askHandoverKey(householdId, askId) {
  return `op_ask_handover:${householdId}:${askId}`;
}

// window.localStorage itself can throw (blocked storage), not just its methods.
function storageOrNull(storage) {
  if (storage !== undefined) return storage;
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

// { [askId]: ms } for the asks that have a readable time; the rest are left out ("never").
export function readAskHandovers(householdId, askIds, storage) {
  const s = storageOrNull(storage);
  const out = {};
  if (!s || !householdId) return out;
  for (const id of askIds || []) {
    try {
      const t = Number(s.getItem(askHandoverKey(householdId, id)));
      if (Number.isFinite(t) && t > 0) out[id] = t;
    } catch { /* unreadable → never */ }
  }
  return out;
}

export function recordAskHandover(householdId, askId, now = Date.now(), storage) {
  const s = storageOrNull(storage);
  if (!s || !householdId || !askId) return;
  try { s.setItem(askHandoverKey(householdId, askId), String(now)); } catch { /* storage unavailable — order stays as it was */ }
}

const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// The rail's order: handed-over asks by their last hand-over, most recent first; then the rest A–Z.
export function orderAsks(asks, handovers) {
  const h = handovers || {};
  const handed = (asks || []).filter((a) => h[a.id]).sort((a, b) => (h[b.id] - h[a.id]) || byLabel(a, b));
  const never = (asks || []).filter((a) => !h[a.id]).sort(byLabel);
  return [...handed, ...never];
}

// The order while Browse stays open: ids already placed keep their place (a hand-over or a pill
// tap never moves them); asks gone from the list drop out; asks not placed yet — the first load,
// or a shelf made mid-session — follow, in orderAsks order. Returns prevIds itself when nothing
// changed, so a state setter can bail out.
export function freezeAskOrder(prevIds, asks, handovers) {
  const live = new Set((asks || []).map((a) => a.id));
  const kept = (prevIds || []).filter((id) => live.has(id));
  const placed = new Set(kept);
  const added = orderAsks((asks || []).filter((a) => !placed.has(a.id)), handovers).map((a) => a.id);
  const next = [...kept, ...added];
  const same = prevIds && next.length === prevIds.length && next.every((id, i) => id === prevIds[i]);
  return same ? prevIds : next;
}

// What the rail draws, given the asks in their frozen order. newShelfAt: "afterStaples" with no
// asks, "end" with 1+, null when this person can't make a shelf (signed out, no place).
export function askRailLayout(orderedAsks, canCreate, cap = ASK_PILL_CAP) {
  const list = orderedAsks || [];
  const over = list.length > cap;
  return {
    pills: over ? list.slice(0, cap) : list,
    more: over ? list.slice(cap) : [],
    newShelfAt: !canCreate ? null : list.length === 0 ? "afterStaples" : "end",
  };
}
