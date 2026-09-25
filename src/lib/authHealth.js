// src/lib/authHealth.js — token health (SPEC_auth_state_ui_gating.md, D1–D3)
//
// The one auth signal Clerk's hooks do not give us: whether getToken() is
// actually returning a token. Clerk can report isSignedIn while the session
// behind it is gone (prod, 2026-09-24 — 27 anon 401s over four minutes under a
// SIGN IN header). Every Supabase request asks for a fresh token, so the fetch
// wrapper in supabaseClient.js is the natural probe: it reports here on every
// call, and App.js derives authPhase (D2) from Clerk's flags plus this store.
//
// Module singleton on purpose. Two Supabase clients (useProvisions' and the
// household context's) share it without prop-drilling, and it must survive a
// component remount — a remount is not a new session. useSyncExternalStore
// keeps React reads tear-free.
import { useSyncExternalStore } from "react";

// Consecutive null tokens before a signed-in session is treated as lost. The
// pollers tick every 2s, so this is ~6s of "Clerk says yes, the token says no".
export const LOST_STREAK = 3;

// rejectedStatus: the HTTP status (401 | 403) a POLLER got back with a token
// attached — the server says this session is not one. Set once, cleared only by
// a new session. Reads denied by RLS return empty rows, not 403, so this fires
// only when auth itself is refused; writes never report here (an RLS-denied
// INSERT is a 403 too, and it is not a session loss).
let state = { nullStreak: 0, lastTokenAt: null, rejectedStatus: null };
const listeners = new Set();
// Raised by the profile sheet's Sign out before it calls Clerk, so the
// ready → signed_out transition that follows reads as a choice, not a loss.
let deliberateSignOut = false;

function emit() {
  for (const l of listeners) l();
}

// Called by the fetch wrapper on every request: present=true resets the
// streak and stamps lastTokenAt; false lengthens the streak.
export function reportToken(present) {
  if (present) {
    if (state.nullStreak === 0 && state.lastTokenAt !== null && Date.now() - state.lastTokenAt < 1000) {
      state.lastTokenAt = Date.now(); // hot path: no listener churn for back-to-back OK tokens
      return;
    }
    state = { ...state, nullStreak: 0, lastTokenAt: Date.now() };
  } else {
    state = { ...state, nullStreak: state.nullStreak + 1 };
  }
  emit();
}

// §Polling discipline: a poller's request carried a token and the server
// answered 401/403. Auth errors never retry — they end the loop and change
// state; useSessionLive goes false and App.js raises session_lost.
export function reportAuthRejected(status) {
  if (state.rejectedStatus) return;
  state = { ...state, rejectedStatus: status };
  emit();
}

// A NEW Clerk session (sessionId changed) starts with a clean slate. Never
// call this on a token arriving — a lost session recovers only by signing in.
export function resetAuthHealth() {
  if (state.nullStreak === 0 && state.lastTokenAt === null && state.rejectedStatus === null) return;
  state = { nullStreak: 0, lastTokenAt: null, rejectedStatus: null };
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

// "Live" = Clerk loaded and signed in AND the token has not gone missing
// LOST_STREAK times running. This is the gate every household-scoped effect
// keys on; isSignedIn alone is what let the anon downgrade happen.
export function useSessionLive({ isLoaded, isSignedIn }) {
  const { nullStreak, rejectedStatus } = useAuthHealth();
  return !!isLoaded && !!isSignedIn && nullStreak < LOST_STREAK && !rejectedStatus;
}

// Non-hook read for interval callbacks (the household watchdog).
export function isSessionHealthy() {
  return state.nullStreak < LOST_STREAK && !state.rejectedStatus;
}
