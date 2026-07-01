# SPEC — Join should activate the joined household

**Scope:** OurProvisions
**Type:** Bug fix at the invite-join → active-household-lens seam
**Risk:** Medium. No schema/RLS/DB. Pure client, but touches the lens (`ActiveHouseholdContext`) and the join detection in `useProvisions` — the two authoritative writers of "which household am I in." A wrong fix creates a split-brain (two disagreeing sources of truth for the active household).
**Surface:** `src/App.js`, `src/hooks/useProvisions.js`, possibly `src/contexts/ActiveHouseholdContext.js`.

---

## The reported defect

Confirmed 2026-07-01: an existing user with prior households accepts an invite; membership lands
server-side, but the active-household **lens** does not move — the user stays in their prior
household instead of landing in the one they just joined. Reproduced by **pasting an invite URL
while already signed in** (there is no in-app "enter a code" field — see below).

---

## What the code actually does today (traced, not assumed)

There are **two** join routes in the codebase. They do not share a mechanism, and only one is wired.

### Route A — `?invite=` URL, handled through bootstrap
The live path for both new AND existing users, because **there is no in-app paste-a-code UI**
(`grep` for paste/enter-code/joinCode in `App.js` returns nothing). An existing user "pastes a
code" by putting the invite URL in the address bar and reloading. A reload remounts the app, so:

1. `useProvisions` Effect 1 runs (keyed `[userId, clerkId, email]`), reads the `?invite=` param,
   passes it to `bootstrap_new_user` (atomic join). *(useProvisions.js ~264–275)*
2. On `joined_via_invite`, Effect 1 sets `sessionStorage.just_joined_household` +
   `just_joined_household_id`, and strips the invite from the URL. *(~287–291)*
3. `App.js` banner effect reads those keys, `await refreshHouseholds()` (so `switchHousehold`'s
   membership guard can see the new household), then `switchHousehold(joinedId)` — **this moves
   the lens.** *(App.js ~516–536)*
4. A companion banner-race effect *(App.js ~544–555)* exists specifically for the existing-user
   case, where the banner is set before the async switch lands.

**Route A already contains the switch this ticket asked us to add.** So the ticket as written
("add the switch") is stale — the switch exists. The real question is why it does not fire, or
does not stick, for an existing user.

### Route B — `acceptInvite(code)`, defined but DEAD
`useProvisions.acceptInvite` *(~991–1071)* is a complete paste-a-code join: looks up the code,
calls `join_household`, marks the invite accepted, then **hand-loads** the new household's
catalog + list + realtime subscription and calls `setHousehold(hhData)` directly.

- **It has zero callers** (`grep acceptInvite App.js` → none).
- It **never touches the lens** — no `switchHousehold`, no `just_joined_household_id`, no
  `localStorage.activeHouseholdId` write. It swaps `useProvisions`' own `household` state
  underneath `ActiveHouseholdContext`, whose `activeHouseholdId` would stay on the OLD household.
- If it were ever wired as-is, it would create a **split-brain**: `household` says X, the lens
  says Y, and the 30s `checkPresence` interval could later fire `resolveAfterHouseholdLoss`
  against the mismatch. This is the household-scoped-UI-state disease one level deeper: the lens
  gaining a second, uncoordinated writer.

---

## Diagnosis first — this is a BUILD-blocked-on-a-question, not a blind edit

Because the switch code already exists in Route A, we must find WHY it fails before changing it.
Do this on **deployed dev**, existing user with ≥1 prior household, paste invite URL + reload,
console open. One of these is true:

| # | Hypothesis | Signal in console / behavior | If true, the fix is |
|---|------------|------------------------------|---------------------|
| H1 | `bootstrap_new_user` returns `joined_via_invite=false` for an already-existing user (it's `bootstrap_NEW_user` — an established user may short-circuit before the join branch) | flags never set; no `just_joined_household_id` in sessionStorage | Fix lives in the RPC's join branch, OR move the existing-user join off bootstrap onto `join_household` + explicit switch. **DB-adjacent — own sub-spec if the RPC changes.** |
| H2 | Flags ARE set, but `switchHousehold(joinedId)` is called before `refreshHouseholds()` has populated `myHouseholdsRef`, so the membership guard (`myHouseholdsRef.current.some(...)`) rejects the id and silently returns | flags present; `switchHousehold` entered but guard `return`s; lens unchanged | The `await refreshHouseholds()` before `switchHousehold` is already there (App.js ~532) — verify it's actually awaited and that `refreshHouseholds` populates the ref *before* resolving. If race persists, gate the switch on `myHouseholds` containing `joinedId` via an effect rather than firing inline. |
| H3 | Switch fires and lens moves, but Effect 2's reload keys or some household-scoped UI state doesn't reset, so the user *appears* stuck | lens `activeHouseholdId` DOES change; list/header still shows old household | This is the **household-scoped UI-state audit**, not this ticket. Re-scope. |
| H4 | The banner-race effect (App.js ~544–555) or the invite-link reset effect clears state in a way that interferes | banner flashes then reverts; or switch happens then un-happens | Fix the specific effect's guard. |

**Do not write the fix until one hypothesis is confirmed by console evidence.** Report which,
then implement only that branch. Grep-before-edit: all line numbers above are from this session
and will drift.

---

## The one architectural decision this spec locks (regardless of hypothesis)

**The lens (`ActiveHouseholdContext`) is the single writer of the active household. Full stop.**

Any join path — Route A, or a future wired Route B — must land the active household **through
`switchHousehold`**, never by calling `setHousehold` directly. `acceptInvite`'s direct
`setHousehold(hhData)` swap is the anti-pattern; if we ever wire a paste-a-code UI, it routes
through the lens exactly like the switcher does:

```
join (server) → refreshHouseholds() → switchHousehold(joinedId) → Effect 2 reloads per-household state
```

This keeps one source of truth and lets the existing Effect 2 machinery (keyed on
`activeHouseholdId`) do the per-household reload it already knows how to do — no hand-loading of
catalog/list/realtime, which is duplicated, drift-prone logic living only in `acceptInvite`.

**Corollary for cleanup (not this ticket, but note it):** dead `acceptInvite` either gets
deleted or rewritten to the lens pattern the day we add a paste-a-code field. Leaving it dead is
fine; leaving it dead AND wiring it as-is is the bug we're pre-empting.

---

## Fix (shape depends on confirmed hypothesis)

Most likely **H1 or H2**. In both cases the corrected flow is the same three-line invariant:

1. Server-side join happens (bootstrap's branch, or `join_household`).
2. `await refreshHouseholds()` — lens's membership list now includes the joined household.
3. `switchHousehold(joinedId)` — guard passes, `localStorage.activeHouseholdId` written,
   `activeHouseholdId` state set, Effect 2 reloads.

If **H2** (race): prefer making the switch **reactive** rather than inline —
set a `pendingJoinId` and let an effect fire `switchHousehold(pendingJoinId)` once
`myHouseholds` contains it — so we never depend on `refreshHouseholds` having resolved the ref
synchronously.

If **H1** (bootstrap doesn't flag existing-user joins): the existing user's join may need to move
off `bootstrap_new_user` onto a plain `join_household` + switch, triggered when an `?invite=`
param is present on an already-bootstrapped session. **That is a real behavior change and, if it
touches the RPC, needs its own DB-adjacent spec** — stop and flag rather than editing the RPC
inside this ticket.

---

## Verify (deployed dev, existing user with a prior household)

1. Existing user, currently active in Household P (prior). Paste an invite URL for Household J,
   reload.
2. After load: header shows **Household J**, list shows J's items, switcher shows J as active.
   `localStorage.activeHouseholdId === J.id`.
3. `activeHouseholdId` in the context and `useProvisions.household` **agree** (no split-brain).
4. Join banner shows J's name and self-dismisses; does not revert the switch.
5. Switch manually back to P → works; switch to J → works. No ghost membership, no
   `resolveAfterHouseholdLoss` firing from the 30s interval.
6. Brand-new user via the same invite URL still lands in J (Route A's original case unbroken).
7. Invite link panel is reset (not showing P's stale link) after landing in J.

---

## Out of scope / explicitly NOT doing

- No paste-a-code UI this ticket. (If we add one later, it routes through the lens — see decision.)
- No wiring of `acceptInvite` as-is. Dead is acceptable; split-brain is not.
- No full household-scoped UI-state audit here — if diagnosis lands on H3, re-scope to that ticket.
- No RPC edit inside this ticket — if H1 requires touching `bootstrap_new_user`/`join_household`,
  stop and write a DB-adjacent sub-spec.
