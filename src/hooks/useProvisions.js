// src/hooks/useProvisions.js
import { useState, useEffect, useCallback, useRef } from "react";
import { createSupabaseClient } from "../lib/supabaseClient";

export function useProvisions({ getToken, userId, clerkId, email }) {
  const [quantities, setQuantities] = useState({});
  const [checked, setChecked] = useState({});
  const [prices, setPrices] = useState({});
  const [household, setHousehold] = useState(null);
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [catalogMap, setCatalogMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const supabaseRef = useRef(null);
  const householdRef = useRef(null);   // mirrors household for use inside callbacks
  const catalogRef = useRef({});       // mirrors catalogMap for use inside callbacks
  const internalUserIdRef = useRef(null);
  const clerkIdRef = useRef(null);
  const pendingWrites = useRef(0);  // count of in-flight DB writes

  async function loadListItems(db, householdId) {
    // Don't overwrite optimistic state while writes are in-flight
    if (pendingWrites.current > 0) return;
    const { data: items, error: listErr } = await db
      .from("list_items")
      .select("id, catalog_item_id, quantity, price_per_unit, status, catalog_items(name)")
      .eq("household_id", householdId)
      .is("deleted_at", null)
      .in("status", ["pending", "bought"]);

    if (listErr) { setError(`Could not load list: ${listErr.message}`); return; }

    const newQty = {};
    const newChecked = {};
    const newPrices = {};
    items.forEach((item) => {
      const name = item.catalog_items?.name;
      if (!name) return;
      newQty[name] = item.quantity;
      newChecked[name] = item.status === "bought";
      if (item.price_per_unit != null) newPrices[name] = parseFloat(item.price_per_unit);
    });
    setQuantities(newQty);
    setChecked(newChecked);
    setPrices(newPrices);
  }

  useEffect(() => {
    // Don't attempt Supabase calls until Clerk has resolved auth
    if (!getToken || !userId || !clerkId) {
      setLoading(false);
      return;
    }

    let realtimeSub;
    let pollInterval;

    async function bootstrap() {
      setLoading(true);
      setError(null);

      try {
        const db = createSupabaseClient(getToken);
        supabaseRef.current = db;

        // Check for pending invite before bootstrapping
        const pendingInviteCode = new URLSearchParams(window.location.search).get("invite");

        // Use bootstrap_new_user RPC (SECURITY DEFINER — bypasses RLS).
        // Pass invite code so joining happens in one atomic transaction.
        const { data: bootstrapData, error: bootstrapErr } = await db
          .rpc("bootstrap_new_user", {
            p_clerk_id: clerkId,
            p_email: email,
            p_invite_code: pendingInviteCode || null,
          });

        if (bootstrapErr) throw new Error(`Bootstrap failed: ${bootstrapErr.message}`);

        const internalUserId = bootstrapData.user_id;
        internalUserIdRef.current = internalUserId;
        clerkIdRef.current = clerkId;

        // Fetch the full household record
        const { data: hhData, error: hhErr } = await db
          .from("households")
          .select("id, name, budget_goal")
          .eq("id", bootstrapData.household_id)
          .single();
        if (hhErr) throw new Error(`Could not fetch household: ${hhErr.message}`);
        const hh = hhData;

        // Clear invite from URL and flag for join banner
        if (bootstrapData.joined_via_invite) {
          window.history.replaceState({}, "", window.location.pathname);
          sessionStorage.setItem("just_joined_household", bootstrapData.household_name || "the household");
        }

        if (hh) {
          setHousehold(hh);
          householdRef.current = hh;

          const { data: members } = await db
            .from("household_members")
            .select("id, user_id, users(clerk_id, email)")
            .eq("household_id", hh.id)
            .is("deleted_at", null);
          setHouseholdMembers(members || []);
        }

        // Only load catalog and list if we have a household.
        // (If joining via invite, hh is null here — acceptInvite handles the rest.)
        if (hh) {
          // Load this user's hidden item IDs
          const { data: hiddenItems } = await db
            .from("user_hidden_items")
            .select("catalog_item_id")
            .eq("clerk_id", clerkId);
          const hiddenIds = new Set((hiddenItems || []).map(h => h.catalog_item_id));

          const { data: catalog, error: catalogErr } = await db
            .from("catalog_items")
            .select("id, name, category, is_global")
            .eq("is_global", true)
            .is("deleted_at", null);
          if (catalogErr) throw new Error(`Could not load catalog: ${catalogErr.message}`);

          const { data: customItems, error: customErr } = await db
            .from("catalog_items")
            .select("id, name, category, is_global")
            .eq("household_id", hh.id)
            .eq("is_global", false)
            .is("deleted_at", null);
          if (customErr) throw new Error(`Could not load custom items: ${customErr.message}`);

          const cMap = {};
          [...(catalog || []), ...(customItems || [])].forEach((item) => {
            if (!hiddenIds.has(item.id)) cMap[item.name] = item;
          });
          setCatalogMap(cMap);
          catalogRef.current = cMap;

          await loadListItems(db, hh.id);

          realtimeSub = db
            .channel(`list_items:${hh.id}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "list_items", filter: `household_id=eq.${hh.id}` },
              () => loadListItems(db, hh.id)
            )
            .subscribe();

          // Polling fallback — syncs every 5 seconds in case realtime misses events
          pollInterval = setInterval(() => loadListItems(db, hh.id), 5000);
        }

      } catch (err) {
        console.error("Bootstrap error:", err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
    return () => {
      if (realtimeSub) realtimeSub.unsubscribe();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [getToken, userId, clerkId, email]);

  // ─────────────────────────────────────────────────────────────
  // updateQty: handles both global catalog items AND custom items.
  // If the item isn't in the catalog yet, it's inserted first as
  // a household-specific item, then the list_items row is written.
  // ─────────────────────────────────────────────────────────────
  const updateQty = useCallback(async (itemName, qty, categoryName) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return;

    // Optimistic update
    setQuantities((prev) => ({ ...prev, [itemName]: Math.max(0, qty) }));

    pendingWrites.current += 1;
    try {
      // Look up in current catalogRef (includes custom items added this session)
      let catalogItem = catalogRef.current[itemName];

      // If not found, this is a brand-new custom item — insert it into catalog_items
      if (!catalogItem) {
        const category = categoryName || "⭐ My Custom Items";
        const { data: inserted, error: insertErr } = await db
          .from("catalog_items")
          .insert({
            name: itemName,
            category: category,
            is_global: false,
            household_id: hh.id,
            created_by: internalUserIdRef.current,
          })
          .select()
          .single();
        if (insertErr) throw insertErr;
        catalogItem = inserted;
        // Keep catalogRef and catalogMap in sync
        catalogRef.current = { ...catalogRef.current, [itemName]: catalogItem };
        setCatalogMap((prev) => ({ ...prev, [itemName]: catalogItem }));
      }

      if (qty <= 0) {
        // Soft-delete the list_items row
        const { error: delErr } = await db
          .from("list_items")
          .update({ deleted_at: new Date().toISOString() })
          .eq("household_id", hh.id)
          .eq("catalog_item_id", catalogItem.id)
          .is("deleted_at", null)
          .select();
        if (delErr) throw delErr;
      } else {
        // Upsert quantity — also clears deleted_at so previously-removed items are restored
        // First try to update an active row
        const { data: updateData, error: updateErr } = await db
          .from("list_items")
          .update({ quantity: qty, status: "pending" })
          .eq("household_id", hh.id)
          .eq("catalog_item_id", catalogItem.id)
          .is("deleted_at", null)
          .select();
        if (updateErr) throw updateErr;

        if (!updateData || updateData.length === 0) {
          // No active row — try to reactivate a soft-deleted row
          const { data: reactivateData, error: reactivateErr } = await db
            .from("list_items")
            .update({ quantity: qty, status: "pending", deleted_at: null })
            .eq("household_id", hh.id)
            .eq("catalog_item_id", catalogItem.id)
            .not("deleted_at", "is", null)
            .select();
          if (reactivateErr) throw reactivateErr;

          if (!reactivateData || reactivateData.length === 0) {
            // Truly no row at all — insert fresh
            const { error: insertErr } = await db
              .from("list_items")
              .insert({
                household_id: hh.id,
                catalog_item_id: catalogItem.id,
                quantity: qty,
                status: "pending",
                added_by: internalUserIdRef.current,
              })
              .select();
            if (insertErr) throw insertErr;
          }
        }

      }
 } catch (err) {
  console.error("updateQty error:", err.message, err);
  console.error("Item:", itemName, "Qty:", qty, "Catalog item:", catalogRef.current[itemName]);
      setError(`Could not update quantity: ${err.message}`);
      // Rollback optimistic update
      setQuantities((prev) => { const n = { ...prev }; delete n[itemName]; return n; });
    } finally {
      pendingWrites.current -= 1;
    }
  }, []);  // empty deps — uses refs, never stale

  const toggleChecked = useCallback(async (itemName) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return;

    const catalogItem = catalogRef.current[itemName];
    if (!catalogItem) { setError(`"${itemName}" not in catalog`); return; }

    const newStatus = checked[itemName] ? "pending" : "bought";
    setChecked((prev) => ({ ...prev, [itemName]: !prev[itemName] }));

    try {
      const { error: updateErr } = await db
        .from("list_items")
        .update({ status: newStatus })
        .eq("household_id", hh.id)
        .eq("catalog_item_id", catalogItem.id)
        .is("deleted_at", null);
      if (updateErr) throw updateErr;
    } catch (err) {
      console.error("toggleChecked error:", err.message);
      setError(`Could not update item: ${err.message}`);
      setChecked((prev) => ({ ...prev, [itemName]: !prev[itemName] }));
    }
  }, [checked]);

  const clearAll = useCallback(async () => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return;

    setQuantities({});
    setChecked({});

    try {
      const { error: clearErr } = await db
        .from("list_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("household_id", hh.id)
        .is("deleted_at", null);
      if (clearErr) throw clearErr;
    } catch (err) {
      console.error("clearAll error:", err.message);
      setError(`Could not clear list: ${err.message}`);
      await loadListItems(db, hh.id);
    }
  }, []);

  const updateBudgetGoal = useCallback(async (amount) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return;

    try {
      const { error: budgetErr } = await db
        .from("households")
        .update({ budget_goal: amount })
        .eq("id", hh.id);
      if (budgetErr) throw budgetErr;
      const updated = { ...hh, budget_goal: amount };
      setHousehold(updated);
      householdRef.current = updated;
    } catch (err) {
      console.error("updateBudgetGoal error:", err.message);
      setError(`Could not update budget: ${err.message}`);
    }
  }, []);

  // ─────────────────────────────────────────────────────────────
  // updatePrice: updates price_per_unit WITHOUT touching quantity.
  // Checks for an existing row first — if found, uses .update()
  // to patch only the price field. If no row exists yet, inserts
  // with quantity 0 as a price-only placeholder.
  // ─────────────────────────────────────────────────────────────
  const updatePrice = useCallback(async (itemName, price) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return;

    // Optimistic UI update
    setPrices((prev) => ({ ...prev, [itemName]: price }));

    pendingWrites.current += 1;
    try {
      const catalogItem = catalogRef.current[itemName];
      if (!catalogItem) return;

      // Check if a row already exists for this item
      const { data: existing } = await db
        .from("list_items")
        .select("id, quantity")
        .eq("household_id", hh.id)
        .eq("catalog_item_id", catalogItem.id)
        .is("deleted_at", null)
        .maybeSingle();

      if (existing) {
        // Row exists — update price only, leave quantity untouched
        const { error: priceErr } = await db
          .from("list_items")
          .update({ price_per_unit: price })
          .eq("id", existing.id);
        if (priceErr) throw priceErr;
      } else {
        // No row yet (or soft-deleted) — upsert as price-only placeholder
        const { error: priceErr } = await db
          .from("list_items")
          .upsert(
            {
              household_id: hh.id,
              catalog_item_id: catalogItem.id,
              price_per_unit: price,
              quantity: 0,
              status: "pending",
              added_by: internalUserIdRef.current,
              deleted_at: null,
            },
            { onConflict: "household_id,catalog_item_id" }
          );
        if (priceErr) throw priceErr;
      }
    } catch (err) {
      console.error("updatePrice error:", err.message);
      setError(`Could not update price: ${err.message}`);
    } finally {
      pendingWrites.current -= 1;
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  // ─────────────────────────────────────────────────────────────
  // createInvite: generates a 6-char code, writes to
  // household_invites, returns the full invite URL.
  // ─────────────────────────────────────────────────────────────
  const createInvite = useCallback(async () => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return null;

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const { error: inviteErr } = await db
        .from("household_invites")
        .insert({
          household_id: hh.id,
          created_by: internalUserIdRef.current,
          code,
          expires_at: expiresAt,
        });
      if (inviteErr) throw inviteErr;
      return `${window.location.origin}?invite=${code}`;
    } catch (err) {
      console.error("createInvite error:", err.message);
      setError(`Could not create invite: ${err.message}`);
      return null;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────
  // acceptInvite: looks up a code, joins the household,
  // reloads app state. Returns household name on success.
  // ─────────────────────────────────────────────────────────────
  const acceptInvite = useCallback(async (code) => {
    const db = supabaseRef.current;
    if (!db || !internalUserIdRef.current) return false;

    try {
      const { data: invite, error: lookupErr } = await db
        .from("household_invites")
        .select("id, household_id, expires_at, accepted_at, households(name)")
        .eq("code", code.toUpperCase())
        .is("deleted_at", null)
        .single();

      if (lookupErr) throw new Error("Invite not found or already used.");
      if (invite.accepted_at) throw new Error("This invite has already been used.");
      if (new Date(invite.expires_at) < new Date()) throw new Error("This invite has expired.");

      const internalUserId = internalUserIdRef.current;

      const { data: existing } = await db
        .from("household_members")
        .select("id")
        .eq("household_id", invite.household_id)
        .eq("user_id", internalUserId)
        .is("deleted_at", null)
        .maybeSingle();

      if (!existing) {
        const { error: joinErr } = await db
          .from("household_members")
          .insert({ household_id: invite.household_id, user_id: internalUserId, role: "member" });
        if (joinErr) throw joinErr;
      }

      await db
        .from("household_invites")
        .update({ accepted_by: internalUserId, accepted_at: new Date().toISOString() })
        .eq("id", invite.id);

      const { data: hhData } = await db
        .from("households")
        .select("id, name, budget_goal")
        .eq("id", invite.household_id)
        .single();

      if (hhData) {
        setHousehold(hhData);
        householdRef.current = hhData;

        // Load catalog (global + household custom items)
        const { data: catalog } = await db
          .from("catalog_items")
          .select("id, name, category")
          .eq("is_global", true)
          .is("deleted_at", null);

        const { data: customItems } = await db
          .from("catalog_items")
          .select("id, name, category")
          .eq("household_id", hhData.id)
          .eq("is_global", false)
          .is("deleted_at", null);

        const cMap = {};
        [...(catalog || []), ...(customItems || [])].forEach((item) => {
          cMap[item.name] = item;
        });
        setCatalogMap(cMap);
        catalogRef.current = cMap;

        await loadListItems(db, hhData.id);

        // Subscribe to realtime for the new household
        db.channel(`list_items:${hhData.id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "list_items", filter: `household_id=eq.${hhData.id}` },
            () => loadListItems(db, hhData.id)
          )
          .subscribe();
      }

      return invite.households?.name || "the household";
    } catch (err) {
      console.error("acceptInvite error:", err.message);
      setError(err.message);
      return false;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────
  // deleteItem: removes an item from this user's catalog view.
  // For household-specific items: soft-deletes the catalog_items row.
  // For global items: inserts into user_hidden_items so the item
  // is hidden for this user only — other users unaffected.
  // Also soft-deletes any active list_items row for this household.
  // ─────────────────────────────────────────────────────────────
  const deleteItem = useCallback(async (itemName) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!db || !hh) return;

    const catalogItem = catalogRef.current[itemName];
    if (!catalogItem) return;

    // Optimistically remove from UI immediately
    setQuantities((prev) => { const n = { ...prev }; delete n[itemName]; return n; });
    setCatalogMap((prev) => { const n = { ...prev }; delete n[itemName]; return n; });
    const newRef = { ...catalogRef.current };
    delete newRef[itemName];
    catalogRef.current = newRef;

    try {
      if (catalogItem.is_global) {
        // Global item — hide for this user only
        const { error: hideErr } = await db
          .from("user_hidden_items")
          .insert({
            clerk_id: clerkIdRef.current,
            catalog_item_id: catalogItem.id,
          });
        if (hideErr && !hideErr.message.includes("duplicate")) throw hideErr;
      } else {
        // Household-specific custom item — soft-delete it entirely
        const { error: catErr } = await db
          .from("catalog_items")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", catalogItem.id);
        if (catErr) throw catErr;
      }

      // Also soft-delete any active list_items row for this household
      await db
        .from("list_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("household_id", hh.id)
        .eq("catalog_item_id", catalogItem.id)
        .is("deleted_at", null);
    } catch (err) {
      console.error("deleteItem error:", err.message);
      setError(`Could not delete item: ${err.message}`);
      // Rollback — re-add to local catalog state
      catalogRef.current = { ...catalogRef.current, [itemName]: catalogItem };
      setCatalogMap((prev) => ({ ...prev, [itemName]: catalogItem }));
    }
  }, []);

  return {
    quantities, checked, prices, household, householdMembers, catalogMap,
    loading, error, dismissError,
    updateQty, updatePrice, toggleChecked, clearAll, updateBudgetGoal,
    deleteItem, createInvite, acceptInvite,
  };
}
