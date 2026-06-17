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

  useEffect(() => {
    if (!clerkId || !getTokenRef.current) {
      setLoadingHouseholds(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const db = createSupabaseClient(getTokenRef.current);

        // Resolve the internal user UUID from the Clerk JWT sub claim.
        // NOTE: household_members RLS is currently keyed by household_id
        // (get_current_household_id()), not user_id — so the eq("user_id") filter below
        // may only return one row even for multi-household users once the switcher is live.
        // If that happens, replace with a dedicated get_my_households() RPC.
        const { data: internalUserId, error: uidErr } = await db.rpc("get_current_user_id");
        if (uidErr || !internalUserId) {
          console.error("[ActiveHousehold] get_current_user_id failed:", uidErr);
          if (!cancelled) setLoadingHouseholds(false);
          return;
        }

        const { data, error } = await db
          .from("household_members")
          .select("role, households(id, name)")
          .eq("user_id", internalUserId)
          .is("deleted_at", null);

        if (error) {
          console.error("[ActiveHousehold] household_members query failed:", error);
          if (!cancelled) setLoadingHouseholds(false);
          return;
        }

        const households = (data || [])
          .filter((row) => row.households)
          .map((row) => ({
            id: row.households.id,
            name: row.households.name,
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

  return (
    <ActiveHouseholdContext.Provider
      value={{
        myHouseholds,
        activeHouseholdId,
        switchHousehold,
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
