// src/contexts/ActiveHouseholdContext.js
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createSupabaseClient } from "../lib/supabaseClient";

const ActiveHouseholdContext = createContext(null);

export function ActiveHouseholdProvider({ getToken, clerkId, children }) {
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

  // In-flight guard — true while auto-provision is running (step 3).
  const provisioningRef = useRef(false);
  // Voluntary-leave marker — set before leave RPC so presence check ignores the removal (step 5).
  const selfDepartureRef = useRef(false);

  useEffect(() => {
    if (!clerkId || !getTokenRef.current) {
      setLoadingHouseholds(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const db = createSupabaseClient(getTokenRef.current);

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
      const db = createSupabaseClient(getTokenRef.current);
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

  const markSelfDeparture = useCallback(() => {
    selfDepartureRef.current = true;
  }, []);

  useEffect(() => {
    if (!clerkId) return;

    const checkPresence = async () => {
      if (provisioningRef.current) return;
      if (!getTokenRef.current) return;
      try {
        const db = createSupabaseClient(getTokenRef.current);
        const { data, error } = await db.rpc("get_my_households");
        // Transient guard: error or empty list means we can't confirm removal — hold position.
        if (error || !data || data.length === 0) return;
        const households = data.map((row) => ({
          id: row.household_id,
          name: row.name,
          role: row.role,
        }));
        myHouseholdsRef.current = households;
        setMyHouseholds(households);
        if (households.some((h) => h.id === activeHouseholdIdRef.current)) return;
        console.log("[Layer2] active household vanished — removal response is step 3");
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
        markSelfDeparture,
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
