// src/contexts/ActiveHouseholdContext.js
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { trace } from "@opentelemetry/api";
import { createSupabaseClient } from "../lib/supabaseClient";
import { setHousehold } from "../rum";
import { isSessionHealthy } from "../lib/authHealth";

const ActiveHouseholdContext = createContext(null);

// Resolves to the provider SplunkOtelWeb.init() registers in src/rum.js. Module-level is
// safe: getTracer returns a proxy that binds to the real provider once registered, so
// import order does not matter. With no RUM token (local dev) the API's no-op provider
// stands in and these spans cost nothing.
const tracer = trace.getTracer("ourprovisions-app");

// clerkId arrives already gated on the LIVE session (App.js passes undefined the
// moment the session is not live — Clerk signed out, or the token gone
// LOST_STREAK ticks running), and sessionId keys the two effects below so the
// same person signing back in re-resolves. See SPEC_auth_state_ui_gating.md.
export function ActiveHouseholdProvider({ getToken, clerkId, sessionId, onRemoval, children }) {
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

  // D5 (SPEC_rum_dxa_exposure.md): the active household is a RUM segment
  // dimension. One effect at the resolution point covers every way the lens
  // moves — initial resolve, switchHousehold, loss recovery — and null stops
  // the stamp. The id only; the name is text and text is masked on prod.
  //
  // 053 / D8 (SPEC_learning_qualification.md): the two global learning-
  // exclusion flags ride the same stamp. The id is stamped immediately (and
  // both flag attributes retired) so no span carries a previous household's
  // flags; the flags follow once read. Two row reads the existing SELECT
  // policies already admit — households by membership, users by own clerk_id
  // — telemetry-only, in their own try/catch, never on the user's path. A
  // read that returns no row leaves its attribute retired rather than
  // asserting false. `get_my_households` is deliberately untouched.
  useEffect(() => {
    setHousehold(activeHouseholdId);
    if (!activeHouseholdId || !clerkId || !getTokenRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const db = getDb();
        const [householdRes, userRes] = await Promise.all([
          db.from("households").select("excluded_from_learning").eq("id", activeHouseholdId).maybeSingle(),
          db.from("users").select("excluded_from_learning").eq("clerk_id", clerkId).maybeSingle(),
        ]);
        if (cancelled) return;
        const h = householdRes?.data;
        const u = userRes?.data;
        setHousehold(activeHouseholdId, {
          household: h ? h.excluded_from_learning === true : undefined,
          user: u ? u.excluded_from_learning === true : undefined,
        });
      } catch (e) {
        // Telemetry never reaches the user.
      }
    })();

    return () => {
      cancelled = true;
    };
    // getDb is a stable closure over refs; listing it would only re-fire the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHouseholdId, clerkId]);

  useEffect(() => {
    if (!clerkId || !getTokenRef.current) {
      // §Sign-out reset (mirror). No live session: drop the client (its getToken
      // would only ever refuse now), the list and the lens. The watchdog effect
      // below returns early on !clerkId and its cleanup already cleared the
      // interval, so nothing can fire on a stale dbRef. On first mount this is
      // a no-op over already-empty state.
      dbRef.current = null;
      myHouseholdsRef.current = [];
      setMyHouseholds([]);
      setActiveHouseholdId(null);
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
  }, [clerkId, sessionId]);

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
      // §Polling discipline: not in `ready` → hold. clerkId is withdrawn the render
      // after the session stops being live and this interval is cleared with it;
      // this read closes the gap for a tick already in flight.
      if (!isSessionHealthy()) return;
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
        // A null lens is NOT a removal (prod, 2026-09-24). A brand-new user's first
        // get_my_households can return [] before bootstrap_new_user has minted their
        // place, so the lens settles on null; when the poll next saw a list that did
        // not "contain" null it took the removal path — probe (id=eq.null → 400),
        // span, "No longer a member of…" — at someone who had just named their first
        // place. Nothing was lost: adopt the first household silently and return.
        if (activeHouseholdIdRef.current == null) {
          if (households.length > 0) switchHousehold(households[0].id);
          return;
        }
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
  }, [clerkId, sessionId]);

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
