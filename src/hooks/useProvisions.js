// src/hooks/useProvisions.js
import { useState, useEffect, useCallback, useRef } from "react";
import { createSupabaseClient } from "../lib/supabaseClient";
import { classifyFetchError } from "../lib/classifyFetchError";
import { useConnectivity } from "../contexts/ConnectivityContext";

export function useProvisions({ getToken, userId, clerkId, email, fullName, activeHouseholdId, myHouseholds }) {
  const [quantities, setQuantities] = useState({});
  const [checked, setChecked] = useState({});
  const [prices, setPrices] = useState({});
  const [addedByMap, setAddedByMap] = useState({});
  const [contributorsMap, setContributorsMap] = useState({});
  const [categoryAvgPrices, setCategoryAvgPrices] = useState({});
  const [household, setHousehold] = useState(null);
  const [householdMembers, setHouseholdMembers] = useState([]);
  const [catalogMap, setCatalogMap] = useState({});
  const [listRows, setListRows] = useState([]); // raw surviving RPC rows — source of truth for the SHOP list
  const [hiddenCatalogItems, setHiddenCatalogItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { reportTransientFailure, reportSuccess } = useConnectivity();
  const supabaseRef = useRef(null);
  const householdRef = useRef(null);   // mirrors household for use inside callbacks
  const catalogRef = useRef({});       // mirrors catalogMap for use inside callbacks
  const hiddenIdsRef = useRef(new Set());
  const deletedIdsRef = useRef(new Set());
  const refreshCatalogRef = useRef(() => {});
  const hiddenCatalogItemsRef = useRef([]);
  const internalUserIdRef = useRef(null);
  const householdMembersRef = useRef([]);
  const clerkIdRef = useRef(null);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const wrappingUpRef = useRef(false);
  // Items with an in-flight local quantity write. The 2s poll must not
  // overwrite these from the DB until the write confirms, or it'll briefly
  // snap the optimistic value back to the stale server value (5→4→5 flicker).
  const pendingQtyRef = useRef(new Set());
  const [activeCycle, setActiveCycle] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const activeCycleRef = useRef(null);
  const activeSessionRef = useRef(null);
  const myHouseholdsRef = useRef(myHouseholds || []);
  myHouseholdsRef.current = myHouseholds || [];
  const bootstrapHouseholdIdRef = useRef(null);
  const bootstrappedRef = useRef(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const justJoinedViaInviteRef = useRef(false);
  const realtimeChannelRef = useRef(null);

  // Staple state is per-household row-presence in household_staples (migration
  // 016) — the single source of truth for BOTH global and custom items. Returns
  // the set of catalog_item_ids this household has stapled, so catalog reads can
  // stamp is_staple per item without trusting the dormant catalog_items column.
  async function fetchStapleSet(db, householdId) {
    const { data } = await db
      .from("household_staples")
      .select("catalog_item_id")
      .eq("household_id", householdId);
    return new Set((data || []).map((r) => r.catalog_item_id));
  }

  async function loadListItems(db, householdId) {
    if (wrappingUpRef.current) return;
    const { data: items, error: listErr } = await db
      .rpc("get_list_items_for_household", { p_household_id: householdId });

    if (listErr) {
      if (classifyFetchError(listErr) === 'transient') { reportTransientFailure(); } else { setError(`Could not load list: ${listErr.message}`); }
      return;
    }

    // Suspect-empty guard: a dropped connection can resolve this RPC with no
    // error but zero rows. If we currently hold state, treat it as a transient
    // empty response and bail before any setters run — don't clobber quantities,
    // checks, rows, or contributors to empty. A real clear-list calls the
    // setters directly, not through this poll.
    if (!items || items.length === 0) {
      let hadItems = false;
      setQuantities((prev) => { hadItems = Object.keys(prev).length > 0; return prev; });
      if (hadItems) { reportTransientFailure(); return; }
    }

    // Names/categories/staple flags now arrive inline from the list RPC join.
    const catalogNameMap = {};
    items.forEach(it => { catalogNameMap[it.catalog_item_id] = it.name; });

    // Merge full catalog entries (with category + is_staple) so items added by
    // other users render in their correct category section.
    items.forEach(it => {
      if (hiddenIdsRef.current.has(it.catalog_item_id) || deletedIdsRef.current.has(it.catalog_item_id)) return; // never re-add a hidden or just-deleted item
      catalogRef.current[it.name] = {
        ...catalogRef.current[it.name],
        id: it.catalog_item_id, name: it.name,
        category: it.category, is_staple: it.is_staple,
      };
    });
    setCatalogMap(prev => {
      let changed = false;
      const next = { ...prev };
      items.forEach(it => {
        const existing = next[it.name];
        if (hiddenIdsRef.current.has(it.catalog_item_id) || deletedIdsRef.current.has(it.catalog_item_id)) return; // never re-add a hidden or just-deleted item
        if (!existing || existing.category !== it.category || existing.is_staple !== it.is_staple) {
          next[it.name] = {
            ...existing,
            id: it.catalog_item_id, name: it.name,
            category: it.category, is_staple: it.is_staple,
          };
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    const listItemIds = items.map(i => i.id);

    let contributorRows = [];
    if (listItemIds.length > 0) {
      const { data: contribs } = await db
        .from("list_item_contributors")
        .select("list_item_id, user_id, quantity_added, added_at")
        .in("list_item_id", listItemIds);
      contributorRows = contribs || [];
    }

    const newQty = {};
    const newChecked = {};
    const newPrices = {};
    const newAddedBy = {};
    const newContributors = {};
    const newListRows = [];

    items.forEach((item) => {
      const name = catalogNameMap[item.catalog_item_id];
      if (!name) return;
      newListRows.push({
        id: item.id,
        catalogItemId: item.catalog_item_id,
        name,
        category: item.category,
        isStaple: item.is_staple,
        quantity: item.quantity,
        status: item.status,
        pricePerUnit: item.price_per_unit != null ? parseFloat(item.price_per_unit) : null,
        addedBy: item.added_by ?? null,
      });
      newQty[name] = item.quantity;
      newChecked[name] = item.status === "bought";
      if (item.price_per_unit != null) newPrices[name] = parseFloat(item.price_per_unit);
      if (item.added_by != null) newAddedBy[name] = item.added_by;

      const itemContribs = contributorRows
        .filter(c => c.list_item_id === item.id)
        .sort((a, b) => new Date(a.added_at) - new Date(b.added_at))
        .map(c => {
          const profile = householdMembersRef.current?.find(m => m.user_id === c.user_id);
          return {
            userId: c.user_id,
            fullName: profile?.users?.full_name || null,
            clerkId: profile?.users?.clerk_id || null,
            quantityAdded: c.quantity_added,
          };
        });

      if (itemContribs.length > 0) newContributors[name] = itemContribs;
    });

    const mergedPrices = {};
    Object.values(catalogRef.current).forEach(item => {
      if (item.price_hint != null) mergedPrices[item.name] = parseFloat(item.price_hint);
    });
    Object.assign(mergedPrices, newPrices);
    setListRows(newListRows);
    // Preserve optimistic values for items with an in-flight write; commit the
    // rest from the server. Prevents the poll from clobbering a not-yet-
    // committed local edit.
    setQuantities((prev) => {
      if (pendingQtyRef.current.size === 0) return newQty;
      const merged = { ...newQty };
      pendingQtyRef.current.forEach((name) => {
        if (name in prev) merged[name] = prev[name];
      });
      return merged;
    });
    setChecked(newChecked);
    setPrices(mergedPrices);
    setAddedByMap(newAddedBy);
    setContributorsMap(newContributors);
  }

  async function loadActiveCycle(db, householdId) {
    const { data, error: cycleErr } = await db
      .from("provision_cycles")
      .select("id, cycle_type, label, started_at, seeded_from")
      .eq("household_id", householdId)
      .is("closed_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cycleErr) { console.error("loadActiveCycle error:", cycleErr.message); return null; }
    setActiveCycle(data || null);
    activeCycleRef.current = data || null;
    return data || null;
  }

  // Effect 1 — session setup (keyed on user identity).
  // Creates the Supabase client once and runs bootstrap_new_user.
  // Does NOT fetch any household-scoped data — that belongs to Effect 2.
  useEffect(() => {
    // If not signed in, fetch global catalog via direct REST call using anon key — no Supabase client needed
    if (!getTokenRef.current || !userId || !clerkId) {
      (async () => {
        try {
          const response = await fetch(
            `${process.env.REACT_APP_SUPABASE_URL}/rest/v1/catalog_items?deleted_at=is.null&select=id,name,category,unit,price_hint`,
            {
              headers: {
                apikey: process.env.REACT_APP_SUPABASE_ANON_KEY,
                Authorization: `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
              },
            }
          );
          const items = await response.json();
          const cMap = {};
          (Array.isArray(items) ? items : []).forEach(item => { cMap[item.name] = item; });
          setCatalogMap(cMap);
          catalogRef.current = cMap;
          const hintPrices = {};
          Object.values(cMap).forEach(item => {
            if (item.price_hint != null) hintPrices[item.name] = parseFloat(item.price_hint);
          });
          setPrices(hintPrices);
          try {
            const avgResponse = await fetch(
              `${process.env.REACT_APP_SUPABASE_URL}/rest/v1/category_avg_prices?select=category,avg_price`,
              {
                headers: {
                  apikey: process.env.REACT_APP_SUPABASE_ANON_KEY,
                  Authorization: `Bearer ${process.env.REACT_APP_SUPABASE_ANON_KEY}`,
                },
              }
            );
            const avgRows = await avgResponse.json();
            const avgMap = {};
            (Array.isArray(avgRows) ? avgRows : []).forEach(row => {
              avgMap[row.category] = parseFloat(row.avg_price);
            });
            setCategoryAvgPrices(avgMap);
          } catch (err) {
            console.error("Category avg prices load error:", err.message);
          }
        } catch (err) {
          console.error("Anon catalog load error:", err.message);
        } finally {
          setLoading(false);
        }
      })();
      return;
    }

    async function setupSession() {
      setLoading(true);
      setError(null);

      try {
        // Create Supabase client once — guard prevents stacking GoTrueClient instances on switch
        if (!supabaseRef.current) {
          supabaseRef.current = createSupabaseClient(getTokenRef.current);
        }
        const db = supabaseRef.current;

        // Check for pending invite before bootstrapping.
        // Prefer the URL param, fall back to the code persisted at app entry (survives
        // Clerk's sign-up redirect, which strips the URL param for brand-new users).
        const urlInvite = new URLSearchParams(window.location.search).get("invite");
        const pendingInviteCode = urlInvite || sessionStorage.getItem("pending_invite_code");

        // Use bootstrap_new_user RPC (SECURITY DEFINER — bypasses RLS).
        // Pass invite code so joining happens in one atomic transaction.
        const { data: bootstrapData, error: bootstrapErr } = await db
          .rpc("bootstrap_new_user", {
            p_clerk_id: clerkId,
            p_email: email,
            p_invite_code: pendingInviteCode || null,
            p_full_name: fullName || null,
          });

        if (bootstrapErr) throw new Error(`Bootstrap failed: ${bootstrapErr.message}`);

        // Code has been attempted — clear the persisted copy so it can't re-trigger
        // on a future visit, regardless of whether the join actually succeeded.
        sessionStorage.removeItem("pending_invite_code");

        internalUserIdRef.current = bootstrapData.user_id;
        clerkIdRef.current = clerkId;

        // Clear invite from URL and flag for join banner
        if (bootstrapData.joined_via_invite) {
          window.history.replaceState({}, "", window.location.pathname);
          sessionStorage.setItem("just_joined_household", bootstrapData.household_name || "the household");
          sessionStorage.setItem("just_joined_household_id", bootstrapData.household_id);
        }

        // Stash bootstrap's chosen household as the fallback for Effect 2
        bootstrapHouseholdIdRef.current = bootstrapData.household_id;
        justJoinedViaInviteRef.current = bootstrapData.joined_via_invite === true; // no longer read in resolver — safe to clean up

        // Signal Effect 2 that session setup is complete
        bootstrappedRef.current = true;
        setBootstrapped(true);

      } catch (err) {
        console.error("Bootstrap error:", err.message);
        setError(err.message);
        setLoading(false);  // clear loading only on failure; Effect 2 owns the success signal
      }
    }

    setupSession();
    // fullName intentionally excluded: it is a cosmetic attribute that feeds
    // bootstrap_new_user (no-op for existing users) only. Including it caused a
    // name edit (which writes Clerk → changes fullName) to re-fire session
    // bootstrap and wedge the loading state. Bootstrap re-runs on identity
    // change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, clerkId, email]);

  // Effect 1b — Reconcile users.full_name from Clerk on each session.
  // WHY its own effect: bootstrap runs once and is a no-op for existing users, and
  // deliberately excludes fullName from its deps (feeding it there wedged loading).
  // So the name that arrives from Clerk *after* first bootstrap never persists.
  // This effect closes that gap: idempotent, own dep on fullName, only writes on a
  // real change. Does NOT go through bootstrap_new_user (avoids its 4-overload
  // ambiguity entirely).
  const lastSyncedNameRef = useRef(null);
  useEffect(() => {
    const db = supabaseRef.current;
    const name = (fullName || "").trim();
    if (!db) return;
    if (!bootstrappedRef.current || !internalUserIdRef.current) return; // need our user id
    if (!name) return;                        // Clerk has no name yet — nothing to write
    if (lastSyncedNameRef.current === name) return; // already reconciled this value

    (async () => {
      try {
        // Only write if stored value actually differs (avoid needless writes/realtime churn)
        const { data: existing } = await db
          .from("users")
          .select("full_name")
          .eq("id", internalUserIdRef.current)
          .maybeSingle();
        if (existing && existing.full_name === name) {
          lastSyncedNameRef.current = name;
          return;
        }
        const { error } = await db
          .from("users")
          .update({ full_name: name })
          .eq("id", internalUserIdRef.current);
        if (error) throw error;
        lastSyncedNameRef.current = name;
      } catch (err) {
        console.error("full_name reconcile error:", err.message);
        // Non-fatal: attribution degrades to email prefix, never blocks the app.
      }
    })();
  }, [fullName, bootstrapped]); // fires when Clerk name arrives or changes, post-bootstrap

  // Effect 2 — household-scoped loads (keyed on the resolved active household).
  // Reruns whenever activeHouseholdId changes (household switch). Never re-creates
  // the Supabase client — reads the one Effect 1 placed on supabaseRef.
  useEffect(() => {
    const db = supabaseRef.current;
    if (!db || !bootstrapped) return;               // wait for Effect 1
    if (!userId || !clerkId) return;                 // not signed in

    // ── Resolve which household to load ──
    const fallbackId = bootstrapHouseholdIdRef.current;

    let targetId;
    if (activeHouseholdId) {
      // Trust the context-validated active household in all cases. On auto-switch
      // joins, App.js has already called switchHousehold(joinedId), so this equals
      // the joined household. On silent joins, this stays on the prior household —
      // which is exactly what "silent" means: the view must not move. The old
      // justJoinedViaInvite forced-fallback overrode this and loaded the joined
      // household's data even for silent joins, causing a highlight/data split.
      targetId = activeHouseholdId;
    } else {
      // No active context yet (fresh device, pre-restore): bootstrap fallback.
      targetId = fallbackId;
    }
    if (!targetId) return;

    let pollInterval;
    let catalogPollInterval;
    let cancelled = false;

    async function loadForHousehold(householdId) {
      setLoading(true);

      // Reset per-household state so the previous household's rows don't flash
      setListRows([]);
      setQuantities({});
      setChecked({});
      setAddedByMap({});
      setContributorsMap({});
      setActiveCycle(null);
      activeCycleRef.current = null;

      try {
        // Fetch the household record
        const { data: hhData, error: hhErr } = await db
          .from("households")
          .select("id, name, budget_goal")
          .eq("id", householdId)
          .single();
        if (hhErr) {
          if (classifyFetchError(hhErr) === 'transient') { reportTransientFailure(); } else { setError(`Could not fetch household: ${hhErr.message}`); }
          setLoading(false); return;
        }
        if (cancelled) return;
        const hh = hhData;
        setHousehold(hh);
        householdRef.current = hh;

        // Members
        const { data: members } = await db
          .from("household_members")
          .select("id, user_id, role")
          .eq("household_id", hh.id)
          .is("deleted_at", null);
        if (cancelled) return;

        const { data: profiles } = await db
          .rpc("get_household_member_profiles", { p_household_id: hh.id });
        if (cancelled) return;

        const membersWithProfiles = (members || []).map(m => ({
          ...m,
          users: profiles?.find(p => p.user_id === m.user_id) || null
        }));
        setHouseholdMembers(membersWithProfiles);
        householdMembersRef.current = membersWithProfiles;

        // Hidden items (per-user; reload on switch to pick up any hides from the other household view)
        const { data: hiddenRows } = await db
          .from("user_hidden_items")
          .select("catalog_item_id, catalog_items(id, name, category, is_global, price_hint, created_by)")
          .eq("clerk_id", clerkIdRef.current);
        if (cancelled) return;

        const hiddenIds = new Set((hiddenRows || []).map(h => h.catalog_item_id));
        hiddenIdsRef.current = hiddenIds;
        const hiddenCatalogList = (hiddenRows || []).map(h => h.catalog_items).filter(Boolean);
        hiddenCatalogItemsRef.current = hiddenCatalogList;
        setHiddenCatalogItems(hiddenCatalogList);

        // Global catalog
        const { data: catalog, error: catalogErr } = await db
          .from("catalog_items")
          .select("id, name, category, is_global, price_hint, is_staple")
          .eq("is_global", true)
          .is("deleted_at", null);
        if (catalogErr) { setError(`Could not load catalog: ${catalogErr.message}`); setLoading(false); return; }
        if (cancelled) return;

        // Custom catalog (household-scoped)
        const { data: customItems, error: customErr } = await db
          .from("catalog_items")
          .select("id, name, category, is_global, price_hint, is_staple, created_by")
          .eq("household_id", hh.id)
          .eq("is_global", false)
          .is("deleted_at", null);
        if (customErr) { setError(`Could not load custom items: ${customErr.message}`); setLoading(false); return; }
        if (cancelled) return;

        // Per-household staples (row-presence). is_staple is stamped from this
        // set, NOT the shared catalog_items column (migration 016).
        const stapleSet = await fetchStapleSet(db, hh.id);
        if (cancelled) return;

        const cMap = {};
        (catalog || []).forEach((item) => {
          if (!hiddenIds.has(item.id)) cMap[item.name] = { ...item, is_staple: stapleSet.has(item.id), created_by: null };
        });
        (customItems || []).forEach((item) => {
          if (!hiddenIds.has(item.id)) cMap[item.name] = { ...item, is_staple: stapleSet.has(item.id), created_by: item.created_by ?? "custom" };
        });
        setCatalogMap(cMap);
        catalogRef.current = cMap;
        const hintPrices = {};
        Object.values(cMap).forEach(item => {
          if (item.price_hint != null) hintPrices[item.name] = parseFloat(item.price_hint);
        });
        setPrices(hintPrices);

        // Category avg prices
        const { data: avgRows, error: avgErr } = await db
          .from("category_avg_prices")
          .select("category, avg_price");
        if (!avgErr && avgRows) {
          if (cancelled) return;
          const avgMap = {};
          avgRows.forEach(row => { avgMap[row.category] = parseFloat(row.avg_price); });
          setCategoryAvgPrices(avgMap);
        }

        if (cancelled) return;
        await loadListItems(db, hh.id);
        if (cancelled) return;
        await loadActiveCycle(db, hh.id);
        if (cancelled) return;

        pollInterval = setInterval(() => { loadListItems(db, hh.id); }, 2000);
        catalogPollInterval = setInterval(() => { refreshCatalogRef.current(); }, 20000);

        reportSuccess();
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error("loadForHousehold error:", err.message);
          setError(err.message);
          setLoading(false);
        }
      }
    }

    loadForHousehold(targetId);

    return () => {
      cancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      if (catalogPollInterval) clearInterval(catalogPollInterval);
      if (realtimeChannelRef.current) {
        try { supabaseRef.current?.removeChannel(realtimeChannelRef.current); } catch (e) {}
        realtimeChannelRef.current = null;
      }
    };
  }, [activeHouseholdId, userId, clerkId, bootstrapped]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────
  // updateQty: handles both global catalog items AND custom items.
  // If the item isn't in the catalog yet, it's inserted first as
  // a household-specific item, then the list_items row is written.
  // ─────────────────────────────────────────────────────────────
  const updateQty = useCallback(async (itemName, qty, categoryName, price) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return;

    // Optimistic update + mark this item as having an in-flight write so the
    // poll won't clobber it before the write confirms.
    pendingQtyRef.current.add(itemName);
    setQuantities((prev) => ({ ...prev, [itemName]: Math.max(0, qty) }));

    try {
      // Look up in current catalogRef (includes custom items added this session)
      let catalogItem = catalogRef.current[itemName];

      // If not found, this is a brand-new custom item — insert it into catalog_items
      if (!catalogItem) {
        const category = categoryName || "Household";
        const { data: insertedId, error: insertErr } = await db
          .rpc("insert_custom_catalog_item", {
            p_name: itemName,
            p_category: category,
            p_household_id: hh.id,
            p_created_by: internalUserIdRef.current,
          });
        if (insertErr) throw insertErr;
        catalogItem = { id: insertedId, name: itemName, category: category, is_global: false, household_id: hh.id };
        // Keep catalogRef and catalogMap in sync
        catalogRef.current = { ...catalogRef.current, [itemName]: catalogItem };
        setCatalogMap((prev) => ({ ...prev, [itemName]: catalogItem }));
      }

      if (qty <= 0) {
        // Atomic remove: soft-delete the list_items row AND clear its
        // contributor badges in one transaction (migration 009). Replaces the
        // old client-side soft-delete that left contributors behind and caused
        // badge-resurrection on re-add (008 upsert revives the same row).
        const { error: delErr } = await db.rpc("remove_list_item", {
          p_household_id: hh.id,
          p_catalog_item_id: catalogItem.id,
        });
        if (delErr) throw delErr;
      } else {
        const { data: updateData, error: updateErr } = await db
          .from("list_items")
          .update({ quantity: qty, status: "pending", deleted_at: null })
          .eq("household_id", hh.id)
          .eq("catalog_item_id", catalogItem.id)
          .select();
        if (updateErr) throw updateErr;

        if (!updateData || updateData.length === 0) {
          // Truly no row exists — insert fresh
          // Auto-open a planned cycle if none is active yet
          if (!activeCycleRef.current) {
            const { data: newCycle } = await db
              .from("provision_cycles")
              .insert({
                household_id: hh.id,
                cycle_type: "planned",
                created_by: internalUserIdRef.current,
              })
              .select()
              .single();
            if (newCycle) {
              activeCycleRef.current = newCycle;
              setActiveCycle(newCycle);
            }
          }

          const { data: newItemId, error: insertErr } = await db
            .rpc("insert_list_item", {
              p_household_id: hh.id,
              p_catalog_item_id: catalogItem.id,
              p_quantity: qty,
              p_status: "pending",
              p_added_by: internalUserIdRef.current,
              p_cycle_id: activeCycleRef.current?.id || null,
              p_price_per_unit: (price != null && price > 0) ? price : null,
            });
          if (insertErr) throw insertErr;
          const newItem = { id: newItemId };

          // Record this user as the first contributor
          if (newItem && internalUserIdRef.current) {
            await db
              .from("list_item_contributors")
              .upsert({
                list_item_id: newItem.id,
                user_id: internalUserIdRef.current,
                quantity_added: qty,
              }, { onConflict: "list_item_id,user_id" });
          }
        } else {
          // Row already exists — update this user's contributor quantity
          if (internalUserIdRef.current && updateData?.[0]?.id) {
            await db
              .from("list_item_contributors")
              .upsert({
                list_item_id: updateData[0].id,
                user_id: internalUserIdRef.current,
                quantity_added: Math.max(1, qty),
              }, { onConflict: "list_item_id,user_id" });
          }
        }

      }
      pendingQtyRef.current.delete(itemName);
      reportSuccess();
    } catch (err) {
      pendingQtyRef.current.delete(itemName);
      console.error("updateQty error:", err.message, err);
      console.error("Item:", itemName, "Qty:", qty, "Catalog item:", catalogRef.current[itemName]);
      // Classify FIRST. On a transient (offline) failure, keep the optimistic
      // value — it's the last-good intent that reconnect will reconcile. Only
      // roll back on a genuine error (real rejection: bad data, RLS, etc.),
      // where the value truly didn't take.
      if (classifyFetchError(err) === 'transient') {
        reportTransientFailure();
      } else {
        setQuantities((prev) => { const n = { ...prev }; delete n[itemName]; return n; });
        setError(`Could not update quantity: ${err.message}`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // empty deps — uses refs, never stale

  const toggleChecked = useCallback(async (itemName, catalogItemId) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return;

    // Resolve the catalog id from the id passed by the caller (stable, from
    // listRows). Fall back to the name-keyed catalog map only if no id arrived.
    const resolvedId = catalogItemId ?? catalogRef.current[itemName]?.id;
    if (!resolvedId) { setError(`"${itemName}" not in catalog`); return; }

    const newStatus = checked[itemName] ? "pending" : "bought";
    setChecked((prev) => ({ ...prev, [itemName]: !prev[itemName] }));

    try {
      const { error: updateErr } = await db
        .from("list_items")
        .update({ status: newStatus })
        .eq("household_id", hh.id)
        .eq("catalog_item_id", resolvedId)
        .is("deleted_at", null);
      if (updateErr) throw updateErr;
      reportSuccess();
    } catch (err) {
      console.error("toggleChecked error:", err.message);
      setChecked((prev) => ({ ...prev, [itemName]: !prev[itemName] }));
      if (classifyFetchError(err) === 'transient') { reportTransientFailure(); } else { setError(`Could not update item: ${err.message}`); }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────
  // PROVISION CYCLES & SESSIONS
  // ─────────────────────────────────────────────────────────────

  const openCycle = useCallback(async (type = "planned") => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return null;

    // Don't open a second cycle if one is already active
    if (activeCycleRef.current) return activeCycleRef.current;

    const { data: newCycle, error: cycleErr } = await db
      .from("provision_cycles")
      .insert({
        household_id: hh.id,
        cycle_type: type,
        created_by: internalUserIdRef.current,
      })
      .select()
      .single();

    if (cycleErr) { setError(`Could not open cycle: ${cycleErr.message}`); return null; }
    setActiveCycle(newCycle);
    activeCycleRef.current = newCycle;
    return newCycle;
  }, []);

  const startSession = useCallback(async () => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return null;

    // Ensure there's an active cycle — create one if not
    let cycle = activeCycleRef.current;
    if (!cycle) cycle = await openCycle("planned");
    if (!cycle) return null;

    // Don't create a duplicate session for this user in this cycle
    if (activeSessionRef.current) return activeSessionRef.current;

    // Capture GPS silently (best effort — won't block if denied)
    let gpsLat = null;
    let gpsLng = null;
    if (navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
        );
        gpsLat = pos.coords.latitude;
        gpsLng = pos.coords.longitude;
      } catch {
        // GPS denied or timed out — that's fine, continue without it
      }
    }

    const { data: newSession, error: sessionErr } = await db
      .from("shopping_sessions")
      .insert({
        household_id: hh.id,
        cycle_id: cycle.id,
        user_id: internalUserIdRef.current,
        gps_lat: gpsLat,
        gps_lng: gpsLng,
      })
      .select()
      .single();

    if (sessionErr) { setError(`Could not start session: ${sessionErr.message}`); return null; }
    setActiveSession(newSession);
    activeSessionRef.current = newSession;
    return newSession;
  }, [openCycle]);

  const wrapUpTrip = useCallback(async (rollItemNames = []) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return;

    wrappingUpRef.current = true;
    try {
      // If no active cycle, create one now so we have something to close
      let cycle = activeCycleRef.current;
      if (!cycle) {
        const { data: newCycle } = await db
          .from("provision_cycles")
          .insert({
            household_id: hh.id,
            cycle_type: "planned",
            created_by: internalUserIdRef.current,
          })
          .select()
          .single();
        if (!newCycle) { setError("Could not create cycle"); return; }
        cycle = newCycle;
        activeCycleRef.current = newCycle;
        setActiveCycle(newCycle);
      }

      // Close active session if one is open
      if (activeSessionRef.current) {
        await db
          .from("shopping_sessions")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", activeSessionRef.current.id);
        setActiveSession(null);
        activeSessionRef.current = null;
      }

      // Resolve roll-forward item names → list_item IDs
      // NOTE: query without cycle_id filter to handle legacy items (cycle_id = null)
      let rollIds = [];
      if (rollItemNames.length > 0) {
        const { data: rollItems } = await db
          .from("list_items")
          .select("id, catalog_items(name)")
          .eq("household_id", hh.id)
          .eq("status", "pending")
          .is("deleted_at", null);

        rollIds = (rollItems || [])
          .filter(li => rollItemNames.includes(li.catalog_items?.name))
          .map(li => li.id);
      }

      await db.rpc("archive_trip_items", {
        p_household_id: hh.id,
        p_keep_item_ids: rollIds,
      });

      // Call close_cycle RPC — creates new cycle with rolled items
      const { data: newCycleId, error: closeErr } = await db
        .rpc("close_cycle", {
          p_cycle_id: cycle.id,
          p_roll_item_ids: rollIds,
        });

      if (closeErr) throw closeErr;

      // Update active cycle to the new one (or null if nothing rolled)
      if (newCycleId) {
        const { data: newCycle } = await db
          .from("provision_cycles")
          .select("id, cycle_type, label, started_at, seeded_from")
          .eq("id", newCycleId)
          .single();
        setActiveCycle(newCycle || null);
        activeCycleRef.current = newCycle || null;
      } else {
        setActiveCycle(null);
        activeCycleRef.current = null;
      }

      // Reset UI state and reload
      setChecked({});
      setQuantities({});
      wrappingUpRef.current = false;
      await loadListItems(db, hh.id);

    } catch (err) {
      wrappingUpRef.current = false;
      console.error("wrapUpTrip error:", err.message);
      setError(`Could not wrap up trip: ${err.message}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Atomic join: revives a soft-deleted membership (leave-then-rejoin)
      // or inserts a fresh one. Replaces the old read-then-insert that hit
      // the UNIQUE(household_id, user_id) constraint on the leftover
      // soft-deleted row and silently failed (migration 011).
      const { error: joinErr } = await db.rpc("join_household", {
        p_household_id: invite.household_id,
      });
      if (joinErr) throw joinErr;

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
          .select("id, name, category, is_staple")
          .eq("is_global", true)
          .is("deleted_at", null);

        const { data: customItems } = await db
          .from("catalog_items")
          .select("id, name, category, is_staple")
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // removeFromList: list-layer action. Soft-deletes a single list_item from the
  // shared list (catalog row untouched — item remains re-addable). This is the
  // SHOP swipe-to-remove action, distinct from hideItem (catalog, per-user) and
  // deleteItem (catalog, household-wide).
  const removeFromList = useCallback(async (itemName, catalogItemId) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!hh || !db) return;

    const resolvedId = catalogItemId ?? catalogRef.current[itemName]?.id;
    if (!resolvedId) { setError(`"${itemName}" not in catalog`); return; }

    const prevRows = listRows;
    setListRows((rows) => rows.filter(r => r.catalogItemId !== resolvedId));

    try {
      const { error: rmErr } = await db
        .from("list_items")
        .update({ deleted_at: new Date().toISOString() })
        .eq("household_id", hh.id)
        .eq("catalog_item_id", resolvedId)
        .is("deleted_at", null);
      if (rmErr) throw rmErr;
    } catch (err) {
      console.error("removeFromList error:", err.message);
      setError(`Could not remove item: ${err.message}`);
      setListRows(prevRows);
    }
  }, [listRows]);

  // ─────────────────────────────────────────────────────────────
  // hideItem: per-user, view-only. Hides any catalog item (global
  // or custom) from THIS user's browse view. Never affects the
  // shared list or other users. Reversible via Restore.
  // ─────────────────────────────────────────────────────────────
  const hideItem = useCallback(async (itemName) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!db || !hh) return;

    const catalogItem = catalogRef.current[itemName];
    if (!catalogItem) return;

    // Optimistically remove from this user's browse view
    setQuantities((prev) => { const n = { ...prev }; delete n[itemName]; return n; });
    setCatalogMap((prev) => { const n = { ...prev }; delete n[itemName]; return n; });
    const newRef = { ...catalogRef.current };
    delete newRef[itemName];
    catalogRef.current = newRef;

    try {
      const { error: hideErr } = await db
        .from("user_hidden_items")
        .insert({
          clerk_id: clerkIdRef.current,
          catalog_item_id: catalogItem.id,
        });
      if (hideErr && !hideErr.message.includes("duplicate")) throw hideErr;

      hiddenIdsRef.current = new Set([...hiddenIdsRef.current, catalogItem.id]);
      hiddenCatalogItemsRef.current = [...hiddenCatalogItemsRef.current, catalogItem];
      setHiddenCatalogItems(prev => [...prev, catalogItem]);
    } catch (err) {
      console.error("hideItem error:", err.message);
      setError(`Could not hide item: ${err.message}`);
      // Rollback
      catalogRef.current = { ...catalogRef.current, [itemName]: catalogItem };
      setCatalogMap((prev) => ({ ...prev, [itemName]: catalogItem }));
    }
  }, []);

  // ─────────────────────────────────────────────────────────────
  // deleteItem: HARD-deletes a CUSTOM (household-owned) catalog item
  // for the entire household via the delete_custom_catalog_item RPC.
  // The RPC removes the catalog row plus all references (list_items,
  // list_item_contributors, user_hidden_items, waste_events).
  // Global/seed items are NOT deletable — use hideItem for those.
  // ─────────────────────────────────────────────────────────────
  const deleteItem = useCallback(async (itemName) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!db || !hh) return;
    const catalogItem = catalogRef.current[itemName];
    if (!catalogItem) return;
    // Guard: deletion is custom-only. Seed/global items can only be hidden.
    if (catalogItem.is_global) {
      console.warn("deleteItem called on a global item — ignored. Use hideItem.");
      return;
    }

    // Snapshot for rollback, then optimistically remove from UI
    const prevCatalogRef = catalogRef.current;
    setQuantities((prev) => { const n = { ...prev }; delete n[itemName]; return n; });
    setCatalogMap((prev) => { const n = { ...prev }; delete n[itemName]; return n; });
    const newRef = { ...catalogRef.current };
    delete newRef[itemName];
    catalogRef.current = newRef;

    // Guard the poll from re-adding this item during the RPC round-trip
    deletedIdsRef.current = new Set([...deletedIdsRef.current, catalogItem.id]);

    try {
      const { error: rpcErr } = await db.rpc("delete_custom_catalog_item", {
        p_household_id: hh.id,
        p_catalog_item_id: catalogItem.id,
      });
      if (rpcErr) throw rpcErr;
    } catch (err) {
      console.error("deleteItem error:", err.message);
      setError(`Could not delete item: ${err.message}`);
      // Rollback — un-mark deleted and restore local catalog state
      deletedIdsRef.current = new Set([...deletedIdsRef.current].filter(id => id !== catalogItem.id));
      catalogRef.current = prevCatalogRef;
      setCatalogMap((prev) => ({ ...prev, [itemName]: catalogItem }));
    }
  }, []);

  const restoreHiddenByCategory = useCallback(async (rawCategoryName) => {
    const db = supabaseRef.current;
    if (!db) return;

    const toRestore = hiddenCatalogItemsRef.current.filter(item => (item.category || "") === rawCategoryName);
    if (toRestore.length === 0) return;

    const ids = toRestore.map(item => item.id);
    const { error: restoreErr } = await db
      .from("user_hidden_items")
      .delete()
      .eq("clerk_id", clerkIdRef.current)
      .in("catalog_item_id", ids);
    if (restoreErr) { setError(`Could not restore items: ${restoreErr.message}`); return; }

    // Remove from hiddenIdsRef
    const newHiddenIds = new Set(hiddenIdsRef.current);
    ids.forEach(id => newHiddenIds.delete(id));
    hiddenIdsRef.current = newHiddenIds;

    // Add restored items back to catalog
    const restoredMap = {};
    toRestore.forEach(item => { restoredMap[item.name] = item; });
    catalogRef.current = { ...catalogRef.current, ...restoredMap };
    setCatalogMap(prev => ({ ...prev, ...restoredMap }));

    // Remove from hiddenCatalogItems
    hiddenCatalogItemsRef.current = hiddenCatalogItemsRef.current.filter(item => !ids.includes(item.id));
    setHiddenCatalogItems(prev => prev.filter(item => !ids.includes(item.id)));
  }, []);

  const refreshCatalog = useCallback(async () => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!db || !hh) return;

    const { data: catalog, error: catalogErr } = await db
      .from("catalog_items")
      .select("id, name, category, is_global, price_hint, is_staple")
      .eq("is_global", true)
      .is("deleted_at", null);
    if (catalogErr) {
      if (classifyFetchError(catalogErr) === 'transient') { reportTransientFailure(); } else { setError(`Could not refresh catalog: ${catalogErr.message}`); }
      return;
    }

    const { data: customItems, error: customErr } = await db
      .from("catalog_items")
      .select("id, name, category, is_global, price_hint, is_staple")
      .eq("household_id", hh.id)
      .eq("is_global", false)
      .is("deleted_at", null);
    if (customErr) {
      if (classifyFetchError(customErr) === 'transient') { reportTransientFailure(); } else { setError(`Could not refresh catalog: ${customErr.message}`); }
      return;
    }

    reportSuccess();

    // Per-household staples (row-presence, migration 016). Reading this here —
    // instead of the shared catalog_items.is_staple column — is what makes a
    // global-item staple PERSIST across the poll instead of reverting to grey.
    const stapleSet = await fetchStapleSet(db, hh.id);

    const next = {};
    (catalog || []).forEach((item) => {
      if (hiddenIdsRef.current.has(item.id) || deletedIdsRef.current.has(item.id)) return; // never show hidden or just-deleted
      next[item.name] = { ...item, is_staple: stapleSet.has(item.id), created_by: null };
    });
    (customItems || []).forEach((item) => {
      if (hiddenIdsRef.current.has(item.id) || deletedIdsRef.current.has(item.id)) return;
      next[item.name] = { ...item, is_staple: stapleSet.has(item.id), created_by: item.created_by ?? "custom" };
    });

    // Guarded merge: only commit if the catalog actually changed, so a
    // 20s poll doesn't clobber optimistic local edits or cause flicker.
    const prev = catalogRef.current;
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    let changed = prevKeys.length !== nextKeys.length;
    if (!changed) {
      for (const k of nextKeys) {
        const a = prev[k], b = next[k];
        if (!a || a.id !== b.id || a.category !== b.category || a.is_staple !== b.is_staple || a.price_hint !== b.price_hint) {
          changed = true;
          break;
        }
      }
    }
    if (changed) {
      catalogRef.current = next;
      setCatalogMap(next);
    }
  }, [reportTransientFailure, reportSuccess]);

  // Keep the ref pointing at the latest refreshCatalog so the boot-effect
  // catalog poll can call it without taking it as an effect dependency.
  refreshCatalogRef.current = refreshCatalog;

  const refreshMembers = useCallback(async () => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!db || !hh) return;
    try {
      const { data: members } = await db
        .from("household_members")
        .select("id, user_id, role")
        .eq("household_id", hh.id)
        .is("deleted_at", null);
      const { data: profiles } = await db
        .rpc("get_household_member_profiles", { p_household_id: hh.id });
      const membersWithProfiles = (members || []).map(m => ({
        ...m,
        users: profiles?.find(p => p.user_id === m.user_id) || null
      }));
      setHouseholdMembers(membersWithProfiles);
      householdMembersRef.current = membersWithProfiles;
    } catch (err) {
      console.error("refreshMembers error:", err.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // refs-only, intentional empty deps

  const renameItem = useCallback(async (oldName, newName) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!db || !hh) return;
    const item = catalogRef.current[oldName];
    if (!item || item.created_by == null) return; // only custom items
    const { error: renameErr } = await db
      .from("catalog_items")
      .update({ name: newName })
      .eq("id", item.id)
      .eq("household_id", hh.id);
    if (renameErr) { setError(`Could not rename item: ${renameErr.message}`); return; }
    const updated = { ...item, name: newName };
    const newRef = { ...catalogRef.current };
    delete newRef[oldName];
    newRef[newName] = updated;
    catalogRef.current = newRef;
    setCatalogMap(prev => {
      const next = { ...prev };
      delete next[oldName];
      next[newName] = updated;
      return next;
    });
  }, []);

  const toggleStaple = useCallback(async (itemName) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!db || !hh) return;
    const item = catalogRef.current[itemName];
    if (!item) return;
    const newVal = !item.is_staple;
    // Staple is per-household row-presence in household_staples (migration 016),
    // uniform for global AND custom items. The old catalog_items UPDATE silently
    // no-op'd on global rows (household_id=NULL failed the RLS USING clause).
    if (newVal) {
      const { error: insErr } = await db
        .from("household_staples")
        .insert({ household_id: hh.id, catalog_item_id: item.id });
      // 23505 = unique_violation (already stapled: double-tap / race) → success.
      if (insErr && insErr.code !== "23505") { setError(`Could not update staple: ${insErr.message}`); return; }
    } else {
      const { error: delErr } = await db
        .from("household_staples")
        .delete()
        .eq("household_id", hh.id)
        .eq("catalog_item_id", item.id);
      if (delErr) { setError(`Could not update staple: ${delErr.message}`); return; }
    }
    const updated = { ...item, is_staple: newVal };
    catalogRef.current = { ...catalogRef.current, [itemName]: updated };
    setCatalogMap(prev => ({ ...prev, [itemName]: updated }));
  }, []);

  const updateFullName = useCallback(async (newName, onClerkUpdate) => {
    const db = supabaseRef.current;
    if (!db || !internalUserIdRef.current) return false;
    const trimmed = newName.trim();
    if (!trimmed) return false;
    try {
      const { error: nameErr } = await db
        .from("users")
        .update({ full_name: trimmed })
        .eq("id", internalUserIdRef.current);
      if (nameErr) throw nameErr;
      if (onClerkUpdate) await onClerkUpdate(trimmed);
      return true;
    } catch (err) {
      console.error("updateFullName error:", err.message);
      setError(`Could not update name: ${err.message}`);
      return false;
    }
  }, []);

  const createHousehold = useCallback(async (name) => {
    const db = supabaseRef.current;
    if (!db || !clerkIdRef.current) return null;
    try {
      const { data, error: createErr } = await db
        .rpc("create_household", { p_name: name, p_clerk_id: clerkIdRef.current });
      if (createErr) throw createErr;
      return data?.household_id || null;
    } catch (err) {
      console.error("createHousehold error:", err.message);
      setError(`Could not create household: ${err.message}`);
      return null;
    }
  }, []);

  const renameHousehold = useCallback(async (newName) => {
    const db = supabaseRef.current;
    const hh = householdRef.current;
    if (!db || !hh) return false;
    const trimmed = (newName || "").trim();
    if (!trimmed) return false;
    try {
      const { error: renameErr } = await db
        .from("households").update({ name: trimmed }).eq("id", hh.id);
      if (renameErr) throw renameErr;
      const updated = { ...hh, name: trimmed };
      setHousehold(updated);
      householdRef.current = updated;
      return true;
    } catch (err) {
      console.error("renameHousehold error:", err.message);
      setError(`Could not rename household: ${err.message}`);
      return false;
    }
  }, []);

  return {
    quantities, checked, prices, categoryAvgPrices, addedByMap, contributorsMap, household, householdMembers, catalogMap, setCatalogMap, listRows, updateFullName,
    hiddenCatalogItems, loading, error, dismissError,
    updateQty, updatePrice, toggleChecked, clearAll, updateBudgetGoal,
    hideItem, deleteItem, removeFromList, createInvite, acceptInvite, restoreHiddenByCategory, toggleStaple, renameItem, refreshCatalog,
    createHousehold, renameHousehold, refreshMembers,
    activeCycle, activeSession, openCycle, startSession, wrapUpTrip,
    supabase: supabaseRef.current,
    _supabase: supabaseRef,
    _household: householdRef,
    _clerkId: clerkIdRef,
    _internalUserId: internalUserIdRef,
  };
}

