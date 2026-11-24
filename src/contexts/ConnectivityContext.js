import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuthHealth } from "../lib/authHealth";
import { nextOffline } from "../lib/offlineMode";

// Offline is a mode, not a problem (SPEC_offline_calm_2026-11-23). This provider answers ONE question for
// the whole app, `offline`, and the header's small icon is its only standing sign (C2). The old three-state
// pill ("Reconnecting…", "Offline — showing last saved", "Back online") is gone (C4, C7).
//
// Raw offline = the device reports offline, or the latest request failed for want of a network (one bar
// counts as offline, C5). A device-offline spell counts as a failure, so coming back clears only after
// the next successful request (iOS can report online before the radio is up). The shown state clears only
// after OFFLINE_HOLD_MS of steady signal (lib/offlineMode nextOffline), so it never flicks back and forth.
//
// reportTransientFailure / reportSuccess keep their names and callers: every request path that already
// reported to the old pill now feeds this.
const ConnectivityContext = createContext(null);

export function ConnectivityProvider({ children }) {
  const { online } = useAuthHealth();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const lastFailAt = useRef(online ? 0 : Date.now());
  const lastOkAt = useRef(0);
  const modeRef = useRef(online ? { shown: false, raw: false, steadySince: null } : { shown: true, raw: true, steadySince: null });
  const [offline, setOffline] = useState(!online);
  const timerRef = useRef(null);
  const evaluateRef = useRef(null);
  // C9: the tab beacon waits on "that tab's first fetch" — the next request result after a switch.
  // onRequestResult(fn) → unsubscribe; fn(true) on a success, fn(false) on a network failure.
  const resultListeners = useRef(new Set());
  const emitResult = (ok) => { [...resultListeners.current].forEach((fn) => { try { fn(ok); } catch (e) { /* a listener never breaks a report */ } }); };
  const onRequestResult = useCallback((fn) => {
    resultListeners.current.add(fn);
    return () => resultListeners.current.delete(fn);
  }, []);

  evaluateRef.current = () => {
    const now = Date.now();
    const raw = !onlineRef.current || lastFailAt.current > lastOkAt.current;
    const n = nextOffline(modeRef.current, raw, now);
    modeRef.current = { shown: n.shown, raw: n.raw, steadySince: n.steadySince };
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (n.clearAt) timerRef.current = setTimeout(() => evaluateRef.current(), Math.max(0, n.clearAt - now) + 25);
    setOffline(n.shown);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  useEffect(() => {
    if (!online) lastFailAt.current = Date.now();
    evaluateRef.current();
  }, [online]);

  const reportTransientFailure = useCallback(() => {
    lastFailAt.current = Date.now();
    evaluateRef.current();
    emitResult(false);
  }, []);

  const reportSuccess = useCallback(() => {
    const now = Date.now();
    // Same millisecond as a failure: the failure stands (no answer is not an answer).
    if (now <= lastFailAt.current) return;
    lastOkAt.current = now;
    if (modeRef.current.shown) evaluateRef.current();   // the 2 s poll's successes cost nothing while online
    if (resultListeners.current.size) emitResult(true);
  }, []);

  return (
    <ConnectivityContext.Provider value={{ offline, reportTransientFailure, reportSuccess, onRequestResult }}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity() {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) throw new Error("useConnectivity must be used inside ConnectivityProvider");
  return ctx;
}

export default ConnectivityProvider;
