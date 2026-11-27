// The new member welcome's memory (SPEC_one_list R12–R13). v1 is an experiment, so no migration: localStorage,
// one key per person per household — op_list_welcome_seen:<clerk user id>:<household id> = "1". Accepted: it
// is once per phone, not once per member across devices (a reinstall or a new phone shows it again).
// Storage can be missing or refuse (a private window, cleared site data): then the welcome counts as seen,
// so it can never come back on every open.
export const WELCOME_KEY = "op_list_welcome_seen";

export const welcomeKey = (userId, householdId) => `${WELCOME_KEY}:${userId}:${householdId}`;

export function welcomeSeen(userId, householdId, storage = typeof window !== "undefined" ? window.localStorage : null) {
  if (!userId || !householdId) return true;
  try { return !storage || storage.getItem(welcomeKey(userId, householdId)) === "1"; } catch (e) { return true; }
}

export function markWelcomeSeen(userId, householdId, storage = typeof window !== "undefined" ? window.localStorage : null) {
  if (!userId || !householdId || !storage) return;
  try { storage.setItem(welcomeKey(userId, householdId), "1"); } catch (e) { /* storage refused: it shows once more, then never (welcomeSeen counts a failing read as seen) */ }
}

// Shown the first time this person opens List in this household with the list NOT empty (an empty list shows
// the guide instead), once the household's list has loaded, signed in.
export function shouldShowWelcome({ view, signedIn, listReady, totalItems, seen }) {
  return view === "list" && !!signedIn && !!listReady && totalItems > 0 && !seen;
}
