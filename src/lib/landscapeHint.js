// Landscape = Staples — the first-run subtitle beside the header: "Tap to add · Hold to remove",
// for the first HINT_VISITS landscape visits on THIS device, then never again.
//
// The count lives in localStorage. Every read and write is wrapped: if storage is missing,
// blocked or full, the subtitle simply never shows (the "Hold to remove" tap hint is the
// backup teacher). Pure over the storage it is handed — jest beside it.
export const HINT_KEY = "op_landscape_hint_visits";
export const HINT_VISITS = 3;
export const HINT_TEXT = "Tap to add · Hold to remove";

const defaultStorage = () => { try { return window.localStorage; } catch (e) { return null; } };

// Visits counted so far; null when storage can't be read AND written.
function count(storage) {
  try {
    if (!storage) return null;
    const raw = storage.getItem(HINT_KEY);
    const n = raw == null ? 0 : parseInt(raw, 10);
    const safe = Number.isFinite(n) && n >= 0 ? n : 0;
    storage.setItem(HINT_KEY, String(safe));   // proves a write will work before anything is shown
    return safe;
  } catch (e) {
    return null;
  }
}

// Should the NEXT landscape visit show the subtitle? false when storage fails.
export function hintForNextVisit(storage = defaultStorage()) {
  const n = count(storage);
  return n != null && n < HINT_VISITS;
}

// A landscape visit has started: count it. Returns whether THIS visit shows the subtitle
// (it was one of the first HINT_VISITS and the count was saved).
export function beginHintVisit(storage = defaultStorage()) {
  const n = count(storage);
  if (n == null) return false;
  if (n >= HINT_VISITS) return false;
  try { storage.setItem(HINT_KEY, String(n + 1)); } catch (e) { return false; }
  return true;
}
