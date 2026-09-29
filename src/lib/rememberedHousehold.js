// src/lib/rememberedHousehold.js — the remembered active place, per user
// (SPEC_auth_state_ui_gating.md Amendment 2026-09-27, A6).
//
// Keyed `activeHouseholdId:<clerkId>`. The old single key was per BROWSER, so it
// survived sign-out by design and the next person to sign in on that phone
// inherited it — DH landed in DT's Madbury, then (after a failed first read) in
// o11y Test House. Each person now returns to their own last place. The legacy
// key is adopted once, only if this user is a member of it, then deleted; if
// they are not a member it is left for whoever it belongs to.
export const LEGACY_ACTIVE_KEY = "activeHouseholdId";
export const activeKeyFor = (clerkId) => `activeHouseholdId:${clerkId}`;

export function readRememberedHousehold(clerkId, households) {
  const isMember = (id) => !!id && households.some((h) => h.id === id);
  try {
    const own = localStorage.getItem(activeKeyFor(clerkId));
    if (own !== null) return isMember(own) ? own : null;   // has a key: it decides, valid or not
    const legacy = localStorage.getItem(LEGACY_ACTIVE_KEY);
    if (isMember(legacy)) {
      localStorage.setItem(activeKeyFor(clerkId), legacy);
      localStorage.removeItem(LEGACY_ACTIVE_KEY);
      return legacy;
    }
  } catch (e) { /* storage unavailable — fall back below */ }
  return null;
}

export function rememberHousehold(clerkId, id) {
  try { if (clerkId) localStorage.setItem(activeKeyFor(clerkId), id); } catch (e) { /* storage unavailable */ }
}

// This user's remembered place if still a member; else the first returned
// (get_my_households orders oldest-joined first) — the same fallback as before.
export function pickActiveHousehold(clerkId, households) {
  return readRememberedHousehold(clerkId, households) ?? households[0]?.id ?? null;
}
