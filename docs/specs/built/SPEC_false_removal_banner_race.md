# SPEC — False "No longer a member" banner on voluntary household delete (race fix)

**Scope:** OurProvisions
**Touches prod:** Yes (dev-first). Client-state only — no DB, no schema.
**File:** `src/contexts/ActiveHouseholdContext.js` (primary). No App.js change required.
**Type:** Race-condition fix + a small name-correctness fix. Single commit.
**Replaces:** the diagnostic `c9e330f` (revert diagnostic as part of this, see below).

---

## Confirmed diagnosis (reproduced on dev with DIAG capture)

Repro: DH creates "Test 100" → app auto-switches active to it → DH deletes Test 100
→ false banner "No longer a member of Madbury" appears, though DH is still on
Madbury and it was Test 100 that was deleted.

DIAG log at the firing instant:
```
:03/:06/:09  dataLen 11  activeId 838cc69b (Test100)  activeIdPresent true
:12.216      dataLen 10  activeId 838cc69b            activeIdPresent FALSE
:12.217      FIRING removal notice  dataLen 10  selfDeparture false
:15/:18      dataLen 10  activeId faadd8be (survivor) activeIdPresent true
```

**Root cause — two loss-handlers race on one deletion:**
1. `handleDeleteHousehold` (App.js) deletes the household and calls
   `resolveAfterHouseholdLoss(deletedId, false)` — the `false` correctly
   suppresses the banner on the deliberate path.
2. The `checkPresence` polling watchdog fires *during* that resolution, before
   `activeHouseholdIdRef` has moved off the deleted id. It sees the active id
   absent from a healthy list, concludes "removed," and calls
   `resolveAfterHouseholdLoss(activeId, true)` — the `true` fires the banner.

The deliberate path is quiet and correct; the poll gets there first and fires
loud, for a household the user deliberately deleted. `selfDeparture: false`
confirms the scaffolded suppression (`markSelfDeparture`) was never wired.

**Secondary — wrong name:** the banner shows `activeHouseholdNameRef.current`,
a sticky ref that held "Madbury" (a previously-resolved name), not the deleted
Test 100. So even the name it displayed was stale.

## Fix — Option B: guard the race at its source (self-clearing)

The real defect is "watchdog poll fired while a deliberate loss-resolution was
in flight." Guard on resolution-in-flight rather than on a departure-category
flag (which risks lingering and swallowing future real removals).

### 1. Add a `resolvingRef`

Near the other refs (with `provisioningRef`, ~line 24):

```javascript
  // True while resolveAfterHouseholdLoss is mid-flight — checkPresence defers to it
  // so the watchdog poll can't double-fire a removal the deliberate path is already handling.
  const resolvingRef = useRef(false);
```

### 2. Set it synchronously at the top of `resolveAfterHouseholdLoss`, clear in finally

CRITICAL: set BEFORE the first `await` (there's an `await refreshHouseholds()`
at the top), and wrap the whole body so it always clears. Current body is
lines ~130–153.

```javascript
  const resolveAfterHouseholdLoss = useCallback(async (lostId, notifyRemoval) => {
    if (provisioningRef.current) return;
    if (resolvingRef.current) return;      // re-entrancy guard
    resolvingRef.current = true;           // set synchronously, before any await
    try {
      await refreshHouseholds();
      const remaining = myHouseholdsRef.current.filter((h) => h.id !== lostId);
      if (remaining.length >= 1) {
        if (notifyRemoval) onRemovalRef.current?.(activeHouseholdNameRef.current, false);
        switchHousehold(remaining[0].id);
      } else {
        if (notifyRemoval) onRemovalRef.current?.(activeHouseholdNameRef.current, true);
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
```

### 3. Make `checkPresence` defer to an in-flight resolution

At the top of `checkPresence`, alongside the existing `provisioningRef` bail
(~line 159):

```javascript
      if (provisioningRef.current) return;
      if (resolvingRef.current) return;   // a deliberate loss-resolution owns this — don't double-fire
```

This closes the race: when `handleDeleteHousehold` calls
`resolveAfterHouseholdLoss(deletedId, false)`, `resolvingRef` is set before the
poll can act, so the racing `checkPresence` bails instead of firing the banner.

### A's intent, folded in

Option A's goal (suppress the notice for voluntary departures) is achieved here
as a consequence: the deliberate delete/leave path runs `resolveAfterHouseholdLoss`,
which holds `resolvingRef` for its whole duration, so the poll can't fire during
it. No separate departure flag needed, and — unlike A — nothing lingers to
swallow a later genuine removal. `markSelfDeparture`/`selfDepartureRef` become
dead scaffolding; leave them for now (removing is a separate cleanup) OR remove
in this commit if trivial — builder's call, note which.

## Name-correctness fix (secondary, same commit)

The banner should name the household actually lost, not a stale sticky ref.
When `checkPresence` detects the active id vanished, capture that household's
name from the list it *last* saw it in, and pass it through. Minimal approach:
in `checkPresence`, resolve the lost name from `myHouseholdsRef.current` (the
pre-update list still holding the departed household) BEFORE overwriting it, and
thread it into the `onRemoval` call rather than relying on `activeHouseholdNameRef`.
If threading the name is non-trivial, SPLIT this into a follow-up spec and ship
the race fix alone — the race fix is the launch-critical part.

## Verify diagnostic is reverted

`c9e330f` added DIAG logging + the 3000ms poll. This commit must restore the
poll to `30000` and remove all `// DIAG` lines. Confirm no `[DIAG` strings and
no `3000` interval remain.

## Verification (dev-first)

1. Reproduce the original: create "Test 200", get auto-switched, delete it.
   → NO banner. Active stays/returns to a real household. Confirm in DIAG-free
   console there's no error fired.
2. Leave a household you're a member of (multi-household): → NO false banner,
   clean switch to survivor.
3. **Genuine-removal regression (critical — don't skip):** the guard must NOT
   suppress a REAL external removal. With two devices/users: from device B,
   remove DH from household X (DH not acting on device A). Within ~30s the
   watchdog poll on device A SHOULD fire the removal notice — confirm it still
   does, and (if name fix included) names X correctly.
4. Confirm poll interval is back to 30s and no DIAG output.
5. Stop at dev. Promote after verification.

## Why this is safe

`resolvingRef` only suppresses the poll while a resolution is actively running
(a sub-second-to-seconds window) and always clears via `finally`. Genuine
external removals — where no deliberate handler is running — are unaffected:
`resolvingRef` is false, the poll fires normally (verified by regression #3).
