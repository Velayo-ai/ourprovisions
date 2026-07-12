# SPEC — DIAGNOSTIC: capture what checkPresence sees when the false removal banner fires

**Scope:** OurProvisions
**Type:** TEMPORARY diagnostic instrumentation — NOT a fix. Revert after capture.
**File:** `src/contexts/ActiveHouseholdContext.js`
**Touches prod:** No. Dev-only. Do not merge to main.

---

## Purpose

The false "No longer a member" banner is emitted by the `checkPresence` polling
interval, not by staple churn directly. We need to know WHICH of three causes
trips it, and the user's recollection of what they did is unreliable. So instrument
the poll to report ground truth, then trip it on dev and read the console.

Three candidate causes this capture discriminates:
- **A — transient empty read:** `get_my_households` returns `data=[]` for a tick
  during churn. `data.length === 0`.
- **B — populated-but-missing:** list returns rows but the active id is absent —
  a genuine membership-row drop. `data.length > 0`, active id not present.
- **C — voluntary leave/delete:** `selfDepartureRef.current === true` at fire time
  (the unwired step-5 path).

## Changes (all temporary — tagged `// DIAG` for easy removal)

### 1. Log every poll result (not just the firing one)

In `checkPresence`, replace the block from the `get_my_households` call through the
fire decision (current lines ~163–178) so it logs on EVERY poll before deciding:

```javascript
        const db = getDb();
        const { data, error } = await db.rpc("get_my_households");

        // DIAG — log every poll's raw result before any decision
        console.warn("[DIAG checkPresence]", {
          ts: new Date().toISOString(),
          error: error ? (error.message || String(error)) : null,
          dataLen: Array.isArray(data) ? data.length : `not-array(${typeof data})`,
          activeId: activeHouseholdIdRef.current,
          activeIdPresent: Array.isArray(data)
            ? data.some((r) => r.household_id === activeHouseholdIdRef.current)
            : "n/a",
          selfDeparture: selfDepartureRef.current,
        });

        if (error || !data) return;
        const households = data.map((row) => ({
          id: row.household_id,
          name: row.name,
          role: row.role,
        }));
        myHouseholdsRef.current = households;
        setMyHouseholds(households);
        if (households.some((h) => h.id === activeHouseholdIdRef.current)) return;

        // DIAG — log the exact moment it decides to fire the banner
        console.error("[DIAG checkPresence FIRING removal notice]", {
          ts: new Date().toISOString(),
          dataLen: data.length,
          activeId: activeHouseholdIdRef.current,
          selfDeparture: selfDepartureRef.current,
        });

        await resolveAfterHouseholdLoss(activeHouseholdIdRef.current, true);
```

### 2. Speed up the poll for the capture run only

Change the interval from 30000 to 3000 (line ~184):

```javascript
    const intervalId = setInterval(checkPresence, 3000); // DIAG — was 30000
```

This makes a poll land every ~3s so a short churn burst crosses several poll
boundaries, instead of racing a 30s interval.

## Capture procedure (dev only)

1. Build, push to dev, wait for Vercel. Open `dev.ourprovisions.velayo.ai`.
2. Sign in as DH. Open DevTools → Console. Filter console to `DIAG`.
3. Network → Slow 3G (widens the race window).
4. Run staple/item churn hard for ~30s: rapidly toggle staples, add/delete items
   back-to-back, switch households and back if a second exists. Do NOT click
   leave/delete household (we're testing the no-membership-action path).
5. Watch for the teal banner. The `[DIAG checkPresence FIRING...]` line marks the
   trip; the `[DIAG checkPresence]` lines around it show the baseline.

## What the capture tells us

At the FIRING line, read `dataLen` and `selfDeparture`:
- `dataLen: 0` → **Cause A** (transient empty). Fix = require confirmation before
  firing: a single empty read must not trigger removal (e.g. two consecutive
  agreeing polls, or re-fetch-and-verify before `resolveAfterHouseholdLoss`).
- `dataLen > 0`, active id absent → **Cause B** (real row drop). Deeper — inspect
  the RPC / RLS; membership row is actually missing under load.
- `selfDeparture: true` → **Cause C** (voluntary path). Fix = wire
  `markSelfDeparture()` into leave/delete handlers + honor it in checkPresence
  (finish the existing step-5 TODO).

If the banner will NOT trip even at 3s + Slow 3G + hard churn: that itself is
signal — the transient-empty path may be rarer than thought; note it and we
reassess.

## Revert

After capture: remove all `// DIAG` lines and restore the interval to `30000`.
The real fix ships as a separate spec against the confirmed cause. This
diagnostic must not reach main.
