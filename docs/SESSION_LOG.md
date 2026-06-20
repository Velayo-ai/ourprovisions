# SESSION LOG
*One entry per session. Most recent at top.*

---

## FORMAT

```
### [YYYY-MM-DD] — [SCOPE] — [GOAL]
**Goal:** [one sentence]
**Completed:**
- [past-tense, action-verb led, max 7 items]
**Unfinished:**
- [honest list, or "None"]
**Next session:**
SESSION START
Goal: [logical next goal]
State: [what's working, what's live, what's broken]
Done when: [clear success condition]
**Files updated:** [list or "None"]
**DB changes:** [list or "None"]
```

---

## LOG

### [2026-06-20] — [OurProvisions] — Connectivity pill: soft offline/retry UX
**Goal:** Replace the alarming red error toast on transient network drops with a gentle bottom pill (Reconnecting / Offline / Back online) that keeps last-good data visible.
**Completed:**
- Built `src/lib/classifyFetchError.js` — pure classifier (no imports): transient (Failed to fetch, ERR_CONNECTION*, NetworkError, AbortError, TypeError+network) → pill; real (HTTP error, Supabase code/status, RLS denial, anything else) → red toast. Default `'real'` (fail safe).
- Built `src/contexts/ConnectivityContext.js` — state machine (online → reconnecting → [3 fails] offline → [success] recovered → [2s] online); `failureCount` ref; recovered timer cleared on re-entry + unmount. Built `src/components/ConnectivityPill.js` — brand-token styled (sand/amber pulse, dark-dot offline, teal back-online), bottom-center mirrors toast, `pointerEvents:none`, `role=status aria-live=polite`, returns null when online.
- Wired `ConnectivityProvider` into `App.js` (outside `ActiveHouseholdProvider`); rendered `<ConnectivityPill />` adjacent to existing error toast.
- Converted 4 read-path error guards in `useProvisions.js` (catalog-refresh ×2, list-load, household-fetch): transient → `reportTransientFailure()` + keep last-good; real → unchanged `setError()`. `reportSuccess()` on boot load success and 20s catalog-poll success.
- Converted 2 write-path error guards (`updateQty`, `toggleChecked`): rollback UNCONDITIONAL (runs on any catch), then branch (transient → pill, real → setError); `reportSuccess()` on confirmed write. Verified: offline write rolls back + shows pill; reconnect reconciles server value.
- Diagnosed badge resurrection bug (design chat): zero-out soft-deletes `list_items` row but does NOT clear `list_item_contributors`; migration 008 upsert resurrects the same row → old badges reappear. Fix = migration 009 atomic RPC (soft-delete + contributor clear, both-or-neither for marine-wifi robustness).
- Designed membership exit (Leave/Remove) in principle (design chat): LEAVE ≈ HIDE (per-user, non-owner self-exit); REMOVE = owner-only. Gated on cycle-boundary question: if provision_cycles are user-facing, ship with "applies at next boundary"; if still backend-only, ship simpler rule first. Do not stack on an unloaded seam.
**Unfinished:**
- Poll-clobber on offline: offline write → optimistic shows correctly → ~1s later background 2s list poll fires, fails/returns empty, resets quantity to 0 → reconnect heals. Transient handling not yet extended to the poll/realtime path (next session).
- Feature files not yet committed (verified on localhost dev). Commit: `feat(ux): connectivity pill — soft offline/retry for transient fetch failures`.
- Remaining `setError` sites (clear list, open cycle, start session) still red toast — optional polish, not core.
- SPEC_leave_remove_member.md not yet produced; cycle-boundary gating question unanswered.
- Migration 009 (badge reset on zero) designed but not built.
**Next session:**
SESSION START
Goal: Fix poll-clobber on offline — extend transient-failure handling to the 2s list poll so a failed/empty background fetch does not reset visible quantities to 0 while offline.
State: Connectivity pill verified working on dev (not yet committed). Read paths keep last-good data on transient fail. Write paths roll back unconditionally and branch notification. Poll-clobber is a pre-existing bug exposed by offline testing: offline write shows correct optimistic value ~1s, then 2s poll fires, fails, resets quantity to 0, reconnect heals. No data loss; cosmetic only.
Done when: An offline write optimistic value stays visible and stable for the full offline window — no collapse to 0 on the poll tick.
**Files updated:** `src/lib/classifyFetchError.js` (new), `src/contexts/ConnectivityContext.js` (new), `src/components/ConnectivityPill.js` (new), `src/App.js` (ConnectivityProvider wrap + pill render), `src/hooks/useProvisions.js` (read-path + write-path error guard conversions).
**DB changes:** None.

### [2026-06-20] — [OurProvisions] — Concurrent-add 409 fix (migration 008)
**Goal:** Make insert_list_item conflict-safe so two members adding the same item at once stop throwing a 409 on the losing client.
**Completed:**
- Designed migration 008: converted insert_list_item from plain INSERT to INSERT ... ON CONFLICT (household_id, catalog_item_id) DO UPDATE.
- Chose column-target conflict form over named-constraint form after discovering dev/prod constraint-name drift (dev: auto-named key; prod: list_items_household_catalog_unique).
- Settled merge semantics: last-write-wins on quantity (matches updateQty set-value model), force status='pending', clear deleted_at to resurrect tombstoned slots, COALESCE-preserve cycle_id and price_per_unit.
- Applied 008 to dev; verified upsert_present = true via pg_proc.prosrc; passed both two-window manual tests (concurrent new-item add + concurrent add against soft-deleted tombstone).
- Applied 008 to prod after two-way environment confirmation; verified upsert_present = true on prod.
- Committed 008 (`6cb82c7`) and bundle_003_007_prod.sql historical record (`f764200`), both local on dev.
**Unfinished:**
- 3 commits on dev unpushed (deliberate — awaiting Dan's review/push).
- bundle_003_007_prod.sql not yet annotated with "APPLIED TO PROD — historical record, do not re-run" header.
**Next session:**
SESSION START
Goal: Reconcile the dev/prod constraint-name drift on list_items, and/or close the quiet quantity-bump race.
State: Concurrent-add 409 and Lemons 409 both fully fixed and live in prod. Multi-household invite-join flow is live. insert_list_item is now an upsert on both DBs.
Done when: (a) dev and prod agree on the list_items unique-constraint name via a deliberate reconciliation migration, and/or (b) simultaneous +1 quantity increments on an existing row no longer undercount.
**Files updated:** `migrations/008_insert_list_item_upsert.sql` (new), `migrations/bundle_003_007_prod.sql` (now tracked).
**DB changes:** insert_list_item replaced with upsert body on dev AND prod.

### [2026-06-19] — [OurProvisions] — Multi-household invite-join flow end-to-end
**Goal:** Fix three sequential invite-join bugs so new and established users can join via invite code without reload, data split, or switcher lag — and verify both branches end-to-end with two real users.
**Completed:**
- Fixed invite code not surviving Clerk sign-up redirect: captured `?invite=` in `index.js` before `ClerkProvider` mounts, persisted to `sessionStorage`; bootstrap reads URL-or-stored; new users now join on first load.
- Fixed resolver highlight/data split: Effect 2 trusts `activeHouseholdId` unconditionally; removed `justJoinedViaInviteRef` forced-fallback that loaded joined-household data even on silent joins.
- Fixed silently-joined household missing from switcher: restructured join-banner effect — `hadPrior` captured before async work; silent join calls `refreshHouseholds()` directly; auto-switch awaits refresh before `switchHousehold`.
- Verified Test 1 (first-household auto-switch) and Test A (established-user silent-join): both pass across data, highlight, and switcher list.
- Confirmed `bootstrap_new_user` RPC is correct — all invite-join failures traced to client-side timing/redirect; RPC needed no change.
- Characterized concurrent same-item insert race: two clients adding the same new item simultaneously → second client 409s (unique constraint working correctly; app surfaces it as an error). Root cause and fix direction identified.
**Unfinished:**
- Test B (two-window realtime sync) and Test C (4-household switch cycle) not formally run.
- Concurrent same-item insert race not fixed — characterized, deferred to next session.
- Invalid/spent invite silently lands user in blank "My Household" — no error feedback.
- Join detection keys off fragile name string `household.name !== "My Household"` — should re-key off `joined_via_invite` from bootstrap.
**Next session:**
SESSION START
Goal: Make `insert_list_item` conflict-safe so concurrent same-item adds don't 409.
State: Multi-household join/switch/silent-join working and verified on dev. Three invite-join fixes shipped (index.js capture, resolver single-source, silent-join refresh). Data integrity sound — unique constraint works; the failure is a surfaced error on the losing client.
Done when: Two users adding/bumping the same new item in the same household simultaneously results in one clean row and NO error toast on either client — the second writer updates instead of erroring.
**Files updated:** `src/index.js` (pre-ClerkProvider sessionStorage capture), `src/hooks/useProvisions.js` (URL-or-stored invite code, resolver trusts `activeHouseholdId`), `src/App.js` (join-banner effect restructure: `hadPrior` before async, silent-join refresh, await before auto-switch).
**DB changes:** None.

### 2026-06-18 — Cross — Contributor 403 root-caused; migration 007 sweep; 003–007 applied to prod
**Goal:** Fix the contributor 403, finish the `get_current_household_id()` → `is_member_of` sweep, and ship the migration bundle (003–007) to prod.
**Completed:**
- Root-caused contributor 403 to `household_members_select` (gated on single guessed household, blinding every inline membership join); ruled out duplicate `users` rows and orphaned memberships via Supabase "External user" impersonation — `get_my_households()` returned 5 households while direct `household_members` read returned 1, isolating the SELECT policy as the single blinding gate.
- Authored migration 007 (`007_finish_authorize_sweep.sql`): converted five remaining `get_current_household_id()` gates to `is_member_of` — `household_members_select`, `waste_events_all`, `catalog_items_select`, `catalog_items_insert`, `household_invites invites_insert`. Used SECURITY DEFINER `is_member_of` (not inline subquery) on `household_members_select` to avoid RLS recursion.
- Applied 007 to dev; verified end-to-end: badge writes with no 403 in non-default household; co-member "DT" now correctly visible; custom item created in My Household, absent in London, persisted across switch — proving `catalog_items` select/insert follow membership.
- Committed 007 to dev, pushed to `origin/dev` (`c277021`). Built `bundle_003_007_prod.sql`; caught and fixed transaction-integrity bug (migration 005's inner `begin;`/`commit;` stripped from bundle only — source 005 untouched).
- Applied corrected bundle to PROD (`parpauldmbetptkmdwbd`) atomically. Verified: `is_member_of`, `create_household`, `get_my_households` present; `household_members_select` reads `is_member_of(household_id)`.
**Unfinished:**
- `dev`→`main` merge NOT done — 19 commits on dev ahead of main; multi-household frontend undeployed. DB deliberately ahead of code (harmless direction; existing single-household users unaffected).
- Unpushed `771effe` on local `main` (docs-only, 2026-06-16 SHOP swipe redesign) — push before merge session.
- Prod behavioral regression not yet tapped (confirm single-household add/remove still works on live prod with new policies).
- `bundle_003_007_prod.sql` untracked on dev — decide: commit as audit record or discard.
- Owner-gate not built; Lemons 409 not started; delete-household not started; `[ActiveHousehold TEST]` log still at `App.js:207`; dev test households clutter.
- Contributor INSERT/UPDATE policies still use inline joins; UPDATE lacks `WITH CHECK` (cleanup only — they work now that `household_members_select` is fixed).
**Next session:**
SESSION START
Goal: Ship multi-household to prod users — push `771effe`, merge `dev`→`main`, deploy via Vercel, run full behavioral test on deployed prod.
State: DB spine 003–007 live + verified on PROD. All multi-household frontend on `dev`, unmerged to `main`. Prod runs old single-household frontend over the new (correct, more-permissive) policies. `771effe` docs commit unpushed on local main.
Done when: `771effe` pushed; `dev`→`main` merged + pushed; Vercel prod deploy live; hard-refreshed prod passes multi-household test (switch to non-default household, add item, no 403); regression confirmed for single-household path. **Decision required up front:** go live now vs. after owner-gate, given invites/rename are member-gated with no owner enforcement yet.
**Files updated:** `migrations/007_finish_authorize_sweep.sql` (new, committed `c277021`, pushed `origin/dev`); `migrations/bundle_003_007_prod.sql` (new, untracked). No app source changed this session.
**DB changes:** **PROD** (`parpauldmbetptkmdwbd`) — migrations 003–007 applied atomically (first multi-household DB migrations on prod). Created `is_member_of`, `create_household`, `get_my_households`; converted `list_items` (write/update/delete), `households` (select/update), `household_members` (select), `waste_events`, `catalog_items` (select/insert), `household_invites` (insert) policies to `is_member_of`. **DEV** — migration 007 applied (same five-policy sweep).

### 2026-06-17 — Cross — Household switcher built end-to-end (re-scope → unified sheet → create/rename), authorized by membership
**Goal:** Build the multi-household switcher — re-scope `useProvisions` so the list follows the active household, then layer the unified manage-household sheet on top — and authorize it server-side.
**Completed:**
- Lifted `ActiveHouseholdProvider` above the `useProvisions` call (split `ShoppingListApp` into a thin provider wrapper + inner `ProvisionsApp`) so the hook can consume `useActiveHousehold()` — structural prerequisite for the switcher (commit `edcd683`).
- Re-scoped `useProvisions` via a two-effect split: Effect 1 (session setup + client creation, keyed on identity) and Effect 2 (household-scoped loads + polls, keyed on `activeHouseholdId + bootstrapped`). List now follows `ActiveHouseholdContext`; bootstrap's `household_id` is a fallback only. GoTrueClient-stacking guard; teardown clears polls + resets per-household state (commit `acecef5`). PROVEN: switching `activeHouseholdId` loads the chosen household's list.
- Built the unified "manage household" sheet: household switcher (active marked, tap to switch in-place), create-new-household flow (name → `create_household` RPC → `switchHousehold` → land on empty list → toast), active-household member list with rename + invite. Toast primitive added (`toastMessage` state + 2500ms auto-dismiss). Title bar tappability + sub-line decoupled from member count (always available when signed in).
- Fixed intermittent load hang: Effect 2 was gated on `bootstrappedRef` (a ref) that can't re-trigger the effect once bootstrap finishes — on some mounts the household load never fired, leaving the app stuck on "LOADING YOUR PROVISIONS" with zero Supabase requests. Re-gated on a `bootstrapped` STATE flag added to Effect 2's deps; closed the race (commit `e5b816e`).
- Fixed stale switcher list: `createHousehold`/`renameHousehold` changed the DB but didn't refresh `myHouseholds` — new/renamed households only appeared after reload. Added `refreshHouseholds()` to `ActiveHouseholdContext`; called after create + rename (commit `e5b816e`).
- Applied migration 005 (households SELECT/UPDATE → `is_member_of`; `with check` on UPDATE the original lacked; invite-preview branch preserved verbatim; fixes 406 "cannot coerce to single JSON object" on Effect 2 household fetch) and migration 006 (`create_household` SECURITY DEFINER RPC — atomic household + owner-membership insert, returns `{household_id, household_name}`) to dev; both smoke-tested (commits `0804d4b`, `18551c0`).
**Unfinished:**
- Contributor 403: `list_item_contributors` upsert rejected by RLS on a fresh load — `auth.jwt()->>'sub'` membership gate may be `auth.uid()` mismatch or membership-join gap on this table. Non-blocking; diagnose next session.
- Lemons 409: revive-after-soft-delete collides with `list_items` unique constraint `(household_id, catalog_item_id)` — not a partial index, so soft-deleted rows still hold the key. Fix candidates: partial index `WHERE deleted_at IS NULL` or a revive-via-upsert RPC.
- No-leak WRITE check not fully demonstrated end-to-end (blocked by above). Read isolation IS proven; write isolation is RLS-guaranteed (003/004) but not demo'd via add-to-one-verify-missing-from-other.
- Temp `[ActiveHousehold TEST]` console log still in `App.js` — strip next session.
- Rename is currently allowed for any member (migration 005 gates `households` UPDATE on membership, not ownership) — tighten to owner-only next session.
- Migrations 003–006 are DEV ONLY — must ship to prod together as one authorization + create bundle.
- Test households clutter dev (BVI, Bristol, "Lake House Test", Smoke/Test* leftovers) — clean up next session.
**Next session:**
SESSION START
Goal: Multi-household hardening — fix the contributor 403 + Lemons 409, finish the RLS sweep, then design + build delete-household; ship the dev migration bundle to prod.
State: Switcher works end-to-end on dev (switch/create/rename/invite, no hang, list follows active household). Authorization spine 003+004+005+006 live on dev only. Known bugs logged above. Owner-vs-member DB enforcement does not yet exist.
Done when: contributor 403 fixed (badges write under multi-household); Lemons 409 fixed (revive-after-soft-delete works); remaining `get_current_household_id()` write gates + `auth.uid()` mismatches converted to `is_member_of` / `auth.jwt()->>'sub'`; delete-household designed (soft vs hard + cascade scope) and built (owner-gated RLS DELETE policy + `delete_household` RPC + guards: can't delete last/active household + UI); rename tightened to owner-only; temp `[ActiveHouseholdTEST]` log removed; test households cleaned up; 003–006 (plus hardening fixes) applied to prod.
**Files updated:** `src/App.js` (provider split, `ProvisionsApp` inner, unified sheet, toast, `refreshHouseholds` wiring), `src/hooks/useProvisions.js` (two-effect split, `bootstrapped` state gate, `createHousehold`/`renameHousehold`), `src/contexts/ActiveHouseholdContext.js` (`refreshHouseholds` added + exposed). Commits: `edcd683`, `acecef5`, `0804d4b`, `18551c0`, `e5b816e`.
**DB changes (DEV ONLY — prod pending):** Migration 005 (households SELECT/UPDATE → `is_member_of`; `with check` on UPDATE; invite-preview preserved). Migration 006 (`create_household` SECURITY DEFINER RPC). Both smoke-tested on dev.

### 2026-06-17 — Cross — Active-context standard set, authorization spine built & proven (003 + 004)
**Goal:** Decide where "which household is active" resolves (and make it the Harbour standard), then build and prove the server-side authorization spine — before any switcher UI.
**Completed:**
- Set the **active-context standard** (Harbour-wide): active context is client-authoritative (held in `ActiveHouseholdContext` + localStorage, passed into writes); the server authorizes membership, never picks a household. Chosen over a server-global `users.active_household_id` because that forces cross-device lockstep (explicit non-goal) and prevents desired per-app divergence.
- Settled the **layered default rule**: device-last (localStorage) → fresh device falls back to home household (deterministic, replaces 002 stopgap) → future confident-GPS one-tap confirm ("You're in Day, NY — shopping for NewLeaf?"), never a silent switch. Location gets a voice, never a vote.
- Built & PROVEN migration **003 `is_member_of(p_household_id)`** — shared SECURITY DEFINER authorization primitive (boolean; resolves Clerk `sub`; `search_path` pinned; fails closed on null). Applied to dev; verified with `pg_get_functiondef` + JWT smoke test returning true/true/false/false for two-household test user.
- Built & PROVEN migration **004** — converted `list_items` write/update/delete policies from `= get_current_household_id()` to `is_member_of(household_id)`; added `with check` on UPDATE the original lacked. Applied to dev; item write committed and round-tripped (Apples, SHOP badge ticked) under new policy.
- Committed both migrations to repo (003 = `412f951`; 004 = `a1a9730`). Local only, not pushed, per convention.
**Unfinished:**
- **KEY DISCOVERY — the switcher's real work:** `useProvisions` and `ActiveHouseholdContext` are disconnected. `useProvisions` resolves its household via `bootstrap_new_user` and keys everything off `householdRef.current`; it does NOT read `activeHouseholdId` from the context. A switcher built today would update context and change nothing visible. The real work is re-scoping `useProvisions` to treat `activeHouseholdId` as its single household source, re-run load sequences, and tear down/re-subscribe realtime on switch.
- Honest recalibration: the Apples write proved `004` lets a write SUCCEED under `is_member_of`, but because the write path uses `householdRef` (not the context), we did NOT cleanly prove "wrote to the chosen household." SQL-layer proof of 003/004 stands; app-layer "write to a chosen household" awaits the re-scope.
- No-leak check (item added to one household staying out of the other) not yet confirmed. Verify once switching is easy.
- 003 + 004 are dev-only — must ride to prod together (helper + policies as one bundle).
- Temp `[ActiveHousehold TEST]` log still in `App.js:207` — strip before switcher ships.
- No switcher UI built (title-bar sub-line, sheet, create flow still unbuilt; mockups approved earlier).
- Six other `= get_current_household_id()` write gates remain (waste_events, catalog_items insert, households update/select, household_invites insert, household_members select) — same latent bug, dormant, flagged as future migration 005.
**Next session:**
SESSION START
Goal: Build the household switcher — beginning with the `useProvisions` re-scope so the LIST follows the active household, then the title-bar sub-line + switcher sheet on top.
State: Authorization spine (003 + 004) built and proven on dev. `ActiveHouseholdContext` resolves + persists active household and is wired into `App.js` (display-only today). Blocker: `useProvisions`/context disconnect documented above — re-scope is step one, visible switcher UI is step two. Strict don't-stack: do the re-scope as its own tested change before layering the sheet.
Done when: `useProvisions` reads `activeHouseholdId` from `ActiveHouseholdContext` as its single household source; on switch it re-runs catalog/list/cycle loads and tears down + re-subscribes realtime to the new household; household modal and list agree on the active household; THEN title-bar sub-line (reveals at 2+) + switcher sheet + create flow per approved mockups. Temp debug log removed. 003 + 004 applied to prod.
**Files updated:** `migrations/003_is_member_of.sql` (new, committed `412f951`), `migrations/004_list_items_authorize.sql` (new, committed `a1a9730`). No app source changed this session.
**DB changes (DEV ONLY — prod pending):** Created `is_member_of(uuid)`; replaced `list_items_write` / `list_items_update` / `list_items_delete` policies to authorize via `is_member_of`.

### 2026-06-17 — OurProvisions — Build & prove the multi-household data spine
**Goal:** Stand up the multi-household spine (households query + active-household state) and prove it works end-to-end through real Clerk auth before building any switcher UI.
**Completed:**
- Built `ActiveHouseholdContext` (context + localStorage persistence, `switchHousehold`, `hasMultiple`); mounted `ActiveHouseholdProvider` in `App.js` via a null-rendering `HouseholdDebugLog` helper so it sits inside Clerk auth and above consumers.
- Diagnosed the keystone RLS trap: `household_members` SELECT policy is `(household_id = get_current_household_id())`, scoped to the ACTIVE household — so a user cannot enumerate their other memberships via normal RLS. Authored `get_my_households()` SECURITY DEFINER RPC (migration 001) to return ALL of a user's households, resolving identity internally from the JWT.
- Verified on dev: built a two-household test user (Dan Holmes in "My Household" + new "Lake House"), confirmed the RPC logic returns two rows in SQL, then confirmed the live app logs `Array(2)` households through a real Clerk token. Spine proven end-to-end.
- Found & diagnosed a three-way "which household is active?" ordering bug exposed by multi-household (see ARCHITECTURE). Shipped migration 002 as a labeled TEMPORARY stopgap (align `bootstrap_new_user` to `joined_at DESC`) so the app stops crashing; applied to dev. App now loads clean with a two-household user.
- Established `repo migrations/` as the single source of truth (baseline 000 + 001 + 002); Google Drive copies are stale/pre-baseline and are NOT authoritative.
**Unfinished:**
- Temp verification log still in `App.js` (`[ActiveHousehold TEST]`) — remove next session.
- Migrations 001 and 002 applied to DEV ONLY — prod still needs them before multi-household ships.
- Bootstrap stopgap (002) is a holdover, not the real fix.
- No switcher UI yet: title-bar sub-line, switcher sheet, create flow all still unbuilt (mockups approved last session).
- Minor: `bootstrap_new_user` step 1 has dead `if v_user_id is null` logic (insert never sets it via RETURNING). Harmless; cleanup later.
**Next session:**
SESSION START
Goal: Replace the bootstrap stopgap with the real fix — make bootstrap/RLS read the ACTIVE household from `ActiveHouseholdContext` rather than each picking one by heuristic — then build the switcher UI.
State: Spine built, wired, and proven on dev: `get_my_households()` returns all households through real Clerk JWT; context resolves + persists active household; provider mounted. App runs clean on dev with a two-household test user. Migrations 001 + 002 live on DEV ONLY. Three-way ordering bug documented (see ARCHITECTURE) — currently masked by the stopgap.
Done when: Bootstrap loads the context's active household (one source of truth), superseding the 002 stopgap. Temp console log removed. 001 + 002 (or replacement) applied to prod. Then: title-bar switch sub-line (reveals at 2+ households), switcher sheet, create-household flow built per approved mockups.
**Files updated:** `src/contexts/ActiveHouseholdContext.js` (new), `src/App.js` (provider mount + temp log), `migrations/001_get_my_households.sql` (new), `migrations/002_bootstrap_ordering_stopgap.sql` (new)
**DB changes (DEV ONLY — prod pending):** `get_my_households()` created; `bootstrap_new_user` altered to `ORDER BY joined_at DESC`. Test data: "Lake House" household + Dan Holmes membership added on dev.

### 2026-06-16 — OurProvisions — Multi-household design + store-awareness discovery
**Goal:** Design the multi-household switching experience (the last structural feature before AI) and scope store awareness.
**Completed:**
- Designed multi-household model: schema already supports it (`household_members` is a junction table); the work is app-layer, not DB.
- Settled title-bar UX: wordmark stays; a new tappable household-name sub-line appears ONLY at 2+ households and opens the switcher. One household = no switcher, zero new chrome.
- Approved two mockups: switcher bottom sheet (lists households + "Create new household") and the create flow (name → insert → add creator as owner → auto-switch → land on empty list).
- Settled roles: two only. Creator = owner (rename/remove-member/delete-household); everyone shares all list actions. Succession passes to oldest member if owner leaves. No co-owners.
- Adopted reusable toast pattern (app-level slot + showToast, ~2.5s auto-dismiss, new replaces current) — first toast in the app; fires on household create.
- Read migration 005 and discovered the store-awareness foundation is already fully designed (`known_stores`, `provision_cycles`, `shopping_sessions`, `match_known_store` RPC, silent GPS auto-detect = Scenario D). Likely written but NOT yet applied to prod.
**Unfinished:**
- No Claude Code prompts written yet (design-only session).
- Re-scoping risk in `useProvisions` (realtime re-subscribe on household switch) NOT yet inspected — needs a fresh read of `useProvisions.js` + App.js state block.
- Whether migration 005 is actually live on prod is UNCONFIRMED. Column inventory suggests `list_items` has `session_id`/`checked_lat`/`checked_lng` but NOT `cycle_id` — strong signal 005 was never run.
- Default active-household rule proposed (last-selected from localStorage, fallback oldest membership) but not yet blessed/implemented.
- Whether any existing RLS policy keys off `role` — needs a live check before the create flow writes 'owner'.
**Next session:**
SESSION START
Goal: Begin multi-household implementation, starting with the data spine and the re-scoping hook (NOT the toast — that's the warm-up).
State: Multi-household fully designed; two mockups approved (switcher sheet, create flow). Roles decided (owner/member in DB, capability-based UI, succession by seniority). Toast pattern agreed. Store awareness deferred to its OWN arc after multi-household ships.
Done when: `useProvisions.js` + App.js state block read fresh and re-scope-on-switch plan (realtime teardown/re-subscribe) is written; first Claude Code prompt ready (candidate order: toast primitive → myHouseholds query + active-household context → switch sub-line → switcher sheet → create flow); default-active-household rule confirmed; `role` RLS dependency checked.
**Files updated:** None (design only; mockups produced as artifacts, not repo files).
**DB changes:** None this session. Pending verification: is migration 005 live on prod?

### 2026-06-16 — Velayo OS — Retire v1 Scribe; rebuild project template as dual-mode
**Goal:** Kill the last of the v1 Google-Drive Session Scribe across the OurProvisions instructions and the parent project template, aligning both with the v2 handoff flow.
**Completed:**
- Rewrote the OurProvisions project instructions whole: replaced the v1 Drive-writing Scribe with the v2 SESSION END (chat produces `design_handoff.md`, Claude Code merges), carrying the canonical `### [YYYY-MM-DD] — [SCOPE] — [GOAL]` header.
- Confirmed scope tagging was already shipped (06-11, commit `8396b8e`): `[SCOPE]` = OurProvisions / Velayo OS / Platform / Cross lives in CLAUDE.md and is the merge-time authority — no chat-side duplication needed.
- Corrected the model line to Opus 4.8 at Medium effort (had wrongly reverted to Sonnet 4.6 from the old model-strategy note).
- Rebuilt `VELAYO_PROJECT_TEMPLATE.md` (Velayo OS project) as dual-mode with a MODE switch: DESIGN (no repo — chat is scribe, paste entries in) vs HANDOFF (repo + Claude Code — chat feeds `design_handoff.md`, Code merges). New apps default to DESIGN, flip to HANDOFF at first coding session.
- Reframed the template's "Project Knowledge" section: repo `docs/` is canonical in HANDOFF mode; Project Knowledge is a convenience mirror, not source of truth. Dropped the retired "re-upload these files" step.
- Generalized the template's `[SCOPE]` to `[APP NAME]` so new apps (OurChef, OurGarden) don't inherit OurProvisions' scope vocabulary; added `**DB changes:**` and the canonical header to the seed format.
**Unfinished:**
- Velayo OS project's OWN instructions may still carry v1 Scribe language (the second of the two surfaces flagged in the 06-11 Harbour entry) — Dan to verify and apply the same v2 replacement.
**Next session:**
SESSION START
Goal: Confirm Velayo OS project instructions are on v2; then resume OurProvisions — merge dev → main and begin the email receipt parser.
State: OurProvisions instructions + parent template both on v2 handoff flow. Template is dual-mode. Scope tagging canonical in CLAUDE.md. v1 Scribe debt from 06-11 now closed except the Velayo OS instruction field.
Done when: Velayo OS project instructions verified on v2 (no Drive-writing language); OR OurProvisions dev→main merged green and receipt parser specced.
**Files updated:** OurProvisions project instructions (chat-side, not repo); `VELAYO_PROJECT_TEMPLATE.md` (Velayo OS project + Drive backup)
**DB changes:** None

### 2026-06-16 — OurProvisions — SHOP swipe redesign + toggleChecked id fix + dev grant restoration
**Goal:** Fix the "not in catalog" error hit while shopping and resolve the design question it exposed — SHOP swipe was wrongly a catalog action (Hide) when it should act on the list only.
**Completed:**
- Diagnosed "not in catalog" toast as a name-key failure in `toggleChecked`: rolled-forward items missed the name-keyed catalog lookup. Rewired to resolve by `catalog_item_id` carried on `listRows` → `shoppingList` item → all tap handlers.
- Shipped SHOP swipe redesign: swipe in SHOP now calls `removeFromList` (list-layer soft-delete), not `hideItem` (catalog-layer). Own item removes instantly; shared item opens an ownership-aware confirm modal naming the adder. Cancel springs the row back because `listRows` is never mutated on Cancel. BROWSE swipe unchanged (still Hides).
- Added `catalogItemId` to `shoppingList` useMemo items; plumbed through all 4 `toggleChecked` call sites and both SHOP `SwipeToRemove` handlers.
- Replaced `toggleChecked(itemName)` signature with `(itemName, catalogItemId)` — resolves stable id from caller first, falls back to name-keyed catalog map only if no id arrives.
- Added `removeFromList` to `useProvisions`: soft-deletes one `list_item` by `catalog_item_id`, optimistic `listRows` filter with rollback on RPC failure. Added to hook return object.
- Added `handleSwipeRemove` + `removeConfirmItem` state to `App.js`; inserted confirm modal for shared-item removes.
- Closed the dev "permission denied for table households" bug open since Jun 13: root cause was missing `authenticated`/`anon` grants (not the `auth.uid()` RLS bug assumed). Wrote `007_dev_restore_role_grants.sql` (dev-only) to restore grants matching prod. Verified 28-row grant count matches prod.
- Cold-tested on dev with two members (Dan + Dan Test): rolled-item toggle, own-item instant remove, shared-item confirm + Cancel spring-back + Remove, BROWSE hide regression — all passed.
**Unfinished:**
- `dev → main` merge not yet done — all tests green, immediate next action.
- "Fabric Softemer" orphaned list row (no `catalog_item_id`, free-typed) — needs rename/cleanup on prod.
- Open decision: block roll-forward of items with no `catalog_item_id` to prevent new orphans?
- "Reset Public Schema Permissions" query still in dev + prod SQL editors — the loaded gun that caused tonight's detour. Rename or delete.
- CLAUDE.md lacks an explicit "commit + push after edits" rule — stranded a commit early in the session, causing a Vercel-stale-build false alarm.
**Next session:**
SESSION START
Goal: Merge dev → main, confirm prod green, then begin the email receipt parser (first AI feature).
State: SHOP swipe redesign + toggleChecked fix live and fully tested on dev. Dev role grants restored to match prod. Prod healthy throughout.
Done when: `main` deployed green on Vercel, prod smoke-tested (load + tap, no destructive actions on the live household), and the receipt parser is specced or the orphan-row cleanup is shipped.
**Files updated:** `src/App.js`, `src/hooks/useProvisions.js`, `migrations/007_dev_restore_role_grants.sql` (new), `docs/SPEC_shop_swipe_remove.md` (new)
**DB changes:** DEV SANDBOX ONLY (`zxwtxjjmssykhqrghouf`) — restored `GRANT`s on all public tables/sequences/functions to `authenticated`, `anon`, `service_role` + matching `ALTER DEFAULT PRIVILEGES`. Mirrors prod. No prod DB changes. No schema changes.

### 2026-06-13 — Cross — Multi-machine dev environment + Surface stand-up
**Goal:** Make OurProvisions development reproducible on any machine (NH, NY, lake Surface, lake desktop, boat) so a new machine rebuilds a working env from clone + one secret file + npm install — and stand up the lake Surface as the first proof.
**Completed:**
- Established principle: the machine is disposable, the repo is the source of truth. Any machine rebuilds from `git clone` + `.env.local` + `npm install`.
- Pinned Node to major 24 (matches Vercel's default build runtime): added `.nvmrc` (`24`) + `engines: { node: "24.x" }` in `package.json`.
- Added `.npmrc` with `legacy-peer-deps=true` to pre-empt React 19 / `react-scripts` 5.0.1 peer-dep conflict on fresh installs.
- Wrote `docs/DEV_SETUP.md` — fresh-machine recipe, multi-machine commit/pull discipline, boat/offline notes, per-machine checklist.
- Diagnosed Vercel env-scope misconfig: Preview correctly points at dev DB, but Development scope still carries prod Supabase vars — `vercel env pull` silently returns prod. Documented as debt; warned in `DEV_SETUP.md`.
- Chose interim secrets route: copied `.env.local` (anon/publishable keys only) to personal Google Drive (My Drive, unshared); documented Bitwarden as planned replacement.
- Committed + pushed to `dev` (`1409a5c`): `.nvmrc`, `.npmrc`, `package.json`, `docs/DEV_SETUP.md`, `.gitignore`.
- **Stood up lake Surface end-to-end:** removed accidental nested clone (`src/ourprovisions`); fetched + checked out `dev` (Surface was frozen at March initial commit); dropped `.env.local`; `npm install` clean; `npm start` compiled; Clerk sign-in succeeded.
- **Isolated a dev-DB permission issue (→ OurProvisions project):** localhost AND `dev.ourprovisions.velayo.ai` both throw "permission denied for table households"; prod works fine. Dev-DB RLS/bootstrap problem, not a Surface/code issue.
**Unfinished:**
- Dev Supabase `households` returns "permission denied" for authenticated user — prod works (handed off to OurProvisions project).
- Vercel Development-scope Supabase vars still point at prod — repoint or remove.
- Preview missing `REACT_APP_CLERK_PUBLISHABLE_KEY` (only Production has it).
- Google Drive `.env.local` copy is a stopgap — replace with Bitwarden, then delete Drive copy.
- Lake desktop not yet stood up (will follow `DEV_SETUP.md`; Surface proved the recipe).
- Stale-clone remote on Surface: `github.com/dan-velayo/ourprovisions` vs canonical `Velayo-ai/ourprovisions` — reconcile remotes across machines.
**Next session:**
SESSION START
Goal: [Velayo OS] Reconcile Vercel env scopes + stand up lake desktop. (Separately, in OurProvisions: fix dev-DB households permission error.)
State: Multi-machine setup committed to `dev` (`1409a5c`); Node pinned to 24 across machines + Vercel; lake Surface fully stood up and synced. Vercel Development scope still returns prod. Dev DB throws households permission-denied (prod fine) — owned by OurProvisions project.
Done when: Vercel Development-scope Supabase vars repointed to dev and a test `vercel env pull` returns the dev URL; AND/OR lake desktop completes the DEV_SETUP recipe end-to-end.
**Files updated:** `.nvmrc`, `.npmrc`, `package.json`, `docs/DEV_SETUP.md`, `.gitignore` (committed `1409a5c`)
**DB changes:** None

### 2026-06-12 — OurProvisions — Canonical schema baseline + migrations/ folder
**Goal:** Close the schema drift between repo migration files and prod by producing one validated canonical baseline, and give schema files a real home in the repo.
**Completed:**
- Pulled six prod introspection dumps; diagnosed 14 live objects (13 tables + `category_avg_prices` view) vs. the 10 the docs claimed — 4 undocumented live tables: `household_invites`, `known_stores`, `provision_cycles`, `shopping_sessions`.
- Wrote `000_canonical_baseline.sql` — single file rebuilding prod from empty: 14 objects, 17 canonical functions (3 dead `bootstrap_new_user` overloads dropped), 35 RLS policies, all constraints/indexes, clean 38-item seed.
- Validated against a freshly wiped dev sandbox; deep diff caught one defect (`list_items` unique constraint auto-named vs. prod's explicit `list_items_household_catalog_unique`) — fixed in the file.
- Created `migrations/` + `migrations/archive/` in repo; placed baseline + 6 historical files; committed on `dev` (`e43ce59`).
**Unfinished:**
- Dev carries the pre-fix baseline (auto-named constraint) — harmless, self-corrects on next dev rebuild from the committed file.
- `category_avg_prices` view body is a reconstruction, not a verbatim dump — run `SELECT pg_get_viewdef('category_avg_prices'::regclass, true);` on prod to verify if exactness is wanted.
- Constraints layer verified by inference, not row-by-row diff (Supabase export truncates at ~100 rows).
**Next session:**
SESSION START
Goal: Fix the two known-debt items sitting on the clean baseline.
State: Canonical baseline committed (`migrations/000_canonical_baseline.sql`, dev `e43ce59`). Six historical files in `migrations/archive/`. Prod untouched throughout.
Done when: (1) RLS policies using `auth.uid()` on `known_stores`/`shopping_sessions`/`velayo_crews`/`velayo_crew_members` rewritten to `auth.jwt()->>'sub'` and tested in dev as a separate named migration; (2) duplicate helper pairs consolidated as a separate named migration. Neither fix touches `000_canonical_baseline.sql`.
**Files updated:** `migrations/000_canonical_baseline.sql`, `migrations/README.md`, `migrations/archive/` (6 historical files)
**DB changes:** None to prod. Dev sandbox wiped and rebuilt from baseline as validation test.

### 2026-06-12 — OurProvisions — Dev DB sandbox + catalog propagation + Browse tab UI overhaul
**Goal:** Stand up isolated dev database, fix cross-client catalog propagation, and overhaul the Browse tab UI.
**Completed:**
- Set up isolated dev Supabase project (`zxwtxjjmssykhqrghouf`); repointed Vercel Preview to dev; reconciled four prod/file schema drifts into `003_apply.sql`, `007_functions.sql`, `008_policies.sql`; configured Clerk Third-Party Auth on dev project.
- Fixed catalog propagation: guarded-merge `refreshCatalog` (respects `hiddenIdsRef`/`deletedIdsRef`, commits only on real field-level diff); added `refreshCatalogRef` for stable closure access; wired 20s `catalogPollInterval` alongside the 2s list poll.
- Replaced direct `list_items`/`catalog_items` writes with SECURITY DEFINER RPCs (`insert_custom_catalog_item`, `insert_list_item`); switched list read to `get_list_items_for_household` RPC (inline name/category/is_staple); removed `pendingWrites` guard that was blocking cross-user poll visibility.
- Built Browse tab UI: real-time search bar, wrapping category chip filters, two-layer `displayCategories` (staples cross-cut → chips narrow), no-match row with category picker and inline new-category creation.
- Removed `CUSTOM_CAT = "⭐ My Custom Items"` constant entirely from App.js and useProvisions.js; all fallbacks replaced with `"Household"`.
- Fixed pre-existing build failures (duplicate declarations, merge conflict markers, unused `realtimeSub`); stabilized splash screen timer (empty deps array + `useCallback`).
- Merged `dev` → `main` (fast-forward), pushed both; production green at `9a3008d` — Hide/Delete/propagation features live.
**Unfinished:**
- Prod schema diverges from migration files on four axes (undocumented tables/columns, 15+ RPCs, RLS rewrite) — prod works, files are not canonical; clean rewrite not yet done.
- Background-tab sync lags (~60s) due to browser `setInterval` throttling on unfocused tabs — accepted as non-issue for foreground use.
**Next session:**
SESSION START
Goal: Regenerate a clean, canonical migration set from prod's actual live state.
State: Catalog propagation shipped to prod. Dev sandbox isolated and functional. Migration files `001`–`006` are behind prod; `003_apply`/`007_functions`/`008_policies` exist as dev-only patches.
Done when: A migration set that reproduces prod's real schema (tables, columns, RPCs, RLS) from scratch exists in repo, validated by a clean dev rebuild.
**Files updated:** `src/hooks/useProvisions.js`, `src/App.js`
**DB changes:** Dev only — `003_apply.sql`, `007_functions.sql`, `008_policies.sql` applied; RLS disabled on `provision_cycles`/`shopping_sessions`/`known_stores`; soft-deleted duplicate `household_members` row. Prod: code-only deploy.

### 2026-06-11 — Velayo OS — Build & ship The Harbour + harden the SESSION END pipeline
**Goal:** Stand up a company "intranet" — refined into a private, push-to-deploy founder operating dashboard ("The Harbour") gated to crew only — then resolve the resulting logging-pipeline conflict.
**Completed:**
- Designed The Harbour: a four-lane balance instrument (Business Foundation / Product / Marketing / Sales & Support), not a link launchpad. Cold-signal hierarchy: neglect detector loudest, then priority, owner, tools.
- Added a leverage gauge — 1 human : tasks run by agents, goal 1:20, summed from per-lane agent counts. Separated the "intelligence layer" (C-suite Claude projects = advice) from the ratio (keeps the number honest and un-inflatable).
- Built + shipped: new repo `Velayo-ai/velayo-os` (private), Git-wired to Cloudflare (push-to-deploy), custom domain `harbour.velayo.ai` (HTTPS), gated with Cloudflare Access (OTP, "Crew only" policy). Verified end-to-end in incognito.
- Decided repo architecture: OS stays its own repo, separate from `velayo-platform` and app repos. Cockpit ≠ engine.
- Resolved the SESSION END conflict: retired v1 chat-Scribe (Drive-writing) in favor of v2 (chat emits handoff → Claude Code merges canonical docs). One record, chat is a feeder.
- Added scope tagging to CLAUDE.md SESSION END routine ([SCOPE] = OurProvisions / Velayo OS / Platform / Cross) so the single rolling log stays one narrative now but splits cleanly later.
**Unfinished:**
- Harbour placeholders: C-suite seat URLs, tool chips (Banking, Cap table, Social, Brand deck), and lane content (priorities, agent counts, "moved Xd ago" dates) are all illustrative — need a real first pass.
- v1 chat-Scribe language still lives in this project's instructions + `VELAYO_PROJECT_TEMPLATE.md` — needs the v2 "produce a handoff" replacement.
- Company-log-in-app-repo is a conscious interim choice; split into `velayo-os/docs` at the trigger (app #2's first session).
**Next session:**
SESSION START
Goal: Wire The Harbour's live data + retire v1 Scribe language.
State: Harbour live + gated at harbour.velayo.ai, push-to-deploy via velayo-os. CLAUDE.md scope-tagging committed. Placeholders throughout the dashboard.
Done when: C-suite seats open the right Claude projects; tool chips resolve; lane data reflects reality; pushed live; project instructions + template updated to v2 handoff-producer language.
**Files updated:** `velayo-os/index.html`, `velayo-os/velayo_os_flight_checklist.html`, `CLAUDE.md` (scope tagging)
**DB changes:** None

### 2026-06-11 — OurProvisions — Add [SCOPE] tag to session log infrastructure
**Goal:** Add a [SCOPE] field to CLAUDE.md so the single rolling session log can distinguish OurProvisions / Velayo OS / Platform / Cross work and support a future per-repo split.
**Completed:**
- Added `[SCOPE]` slot to `SESSION LOG ENTRY FORMAT` header (`### [YYYY-MM-DD] — [SCOPE] — [GOAL]`)
- Appended scope-tagging paragraph to Step 1 of SESSION END routine (defines four values; explains why a filter beats a migration)
- Added scope discipline bullet to Rules (directs against filing OS/Platform work as OurProvisions history; flags future velayo-os log)
- Committed all three surgical edits (`8396b8e`, `dev`)
**Unfinished:** None
**Next session:**
SESSION START
Goal: Stand up dev DB sandbox, THEN fix catalog propagation.
State: Delete verb (client side) done; `delete_custom_catalog_item` RPC not yet deployed; catalog propagation cross-client broken (catalog loaded once at boot, not on poll); ESLint exhaustive-deps warning present; dev NOT merged to main.
Done when: dev DB isolated (Supabase branch + Vercel env repointed); custom catalog adds + catalog-only deletes propagate cross-client within a poll cycle; lint clean; dev merged to main.
**Files updated:** `CLAUDE.md`
**DB changes:** None

### June 11, 2026 — Delete verb (client side) + pre-merge cleanup
**Goal:** Implement client-side Delete for custom catalog items; strip debug artifacts before dev→main merge.
**Completed:**
- Rewired `deleteItem` in `useProvisions.js` to call `delete_custom_catalog_item` RPC (hard-delete + reference cascade server-side); added `is_global` guard refusing deletion of seed items; optimistic UI removal with `prevCatalogRef` snapshot rollback on error
- Removed dead `pendingWrites` ref (orphaned by prior debug-log removal)
- Added Delete button to Edit Item modal footer — custom items only, `window.confirm` gate, left-slot placement, taupe-red text style
- Fixed `isCustom` discriminator in `openEditModal`: `created_by != null` → `is_global === false` (canonical discriminator, reliably present in all catalog read paths)
- Added `deletedIdsRef` poll guard in `loadListItems`: prevents 2-second poll from transiently re-adding a just-deleted item during the RPC round-trip; wired into `deleteItem` (mark before RPC, unmark on rollback)
- Stripped 6 debug `console.log` statements from `useProvisions.js`
**Unfinished:**
- Catalog propagation across clients is broken (DIAGNOSED, not fixed): custom items created on one client don't appear on others until hard-reload. Root cause: the 2s poll refreshes LIST state only; the catalog_items read runs once at boot, never on the interval. Confirmed live (proptest1 created on DT never reached DH).
- ESLint exhaustive-deps warning on the boot effect — still present, blocks main merge.
- dev NOT merged to main (gated on the two items above).
- Note: dev preview + Supabase SQL Editor both currently run against PRODUCTION (main); no isolated dev DB branch exists. This session's test deletes hit prod (throwaway items only).
**Next session (SESSION START):**
Goal: Stand up a dev DB sandbox, THEN fix catalog propagation against it.
Order: (1) Create Supabase `dev` branch + repoint Vercel preview env vars to it — stop testing against prod. (2) Fix catalog propagation (separate slower catalog poll + harden refreshCatalog into a guarded merge; it currently does a full setCatalogMap replace and ignores deletedIdsRef). (3) Resolve ESLint exhaustive-deps warning. (4) Merge dev → main.
Done when: dev DB isolated; custom catalog adds + catalog-only deletes propagate cross-client within a poll cycle; lint clean; dev merged to main.
**Files updated:** `src/hooks/useProvisions.js`, `src/App.js`
**DB changes:** `delete_custom_catalog_item` SECURITY DEFINER RPC deployed and tested

### June 10, 2026 — Repo housekeeping & handoff bridge
**Goal:** Clean up repo structure and wire the design→implementation handoff path.
**Completed:**
- Moved `src/docs/` → `docs/` and `src/handoff/` → `handoff/` (repo root); updated all path references in CLAUDE.md and the docs themselves
- Tracked `tools/` (velayo OS flight checklist)
- Added `handoff/.gitignore` (`*` / `!.gitignore`) so transient `design_handoff.md` files are never accidentally committed
- Added `.gitattributes` to normalize all text files to LF; renormalized existing files
- Removed `src/App_legacy.js` backup (unused)
**Unfinished:** None
**Next session:** —
**Knowledge updated:** CLAUDE.md (all `src/docs/` → `docs/` refs, Step 5 git-add path), ARCHITECTURE.md, ROADMAP.md, SESSION_LOG.md

### June 9, 2026 — Implement Hide verb + fix poll/boot races
**Goal:** Wire up per-user Hide (per SPEC_hide_delete) and eliminate the two root causes of hidden items reappearing.
**Completed:**
- Added `hideItem` function to `useProvisions.js` — inserts into `user_hidden_items`, optimistic local removal of item from `catalogMap`/`catalogRef`/`quantities`, rollback on error; exported from hook return object
- Repointed all three `SwipeToRemove` `onRemove` handlers in `App.js` from `deleteItem` to `hideItem`
- Renamed "Remove" → "Hide" in SwipeToRemove action row and swipe-reveal; recolored from red (`#e05c5c`) to warm taupe (`#8A7968`); Staple button non-staple state stays slate (`#6B7E8F`)
- Updated Add Item restore-hidden copy: "select to reset" → "tap below to unhide"; "restored" → "items unhidden"; button now shows count-aware "Unhide N hidden {category} item(s)"
- Fixed poll re-adding hidden items: added `hiddenIdsRef.current.has()` guard in `loadListItems` in both the `catalogRef.current` forEach and the `setCatalogMap` forEach — hidden items are now skipped on every 2-second poll tick
- Removed `await refreshCatalog()` from `hideItem` try block (optimistic removal + poll guard is sufficient; the full re-fetch caused flicker)
- Fixed boot effect stacked-poll race: added `getTokenRef` to hold the latest Clerk `getToken` without re-triggering the effect; removed `getToken` from the `useEffect` dependency array — effect now only fires on `userId`/`clerkId`/`email`/`fullName` changes
- Added 3 temporary debug `console.log` lines to diagnose any remaining catalog repopulation path

**Unfinished:**
- Debug logs still present (remove after confirming hide is stable cross-user)
- Delete verb not yet implemented (custom items, household-wide, cascades to list)
- Cold cross-user test of Hide still needed

**Next session:**
SESSION START
Goal: Confirm hide is stable across two users; remove debug logs; begin Delete verb.
State: Hide is wired. Boot race fixed. Poll guard in place. 3 debug logs in `useProvisions.js` (loadListItems, hideItem, refreshCatalog).
Done when: Hide survives 2-second poll on both clients with no reappearance; debug logs removed; Delete verb spec'd or started.

**Files updated:** `src/hooks/useProvisions.js`, `src/App.js`
**DB changes:** None (user_hidden_items table pre-existing)

### June 8, 2026 — Fix multi-user list sync (OurProvisions)
**Completed:**
- Rendered SHOP list from raw RPC rows (`listRows`) instead of `catalogMap`, so synced items (e.g. Bakery) appear on every client regardless of local catalog state
- Removed per-user `hiddenIdsRef` filter from the `listRows` loop — catalog hides must not suppress shared active list items
- Removed now-unused `addedByMap` from App.js destructuring; build passes clean
- Added `docs/` to repo: SESSION_LOG, ROADMAP, SPEC_hide_delete

**Unfinished:**
- SPEC_hide_delete implementation (hide/delete rework per spec)

**Next session:**
- Implement SPEC_hide_delete: per-user hide via `user_hidden_items`, hard-delete for custom items, restore flow

**Knowledge updated:**
- `listRows` is now the source of truth for the SHOP list; `catalogMap` is catalog-browse only

### June 2026 — Velayo OS Foundation
**Completed:** 
- Built complete Claude OS framework (project structure, hygiene rules, session templates)
- Clarified model strategy: Sonnet as default, Opus for hard problems
- Mapped first agent: Session Scribe
- Created all four Velayo OS base documents (VELAYO_BRIEF, CLAUDE_OS, ROADMAP, SESSION_LOG)

**Unfinished:** 
- OurProvisions Project Knowledge audit
- Session Scribe v1 build

**Next session:** 
- Build Session Scribe v1 as a prompt-based tool in Velayo OS project
- Audit OurProvisions Project Knowledge

**Knowledge updated:** 
- All four base documents created fresh tonight
