import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuthHealth } from "../lib/authHealth";

const OFFLINE_THRESHOLD = 3;
const RECOVERED_DURATION = 2000;

const ConnectivityContext = createContext(null);

export function ConnectivityProvider({ children }) {
  const [connState, setConnState] = useState("online");
  const failureCount = useRef(0);
  const recoveredTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (recoveredTimer.current) clearTimeout(recoveredTimer.current);
    };
  }, []);

  const reportTransientFailure = useCallback(() => {
    setConnState((prev) => {
      if (prev === "offline") return prev;

      failureCount.current += 1;

      if (failureCount.current >= OFFLINE_THRESHOLD) return "offline";
      if (prev === "online" || prev === "recovered") return "reconnecting";
      return prev;
    });
  }, []);

  // V5 pill bug (2026-09-24): only the FIRST offline episode ever showed a pill.
  // This provider inferred "offline" from failed requests — and once the polling
  // gate (authHealth.isPollingOpen) started skipping ticks while navigator.onLine
  // is false, nothing fails while offline, so nothing was ever reported. Now the
  // pill subscribes to the same signal the gate uses: while onLine is false it
  // reads "Reconnecting…" for as long as that lasts, and the offline → online
  // edge shows "Back online" every time, not only when a prior failure had moved
  // the state off "online". The failure counter stays as the one-bar fallback
  // (onLine true, requests failing).
  const { online } = useAuthHealth();
  const wasOfflineRef = useRef(false);
  const markRecovered = useCallback(() => {
    failureCount.current = 0;
    if (recoveredTimer.current) clearTimeout(recoveredTimer.current);
    recoveredTimer.current = setTimeout(() => {
      setConnState("online");
    }, RECOVERED_DURATION);
    setConnState("recovered");
  }, []);
  useEffect(() => {
    if (!online) { wasOfflineRef.current = true; return; }
    if (!wasOfflineRef.current) return;
    wasOfflineRef.current = false;
    markRecovered();
  }, [online, markRecovered]);

  const reportSuccess = useCallback(() => {
    setConnState((prev) => {
      if (prev === "online") return prev;

      failureCount.current = 0;

      if (recoveredTimer.current) clearTimeout(recoveredTimer.current);
      recoveredTimer.current = setTimeout(() => {
        setConnState("online");
      }, RECOVERED_DURATION);

      return "recovered";
    });
  }, []);

  return (
    <ConnectivityContext.Provider value={{ connState: online ? connState : "reconnecting", reportTransientFailure, reportSuccess }}>
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
