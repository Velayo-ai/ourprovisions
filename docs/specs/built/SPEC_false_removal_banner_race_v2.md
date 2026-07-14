# SPEC — False removal banner v2: raise the guard BEFORE the delete/leave RPC

**Scope:** OurProvisions
**Touches prod:** Yes (dev-first). Client-state only.
**Files:** `src/contexts/ActiveHouseholdContext.js` + `src/App.js`
**Type:** Correction to `a43a1ba`. Single commit.
**Supersedes the timing of:** `SPEC_false_removal_banner_race.md` (a43a1ba)

---

## What a43a1ba got right, and what it missed

RIGHT: the `resolvingRef` mechanism (self-clearing via `finally`), the
`checkPresence` bail, the name-correctness fix, and — VERIFIED tonight — the
genuine-external-removal regression (DH removed DT from Test 101; notice fired
correctly and named the household right). Keep ALL of that.

MISSED: `resolvingRef` is raised only when `resolveAfterHouseholdLoss` is
*entered*. But the deliberate handlers run the destructive RPC FIRST and call
the resolver AFTER:

```
handleDeleteHousehold:
  await supabase.rpc('delete_household', ...)   // ~2s on 3G — household now gone server-side
  showToast(...)
  await resolveAfterHouseholdLoss(deletedId, false)   // resolvingRef raised only HERE
```

Between the RPC completing and the resolver starting, `resolvingRef` is still
`false`. A `checkPresence` poll landing in that window sees the active id gone
from a healthy list and fires the false banner. On 3G the window is seconds
wide. **This is why the delete repro still fails while the external-removal
regression passes** — external removal has no deliberate handler, so it was
never the problem.

`handleLeaveHousehold` has the identical shape (RPC at :834, resolution at
:839-841) and the identical gap.

## Fix — raise the guard at the START of the deliberate action, clear after resolution

Move the guard up one layer: mark "a deliberate loss is in progress" BEFORE the
RPC, and hold it until resolution completes. Mechanism stays B (a ref, cleared
in `finally`); only the timing moves earlier — this is B with A's *timing*.

### 1. Context: expose a begin/end marker for deliberate loss

In `ActiveHouseholdProvider`, add alongside `resolvingRef` (~line 27):

```javascript
  // Raised by the deliberate delete/leave handlers BEFORE their RPC, so the
  // watchdog poll defers across the whole action — RPC + resolution — not just
  // the resolver's lifetime. Cleared by the handler in finally.
  const deliberateLossRef = useRef(false);
  const beginDeliberateLoss = useCallback(() => { deliberateLossRef.current = true; }, []);
  const endDeliberateLoss = useCallback(() => { deliberateLossRef.current = false; }, []);
```

Expose `beginDeliberateLoss` and `endDeliberateLoss` in the context value
(alongside `resolveAfterHouseholdLoss`).

### 2. Context: `checkPresence` also bails on deliberateLossRef

At the top of `checkPresence`, next to the existing guards:

```javascript
      if (provisioningRef.current) return;
      if (resolvingRef.current) return;
      if (deliberateLossRef.current) return;   // a deliberate delete/leave owns this window
```

Keep `resolvingRef` too — it still guards the resolver against re-entrancy and
covers resolver-internal awaits.

### 3. App.js: wrap both handlers

Destructure the two new fns (App.js:268 area) from `useActiveHousehold()`.

`handleDeleteHousehold` — raise BEFORE the RPC, clear in `finally`:

```javascript
  const handleDeleteHousehold = async () => {
    const deletedId = activeHouseholdId;
    beginDeliberateLoss();                     // BEFORE the RPC — closes the gap
    try {
      const { error } = await supabase.rpc('delete_household', { p_household_id: deletedId });
      if (error) throw error;
      setShowHouseholdModal(false);
      setShowDeleteHouseholdConfirm(false);
      showToast("Household deleted");
      await resolveAfterHouseholdLoss(deletedId, false);
    } catch (err) {
      showToast(err.message || "Could not delete household");
    } finally {
      endDeliberateLoss();                     // always clears, even on error
    }
  };
```

`handleLeaveHousehold` — same pattern, raise before the leave RPC:

```javascript
  const handleLeaveHousehold = async () => {
    if (!window.confirm("Leave this household? Anything you added stays behind for the others.")) return;
    beginDeliberateLoss();
    try {
      const leftId = household.id;
      const { error } = await supabase.rpc("leave_household", { p_household_id: leftId });
      if (error) throw error;
      setShowHouseholdModal(false);
      await refreshHouseholds();
      const remaining = myHouseholds.filter(h => h.id !== leftId);
      if (remaining.length > 0) switchHousehold(remaining[0].id);
      showToast("You left the household");
    } catch (err) {
      showToast(err.message || "Could not leave household");
    } finally {
      endDeliberateLoss();
    }
  };
```

## Why this closes it

The guard now spans the ENTIRE deliberate action — from before the RPC through
the end of resolution — so no poll can land in a window where the household is
gone server-side but the client hasn't reconciled. `finally` guarantees the
flag clears even if the RPC throws, so a failed delete can't wedge the watchdog
off permanently.

Genuine external removals are untouched: no deliberate handler runs, so
`deliberateLossRef` stays false and the poll fires normally — exactly the
regression that PASSED tonight. This change only widens the suppression window
for actions the user themselves initiated.

## Verification (dev-first)

1. **The failing repro — now the gate:** create "Test 300", get auto-switched,
   delete it, ON 3G (Slow). → NO banner. Run it 3x (the race is timing-based;
   one clean pass isn't enough — do three).
2. Leave a household on 3G → no false banner, clean switch to survivor.
3. **Genuine-removal regression (must still pass):** device B removes DH from
   household X, DH idle on device A → within ~30s device A fires the notice,
   naming X. This already passed on a43a1ba; confirm v2 didn't regress it.
4. **Failed-RPC safety:** if feasible, force a delete error (e.g. offline mid-
   delete) and confirm the watchdog still works afterward (flag cleared).
5. Stop at dev. Promote only after 1-3 all green.

## Note

`selfDepartureRef`/`markSelfDeparture` remain dead scaffolding — now doubly
superseded. Leave for the queued cleanup; do not remove in this launch commit.
