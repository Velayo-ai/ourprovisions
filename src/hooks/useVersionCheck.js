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
  // Offline, the notice hides even when a newer bundle is already known: Reload with no connection would
  // leave an installed app on a "no internet" page instead of the app (found by the harness pre-walk).
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
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
    const onOnline = () => { setOnline(true); check(); };
    const onOffline = () => setOnline(false);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const id = setInterval(() => { if (document.visibilityState === "visible") check(); }, intervalMs);
    check();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(id);
    };
  }, [check, intervalMs]);

  const dismiss = useCallback(() => setDismissed(true), []);
  const reload = useCallback(() => window.location.reload(), []);
  return { show: newer && !dismissed && online, dismiss, reload };
}
