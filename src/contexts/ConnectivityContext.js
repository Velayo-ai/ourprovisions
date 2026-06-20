import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

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
    <ConnectivityContext.Provider value={{ connState, reportTransientFailure, reportSuccess }}>
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
