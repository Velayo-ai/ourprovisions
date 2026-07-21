# SPEC ADDENDUM — Join-activation REOPENED (prod fails; dev-green fix incomplete)

**Appends to:** `docs/SPEC_join_activates_household.md`
**Scope:** OurProvisions
**Type:** Reopen — the shipped `pendingJoinId` fix passes on dev but FAILS on prod.
**Risk:** Medium. Same seam as the original (App.js join detection + `ActiveHouseholdContext` lens). Client-only, no DB.
**Status:** The original fix (`1c5a916`, reactive `pendingJoinId` in App.js) is live on main/prod and is INCOMPLETE. This addendum supersedes the "Fix" section of the original spec.

---

## What happened

The original fix was verified green on **dev** (three fresh joins, multi-household profile, both legs).
It was then merged to main and tested on **prod** (`ourprovisions.velayo.ai`, Supabase project
`parpauldmbetptkmdwbd`) — and it **reproduced the original bug.** Dev-green did not transfer to prod,
because the failure is latency-sensitive and prod is slower than dev.

**Prod repro (2026-07-01):**
- Inviter (DH) in household **Madbury**, generated fresh invite `Z8165W`.
- Existing user **Test User 60** (has a prior "My Household"), incognito, active in **My Household**.
- TU60 pasted `ourprovisions.velayo.ai?invite=Z8165W` in the address bar and loaded — a genuine
  invite-consuming load (`bootstrap_new_user` fired, confirmed in Network).
- **Result:** header stayed on **MY HOUSEHOLD**. Madbury appeared in the switcher **late** (visible
  populating a beat after load) but was never activated. The lens never moved.

---

## The diagnosis — this is now concrete, not hypothetical

Console evidence captured in the failed prod state, with the switcher showing My Household ACTIVE /
Madbury present-but-inactive:

```
localStorage.getItem("activeHouseholdId")      → "1e12d401-4bd2-4567-8f91-b5a1745015a5"  (= My Household — prior household, lens never moved)
sessionStorage.getItem("just_joined_household_id") → "d69884b9-e7d1-450b-8b85-69b75691c210"  (= Madbury — STILL SET, never consumed)
```

**The two facts that pin the cause:**

1. `just_joined_household_id` is **still set** (non-null) in the failed state. So `bootstrap_new_user`
   DID report the join and DID write the flag. (Consistent with H1 being ruled out — the RPC is fine.)
   The flag was **never consumed** into a switch, and never cleared — because clearing only happens
   *after* a successful switch that never came.

2. `activeHouseholdId` still points at the prior household. The lens never wrote.

Combined with the observed **late population of Madbury into `myHouseholds`** (switcher filled in a
beat after load), the mechanism is a **single-fire race**:

- The App.js join-banner effect (keyed `[loading, household]`) reads `just_joined_household_id`
  **once** when `household` first resolves and sets `pendingJoinId`.
- The reconciling effect fires `switchHousehold(pendingJoinId)` only when `myHouseholds` **already
  contains** the joined id.
- On prod's slower load, `myHouseholds` did **not yet contain Madbury** at the moment(s) the effect
  evaluated. Membership propagated into `get_my_households` late. The effect did not re-fire when
  Madbury finally arrived, so the switch never happened — and `pendingJoinId` / the flag parked
  forever.

This is exactly the **interrupted / late-membership window** flagged in the original commit as
"reasoned-correct but not reproduced." It is now **reproduced on prod by real latency.**

---

## The fix — make flag consumption durable and retriable (supersedes original "Fix" section)

The original fix moved intent into React state (`pendingJoinId`) but left three single-fire
assumptions that break under prod latency. Correct all three:

1. **Re-derive `pendingJoinId` from the surviving flag, not just once.** While
   `just_joined_household_id` is set AND not yet reflected in the active household, (re)set
   `pendingJoinId` from it on the relevant renders — don't rely on a single `[loading, household]`
   fire catching the flag at exactly the right moment. The sessionStorage flag is the durable
   source (it survives reload; React state does not); treat it as the source of truth for
   "unfinished join intent" until the switch is confirmed.

2. **Re-fire the reconciling switch on EVERY `myHouseholds` change while `pendingJoinId` is set and
   unresolved.** This is the core fix. The effect must be keyed so that when the joined household
   populates late into `myHouseholds`, the switch fires *then*. Today it evaluates and gives up;
   it must keep watching until the id resolves.

3. **Clear the sessionStorage flag ONLY after `switchHousehold` confirms the active id equals the
   joined id.** Not before. Premature clearing is what strands the intent when the switch hasn't
   landed. Guard: after `switchHousehold(joinedId)`, confirm `activeHouseholdId === joinedId`
   (or re-check on the next render), then remove `just_joined_household_id`.

**Optional hardening (recommended given prod latency):** a bounded `refreshHouseholds()` retry —
if `pendingJoinId` is set but hasn't appeared in `myHouseholds` after a short interval, re-fetch
`get_my_households` once or twice (bounded, not a loop) to pull the late membership in, rather than
waiting passively for whatever refresh cadence exists. Keeps a slow prod propagation from stranding
the join indefinitely.

**Invariant unchanged:** the lens (`ActiveHouseholdContext`) remains the single writer. Switch
through `switchHousehold`, never `setHousehold`. Do not wire dead `acceptInvite`.

---

## Verify — MUST be verified on PROD, not just dev

Dev-green already proved insufficient. The whole point of this reopen is that prod latency is the
trigger. Verify on `ourprovisions.velayo.ai`:

1. Existing user with a prior household (e.g. a TU## account already in ≥1 household), incognito.
   Note active household = prior (e.g. My Household).
2. From another account, generate a **fresh** invite to a household the test user is NOT in.
3. Paste the invite URL, load. → Header shows the **joined** household; banner fires.
4. In console: `sessionStorage.getItem("just_joined_household_id")` → **null** (flag consumed and
   cleared after a confirmed switch). `localStorage.getItem("activeHouseholdId")` → the **joined**
   household's id.
5. Hard-reload → stays in the joined household.
6. Repeat once where the tester deliberately watches for late `myHouseholds` population (the prod
   race) — the switch must still land.

If step 3/4 pass on prod, the reopen is closed. Do NOT re-mark DONE on dev evidence alone.

---

## Roadmap / bookkeeping correction

- **The prior "Move Join-activation → DONE" was premature.** The fix is live but incomplete.
  Move it back to **NOW** (or top of NEXT) as: *"Join-activation — reopened 2026-07-01: shipped
  `pendingJoinId` fix is dev-green but fails on prod under membership-propagation latency; flag
  `just_joined_household_id` is set but never consumed. Cause identified (single-fire reconcile);
  fix = durable/retriable flag consumption per SPEC addendum. Prod-verify required."*
- The interrupted-window caveat recorded in commit `1c5a916` is now a confirmed prod failure, not a
  theoretical edge — reference it so the history is honest.
- Text-size (`b8368f5`) remains correctly DONE — live and verified on prod, unaffected.
