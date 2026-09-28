// src/lib/holdRetry.js — the hold-and-retry pattern for a one-shot read
// (SPEC_auth_state_ui_gating.md Amendment 2026-09-27, A2/A3/A7).
//
// A first request that dies on a cold radio ("TypeError: Load failed" on an
// iPhone just off Airplane Mode) is a HOLD, never an error and never terminal.
// The caller reports to the connectivity pill and schedules the next attempt
// here: bounded backoff 1, 2, 4, 8, 16 s, then every 30 s — PLUS an immediate
// attempt the moment the browser says `online` or the page becomes visible
// again. navigator.onLine is a hint only (it can read true before the radio is
// up), so the timer, not the event, is what guarantees recovery.
//
// Returns a cancel function. The caller invokes it from its effect cleanup so
// an identity change, a sign-out or a successful attempt never lets a stale
// retry fire.
export const HOLD_BACKOFF_MS = [1000, 2000, 4000, 8000, 16000];
export const HOLD_STEADY_MS = 30000;

// `failures` = consecutive transient failures so far, 1 for the first.
export function holdDelayMs(failures) {
  const n = Math.max(1, failures | 0);
  return n <= HOLD_BACKOFF_MS.length ? HOLD_BACKOFF_MS[n - 1] : HOLD_STEADY_MS;
}

export function scheduleHoldRetry(failures, onRetry) {
  let done = false;
  const onOnline = () => fire();
  const onVisible = () => { if (document.visibilityState === "visible") fire(); };
  const cleanup = () => {
    clearTimeout(timer);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
  const fire = () => {
    if (done) return;
    done = true;
    cleanup();
    onRetry();
  };
  const timer = setTimeout(fire, holdDelayMs(failures));
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  return () => { done = true; cleanup(); };
}
