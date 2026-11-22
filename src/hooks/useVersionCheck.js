import { useCallback, useEffect, useRef, useState } from "react";
import { VERSION_CHECK_INTERVAL_MS, runningMainScript, fetchLatestMain, isNewVersion } from "../lib/versionCheck";

// SPEC_app_version_check V1 + V2. Checks once at startup, on every visibilitychange → visible, and every
// 10 minutes while the page is visible and online. { show } is true when the deployed bundle differs
// from the running one and the notice hasn't been dismissed in this foreground. dismiss() hides it until
// the next foreground (which checks again); reload() is a plain location.reload() — never automatic.
// Offline or a failed fetch: nothing changes and nothing is sent. The caller decides when it may
// appear (never during an Ask run, never over another toast).
export function useVersionCheck({ intervalMs = VERSION_CHECK_INTERVAL_MS, fetchImpl, doc } = {}) {
  const runningRef = useRef(undefined);
  if (runningRef.current === undefined) runningRef.current = runningMainScript(doc || (typeof document !== "undefined" ? document : null));
  const [newer, setNewer] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const inFlight = useRef(false);

  const check = useCallback(async () => {
    if (!runningRef.current || inFlight.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    inFlight.current = true;
    try {
      const latest = await fetchLatestMain(fetchImpl);
      // Only a real answer moves the flag: a rollback to the running bundle clears it again.
      if (latest) setNewer(isNewVersion(runningRef.current, latest));
    } finally {
      inFlight.current = false;
    }
  }, [fetchImpl]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setDismissed(false);   // a new foreground: a dismissed notice may come back (once per foreground)
      check();
    };
    document.addEventListener("visibilitychange", onVisible);
    const id = setInterval(() => { if (document.visibilityState === "visible") check(); }, intervalMs);
    check();
    return () => { document.removeEventListener("visibilitychange", onVisible); clearInterval(id); };
  }, [check, intervalMs]);

  const dismiss = useCallback(() => setDismissed(true), []);
  const reload = useCallback(() => window.location.reload(), []);
  return { show: newer && !dismissed, dismiss, reload };
}
