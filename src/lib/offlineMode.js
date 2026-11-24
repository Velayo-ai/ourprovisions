// src/lib/offlineMode.js — offline is a mode, not a problem (SPEC_offline_calm_2026-11-23).
//
// One question for the whole app: are we offline right now? The answer drives ONE standing sign, a small
// neutral icon in the header (C2), and one calm note per trip (C3). No pill, no counts, no "Back online".
//
// RAW offline = the device says it's offline, or the most recent request failed for want of a network
// (one bar counts as offline, C5). It clears only after the next successful request.
// SHOWN offline turns on at once and turns off only after OFFLINE_HOLD_MS of steady signal since the last
// drop, so a signal dropping in and out never flicks the icon back and forth (C5).
export const OFFLINE_HOLD_MS = 10000;
// The note: about 3 s, once per trip (C3). A trip ends at Wrap up; a note older than a trip's longest
// life (the 8 h session expiry, D11) counts as another trip's.
export const NOTE_MS = 3000;
export const NOTE_TRIP_MS = 8 * 60 * 60 * 1000;
export const NOTE_KEY = "op_offline_note_at";
export const NOTE_COPY = "Shopping offline · everything's saved";

// prev = { shown, raw, steadySince } — steadySince = when raw last went from offline to online. Returns the
// next state plus clearAt: when to look again, set only while a clear is being held back.
export function nextOffline(prev, raw, now, holdMs = OFFLINE_HOLD_MS) {
  const shown = !!(prev && prev.shown);
  if (raw) return { shown: true, raw: true, steadySince: null, clearAt: null };
  if (!shown) return { shown: false, raw: false, steadySince: null, clearAt: null };
  const steadySince = prev.raw || prev.steadySince == null ? now : prev.steadySince;
  if (now - steadySince >= holdMs) return { shown: false, raw: false, steadySince: null, clearAt: null };
  return { shown: true, raw: false, steadySince, clearAt: steadySince + holdMs };
}

const defaultStorage = () => {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch (e) { return null; }
};

// The note shows on a switch to offline unless it already showed this trip.
export function noteDue(lastShownAt, now) {
  return !(typeof lastShownAt === "number" && lastShownAt > 0 && now - lastShownAt < NOTE_TRIP_MS);
}
export function readNoteShownAt(store = defaultStorage()) {
  if (!store) return null;
  try { const v = Number(store.getItem(NOTE_KEY)); return Number.isFinite(v) && v > 0 ? v : null; } catch (e) { return null; }
}
export function writeNoteShownAt(at, store = defaultStorage()) {
  if (!store) return;
  try { store.setItem(NOTE_KEY, String(at)); } catch (e) { /* storage unavailable: once per session instead */ }
}
// Wrap up ends the trip: the next trip that loses signal gets its own note.
export function clearNoteShownAt(store = defaultStorage()) {
  if (!store) return;
  try { store.removeItem(NOTE_KEY); } catch (e) { /* storage unavailable */ }
}

// The sheet (C2). Fixed copy; the one count is changes waiting on this phone.
export const SHEET_COPY = "You're offline. Everything you do is saved on this phone and shares with your household when you're back in signal.";
export function changesLine(n) {
  if (!n || n < 1) return null;
  return `${n} ${n === 1 ? "change" : "changes"} will share when you're back.`;
}
// The known gap (spec, "Known gap"): what still rolls back offline, said once, plainly, in the sheet —
// never an error toast.
const NEEDS_SIGNAL = {
  add: "Adding items needs signal for now.",
  qty: "Changing quantities needs signal for now.",
  remove: "Removing items needs signal for now.",
  price: "Editing prices needs signal for now.",
};
export function needsSignalLine(kind) {
  return NEEDS_SIGNAL[kind] || null;
}

// C9 — the Velayo dots are the Harbor connection light. The beacon: a lighthouse sweep, each dot
// brightening in turn over one pass, two passes, then rest. Never loops.
export const BEACON_PASS_MS = 1500;
export const BEACON_PASSES = 2;
export const BEACON_MS = BEACON_PASS_MS * BEACON_PASSES;
export const HARBOR_LABEL = { connected: "Connected to the Harbor", offline: "Offline" };
// Low Power Mode, where detectable: iOS caps requestAnimationFrame at 30 fps in Low Power Mode, so a
// short sample whose frames average slower than ~24 ms reads as "save power: no sweep". Anything
// unmeasurable (a hidden tab runs no frames) also skips the sweep.
export function lowPowerFromFrames(deltas) {
  const d = (deltas || []).filter((x) => Number.isFinite(x) && x > 0);
  if (d.length < 3) return true;
  return d.reduce((a, b) => a + b, 0) / d.length > 24;
}
