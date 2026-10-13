// The Galley card's error copy — ONE place on the card (walk defect 16, Dan,
// 2026-10-12): every failure on either path lands in the hint line under the box,
// never as a toast. Input is kept for the retry; the hint clears on the next edit
// or tap. Browser error text never reaches the UI — Safari's "Load failed" and
// Chrome's "Failed to fetch" are for the console (2026-10-11 ruling).
//
// Read path (recipe-import): the two declines, the model timeout (504), the
// unreachable reader (502), a fetch that never got a response, a dead session,
// and the plain "anything else".

export const IMPORT_HINTS = {
  not_a_recipe: "Couldn't find a recipe in that. Try a clearer screenshot, or paste the text.",
  unreadable: "Couldn't read that clearly enough. A sharper screenshot usually works.",
  timeout: "That took too long. Try again, or try fewer screenshots.",
  unreachable: "Couldn't reach the reader. Try again in a moment.",
  offline: "Couldn't reach the reader. Check your connection and try again.",
  session_expired: "Your session has expired. Please sign in again.",
  failed: "Couldn't read the recipe. Try again.",
};
export const IMPORT_FAILED_HINT = IMPORT_HINTS.failed;

// Invent path (meal-suggestion): the same slot, the same tone. "failed" covers a
// 5xx, an unexpected shape, and a malformed draft refused by the guard
// (src/lib/galleyDraft.js) — the person's next move is the same for all three.
export const GALLEY_HINTS = {
  offline: "Couldn't reach the Galley. Check your connection and try again.",
  session_expired: IMPORT_HINTS.session_expired,
  failed: "Couldn't get a suggestion. Try again.",
};
export const GALLEY_OFFLINE_HINT = GALLEY_HINTS.offline;
export const GALLEY_FAILED_HINT = GALLEY_HINTS.failed;

// Classify an error thrown around fetch():
//   "aborted" — the person pressed Never mind (swallowed, no copy at all)
//   "offline" — fetch rejected with no response: a TypeError in every engine
//               ("Failed to fetch", "Load failed", "NetworkError when attempting
//               to fetch resource.") — the connection hint
//   "failed"  — anything else — the plain hint
// Checked by name/shape, never by message text: the text is the thing we must
// not depend on or repeat. Deliberately NOT classifyFetchError (src/lib): that
// one answers "retry quietly or toast?" for the pollers and reads message
// phrases; this one answers "which copy does the person see?" for one request.
export function classifyFetchFailure(err) {
  if (!err) return "failed";
  if (err.name === "AbortError") return "aborted";
  if (err.name === "TypeError" || err instanceof TypeError) return "offline";
  return "failed";
}
