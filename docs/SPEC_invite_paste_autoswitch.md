# SPEC — Invite-paste auto-switch (explicit-accept gate)

Scope: OurProvisions (Harbour-relevant: establishes the explicit-accept vs
passive-grant membership primitive the fleet will inherit)

Intent: When an existing user pastes an invite URL, the join succeeds (membership
row created, RPC returns joined_via_invite: true) but the app does NOT switch
their active household — they stay in their prior household and cannot tell the
invite worked. (Observed live: a real user, already in one household, pasted an
invite, joined successfully, and was confused because nothing moved.) Root cause:
the App.js banner effect gates the auto-switch on `hadPrior` (does the user
already have a household), which is the WRONG question. New users switch;
existing users are silently left in place.

Decision (architectural): The correct gate is "did the user EXPLICITLY accept an
invite this load," not "are they new." `just_joined_household_id` is set in
sessionStorage (useProvisions.js ~287) ONLY inside `if (joined_via_invite)`,
which is true ONLY when an invite code was present and consumed this load. So
`joinedId` IS the explicit-accept signal. Gating on `joinedId` alone makes
explicit invite-accepts switch the view (new AND existing users), while a future
PASSIVE/admin-provisioned join — which would create a membership WITHOUT going
through the joined_via_invite stash — correctly does NOT yank the user's view.
This builds the Harbour membership model correctly now: explicit accept moves you;
passive grant does not. The fix is to REMOVE the wrong proxy, not add machinery.

The prior "Effect 2 map-wipe / pre-join snapshot" landmine is STALE — confirmed by
diagnosis. Current Effect 2 wipes per-household state and reloads from the DB on
every activeHouseholdId change; there is no in-memory authored state for a switch
to clobber, so no snapshot is needed. The switch is safe.

## EDITS

File: src/App.js  (banner effect, ~lines 454-477)

Replace the hadPrior-gated block with a joinedId-only gate. Remove the hadPrior
computation and the stale TODO. Run the existing await-refresh-then-switch path
whenever joinedId is present.

OLD:
        // Capture hadPrior from the pre-refresh list so the refresh below doesn't race the check.
        // 0 = brand-new user with no prior household → auto-switch.
        // ≥1 = established user → silent join, leave active context unchanged.
        const hadPrior = (myHouseholds || []).length >= 1;
        if (joinedId && !hadPrior) {
          // New user: await refresh so the membership guard in switchHousehold
          // sees the new household before we try to activate it.
          (async () => {
            await refreshHouseholds();
            switchHousehold(joinedId);
          })();
        } else {
          // Silent join (or no joinedId edge case): refresh so the new household
          // appears in the switcher immediately — no reload needed.
          // TODO(dan): established user with untouched prior list should also
          // auto-switch, but the maps reflect the joined household by the time
          // this effect fires. Needs a pre-join snapshot to implement safely.
          refreshHouseholds();
        }
NEW:
        // joinedId is set (useProvisions Effect 1) ONLY when an invite was
        // explicitly accepted this load (joined_via_invite). That is the correct
        // signal to auto-switch: an explicit accept moves the user into the
        // joined household, for new AND established users. A future passive /
        // admin-provisioned join would NOT set joinedId, so it correctly does
        // not move the user's active view. (Harbour membership model: explicit
        // accept switches; passive grant does not.)
        // Switch is safe — Effect 2 reloads per-household state from the DB on
        // activeHouseholdId change; no in-memory state to clobber, no snapshot.
        if (joinedId) {
          // await refresh so switchHousehold's membership guard sees the new
          // household before we activate it.
          (async () => {
            await refreshHouseholds();
            switchHousehold(joinedId);
          })();
        } else {
          // No joinedId (edge case): refresh so any new household appears in the
          // switcher; leave active context unchanged.
          refreshHouseholds();
        }

## DB
None.

## TEST
1. Push to dev, hard-refresh (Ctrl+Shift+R).
2. PRIMARY CASE (the reported bug): As an EXISTING user already active in
   household A (e.g. TU in NewLeaf), have another user (DH) invite them to
   household B (Madbury). Paste the Madbury invite URL into TU's browser.
   EXPECT: after load, TU's active household is now Madbury (not NewLeaf), with
   Madbury's list/data shown correctly. No hang, no wiped/blank list, no
   highlight/data split.
3. REGRESSION — new user: brand-new user pastes an invite → still lands in the
   invited household (unchanged behavior).
4. REGRESSION — switch integrity: after the auto-switch, manually switch back to
   NewLeaf → its data loads correctly (confirms no cross-household state bleed).
5. REGRESSION — normal load (no invite): existing user opens the app with no
   ?invite= → lands in their last-active household as before, no unexpected switch.

## LOG_SEED
Fixed invite-paste auto-switch: existing users who explicitly accept an invite now
land in the joined household (was gated on `hadPrior`, the wrong question; now
gated on `joinedId` = explicit-accept signal). Establishes the Harbour membership
primitive: explicit accept switches the active view, passive/admin grant does not.
Removed stale Effect-2-map-wipe TODO (landmine no longer real after resolver
rewrite).
