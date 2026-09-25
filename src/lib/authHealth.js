// src/lib/authHealth.js — token health and the polling gate
// (SPEC_auth_state_ui_gating.md D1–D3; Amendment 2026-09-24 "offline is not auth loss")
//
// Two questions, kept apart on purpose:
//   1. Is there a session?  Clerk's own React context answers this (isLoaded,
//      isSignedIn). It is the ONE signal that can end a session in this app.
//   2. Can we fetch right now?  This store answers that: has getToken been
//      failing, is the device offline, did the server just refuse a token. Any
//      "no" here is a HOLD — pollers skip, the UI stays, the pill says
//      "Reconnecting…" — never a loss. A grocery aisle with one bar, or a boat
//      between marina wifi and nothing, must never look like a lost account
//      (V5, 2026-09-24: 20s of DevTools Offline put the signed-out sheet over a
//      session Clerk still held).
//
// Module singleton on purpose. Two Supabase clients (useProvisions' and the
// household context's) share it without prop-drilling, and it survives a
// component remount — a remount is not a new session. useSyncExternalStore
// keeps React reads tear-free.
import { useSyncExternalStore } from "react";

// After a 401/403 with a token attached, pollers sit out this long before the
// next attempt. Clerk's own client refresh decides whether the session is gone;
// this just stops a 2s loop from hammering a refusal.
export const REJECTED_HOLD_MS = 10000;

const initialOnline = typeof navigator === "undefined" ? true : navigator.onLine !== false;
let state = {
  nullStreak: 0,        // consecutive getToken failures of ANY class — a hold signal, never a loss signal
  clerkFailStreak: 0,   // the subset Clerk itself reported (instrumentation; still not a loss signal)
  lastFailClass: null,  // 'network' | 'clerk' | null — what the most recent failure was
  lastTokenAt: null,
  rejectedAt: null,     // last 401/403 a poller got with a token attached
  rejectedStatus: null,
  online: initialOnline,
};
const listeners = new Set();
// Raised by the profile sheet's Sign out before it calls Clerk, so the
// ready → signed_out transition that follows reads as a choice, not a loss.
let deliberateSignOut = false;

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { if (!state.online) { state = { ...state, online: true }; emit(); } });
  window.addEventListener("offline", () => { if (state.online) { state = { ...state, online: false }; emit(); } });
}

// network: the request to Clerk never completed (offline, DNS, reset). Clerk
// answered nothing, so Clerk said nothing about the session.
// clerk:   Clerk answered — with null (no session to mint for) or an API error.
// Neither class raises session_lost; the class rides on the spans so a future
// incident can be read, not reconstructed.
export function classifyTokenFailure(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "network";
  if (!err) return "clerk";
  const msg = typeof err.message === "string" ? err.message : "";
  if (err.name === "TypeError") return "network";
  if (/Failed to fetch|NetworkError|Load failed|ERR_NETWORK|ERR_CONNECTION|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|network/i.test(msg)) return "network";
  return "clerk";
}

// Called by the fetch wrapper on every request: present=true resets the
// streaks and stamps lastTokenAt; false lengthens them (failClass says which).
export function reportToken(present, failClass) {
  if (present) {
    if (state.nullStreak === 0 && state.lastTokenAt !== null && Date.now() - state.lastTokenAt < 1000) {
      state.lastTokenAt = Date.now(); // hot path: no listener churn for back-to-back OK tokens
      return;
    }
    state = { ...state, nullStreak: 0, clerkFailStreak: 0, lastFailClass: null, lastTokenAt: Date.now() };
  } else {
    state = {
      ...state,
      nullStreak: state.nullStreak + 1,
      clerkFailStreak: failClass === "clerk" ? state.clerkFailStreak + 1 : state.clerkFailStreak,
      lastFailClass: failClass || "clerk",
    };
  }
  emit();
}

// §Polling discipline: a poller's request carried a token and the server
// answered 401/403. The pollers hold for REJECTED_HOLD_MS, then try once more;
// whether the session is actually gone is Clerk's call (its client refresh
// ends the session, and that ends the hold as a loss), not this store's.
export function reportAuthRejected(status) {
  state = { ...state, rejectedAt: Date.now(), rejectedStatus: status };
  emit();
}

// A NEW Clerk session (sessionId changed) starts with a clean slate.
export function resetAuthHealth() {
  if (state.nullStreak === 0 && state.clerkFailStreak === 0 && state.lastTokenAt === null && state.rejectedAt === null) return;
  state = { ...state, nullStreak: 0, clerkFailStreak: 0, lastFailClass: null, lastTokenAt: null, rejectedAt: null, rejectedStatus: null };
  emit();
}

export function markDeliberateSignOut() { deliberateSignOut = true; }
export function consumeDeliberateSignOut() {
  const was = deliberateSignOut;
  deliberateSignOut = false;
  return was;
}

export function getAuthHealth() { return state; }
export function subscribeAuthHealth(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAuthHealth() {
  return useSyncExternalStore(subscribeAuthHealth, getAuthHealth, getAuthHealth);
}

// "Live" = Clerk loaded and signed in. Clerk's word only — token trouble and
// offline are holds (see isPollingOpen / authPhase), never the end of a session.
export function useSessionLive({ isLoaded, isSignedIn }) {
  return !!isLoaded && !!isSignedIn;
}

// The gate every poll TICK runs through (non-hook, for interval callbacks).
// Offline: closed — nothing is sent into the void; the `online` event gives one
// immediate tick. Recently refused (401/403): closed until the hold lapses, then
// the hold clears itself so the next tick can try; a fresh refusal re-arms it.
// A missing token does NOT close the gate: the tick must run for the wrapper to
// ask Clerk again, which is the only way the streak ever resets.
export function isPollingOpen() {
  if (!state.online) return false;
  if (state.rejectedAt) {
    if (Date.now() - state.rejectedAt < REJECTED_HOLD_MS) return false;
    state = { ...state, rejectedAt: null, rejectedStatus: null };
    emit();
  }
  return true;
}
