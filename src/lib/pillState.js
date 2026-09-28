// src/lib/pillState.js — which pill the connectivity state renders as
// (SPEC_auth_state_ui_gating.md Amendment 2026-09-27, Addendum A5b — pill copy).
//
// "Offline — showing last saved" claims there is something saved to show. On a
// fresh sign-in with a held bootstrap there is not (V11 showed it over an empty
// shell), so until this household's data has rendered at least once the offline
// state is DRAWN as "Reconnecting…", however many attempts have failed. Copy
// only: when the pill appears and clears is unchanged (ConnectivityContext).
export function resolvePillState(connState, hasSavedData) {
  if (connState === "offline" && !hasSavedData) return "reconnecting";
  return connState;
}
