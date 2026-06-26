# SPEC — Layer 2: Removal Notice + Fresh-Household Auto-Provision

**Scope:** OurProvisions
**Status:** Design approved (this chat). Ready for Claude Code build.
**Depends on:** migrations 003 (`is_member_of`), `create_household` RPC, `refreshMembers`
primitive — all already live.
**Prereq build discipline:** dev-first; mockup approved (Register-3 shape, teal-accent
translucent espresso wash — see `mockup_notice_translucent.html` variant B); surgical
`str_replace`; one tested change committed before the next.

---

## 1. Problem this solves

When member X is removed from a household by member Y (via the existing
`remove_member` RPC), Y's own view updates live (Y calls `refreshMembers` +
`refreshHouseholds`). **X's view does not.** X keeps showing the household X was
removed from until a manual refresh — gracefully degraded (RLS blocks X's writes)
but unfinished.

The realtime path we hoped to use is **blocked by RLS** (confirmed against dev,
2026-06-22):

- The live `household_members` SELECT policy is `is_member_of(household_id)`
  (NOT `household_id = get_current_household_id()` — the canonical baseline `000`
  predates migrations 003–005 and is stale on this point).
- `is_member_of` (migration 003, line 75) filters `hm.deleted_at is null`.
- Supabase realtime evaluates the SELECT policy against the **new** (soft-deleted)
  row image to decide delivery. The instant X is removed, `is_member_of` returns
  false for X against that household → realtime **suppresses X's own removal
  broadcast.** Other members still receive it; X never does.
- `household_members` replica identity = `default` (pk only) — the UPDATE's old
  image carries only the pk, so reading pre-removal state from the old image is
  not available either.

**Conclusion:** a client-side `postgres_changes` subscription cannot notify the
removed user. We use **membership-presence detection** instead — a low-frequency
re-check of "is my active household still in my household list."

Product decision: **~30s latency is acceptable** (KISS). No new server surface,
no RLS change.

---

## 2. Detection mechanism (the core)

**Lives in:** `ActiveHouseholdContext` — it already owns `myHouseholds`,
`switchHousehold`, `refreshHouseholds`, and `clerkId`. The removed-user path is a
context-level presence check, NOT a `useProvisions` concern.

**Interval discipline (CRITICAL — this is the category that caused prior
catastrophic bugs: stacked intervals, `getToken` instability):**

- One `useEffect` keyed **only on `clerkId`** (stable for the session).
- Everything else read through refs kept current each render:
  `activeHouseholdIdRef`, `myHouseholdsRef` (already exists), `getTokenRef`
  (already exists in this file).
- **DO NOT** put `activeHouseholdId` in the interval effect's dep array — that
  would tear down and rebuild the interval on every household switch.
- Interval fires `checkPresence()` every **30s**. Clean teardown on unmount /
  `clerkId` change (clear the interval).

**`checkPresence()` logic:**

1. Call `get_my_households` (reuse the exact fetch `refreshHouseholds` uses).
2. **Transient guard (marine-wifi safety — same class as the `loadListItems`
   suspect-empty guard):** only proceed if the fetch **succeeded AND returned a
   non-empty list.** On error OR empty result → treat as transient, **hold
   position, return.** Removal is "the list came back healthy and my active id
   isn't in it" — NEVER "the list didn't come back."
3. Update `myHouseholds` / `myHouseholdsRef` from the healthy result (this doubles
   as a passive refresh).
4. Read `activeHouseholdIdRef.current`. Is it present in the fresh list?
   - **Yes** → do nothing.
   - **No** → the active household vanished. Go to §3 (disambiguate) then §4/§5.

**Tab-focus immediate check (DEFERRED — see §7):** not in v1.

---

## 3. Removed vs. left (the asymmetry)

The presence check sees a subtraction; it cannot see the cause. Both "I left" and
"I was removed" produce an identical observable. Disambiguate with a local flag:

- `selfDepartureRef` (a `useRef(false)` in the context, or surfaced from App.js).
- In `handleLeaveHousehold` (App.js:690), set the flag **true** at the top, before
  calling `leave_household`.
- In `checkPresence`, when the active household has vanished:
  - If `selfDepartureRef.current === true` → **voluntary leave.** Switch silently
    (no notice). Clear the flag.
  - Else → **removal.** Fire the notice (§4) and switch/provision (§5).
- Backstop: clear `selfDepartureRef` on a short timeout (e.g. 5s) after a leave, so
  a stale flag can't suppress a later genuine removal.

**Note:** `handleLeaveHousehold` already switches synchronously after the leave RPC
(App.js:699–701), so in the normal case X is moved to a survivor *before* the next
interval fires — the flag only covers the race where the interval beats that
synchronous switch. Fail-safe direction: if the flag is somehow missed, X sees an
"explained" notice for a voluntary leave (mildly redundant) — never the reverse
(a silent unexplained removal). That is the gentler error.

---

## 4. The notice (Register-3 shape, teal-accent translucent — PROVISIONAL)

**Treatment:** edge-floating left-accent status block, `position: fixed`, bottom,
left/right inset ~14px. Background `rgba(44,26,14,0.5)` + `backdrop-filter: blur(7px)`,
`border-left: 4px solid #0D9488` (teal), info icon + household name in teal
(`#5fd8c9`), cream text, dismiss ✕, 2px teal auto-dismiss progress bar.
See `mockup_notice_translucent.html` variant B for exact tokens.

**⚠️ WATCH-ITEM (provisional):** teal-accent chosen to read as "status," but we are
NOT certain it won't feel like an error in daily use. Revisit after living with it.
If it reads as error → try variant A (sand accent) or adjust. Do not treat the
visual as final.

**`backdrop-filter` fallback:** if a target webview lacks `backdrop-filter`, the 50%
alpha alone still renders correctly (no blur). Acceptable; no polyfill.

**Behavior:**
- Auto-dismiss after **30s**; also manually dismissible (✕).
- **Must persist across the household switch** — it lives as App.js-level state
  (above the household being torn down), NOT inside the household-scoped tree, or
  it'll unmount mid-switch.

**Wording (locked):**
- Line 1 (always): `No longer a member of {oldHouseholdName}.`
- Line 2 (only when auto-provisioned — see §5): `We've set you up with a fresh household.`

---

## 5. Switch / auto-provision after removal

After confirming removal (§3), branch on what's left in the healthy household list
(excluding the vanished id):

- **≥1 remaining** → `switchHousehold(remaining[0].id)`. Notice = line 1 only.
- **0 remaining (removed from only household)** → **auto-provision:**
  - Call `create_household` (reuse existing RPC) with name `"My Household"`.
  - `refreshHouseholds`, then `switchHousehold(newId)`.
  - Notice = line 1 + line 2.
  - **In-flight guard (CRITICAL):** a `provisioningRef` (`useRef(false)`) set true
    before `create_household` and cleared after the switch completes. The 30s
    interval must NOT fire a second `create_household` if the first is still in
    flight (flaky wifi → otherwise spawns duplicate "My Household"s). If
    `provisioningRef.current` is true, `checkPresence` returns early.

Auto-provisioned household is **empty** (global catalog only; no list items, no
custom items, no history) — correct: X was removed and does not keep shared data.
The notice's line 2 is what makes the suddenly-empty list legible.

**⚠️ KNOWN-DEBT to log in ROADMAP (do not solve now):** repeated add/remove of a
guest-only user spawns repeated empty "My Household"s — junk-household
accumulation. Accepted under KISS ("wait until people complain"). Future fix:
only auto-provision if the user has never had a personal household, else switch to
a dormant existing one. Deferred.

---

## 6. Channel-ready, single-tenant (design-for-future, build-for-now)

This bottom-edge notice is intended as the **future home for app-level system
messages** (join banner, connectivity, trip events). Build it with a **typed
message shape** so it can become that channel — but build ONLY this one tenant now.

**Build now:**
- A small typed object, e.g. `systemMessage = { kind, text, subtext?, durationMs,
  dismissible }`, held as App.js state, with a `postSystemMessage(msg)` setter.
- Removal notice posts `{ kind: 'info', text, subtext?, durationMs: 30000,
  dismissible: true }`.
- One render block consuming that state (variant-B styling).

**Deliberately DEFER (do NOT build until a 2nd real tenant exists):**
- Queueing / stacking / priority rules.
- Migrating the existing 2.5s `showToast` (App.js:351) or `joinBanner`
  (App.js:308, 1352) into the channel.
- When the 2nd tenant arrives (likely `joinBanner` first), THEN design
  newest-wins-vs-persistent priority against two real cases.

Rationale: design the shape for the future, pay for only the present tenant.

---

## 7. Deferred items (note, don't build)

- **Tab-focus immediate check** (`visibilitychange` → immediate `checkPresence`):
  improves perceived responsiveness so a returning user finds out at once rather
  than waiting out the 30s. Add only if the 30s wait feels slow in use.
- Channel queueing/priority (§6).
- Junk-household mitigation (§5).

---

## 8. Build order (surgical, one tested commit each)

1. Context: add refs (`activeHouseholdIdRef`, `provisioningRef`, `selfDepartureRef`),
   keep them current each render.
2. Context: add `checkPresence` + the `clerkId`-keyed interval with transient guard.
   Test on dev: two windows, DH removes DT, confirm DT switches within 30s.
3. Context: add removal→switch + auto-provision branch with in-flight guard.
   Test: DT removed from ONLY household → lands in fresh "My Household".
4. App.js: typed `systemMessage` state + `postSystemMessage` + variant-B render
   block. Wire context detection to post the message (surface a callback or
   context value App.js reads).
5. App.js: set `selfDepartureRef` in `handleLeaveHousehold`; confirm voluntary
   leave stays silent.
6. Full two-window regression on dev (removal-with-survivor, removal-only-household,
   voluntary-leave-silent, transient-blip-holds-position). Hard-reset both clients
   before judging (stale bundles → false readings).
7. Commit. Hold dev→main per standing instruction.

**DB changes:** none (all RPCs already live).
**Files touched:** `ActiveHouseholdContext.js`, `App.js`.

---

## 9. Verification checklist (dev, two-window)

- [ ] DH removes DT (DT has another household) → DT switches to it ≤30s, line-1 notice.
- [ ] DH removes DT (DT's only household) → DT lands in fresh "My Household", line-1+2 notice.
- [ ] DT taps Leave → silent switch, NO notice.
- [ ] Simulated dropped fetch (empty/error) → DT holds position, no false eject.
- [ ] Flaky double-fire → exactly ONE "My Household" created (in-flight guard holds).
- [ ] Notice survives the switch (doesn't flash/unmount mid-transition).
- [ ] Notice auto-dismisses ~30s AND manual ✕ works.
