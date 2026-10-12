// Recipe import — the row's hint copy and the one place a thrown error is turned
// into something the person can read (SPEC_recipe_import "Client errors";
// 2026-10-11 ruling: browser error text never reaches the UI — Safari's "Load
// failed" and Chrome's "Failed to fetch" are for the console).
//
// Four function outcomes have a next move in the Bring row, so they are hints
// there and never a toast: the two declines, the model timeout (504), the
// unreachable reader (502). A fetch that never got a response (the phone went
// offline mid-read) is the fifth: same row, same tone. Staged input is kept for
// every one of them.

export const IMPORT_HINTS = {
  not_a_recipe: "Couldn't find a recipe in that. Try a clearer screenshot, or paste the text.",
  unreadable: "Couldn't read that clearly enough. A sharper screenshot usually works.",
  timeout: "That took too long. Try again, or try fewer screenshots.",
  unreachable: "Couldn't reach the reader. Try again in a moment.",
  offline: "Couldn't reach the reader. Check your connection and try again.",
};

// Anything else that throws on the way (a token call, a bug) gets plain copy in
// the toast. The raw message goes to the console only.
export const IMPORT_FAILED_TOAST = "Couldn't read the recipe. Try again.";

// The Galley (requestMealSuggestion) had the same leak — "Could not get a
// suggestion: Load failed" — and shares the classifier. It has no row hint line,
// so both outcomes are toasts, in the same plain English (fixed 2026-10-11).
export const GALLEY_OFFLINE_TOAST = "Couldn't reach the galley. Check your connection and try again.";
export const GALLEY_FAILED_TOAST = "Couldn't get a suggestion. Try again.";

// Classify an error thrown around fetch():
//   "aborted" — the person pressed Never mind (swallowed, no copy at all)
//   "offline" — fetch rejected with no response: a TypeError in every engine
//               ("Failed to fetch", "Load failed", "NetworkError when attempting
//               to fetch resource.") — the hint, not a toast
//   "failed"  — anything else — the plain toast
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
