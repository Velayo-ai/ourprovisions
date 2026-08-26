// src/contexts/ActiveHouseholdContext.js
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { trace } from "@opentelemetry/api";
import { createSupabaseClient } from "../lib/supabaseClient";

const ActiveHouseholdContext = createContext(null);

// Resolves to the provider SplunkOtelWeb.init() registers in src/rum.js. Module-level is
// safe: getTracer returns a proxy that binds to the real provider once registered, so
// import order does not matter. With no RUM token (local dev) the API's no-op provider
// stands in and these spans cost nothing.
const tracer = trace.getTracer("ourprovisions-app");

export function ActiveHouseholdProvider({ getToken, clerkId, onRemoval, children }) {
  const [myHouseholds, setMyHouseholds] = useState([]);
  const [activeHouseholdId, setActiveHouseholdId] = useState(null);
  const [loadingHouseholds, setLoadingHouseholds] = useState(true);

  // Stable ref so the effect doesn't re-fire when getToken identity changes each render.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  // Keep a ref in sync so switchHousehold can validate ids without capturing stale state.
  const myHouseholdsRef = useRef([]);

  // Mirrors activeHouseholdId each render; read by the presence-check interval (step 2).
  const activeHouseholdIdRef = useRef(null);
  activeHouseholdIdRef.current = activeHouseholdId;

  // Wall-clock stamp of when the lens last MOVED to a different household. Instrumentation
  // only — nothing branches on it. It answers the question the removal trace exists to
  // settle: was the household the poll just declared gone one the user had been sitting in
  // for an hour, or one they switched into three seconds ago? The latter is a race with
  // membership propagation, not a removal.
  const activeSinceRef = useRef(null);
  const prevActiveIdRef = useRef(null);
  if (prevActiveIdRef.current !== activeHouseholdId) {
    prevActiveIdRef.current = activeHouseholdId;
    activeSinceRef.current = activeHouseholdId ? Date.now() : null;
  }

  // In-flight guard — true while auto-provision is running (step 3).
  const provisioningRef = useRef(false);
  // True while resolveAfterHouseholdLoss is mid-flight — checkPresence defers to it
  // so the watchdog poll can't double-fire a removal the deliberate path is already handling.
  const resolvingRef = useRef(false);
  // Raised by the deliberate delete/leave handlers BEFORE their RPC, so the
  // watchdog poll defers across the whole action — RPC + resolution — not just
  // the resolver's lifetime. Cleared by the handler in finally.
  const deliberateLossRef = useRef(false);
  const beginDeliberateLoss = useCallback(() => { deliberateLossRef.current = true; }, []);
  const endDeliberateLoss = useCallback(() => { deliberateLossRef.current = false; }, []);

  // Kept current so checkPresence can fire the removal notice without a stale closure.
  const onRemovalRef = useRef(onRemoval);
  onRemovalRef.current = onRemoval;

  // Sticky name ref — updates only when the active household is positively resolvable;
  // retains the last known name across refreshHouseholds calls that drop the departed household.
  const activeHouseholdNameRef = useRef(null);
  const activeHouseholdNameResolved = myHouseholds.find((h) => h.id === activeHouseholdId)?.name;
  if (activeHouseholdNameResolved) activeHouseholdNameRef.current = activeHouseholdNameResolved;

  // Cached client — created once per session; createSupabaseClient closes over getToken as a
  // function so every request fetches a fresh token. Re-creating per call stacks GoTrueClients.
  const dbRef = useRef(null);
  const getDb = () => {
    if (!dbRef.current) dbRef.current = createSupabaseClient(getTokenRef.current, "op-household");
    return dbRef.current;
  };

  useEffect(() => {
    if (!clerkId || !getTokenRef.current) {
      setLoadingHouseholds(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const db = getDb();

        const { data, error } = await db.rpc("get_my_households");

        if (error) {
          console.error("[ActiveHousehold] get_my_households failed:", error);
          if (!cancelled) setLoadingHouseholds(false);
          return;
        }

        const households = (data || []).map((row) => ({
          id: row.household_id,
          name: row.name,
          role: row.role,
        }));

        if (cancelled) return;

        myHouseholdsRef.current = households;
        setMyHouseholds(households);

        // Prefer last-selected household from localStorage if it's still a valid membership;
        // otherwise fall back to the first returned (oldest / default ordering from DB).
        const stored = localStorage.getItem("activeHouseholdId");
        const isValid = households.some((h) => h.id === stored);
        setActiveHouseholdId(isValid ? stored : (households[0]?.id ?? null));
      } catch (err) {
        console.error("[ActiveHousehold] unexpected error:", err);
      } finally {
        if (!cancelled) setLoadingHouseholds(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkId]);

  const switchHousehold = useCallback((id) => {
    if (!myHouseholdsRef.current.some((h) => h.id === id)) return;
    localStorage.setItem("activeHouseholdId", id);
    setActiveHouseholdId(id);
  }, []);

  const refreshHouseholds = useCallback(async () => {
    if (!clerkId || !getTokenRef.current) return;
    try {
      const db = getDb();
      const { data, error } = await db.rpc("get_my_households");
      if (error) {
        console.error("[ActiveHousehold] refreshHouseholds failed:", error);
        return;
      }
      const households = (data || []).map((row) => ({
        id: row.household_id,
        name: row.name,
        role: row.role,
      }));
      myHouseholdsRef.current = households;
      setMyHouseholds(households);
    } catch (err) {
      console.error("[ActiveHousehold] refreshHouseholds unexpected error:", err);
    }
  }, [clerkId]);

  // Single switch-or-provision path — shared by checkPresence and resolveAfterHouseholdLoss.
  // Fetches the authoritative current list (avoids stale-closure reads), then switches to a
  // survivor or auto-provisions a fresh household, with provisioningRef guarding against races.
  // notifyRemoval=false when the caller is the actor who voluntarily deleted (owner path);
  // true when the caller is checkPresence reacting to an external removal.
  const resolveAfterHouseholdLoss = useCallback(async (lostId, notifyRemoval, lostName) => {
    if (provisioningRef.current) return;
    if (resolvingRef.current) return;      // re-entrancy guard
    resolvingRef.current = true;           // set synchronously, before any await
    try {
      await refreshHouseholds(); // populates myHouseholdsRef.current with the authoritative list
      const remaining = myHouseholdsRef.current.filter((h) => h.id !== lostId);
      // Name the household actually lost; fall back to the sticky ref if the caller didn't supply one.
      const lostLabel = lostName ?? activeHouseholdNameRef.current;
      if (remaining.length >= 1) {
        if (notifyRemoval) onRemovalRef.current?.(lostLabel, false);
        switchHousehold(remaining[0].id);
      } else {
        if (notifyRemoval) onRemovalRef.current?.(lostLabel, true);
        provisioningRef.current = true;
        try {
          const db = getDb();
          const { data: created, error: createErr } = await db.rpc("create_household", {
            p_name: "My Household",
            p_clerk_id: clerkId,
          });
          if (createErr) throw createErr;
          await refreshHouseholds();
          if (created?.household_id) switchHousehold(created.household_id);
        } finally {
          provisioningRef.current = false;
        }
      }
    } finally {
      resolvingRef.current = false;        // self-clearing — no lingering flag
    }
  }, [clerkId, refreshHouseholds, switchHousehold]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!clerkId) return;

    const checkPresence = async () => {
      if (provisioningRef.current) return;
      if (resolvingRef.current) return;   // a deliberate loss-resolution owns this — don't double-fire
      if (deliberateLossRef.current) return;   // a deliberate delete/leave owns this window
      if (!getTokenRef.current) return;
      try {
        const db = getDb();
        const { data, error } = await db.rpc("get_my_households");
        // Transient guard: only a failed fetch (error) or null data holds position.
        // A successful empty result (error=null, data=[]) is a legitimate removal signal —
        // the user was removed from their last household. Let it through.
        if (error || !data) return;
        // Capture the departing household's name from the list we last saw it in,
        // BEFORE overwriting myHouseholdsRef below — so the banner names the household
        // actually lost, not a stale sticky ref.
        const lostName = myHouseholdsRef.current.find(
          (h) => h.id === activeHouseholdIdRef.current
        )?.name;
        const households = data.map((row) => ({
          id: row.household_id,
          name: row.name,
          role: row.role,
        }));
        myHouseholdsRef.current = households;
        setMyHouseholds(households);
        if (households.some((h) => h.id === activeHouseholdIdRef.current)) return;
        // Active household vanished from a healthy list — user was removed (or left).

        // ── RUM instrumentation (2026-08-25). INSTRUMENTATION ONLY — no behaviour
        // change, no fix. This is the ONLY code path that reaches the "No longer a
        // member of…" notice, and it is a 30s poll, so a recurrence needs a trace to
        // read rather than a reconstruction to argue about.
        //
        // The discriminator is `household.row_still_readable`. households' SELECT policy
        // is is_member_of(id), so if the row is STILL readable here, RLS says we are a
        // member while get_my_households said we are not — a contradiction that means
        // false positive. Unreadable means the removal is real. Best-effort and fully
        // guarded: telemetry must never be able to break the notice it observes.
        const lostId = activeHouseholdIdRef.current;
        let deletedAt = null;
        let rowReadable = false;
        let createdAt = null;
        try {
          const { data: row } = await db
            .from("households")
            .select("id, deleted_at, created_at")
            .eq("id", lostId)
            .maybeSingle();
          if (row) {
            rowReadable = true;
            deletedAt = row.deleted_at;
            createdAt = row.created_at;
          }
        } catch (probeErr) { /* unreadable is itself the signal — record it as false */ }

        try {
          const span = tracer.startSpan("membership.removal-detected");
          span.setAttributes({
            "household.id": lostId ?? "unknown",
            "household.name": lostName ?? "unknown",
            "household.deleted_at": deletedAt ?? "unavailable",
            "user.clerk_id": clerkId ?? "unknown",
            "trigger.source": "poll",
            "household.age_seconds": activeSinceRef.current
              ? Math.round((Date.now() - activeSinceRef.current) / 1000)
              : -1,
            // Supporting detail — each one separates a real removal from a race:
            "poll.interval_ms": 30000,
            "household.row_still_readable": rowReadable,
            "household.created_at": createdAt ?? "unavailable",
            "households.returned_count": households.length,
            "resolution.path": households.length === 0 ? "provision" : "switch",
          });
          span.end();
        } catch (rumErr) { /* never let telemetry break the notice */ }

        await resolveAfterHouseholdLoss(activeHouseholdIdRef.current, true, lostName);
      } catch (err) {
        // transient — hold position
      }
    };

    const intervalId = setInterval(checkPresence, 30000);
    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clerkId]);

  return (
    <ActiveHouseholdContext.Provider
      value={{
        myHouseholds,
        activeHouseholdId,
        switchHousehold,
        refreshHouseholds,
        resolveAfterHouseholdLoss,
        beginDeliberateLoss,
        endDeliberateLoss,
        loadingHouseholds,
        hasMultiple: myHouseholds.length > 1,
      }}
    >
      {children}
    </ActiveHouseholdContext.Provider>
  );
}

export function useActiveHousehold() {
  const ctx = useContext(ActiveHouseholdContext);
  if (!ctx) throw new Error("useActiveHousehold must be used inside ActiveHouseholdProvider");
  return ctx;
}
