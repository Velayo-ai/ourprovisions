# OurProvisions — Architecture
*Last updated: 2026-07-09 (deliberate-loss guard pattern — `deliberateLossRef`, watchdog defers to user-initiated household loss; removal-notice name from pre-update list; Splunk RUM session replay unmasked + rendering, masking-key + blank-player gotchas; banked "Your data is yours" profile principle + verified Clerk email pre-fill constraint from Beta 1 launch-funnel design)*

---

## Overview

OurProvisions is a collaborative household grocery and provisioning app. It is App 1 inside the Velayo Harbor — a shared identity layer for families across multiple apps. The design bar is high: farmers-market warmth, not superstore utility. Jony Ive is the benchmark.

**Live at:** `ourprovisions.velayo.ai`
**Dev at:** `dev.ourprovisions.velayo.ai`
**Local:** `localhost:3000`

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React (Create React App) | Web; React Native via Expo queued for iOS |
| Auth | Clerk | Google login; shared Velayo identity across all apps |
| Database (prod) | Supabase (PostgreSQL) | Project ID: `parpauldmbetptkmdwbd`, US East |
| Database (dev) | Supabase (PostgreSQL) | Project ID: `zxwtxjjmssykhqrghouf`; Vercel Preview env vars point here; `.env.local` also points here (gitignored — CRA precedence over `.env`) |
| Hosting | Vercel | Auto-deploys from `main` branch |
| DNS | Cloudflare | DNS only, not proxied |
| AI | Anthropic Claude API | Receipt scanning, smart suggestions, pantry vision |

---

## Repository & Git Workflow

- **Org:** `Velayo-ai` on GitHub (canonical remote — stale clones may show `dan-velayo/ourprovisions`)
- **Dev branch:** `dev` — all active work committed here first
- **Production branch:** `main` — merge dev → main; Vercel auto-deploys
- **Local path:** `C:\Users\mr_dh\ourprovisions`

---

## Development Environment

Fresh-machine bootstrap is documented in `docs/DEV_SETUP.md`. The principle: **the machine is disposable, the repo is the source of truth.** Any machine rebuilds from `git clone` + `.env.local` + `npm install`.

| Item | Value / Notes |
|---|---|
| Node version | Pinned to **major 24** via `.nvmrc` + `package.json engines: "24.x"`. Matches Vercel's default build runtime (Vercel guarantees major, auto-rolls minor/patch). |
| npm config | `.npmrc` committed with `legacy-peer-deps=true` — required for clean installs given `react-scripts` 5.0.1 + React 19 ERESOLVE. Keeps every machine and Vercel consistent. |
| Secrets | `.env.local` (anon/publishable Supabase + Clerk keys, gitignored). Interim: copied to Google Drive (My Drive, unshared). Planned: Bitwarden. `vercel env pull` is **NOT** safe yet — see env-scope debt below. |
| Vercel env scopes | Production → prod DB (correct). Preview → dev DB (correct, `dev`-branch deploys). **Development → prod DB (debt** — carries 79-day-old prod vars). `vercel env pull` reads Development, so it silently returns prod until repointed. Preview also missing `REACT_APP_CLERK_PUBLISHABLE_KEY`. |

---

## Core Files

| File | Role |
|---|---|
| `src/App.js` | Main React component — all UI, tabs, modals, list rendering |
| `src/hooks/useProvisions.js` | All data logic — Supabase queries, state, real-time subscriptions |
| `src/lib/classifyFetchError.js` | Pure classifier: returns `'transient'` or `'real'` for any caught error. No imports. |
| `src/contexts/ActiveHouseholdContext.js` | Multi-household spine. Holds `myHouseholds`, `activeHouseholdId`, `switchHousehold`, `refreshHouseholds`. Runs 30s `checkPresence` interval (Layer-2 removal detection). Exports `resolveAfterHouseholdLoss(lostId, notifyRemoval, lostName)` — the single switch-or-provision path guarded by `provisioningRef`; shared by `checkPresence` and `handleDeleteHousehold` so there is one provisioning code path with one in-flight guard. `notifyRemoval=false` for the deleting owner (suppress the removal notice), `true` for external removal via `checkPresence`; optional `lostName` names the departed household in the notice (falls back to the sticky `activeHouseholdNameRef`). Also exports `beginDeliberateLoss`/`endDeliberateLoss` — the deliberate-loss guard (see Key Patterns): the delete/leave handlers raise `deliberateLossRef` *before* their RPC and clear it in `finally`, and `checkPresence` bails while it (or `resolvingRef`) is set, so the watchdog poll cannot double-fire a removal the deliberate path is already handling. |
| `src/contexts/ConnectivityContext.js` | State machine exposing `connState` + `reportTransientFailure` / `reportSuccess`. Provider + `useConnectivity` hook. |
| `src/components/ConnectivityPill.js` | Bottom-center status pill; renders nothing when `connState === 'online'`. |
| `src/supabaseClient.js` | Supabase client initialization with Clerk JWT auth |
| `public/index.html` | Shell — Open Graph tags, Clerk script, favicon |
| `CLAUDE.md` (repo root) | Claude Code standing context + Session Scribe routine |
| `docs/SESSION_LOG.md` | Rolling session history (newest on top); maintained by the Scribe |
| `docs/ROADMAP.md` | Now/Next/Later/Done + Decisions log |
| `docs/SPEC_hide_delete.md` | Implementation spec for the Hide/Delete build |

### Auth Pattern
Clerk is configured as a Third-Party Auth provider in Supabase via JWKS endpoint. JWT uses RS256 (not HS256). Legacy anon key format required. All Supabase calls include explicit `apikey` + `Authorization` headers. `SECURITY DEFINER` functions required for RLS helpers that call `auth.jwt()`. `bootstrap_new_user` RPC handles new user onboarding atomically — canonical signature is 4-arg `(p_clerk_id, p_email, p_invite_code, p_full_name)`; prod has additional overloads (ambiguity risk).

**Known RLS gap:** `provision_cycles`, `shopping_sessions`, `known_stores` have RLS disabled in prod. Anon key can cross-household read/write these tables. Low stakes now; address during migration rewrite (NEXT #6).

---

## Brand

| Token | Value |
|---|---|
| Abyss (dark bg) | `#020F1A` |
| Teal Reef (primary) | `#0D9488` |
| Sky Water (accent) | `#0EA5E9` |
| Title font | Playfair Display, unified italic |
| Tagline | *Live Better. Live Smarter.* |

---

## Database Schema

### Migration Files

**Source of truth: `migrations/000_canonical_baseline.sql`** — single file that rebuilds prod from empty. Validated against a clean dev rebuild on 2026-06-12. Never run against production — prod is already in this state; it's for rebuilding empty environments only.

Historical files (superseded, in `migrations/archive/`):

| File | Original Purpose |
|---|---|
| `001_initial_schema.sql` | Full Phase 1 schema — all core tables |
| `002_harbor_crew.sql` | `velayo_crews`, `velayo_crew_members`, `crew_id` on households |
| `003_live_schema_audit_june2026.sql` | Delta audit — documented column drift, views, undocumented tables |
| `004_list_item_contributors.sql` | Contributor badges table |
| `005_provision_cycles_sessions_stores.sql` | `provision_cycles`, `shopping_sessions`, `known_stores`; `cycle_id`/`rolled_from_item_id` on `list_items`; RPCs — **UNCONFIRMED if applied to prod** (column inventory Jun 16 suggests `cycle_id` absent from `list_items`) |
| `006` | *(contents not captured in docs)* |

**Post-baseline migrations:**

| File | Contents | Status |
|---|---|---|
| `migrations/001_get_my_households.sql` | `get_my_households()` SECURITY DEFINER RPC — enumerates all of a user's households bypassing the single-household SELECT policy. | Dev (≈06-12) → **Prod (2026-06-25)** *(was absent from prod despite docs claiming 2026-06-18 — applied manually 2026-06-25 after smoke-test surfaced the gap)* |
| `migrations/002_bootstrap_ordering_stopgap.sql` | Align `bootstrap_new_user` to `joined_at DESC` — TEMPORARY stopgap; real fix is `useProvisions` re-scope. | Dev only |
| `migrations/003_is_member_of.sql` | `is_member_of(household_id)` SECURITY DEFINER boolean authorization primitive. No new dependencies. | Dev + Prod (2026-06-18) |
| `migrations/004_list_items_authorize.sql` | Rewrite `list_items` write/update/delete RLS to `is_member_of`; add `with check` to UPDATE. Depends on 003. | Dev + Prod (2026-06-18) |
| `migrations/005_households_authorize_by_membership.sql` | Rewrite `households` SELECT/UPDATE RLS to `is_member_of(id)`; add `with check` on UPDATE; preserve invite-preview subquery on SELECT verbatim. Depends on 003. Fixes 406 on Effect 2 household fetch. | Dev + Prod (2026-06-18) |
| `migrations/006_create_household.sql` | `create_household(p_name, p_clerk_id)` SECURITY DEFINER RPC — atomically creates household + adds caller as owner-member, returns `{household_id, household_name}`. | Dev + Prod (2026-06-18) |
| `migrations/007_finish_authorize_sweep.sql` | Converts last five `get_current_household_id()` gates to `is_member_of`: `household_members_select`, `waste_events_all`, `catalog_items_select`, `catalog_items_insert`, `household_invites invites_insert`. Uses SECURITY DEFINER `is_member_of` on `household_members_select` to avoid RLS recursion. Fixes contributor 403. | Dev + Prod (2026-06-18) |
| `migrations/008_insert_list_item_upsert.sql` | Converts `insert_list_item` from plain INSERT to INSERT ... ON CONFLICT (household_id, catalog_item_id) DO UPDATE. Merge semantics: quantity = last-write-wins (EXCLUDED), status forced to 'pending', deleted_at = NULL (resurrects tombstoned slots), cycle_id and price_per_unit preserved via COALESCE, updated_at bumped. Fixes concurrent-add 409 and Lemons 409 simultaneously. Signature, language (sql), SECURITY DEFINER, and search_path unchanged. | Dev + Prod (2026-06-20) |
| `migrations/009_remove_list_item.sql` | `remove_list_item(p_household_id, p_catalog_item_id)` — atomically soft-deletes a `list_items` row AND clears its `list_item_contributors` rows in one transaction (both-or-neither). Fixes badge-resurrection bug: migration 008 upsert revived the tombstoned row with stale contributors on re-add. Client `updateQty` qty≤0 path swapped from `.update({deleted_at})` to this RPC. SECURITY DEFINER. | Dev + Prod (2026-06-22) |
| `migrations/010_remove_member_leave_household.sql` | `remove_member(p_household_id, p_user_id)` returns `{removed, user_id}` — any member may soft-delete any non-owner membership row (guard reads target row's `role` inline). `leave_household(p_household_id)` returns `{left}` — self-exit; owner cannot leave (must delete household). Both SECURITY DEFINER. | Dev + Prod (2026-06-22) |
| `migrations/011_join_household.sql` | `join_household(p_household_id)` returns `{joined, revived, user_id}` — atomic revive-or-insert: ON CONFLICT (household_id, user_id) DO UPDATE SET deleted_at = NULL, role = 'member'. Fixes leave-then-rejoin UNIQUE constraint collision. Always lands as `role = 'member'` (no silent role re-elevation). Used by `acceptInvite` (manual code entry join path). | Dev + Prod (2026-06-22) |
| `migrations/012_bootstrap_revive_fix.sql` | Fixes the URL-invite join path in `bootstrap_new_user` (4-arg signature). Step 2 now uses the same revive-or-insert upsert pattern as migration 011 instead of ON CONFLICT DO NOTHING. Closes the second instance of the leave-then-rejoin bug. Prod still carries three dead overloads — future cleanup. | Dev + Prod (2026-06-22) |
| `migrations/013_delete_household.sql` | Two schema additions: `provision_cycles.deleted_at` (enables soft-delete in the household cascade) and `list_item_contributors.deleted_at` (soft-delete for recoverability, D1). Plus `delete_household(p_household_id uuid) → jsonb` SECURITY DEFINER RPC — owner-only cascade stamping `deleted_at = now()` across all household-bearing tables in FK order; `user_hidden_items` hard-deleted (disposable per-user view state); returns `{deleted, member_count, household_id}`. Applied to dev 2026-06-26 by hand; applied to prod 2026-06-28, verified via `pg_proc.prosrc` (body_len 2550, cascade markers present). | Dev + Prod (2026-06-28) |
| `migrations/014_fix_authuid_rls.sql` | Rewrites 8 RLS policies on `known_stores`, `shopping_sessions`, `velayo_crew_members`, `velayo_crews` that compared `auth.uid()` (Clerk text `sub`) against uuid columns — always false. Household-membership checks → `is_member_of(household_id)`; ownership (`sessions_insert_own`/`sessions_update_own`) → `get_current_user_id()` (owner-is-you); crew policies → `get_current_user_id()` (crew-keyed). RLS enabled/disabled state UNCHANGED. Idempotent drop-and-recreate. Verified: `auth.uid()` check = 0 rows, A5 presence ok on all 8. | Dev + Prod (2026-06-29) |
| `migrations/015_consolidate_helpers.sql` | Drops the two `proconfig=NULL` helper variants (`get_household_id_for_current_user`, `get_user_id_from_clerk`); survivors `get_current_household_id` / `get_current_user_id` pin `search_path` and are deterministic. Zero callers verified both envs before drop. Verified: exactly 2 survivors remain. | Dev + Prod (2026-06-29) |
| `migrations/016_household_staples.sql` | New `household_staples(household_id, catalog_item_id)` join table (per-household staple prefs, row-presence model); RLS select/insert/delete on `is_member_of`; `catalog_item_id` `ON DELETE CASCADE` (scoped carve-out); backfill of existing custom `is_staple=true` rows (verified dev 1=1, prod 5=5); repoints `get_list_items_for_household` to derive `is_staple` via EXISTS. `catalog_items.is_staple` left dormant. **Non-idempotent policies (single-apply.)** Verified via `prosrc`. | Dev + Prod (2026-07-07) |

> **No Supabase migration tracker exists on this project** — `supabase_migrations.schema_migrations` does not exist on prod. Migrations are applied by hand in the SQL editor, never via CLI. Filing numbers are a folder convention, not load-bearing. Record applied state by querying the live catalog (`pg_proc`, `pg_policies`), not by trusting the folder or any doc. Write all migrations idempotent (`drop ... if exists` / drop-and-recreate). *(On disk the high-water mark is now `015`; the `009`–`012` gap and the `007` collision — `docs/007_dev_restore_role_grants.sql` vs `migrations/007_finish_authorize_sweep.sql` — still stand; see ROADMAP reconciliation item.)*

---

### Live Tables (public schema)

#### `users`
Maps Clerk user IDs to internal UUIDs. Created via `bootstrap_new_user` RPC on first login.
- `id`, `clerk_id`, `email`, `full_name`, `created_at`, `deleted_at`

#### `households`
One per family group. Schema already supports multiple households per user (`household_members` is a junction table). Multi-household switching is in active development.
- `id`, `name`, `created_by` (**NOT NULL** — must supply on insert), `crew_id` (→ velayo_crews), `created_at`, `deleted_at`
- **Create constraint:** `created_by` is NOT NULL, so inserting a new household + its first `household_members` row must be atomic. A client-side two-step write can half-complete. Use a SECURITY DEFINER `create_household` RPC for the create-household flow.

#### `household_members`
Join table. Realtime enabled.
- `id`, `household_id`, `user_id`, `role` (owner/member), `joined_at`, `deleted_at`
- **Role model:** `owner` = creator (the un-removable anchor); any member can rename household, remove any non-owner member (incl. self = leave). Owner cannot be removed by anyone and cannot leave — must delete the household to exit. All list actions are shared. No succession in phase 1 — owner exit is delete-only. No co-owners.
- **Membership authorization rule:** "You may soft-delete any membership row in a household you belong to, as long as that row's `role` is not `'owner'`." Leave = the self case; owner-protection falls out for free. No separate is_owner_of helper needed — guard reads the TARGET row's role inline.
- **Soft-delete + revive invariant:** Leaving sets `deleted_at = now()`. Re-join MUST revive (ON CONFLICT DO UPDATE SET deleted_at = null, role = 'member'), never plain INSERT — the leftover soft-deleted row collides with UNIQUE(household_id, user_id). Migration 011 covers the manual invite path; migration 012 covers the URL-invite `bootstrap_new_user` path. BOTH paths must be maintained independently.
- **Re-scoping risk (multi-household):** `useProvisions` + realtime subscriptions must tear down and re-subscribe to the new `household_id` on switch, or stale realtime updates leak from the old household. Inspect before coding the switcher.
- **Timestamp column naming (grep note):** join time **is** recorded — the column is named **`joined_at`**, NOT `created_at`. A grep for `created_at` on this table will come up empty; that is a naming choice, not a missing column. (Corrects a 2026-07-01 handoff that inferred join time wasn't recorded.)
- **Ordering:** `joined_at` is the timestamp column (not `created_at`). `get_current_household_id()` orders `DESC` (newest); `get_my_households()` orders `ASC` (oldest = context default); `bootstrap_new_user` step 3 now orders `DESC` (migration 002 stopgap). See three-way ordering bug in Known Debt.
- **Former fragility (resolved Jun 17):** `.from("households").eq("id", ...).single()` in bootstrap's return path threw if the households RLS blocked the read → 0 rows. Fixed by (a) migration 005 converting `households` SELECT to `is_member_of(id)` (authorizes any membership, not just the active-heuristic one), and (b) the `useProvisions` two-effect re-scope (Effect 2 fetches the household by the context's `activeHouseholdId`, bypassing bootstrap's return value for the household query).

#### `catalog_items`
The item library. Items are either **global/seed** (system-owned) or **household custom** (household-owned). The `is_global` boolean is the ownership discriminator and drives the Hide/Delete verb model:
- `is_global = true` → seed item. System-owned (only Velayo creates/edits/deletes, via code or future admin UI). `household_id` and `created_by` are NULL. Members can **Hide** (per-user) but never delete.
- `is_global = false` → custom item. Household-owned. `household_id` + `created_by` set. Any member can add or **Delete** (household-wide); members can also Hide it from their own view.
- `id`, `name`, `category`, `unit`, `is_global`, `created_by`, `household_id`
- `external_id` (future retailer SKU), `price_hint` (fallback price), `is_staple` (**DORMANT** — see below)
- `created_at`, `deleted_at`
- **✅ RESOLVED 2026-07-07 — staple state moved to `household_staples` (migration 016, live dev+prod).** The old `is_staple` boolean was a single value on the shared `is_global=true` row (`household_id=NULL`), so it could not hold a *per-household* preference — and the `catalog_items` UPDATE policy admits only rows whose `household_id` is in the caller's memberships (`NULL in (...)` is never true → 0 rows updated, no error → silent write failure on global items, reverted by the 20s poll). Staple state is now **row-presence in `household_staples`** (see that table below), the single source of truth for global AND custom items. `catalog_items.is_staple` is now **dormant** — no read/write path uses it; kept in place for clean rollback, drop in a later cleanup migration. Prod-leak check (`is_global=true and is_staple=true`) returned 0 rows before the migration — no cross-household leak had occurred.
- **Seed set: 50 distinct items.** (Cleaned June 8 — collapsed 3 fragmented "Bakery" categories into canonical `Bakery`, re-homed 5 misfiled items, removed 10 unreferenced duplicate seed rows. 10 both-referenced duplicate seed items remain — Flour, Sugar, Bananas, Broccoli, Carrots, Garlic, Lemons, Potatoes, Spinach, Tomatoes — pending the merge logic that ships with/after Delete.)

#### `household_staples` *(migration 016, live dev+prod 2026-07-07)*
Per-household staple preferences. **Row-presence = stapled** — the single source of truth for staple state, for BOTH global and custom catalog items (replaces the dormant `catalog_items.is_staple` boolean).
- `id` uuid PK, `household_id` uuid NOT NULL → `households(id)` `ON DELETE CASCADE`, `catalog_item_id` uuid NOT NULL → `catalog_items(id)` `ON DELETE CASCADE`, `created_at`.
- `UNIQUE (household_id, catalog_item_id)` — one staple row per (household, item); insert = staple, delete = unstaple; no UPDATE path.
- **RLS:** `select` / `insert` / `delete` all gated on `is_member_of(household_id)`. No UPDATE policy (row-presence model).
- **FK carve-out (deliberate):** `catalog_item_id` is `ON DELETE CASCADE`, a **scoped exception** to the "all FKs referencing `catalog_items` are `NO ACTION`" invariant below. Staples are disposable preference rows, not history — they *should* vanish when a custom item is deleted, and CASCADE kept migration 016 self-contained (no `CREATE OR REPLACE` surgery on the multi-step delete RPCs). **Do not "correct" this back to `NO ACTION`** — that would strand orphan staple rows or block custom-item deletion.
- Reads: client stamps `is_staple` from a per-household staple set (`fetchStapleSet` in `useProvisions` — used by `loadForHousehold` + `refreshCatalog`); the SHOP list RPC derives it via EXISTS (see `get_list_items_for_household`). Write: `toggleStaple` inserts/deletes a row (handles `23505` unique-violation as success).

#### `list_items`
The living household list. Items are never hard deleted — they move through statuses. Realtime enabled.
- `id`, `household_id`, `catalog_item_id`, `quantity`, `price_per_unit`, `status` (pending/bought/skipped/deferred)
- `added_by`, `checked_by`
- `cycle_id` (→ `provision_cycles`), `rolled_from_item_id` (→ `list_items`, self-ref for carry-forward)
- Phase 2 forward refs: `session_id`, `checked_sequence`, `checked_lat`, `checked_lng`
- Phase 4: `deferred_reason`
- `created_at`, `updated_at`, `deleted_at`
- **Unique constraint:** `(household_id, catalog_item_id)` — prod names this `list_items_household_catalog_unique`; dev uses the Postgres auto-generated name `list_items_household_id_catalog_item_id_key` (constraint-name drift, see Known Debt). `close_cycle` and migration 008 use the column-target form to remain environment-agnostic.
- **RLS write policies (migration 004, Dev + Prod 2026-06-18):** `list_items_write` (insert), `list_items_update` (using + with check), `list_items_delete` (using) gate on `is_member_of(household_id)` instead of `= get_current_household_id()`. SELECT policy unchanged (already returns all households the caller belongs to).

#### `waste_events`
Every thrown-away unconsumed item. Most important AI training data in the app.
- `id`, `household_id`, `catalog_item_id`, `quantity`, `reason`, `wasted_at`

#### `list_item_contributors` *(added June 1, 2026)*
One row per person who contributed to a given list item. Powers contributor badges `[D][H][E]`.
- `id`, `list_item_id`, `user_id`, `quantity_added`, `added_at`, `deleted_at` *(added migration 013 — soft-delete for recoverability per D1; previously hard-deleted by remove_list_item RPC)*
- Unique constraint: `(list_item_id, user_id)`
- RLS: household-scoped. Realtime enabled.

#### `velayo_crews` / `velayo_crew_members`
Harbor-level identity layer. Links households across the Velayo app family.
- Added by `002_harbor_crew.sql`
- **RLS on, but `auth.uid()` bug** — policies compare Clerk string ID against a uuid column and never match. Inert while no live feature reads these tables. Fix queued (NEXT #1).

#### `household_invites`
Invite-by-code flow. Never had a migration file before `000_canonical_baseline.sql` — reconstructed from prod introspection.
- `id`, `household_id`, `code` (6-char), `created_by`, `expires_at` (7-day TTL), `accepted_at`, `accepted_by`, `created_at`

#### `provision_cycles`
Planning cycles. One open cycle per household at a time. **RLS: DISABLED in prod** (reachable only via SECURITY DEFINER RPCs).
- `id`, `household_id`, `started_at`, `closed_at`, `item_count`, `sessions_count`, `seeded_from`, `cycle_type`, `label`, `deleted_at` *(added migration 013 — enables soft-delete in the household cascade)*

#### `shopping_sessions`
One person / one store / one trip, linked to a cycle and a known_store. GPS fields for store matching. `total_spent` + `receipt_scanned` hook into the Phase 3 receipt parser. **RLS: DISABLED in prod.**
- `id`, `household_id`, `cycle_id`, `store_id` (→ known_stores), `started_at`, `closed_at`, `gps_lat`, `gps_lng`, `total_spent`, `receipt_scanned`
- **Status: UNCONFIRMED if live on prod** — see known_stores caveat above.

#### `known_stores`
GPS-clustered store locations. Self-teaching store map — visit_count increments on each trip; confirmed_by_receipt flips on first receipt scan. `chain` key enables cross-location price comparison (all "Hannaford" stores share price history). **RLS: DISABLED in prod.**
- `id`, `household_id`, `name`, `lat`, `lng` (centroid), `radius_m` (geofence, default 150m), `visit_count`, `chain`, `confirmed_by_receipt`, `created_at`
- **Status: UNCONFIRMED if live on prod** — column inventory suggests migration 005 may not have been applied (see Queued Migrations). Verify before the store-awareness arc.

#### `user_hidden_items`
Per-user catalog suppressions. `clerk_id` + `catalog_item_id`. No soft delete — delete the row to restore (unhide).
- **Browse-layer only (corrected June 8):** hides affect ONLY the per-user catalog/browse view, NEVER the shared list. A hidden item still appears on the shared list if a household member added it. (Prior bug: the hide filter leaked into `loadListItems` and suppressed shared list rows — removed June 8.)

---

### Foreign Key Constraints — ALL `NO ACTION` (verified June 8)

Every FK referencing `catalog_items` (and the list/contributor chain) is `delete_rule = NO ACTION`:
- `list_items.catalog_item_id`, `list_items.household_id`, `list_items.added_by`, `list_items.checked_by`, `list_items.cycle_id`, `list_items.rolled_from_item_id`
- `waste_events.catalog_item_id`
- `user_hidden_items.catalog_item_id`
- `list_item_contributors.list_item_id`, `list_item_contributors.user_id`

**Design implication:** Postgres will *block* deletion of any referenced row (no cascade, no set-null). This protects against silently orphaning list data — but means the **Delete feature cannot be a simple `delete`**. Deleting a custom catalog item requires a multi-step SECURITY DEFINER RPC that handles references first (or soft-deletes the row via `deleted_at`, keeping FKs valid and history intact). See `SPEC_hide_delete.md`.

**Scoped exception (2026-07-07):** `household_staples.catalog_item_id` is `ON DELETE CASCADE`, NOT `NO ACTION`. Deliberate — staples are disposable *preference* rows, not history, so they should vanish with a deleted custom item rather than blocking its deletion. This is the only intentional deviation from the rule; every other `catalog_items` FK remains `NO ACTION`. Do not "normalize" it back.

---

### Canonical Functions (17)

All are `SECURITY DEFINER`. Where auth-scoped, they use `auth.jwt()->>'sub'` — **never `auth.uid()`**, which returns the Clerk string ID rather than an internal UUID. The event trigger is listed last.

| Function | Purpose |
|---|---|
| `bootstrap_new_user(p_clerk_id, p_email, p_invite_code, p_full_name)` | Atomic onboarding. **4-arg is canonical** — prod had 4 overloads; 3 dead ones dropped in baseline. Invite branch (step 2) **now uses revive-or-insert upsert (migration 012)** — ON CONFLICT (household_id, user_id) DO UPDATE SET deleted_at = NULL, role = 'member'. Fixes leave-then-rejoin for the URL-invite path. **Invite-first early-return (confirmed Jun 25):** when a valid, unexpired, unaccepted invite code is provided, step 2 joins the user as `member`, marks the invite accepted, and returns **before** the "create My Household" block — invite-first users are single-household by construction and have no personal My Household. An expired or already-accepted code falls through to My Household creation. This is the structural basis for why only-household removal (Layer 2, point 4) fires exclusively for invite-first users in production. Prod still carries 3 dead overloads — known cruft, future cleanup. |
| `get_current_household_id()` | Returns calling user's household UUID. Used by RLS policies to avoid self-referential recursion. |
| `get_current_user_id()` | Returns calling user's internal UUID from Clerk sub. |
| `get_household_id_for_current_user()` | Near-duplicate of `get_current_household_id` — **KNOWN DEBT: consolidate.** |
| `get_user_id_from_clerk()` | Near-duplicate of `get_current_user_id` — **KNOWN DEBT: consolidate.** |
| `get_household_user_ids()` | Returns array of user UUIDs in the calling user's household. |
| `get_household_member_profiles()` | Returns member profiles for the calling user's household. |
| `get_list_items_for_household()` | Primary list read — returns rows with name/category/is_staple inline. Bypasses stale `auth.uid()` RLS. **Migration 016 (2026-07-07):** `is_staple` now derived per-household via `exists (select 1 from household_staples hs where hs.household_id = p_household_id and hs.catalog_item_id = ci.id)` — replaced the read of the shared `catalog_items.is_staple` boolean. Signature unchanged (stable client contract). Verified via `prosrc` on dev + prod. |
| `get_catalog_names_by_ids(p_ids uuid[])` | Batch catalog name lookup by ID array. |
| `insert_custom_catalog_item(...)` | Inserts a household-owned catalog item. |
| `insert_list_item(...)` | Inserts a `list_items` row. **Now an upsert (migration 008):** ON CONFLICT (household_id, catalog_item_id) DO UPDATE — quantity last-write-wins, status='pending', deleted_at cleared (resurrects tombstoned slots), cycle_id and price_per_unit COALESCE-preserved. Signature, language (sql), SECURITY DEFINER, search_path unchanged. |
| `delete_custom_catalog_item(p_catalog_item_id)` | Hard-deletes a custom catalog item + cascades to referencing rows. |
| `get_active_cycle(p_household_id)` | Returns the current open provision cycle. |
| `close_cycle(p_household_id)` | Archives a cycle — upserts items forward (targets `list_items_household_catalog_unique`), clears badges. Live version supersedes the 005 file. |
| `archive_trip_items(...)` | Archives trip items at session close. |
| `match_known_store(p_lat, p_lng, p_household_id)` | Bounding-box pre-filter + Haversine nearest-store lookup (no PostGIS). Returns closest store within `radius_m`; app enforces the radius. This IS the "auto-select via GPS" behavior from Scenario D. |
| `get_my_households()` *(migration 001)* | Returns `(household_id, name, role)` for ALL of the caller's active, non-deleted memberships, `joined_at ASC`. SECURITY DEFINER — bypasses the `household_members` SELECT policy. Identity resolved via `get_current_user_id()` internally; takes no user-id parameter. Dev (≈06-12) → **Prod (2026-06-25)** *(was absent from prod — applied after smoke-test gap discovery)*. |
| `is_member_of(p_household_id uuid) returns boolean` *(migration 003)* | Shared authorization primitive. SECURITY DEFINER, STABLE, `search_path` pinned. Resolves `auth.jwt()->>'sub'` → `users.clerk_id`; returns whether the caller is a non-deleted member of the passed household. Null arg → false (fail closed). Used in all post-003 RLS policies. Dev + Prod (2026-06-18). |
| `create_household(p_name, p_clerk_id)` *(migration 006)* | Atomically creates a new household and adds the caller as owner-member. Returns `{household_id, household_name}`. SECURITY DEFINER — required because a client two-step INSERT (household, then membership) can half-complete; `households.created_by` is NOT NULL (mirrors bootstrap_new_user). Dev + Prod (2026-06-18). |
| `create_household_from_template(p_name, p_clerk_id, p_source_household_id default null)` *(migration TBD — authored, not yet applied)* | Wraps `create_household` (006) and then clones the source household's custom catalog into the new household. Returns `{household_id, household_name, items_cloned}`. SECURITY DEFINER, `search_path = public`. **SECURITY-CRITICAL:** calls `is_member_of(p_source_household_id)` before cloning — prevents exfiltrating another household's catalog by passing an arbitrary id. Clones `catalog_items` where `household_id = source AND is_global = false AND deleted_at IS NULL`, deduped against global seed by `lower(name)`. New rows get fresh id, new `household_id`, `is_global = false`, `created_by = caller`; carries `name, category, unit, price_hint, is_staple`. When `p_source_household_id IS NULL`, behaves identically to `create_household` — `items_cloned = 0` ("Standard provisions" path). **Not yet applied to dev or prod.** See `docs/SPEC_create_household_from_template.md`. |
| `remove_list_item(p_household_id, p_catalog_item_id)` *(migration 009)* | Atomic soft-delete: sets `list_items.deleted_at` AND deletes all `list_item_contributors` rows for that item in one transaction. Fixes badge-resurrection (tombstoned row + stale contributors revived by 008 upsert on re-add). SECURITY DEFINER. Dev + Prod (2026-06-22). |
| `remove_member(p_household_id, p_user_id)` *(migration 010)* | Soft-deletes a membership row. Any member may remove any non-owner (guard reads target row's `role` inline). Returns `{removed, user_id}`. SECURITY DEFINER. Dev + Prod (2026-06-22). |
| `leave_household(p_household_id)` *(migration 010)* | Self-exit. Owner cannot leave (must delete household). Returns `{left}`. SECURITY DEFINER. Dev + Prod (2026-06-22). |
| `join_household(p_household_id)` *(migration 011)* | Revive-or-insert upsert: ON CONFLICT (household_id, user_id) DO UPDATE SET deleted_at = NULL, role = 'member'. Fixes leave-then-rejoin UNIQUE collision. Always lands as `role = 'member'`. Returns `{joined, revived, user_id}`. SECURITY DEFINER. Dev + Prod (2026-06-22). |
| `delete_household(p_household_id uuid)` *(migration 013)* | Owner-only soft-delete cascade. Resolves caller via `auth.jwt()->>'sub'` → `users.clerk_id`; guards `created_by = caller AND deleted_at IS NULL` (owner-only + idempotency / double-tap safety). Captures `member_count` BEFORE cascade. Cascade in FK order: list_item_contributors → waste_events → shopping_sessions → list_items → provision_cycles → catalog_items → known_stores → household_invites → household_members → households. `user_hidden_items` hard-deleted (disposable view state; subquery still resolves against soft-deleted catalog_items). Returns `{deleted, member_count, household_id}`. Dev + Prod (2026-06-28). Verified via `pg_proc.prosrc` body_len 2550; smoke-tested on prod (DH owner delete + DT member notice + auto-provision; orphan count 0 across five tables). Confirmed full household_id-bearing table set (derived live, 2026-06-26): catalog_items, household_invites, household_members, known_stores, list_items, provision_cycles, shopping_sessions, waste_events; plus transitive list_item_contributors (via list_items) and user_hidden_items (via catalog_items). |
| `rls_auto_enable` *(event trigger)* | Auto-enables RLS on any newly created public table. **Every new table comes up locked by default.** Include policies in the same migration or the table will be inaccessible. |

---

### Known Debt

Reproduced as-is in `000_canonical_baseline.sql`. Fixes go in separate, named, tested migrations — never edit back into `000`.

- **`auth.uid()` RLS bug** on `known_stores`, `shopping_sessions`, `velayo_crews`, `velayo_crew_members` — `auth.uid()` returns the Clerk string ID, not an internal UUID; comparison against uuid columns always fails. Inert today: the first three have RLS disabled; crew tables have RLS on but no live feature reads them. Fix: rewrite to `(auth.jwt()->>'sub')::uuid` (NEXT #1).
- **RLS disabled** on `provision_cycles`, `known_stores`, `shopping_sessions` — anon key can cross-household read/write. Acceptable now; must fix before any live feature depends on row isolation (NEXT #1 + #6).
- **Duplicate helper pairs** — `get_household_id_for_current_user` / `get_current_household_id` and `get_user_id_from_clerk` / `get_current_user_id` do near-identical work. Consolidate (NEXT #2).
- **`category_avg_prices` view body** — baseline is a reconstruction, not a verbatim prod dump. Run `SELECT pg_get_viewdef('category_avg_prices'::regclass, true);` on prod to verify exactness if needed.
- **Three-way ordering bug (core debt, currently masked by migration 002 stopgap):** Three places independently answer "which household is active?" with conflicting tie-break rules:
  1. `bootstrap_new_user` step 3 — was unordered `LIMIT 1` (non-deterministic). **Now (002): `joined_at DESC` (newest).** Matches the RLS gate.
  2. `get_current_household_id()` — `joined_at DESC` (newest). Drives the `households_select` RLS gate.
  3. `get_my_households()` / `ActiveHouseholdContext` default — `joined_at ASC` (oldest first). Context persists last-selected to localStorage.
  Pre-002 failure mode: bootstrap picked a household (arbitrary heap order) that the RLS gate (`DESC`) would not permit reading → `useProvisions.js:244` `.single()` got 0 rows → "Cannot coerce to a single JSON object" (a 0-row PostgREST 406, not a too-many-rows error). Migration 002 aligns bootstrap to the RLS gate (`DESC`) to stop the crash. It does NOT reconcile the context default (`ASC`) — bootstrap picks newest (Lake House) while the context's fallback picks oldest (My Household). Harmless while they read different sources; the REAL FIX is a single source of truth = the context's `activeHouseholdId`, passed to bootstrap and used to rewrite `get_current_household_id()`.
- **Migration 002 DEV only** (bootstrap ordering stopgap). Migrations 003–007 applied to Dev + Prod (2026-06-18) as one atomic bundle (`bundle_003_007_prod.sql`). Migration 001 was dev-only until **2026-06-25** when it was applied to prod after smoke-test revealed the gap (docs had incorrectly recorded it as "Dev + Prod (2026-06-18)").
- **`bootstrap_new_user` dead overloads (prod):** Prod carries FOUR overloaded signatures; migration 012 fixed only the 4-arg form the client calls. The other three overloads are unused but live (ambiguity risk — PostgREST could resolve the wrong one). Drop them in a dedicated migration.
- **Migration-folder bookkeeping debt (discovered 2026-06-25):** Two issues: (1) `007` numbering collision — disk file `007_dev_restore_role_grants.sql` conflicts with the canonical post-baseline `007_finish_authorize_sweep.sql`. (2) Migration files `009`–`012` are described in this doc and their RPCs are confirmed live on prod, but the files are absent from the local `migrations/` folder (provenance unknown). Reconcile before enabling the Supabase CLI workflow — the CLI needs a consistent, gapless `schema_migrations` table.
- **Realtime-on-soft-delete RLS suppression (load-bearing finding):** Supabase realtime applies the table's SELECT policy against the NEW row image to decide per-recipient delivery. `is_member_of` filters `deleted_at is null` → the soft-deleted row fails the check → the removed user's own broadcast is suppressed. `replica identity = default` (PK only) also makes old-image reads unavailable. This is a general pattern: ANY future realtime-on-soft-delete feature using an `is_member_of`-style policy (e.g. delete-household, crew removal) will hit the same suppression. Layer 2 detection uses a 30s membership-presence check instead.
- **Canonical baseline `000` is stale on `household_members` SELECT policy.** The baseline shows `= get_current_household_id()` but the live policy (since migration 007) is `is_member_of(household_id)`. The baseline must be reconciled to reality before it can be used to rebuild a fresh environment reliably.
- **Junk-household accumulation:** Repeated add-then-remove of a guest-only user spawns a repeated empty "My Household" on each removal (Layer 2 auto-provisions one per removal event). Accepted under KISS. Future fix: only auto-provision if the user has never had a personal household before; else switch to a dormant one.
- **CONSTRAINT-NAME DRIFT (dev↔prod):** `list_items` unique constraint on `(household_id, catalog_item_id)` is named differently across environments — dev: `list_items_household_id_catalog_item_id_key` (Postgres auto-generated); prod: `list_items_household_catalog_unique` (explicit). The `000` baseline comment incorrectly implied dev was renamed to match prod; it was not. Migration 008 uses the column-target form to avoid this. Any future migration referencing this constraint BY NAME must account for the split, or use the column-target form. Reconciliation deferred to a dedicated migration.
- **Quiet quantity-bump race:** The add-item client path does UPDATE-then-fallthrough-to-insert. The concurrent-INSERT race is now closed by the migration 008 upsert. The concurrent-UPDATE race on an already-existing row is NOT addressed — two simultaneous +1 quantity bumps serialize via Postgres row lock (no error) but can land as a single increment rather than summing. No toast; possible silent undercount. Out of scope for 008; flagged for next session.
- **`household_members` has no `created_at` column** (most tables do) — only `joined_at`. Any ordering or auditing on this table must use `joined_at`.
- **`households` has no unique constraint on `name`** (intentional — two real households may share a name). Duplicate-named households are valid and will accumulate in test environments. UI-level disambiguation (show creator name or creation date when names collide in the switcher) is the fix path, not a DB constraint.

---

### Views

#### `category_avg_prices`
Aggregates average `price_per_unit` per category across all list_items with real prices. Used as fallback estimate in the UI with a `~` prefix. Unrestricted (expected — inherits RLS from underlying list_items at query time).

---

### Queued Migrations (not yet live)

| Migration | Contents | Status |
|---|---|---|
| ~~016~~ → 017 | `receipts` + `receipt_items` tables (see schema below); 4 load-bearing columns pre-seeded (shopped_by, store_key, line_type, numeric quantity) | Designed 2026-07-03 — migration file written in build session. **Renumbered from 016 — that number is now `household_staples` (applied 2026-07-07).** |
| ~~017~~ → 018 | `public.beta_signups` (see schema below); RLS enabled; insert-only anon policy | Designed 2026-07-05 — see `docs/specs/SPEC_beta_signups.md`; NOT YET APPLIED |
| ~~018~~ → 019 | `public.feedback` — "Message the bridge" store (per-submission auto-context: page, household_id, app_version, clerk_id, message) | Designed 2026-07-06 — see `docs/SPEC_feedback_bridge.md`; NOT YET APPLIED |
| ~~019~~ → 020 | `public.dispatches` — in-app what's-new notices; per-user dismissal behavior TBD | Designed 2026-07-06 — see `docs/SPEC_dispatches.md`; NOT YET APPLIED |
| — | `price_history` | Superseded by `receipt_items` as the source-of-truth price record; this table may not be needed |
| — | `household_category_overrides` | Queued — designed, not built |
| — | `household_audit_log` | Concept wanted (who-did-what-when); use cases TBD; must stay distinct from behavioral/analytics event stream |

#### `receipts` (pending migration 017 — renumbered; 016 taken by `household_staples`)
Header/audit object. First-class entity, not a session appendage.
- `id` uuid PK, `household_id` uuid NOT NULL — RLS via `is_member_of`
- `session_id` uuid NULL — Phase 2 hook, unused v1
- `source` text NOT NULL — `'photo'|'email'|'api'`
- `store_name` text NULL (display), `store_key` text NULL — normalized slug; prevents store fragmentation in analytics
- `purchased_at` timestamptz NULL — receipt date, not import date
- `shopped_by` uuid NULL — importer ≠ shopper; required for per-shopper analytics and UC-7/UC-14 attribution
- `total` / `subtotal` / `tax` numeric NULL
- `status` text — `'parsing'|'review'|'committed'|'discarded'`
- `raw_payload` jsonb NULL — full extraction output; never discard
- `created_by` uuid, `created_at`, `deleted_at`

#### `receipt_items` (pending migration 017 — renumbered; 016 taken by `household_staples`)
One row per line on the receipt.
- `id` uuid PK, `receipt_id` uuid NOT NULL FK
- `raw_text` text NOT NULL — verbatim printed text; the audit anchor; never normalized
- `parsed_name` text NULL, `quantity` **numeric** NULL, `unit` text NULL, `price` numeric NULL (allows negatives for returns/discounts)
- `catalog_item_id` uuid NULL — NULL = unmatched or new item
- `match_confidence` numeric NULL — drives the review gate (≤0.80 surfaces to human)
- `match_source` text — `'deterministic'|'ai'|'human'` — Tier-1 learning hook; `receipt_items` where `match_source='human'` IS the training set
- `line_type` text — `'item'|'discount'|'tax'|'fee'|'deposit'|'return'` — first-class savings/spend data, not noise
- `status` text — `'auto'|'needs_review'|'confirmed'|'discarded'`
- `created_at`, `deleted_at`

**RLS:** `receipts` via `is_member_of(household_id)`; `receipt_items` authorized through parent `receipt`. Identity: `auth.jwt()->>'sub'`, never `auth.uid()`. SECURITY DEFINER RPC for commit if RLS keystones it. Never hard-delete confirmed `receipt_items` — they are the future training set.

**Commit behavior:** confirmed/auto lines → write `receipt_items`, refresh `catalog_items.price_hint` (rolling avg last-N=5 `receipt_items.price`), AND update `category_avg_prices` (existing table). No `list_items` write in v1.

#### `beta_signups` (pending migration 018 — renumbered; 016 taken by `household_staples`)
Mission-control table #1. Operational telemetry owned by Velayo, distinct from product tables owned by households.
- `id` uuid PK DEFAULT `gen_random_uuid()`
- `created_at` timestamptz DEFAULT `now()`
- `name` text NULL, `email` text NULL
- `region` text NULL — tap-chip code (`'northeast'|'southeast'|'midwest'|'west'|'pacific'|'international'|'elsewhere'`)
- `region_other` text NULL — free-text, populated only when `region = 'elsewhere'`; escape-hatch column split pattern
- `keeps_list` text NULL — `'always'|'usually'|'rarely'|'never'`
- `who_shops` text NULL — `'me'|'partner'|'split'|'whole_crew'`
- `store_count` text NULL — `'one'|'two_three'|'four_plus'`
- `crew` text NULL — `'solo'|'duo'|'family'|'multigenerational'`
- `multi_household` boolean NULL
- `list_method` text NULL — `'meals'|'staples'|'mixed'`
- `wishes` text NULL — open free-text
- `status` text DEFAULT `'new'` — founder-only: `'new'|'invited'|'declined'|'waitlist'`
- `fit_note` text NULL — founder-only annotation

**RLS:** RLS enabled (catches the `rls_auto_enable` event trigger). Anon role gets one INSERT policy `with check (true)` and **deliberately no SELECT/UPDATE/DELETE policy**. The absence of a SELECT policy is the security model — a visitor can write a row but can never read one back, protecting `status` and `fit_note` from visitor reads. See `docs/specs/SPEC_beta_signups.md` for the full migration SQL.

---

## Design Principles

- **Two-confidence separation (systemic AI pattern).** `price_confidence` (extraction — how clearly the number was read) must never be conflated with `match_confidence` (reconcile — how confidently the line maps to a catalog item). Conflation produces a system confidently wrong about the thing it should be humble about. *(Established 2026-07-03 — receipt import design.)*
- **Most "matching" problems are normalization problems.** Normalize (lowercase, strip punctuation, collapse whitespace, alias) before comparing; reach for a fuzzy library only after real data proves deterministic matching is insufficient. KISS. *(Established 2026-07-03.)*
- **Raw data is sacred.** `raw_payload` (receipt header) + `raw_text` (line) kept redundantly so a better parser can reprocess old receipts without data loss. Confirmed `receipt_items` are soft-delete only — they are the future training set. Never hard-delete confirmed receipt lines. *(Established 2026-07-03.)*
- **AI results aligned by stable key, never array position.** When returning AI-parsed arrays (e.g. receipt lines), align results by `raw_text` (the verbatim anchor), not by array index — models reorder and drop elements. **Shaped failures** (`{ ok: true/false, ... }`) from every AI call so the UI branches predictably and never silently drops data. *(Established 2026-07-03.)*
- **`.modal` is the canonical modal card class; `.modal-box` is dead — do not use.** Phantom-class bug found twice (wrap-up modal, Jul 3). Inline `maxWidth` correctly overrides `.modal`'s 420px default. If a third phantom class appears, run a grep-for-orphaned-classnames hygiene pass across `App.js` vs the stylesheet. *(Established 2026-07-03.)*
- **The shared list is sacred.** No per-user view preference (Hide, filter) ever suppresses what the household has put on the shared list. Personalization lives in the view layer; the list is shared truth. *(Established June 8 — the principle behind the per-user-hide fix.)*
- **Hide vs. Delete are different verbs for different scopes.** Hide = personal view preference (any item, per-user, reversible). Delete = household action on ownership (custom items only, household-wide, cascades). Item type (`is_global`) determines which verbs are available. See `SPEC_hide_delete.md`.
- **Own the data from day one.** No vendor lock-in on the data layer.
- **Capture behavioral signals silently.** Sequence, location, timing — no user configuration.
- **Soft delete everything.** Never hard delete user data.
- **Schema stays ahead of the roadmap.** Add role fields and source fields early; populate later.
- **Prices are infrastructure, not UI.** Manual price entry creates friction. Price data builds passively through receipt scanning.
- **Merge don't duplicate.** When multiple users add the same item, merge with quantity increment + contributor attribution.
- **`window.location.reload()` is an anti-pattern.** Always use `refreshCatalog()` instead.
- **Transient network failures degrade gracefully — never alarm the user.** A blip on marine wifi is not an error. Classify transport failures vs. real HTTP/RLS errors (`classifyFetchError`). Transient → silent pill + keep last-good data. Real → red toast as before. Default to `'real'` when uncertain (fail safe). See `classifyFetchError + ConnectivityPill` pattern.
- **Optimistic writes roll back unconditionally.** On any write failure (transient or real), rollback runs first, then the notification branches. The user always returns to true-server-state. No phantom saves under any error type.
- **Two roles only (owner/member). UI shows capability, not role nouns.** Internal shorthand "captain/crew"; DB stores owner/member; product surfaces a Remove button, not a "Captain" badge. No nautical labels in the product.
- **Activator principle.** The person who creates a space carries no ongoing authority over the group — only the structural responsibility of being the un-removable anchor. Any member can remove any non-creator. Equal authority within the group is foundational to "Our*" products.
- **Attribution is universal; ownership is pinned and rare.** Attribution (who created an item/category/household) is shown freely everywhere. Ownership gates only irreversible, group-affecting actions (delete household) and is pinned to the single creator anchor. Items and categories carry attribution — they carry no ownership anchor.
- **Soft-delete + revive — never re-insert on rejoin.** Leaving sets `household_members.deleted_at = now()`. Re-join must revive via upsert (ON CONFLICT DO UPDATE), never plain INSERT — the leftover soft-deleted row collides with UNIQUE(household_id, user_id). Two join paths exist (`acceptInvite` + URL-invite `bootstrap_new_user`); a fix to one does NOT cover the other. Always use column-target conflict form — constraint names drift between dev and prod.
- **Active context is client-authoritative (the Harbour standard).** Each app instance holds its own active household (React context + localStorage, keyed to the Clerk user); the server authorizes the claimed household, never infers or picks it. `is_member_of` is the authorization primitive; `get_my_households()` is the enumeration authority. `get_current_household_id()`'s "pick a household" role is retired for write paths — replaced by "authorize the claimed household." Generalizes to the fleet (active vessel, active kitchen). *(Established Jun 17.)*
- **Switcher reveals progressively.** No switcher chrome at 1 household. A tappable household-name sub-line appears only at 2+ households. "Create new household" is the act that unlocks it. Zero friction for the common case.
- **Store awareness is its own arc, sequenced after multi-household ships.** Don't interleave features. Foundation is already designed (migration 005); the arc begins with verification, not design.
- **A new household's catalog is a snapshot at birth, not a live link.** `create_household_from_template` copies custom items at creation time; households then diverge freely. No ongoing sync between a source and cloned household. Lists are independent — they never travel with the catalog clone. *(Established 2026-06-26.)*
- **"Verified present on prod" means a live query against the prod tab — never a doc entry or self-report.** The 2026-06-25 `get_my_households` gap survived because the prod-applied status was self-reported (query likely run against dev). The DB is the source of truth; docs record what the query showed. No "applied to prod ✅" without the prod-tab result in evidence.
- **Vercel CI treats ESLint warnings as errors.** All declared variables must be used before pushing to main.
- **Stable UUID is the key for all item actions; name strings are display only.** `catalog_item_id` from `listRows` is the durable identifier for every list/catalog operation (`toggleChecked`, `removeFromList`, `hideItem`, `deleteItem`). Item names are used only for optimistic UI state keys and display. Name-keyed lookups into `catalogRef`/`catalogMap` are a fallback of last resort, not the primary path. *(Established Jun 16 — the root cause of two separate name-key bugs: multi-session sync chain + "not in catalog" on rolled-forward items.)*
- **Filtered views render the same row component as unfiltered views.** Filtering changes the dataset, never the presentation or behavior. The catalog row is one shared component (`CatalogItemRow`); search is a filter over the dataset and must reuse it — never substitute a different row. Applies to the qty stepper (done), the price line (done), and swipe (pending — search rows are not yet wrapped in `SwipeToRemove`). *(Established 2026-06-29 — the root cause of the search-row +1-only stepper bug.)*
- **Telemetry loop: passive + active channels.** RUM/session-replay is the passive channel (Splunk); "Message the bridge" is the active channel. Together they are the rolling-thunder engine — a prod JS error or failed Supabase write should reach Dan within the hour (alert), not just a dashboard. Close the gap on the passive channel before beating the drum on the active one. *(Established 2026-07-06.)*
- **Mission-control tables are distinct from product tables.** Product tables (`list_items`, `households`, …) are owned by households, read by members. Mission-control tables (starting `beta_signups`) are owned by Velayo, readable only by the founder. Never mix them — keep them cleanly separated from table #1. *(Established 2026-07-05.)*
- **Escape-hatch column split: structured code + free-text escape.** When a field has a chip/enum answer set, pair a code column (`region`) with a `_other` free-text column (`region_other`, populated only when code = `'elsewhere'`). Keeps the code column GROUP-BY-able while preserving nuance ("Tortola, BVI") without polluting the GROUP BY. Generalizes to any "pick one + write-in" pattern. *(Established 2026-07-05.)*
- **Banked design principle — "Your data is yours" (future beat; earns a SPEC when built).** Onboarding data belongs to the user, not the company — it should live under their name in-app, be editable, be labelled with *why* it exists, on an honest "keep sharing and it gets smarter" loop. Velayo's data posture made visible (on-thesis: prove tech lets people live better). Technical shape when built: a **separate editable profile table**, user-owned and mutable (RLS readable/updatable scoped to the user), **seeded from `beta_signups` but never conflated with it**. `beta_signups` stays the immutable intake record (what they said at the door, timestamped, founder-only `status`/`fit_note` intact). Do NOT make the intake row user-editable — the living profile is a distinct object. Small schema decision with a real "why" + verification need → write a proper SPEC when the beat comes up, not before. *(Banked 2026-07-09 — Beta 1 launch-funnel design.)*
- **Verified external constraint — Clerk email pre-fill.** Clerk `<SignUp />` accepts a pre-filled email via the `initialValues` prop OR a query string; the query-string path fits the funnel (the `beta_signups` questionnaire redirects into sign-up, carrying the email). Pre-fill does NOT skip Clerk's own OTP verification — the email carries over but the user still confirms it, so copy must expect a "confirm it's you" beat, not promise one-click entry. **Verify the exact query-param key against the installed Clerk version at build — do not assert it from the 2023 changelog.** *(Verified 2026-07-09.)*

---

## Key Patterns

### Deliberate-loss guard — a watchdog defers to a user-initiated state transition *(2026-07-09 — `src/contexts/ActiveHouseholdContext.js` + `src/App.js`)*
The durable pattern for "a background watchdog poll must not race a deliberate state transition." A `deliberateLossRef` is raised at the START of any user-initiated household loss (delete/leave), *before* the destructive RPC, and cleared in the handler's `finally`. The `checkPresence` watchdog bails while it is set, so the poll cannot double-fire a removal notice the deliberate path is already handling. Two independent handlers reacting to one event is the race surface: `handleDeleteHousehold`/`handleLeaveHousehold` and the poll both call `resolveAfterHouseholdLoss`; the fix makes the poll *defer* to the deliberate path rather than trying to detect intent after the fact (the abandoned `selfDeparture` approach — now dead scaffolding). Guard the *whole* action from before its first async boundary, self-clearing via `finally` so a thrown RPC can't wedge the watchdog off permanently. `resolvingRef` is retained as an inner guard for resolver re-entrancy and resolver-internal awaits. **The false "No longer a member" P0 was this class of bug:** v1 guarded only the resolver's lifetime, leaving the ~2s-on-3G RPC window unguarded; v2 raised the guard to the handler layer. External removals are unaffected — no deliberate handler runs, the flag stays false, the poll fires normally (regression-verified).

### Removal-notice household name comes from the pre-update list *(2026-07-09 — `src/contexts/ActiveHouseholdContext.js`)*
When `checkPresence` detects the active household vanished, it captures that household's name from `myHouseholdsRef.current` (which still holds the departed household at detection time) BEFORE overwriting the ref, and threads it through `resolveAfterHouseholdLoss`'s optional `lostName` param into the notice. Previously the notice used the sticky `activeHouseholdNameRef`, which could hold a stale prior name (showed "Madbury" for a deleted "Test House 101"). Complements the sticky-resolved-value ref pattern — the sticky ref remains the fallback when no `lostName` is supplied.

### Session replay (Splunk RUM) — unmasked + rendering, usable as a diagnostic instrument *(2026-07-09 — `src/rum.js`)*
Splunk RUM session replay is now unmasked and rendering; it surfaced the blank-catalog bug this session. Masking posture (`sensitivityRules` in `SplunkSessionRecorder.init`): unmask `body`, mask `input`/`textarea`, exclude Clerk (`[class*="cl-"]`, `#clerk-components`). **Gotcha — the recorder reads the key `rule:`, not `type:`;** an invalid rule is silently skipped, and with no valid rules the recorder falls back to its privacy-first mask-everything default (all-grey replays). **Gotcha — a blank replay *player* is render latency before it is a bug:** once capture is confirmed and beacons return 200, wait + reload before chasing config/version theories. Known follow-up: `unmask body` exposes all rendered text incl. emails/identifiers in member lists and profile headers — add `mask` rules for those surfaces once class names are confirmed.

### Shared catalog row — `CatalogItemRow` renders Browse + Search *(2026-06-29 — `src/App.js`)*
The inner `.item-row` body (qty stepper, price row, subtotal) is a single top-level component, `CatalogItemRow`, rendered from BOTH the Browse call site and the search-results call site. Extracted so the two presentations cannot drift (the search row had previously diverged into a +1-only button). It takes `item`, `qty`, `rawCategory`, `showPrices`, `price`, plus the price-edit state/handlers as props (`centsToDisplay` is passed in since it closes over `ProvisionsApp` state). `SwipeToRemove` wraps it at the Browse call site only — search rows render the bare component (swipe-parity is a pending follow-up). Implements the "filtered views render the same row component" design principle.

### SHOP list renders from the RPC, not from catalogMap *(June 8)*
The SHOP list is grouped directly from `get_list_items_for_household`'s returned rows (`listRows` state — name, category, is_staple inline), NOT rebuilt from local `catalogMap`. This keeps `catalogMap` out of the display path, so a stale or incomplete local catalog can never drop a synced list row. The RPC is the single source of truth for what's on the list; rendering is a pure function of its response.

### refreshCatalog()
Replaces all `window.location.reload()` calls. Prevents jarring full-page reloads on mobile. Fetches fresh catalog data and updates state in-place.

### hiddenIdsRef poll guard *(June 9)*
`loadListItems` runs on every 2-second poll tick and merges catalog entries into `catalogRef.current` and `catalogMap`. Without a guard, this re-adds items the user has hidden. Both the `catalogRef.current` forEach and the `setCatalogMap` forEach now check `hiddenIdsRef.current.has(it.catalog_item_id)` and return early for any hidden item. `hideItem` updates `hiddenIdsRef` synchronously before the next poll tick, so the guard is always current.

### getTokenRef stable-ref pattern *(June 9)*
Clerk's `getToken` function has an unstable reference — it changes identity on every render, which caused the boot `useEffect` to re-run on every render, stacking poll intervals and triggering a hidden-items race. Fix: declare `const getTokenRef = useRef(getToken)` and update `getTokenRef.current = getToken` on every render (outside the effect). Inside the effect, use `getTokenRef.current` instead of `getToken` directly, and remove `getToken` from the effect's dependency array. The effect now only fires when `userId`/`clerkId`/`email`/`fullName` change.

### Two-tier polling *(June 12)*
List state on a hot 2s poll (`loadListItems` via `get_list_items_for_household` RPC); catalog on a cooler 20s poll (`refreshCatalog` via `refreshCatalogRef`). Catalog changes rarely — no need to poll it hot. Both intervals declared in the boot effect and cleared in the cleanup return (`pollInterval` + `catalogPollInterval`).

### Guarded catalog merge *(June 12)*
`refreshCatalog` computes `next`, does a field-level diff (id, category, is_staple, price_hint) against `catalogRef.current`, and only commits (`setCatalogMap` + ref update) when something actually changed. Prevents flicker and clobbering optimistic local edits. Respects `hiddenIdsRef` and `deletedIdsRef` (hidden/deleted items excluded from `next`). The same `changed ? next : prev` guard is used in `loadListItems`' `setCatalogMap` call.

### refreshCatalogRef pattern *(June 12)*
Same approach as `getTokenRef` — `refreshCatalog` is a `useCallback` whose identity could change, so the boot effect calls it via `refreshCatalogRef.current()`. The ref is kept current by `refreshCatalogRef.current = refreshCatalog` on every render (outside the effect), avoiding adding `refreshCatalog` to the boot effect's dependency array.

### SECURITY DEFINER helpers break RLS recursion *(June 12; reaffirmed June 18)*
Policies on `household_members` that self-reference trigger `infinite recursion detected in policy for relation "household_members"`. The fix: route through a SECURITY DEFINER function that reads `household_members` without re-triggering the policy. The canonical current form: `using (is_member_of(household_id))` where `is_member_of` is SECURITY DEFINER (migration 003, Dev + Prod 2026-06-18). The phase-1 migration files used self-referential inline subqueries — do not re-apply them. An inline `SELECT ... FROM household_members` inside a `household_members` policy triggers the recursion even if the intent is correct; always route through a DEFINER helper.

### rls_auto_enable event trigger *(June 12)*
An event trigger auto-enables RLS on any new table created in the public schema. **New tables come up locked by default.** Always include the table's RLS policies in the same migration — or the table is inaccessible until policies are added.

### List-layer vs catalog-layer action split *(Jun 16)*

Three distinct removal verbs, distinct by layer and scope:

| Function | Layer | Scope | Verb visible to user |
|---|---|---|---|
| `hideItem` | Catalog | Per-user, browse-only | "Hide" (BROWSE swipe) |
| `removeFromList` | List | Household-wide, list-only | "Remove" (SHOP swipe) |
| `deleteItem` | Catalog | Household-wide, custom items only | "Delete" (Edit modal) |

`removeFromList` soft-deletes one `list_item` row (`deleted_at`) scoped by `household_id` + `catalog_item_id`. The catalog row is untouched — the item stays re-addable. Mirrors the `clearAll` mechanism scoped to one item. Optimistic `listRows` filter with rollback on RPC failure.

### SHOP SwipeToRemove gesture constraint *(Jun 16)*

`SwipeToRemove` in SHOP (no `onEdit`/`onStaple` props) is **full-swipe-commits** — the row animates off-screen before `onRemove()` fires (~400ms later). Any own-vs-shared branching must happen *outside* the component in `handleSwipeRemove`, not inside `SwipeToRemove`. On Cancel, `listRows` is NOT mutated, so the row springs back cleanly from the original state.

### Catalog SwipeToRemove close-gesture *(2026-06-29 — `src/App.js`)*

Catalog rows (the `onEdit` branch — Browse **and** Search, since both wrap the shared `SwipeToRemove`) latch open at `-REVEAL_WIDTH` after a left swipe and close on a **direction-aware** release in `handleEnd`: net gesture delta (`offsetX - baseOffset.current`) vs. the 60px `SWIPE_THRESHOLD` — an open row closes on a right drag past threshold, a closed row opens on a left drag past threshold, sub-threshold drags return to prior state. **Constraint:** the draggable content layer must keep `pointerEvents: "auto"` even when fully latched open — a conditional `"none"` at `offsetX <= -REVEAL_WIDTH` blocks `onTouchStart`/`onMouseDown` so the close gesture can't even start. The action-button panel is absolutely-positioned *beneath* the translated content (content slides `translateX(-240px)` off the right edge), so unconditional `auto` does not block button taps. Deferred (per "wait until users complain"): tap-away, single-open-at-a-time, velocity flick.

### Canonical RLS authorization helpers *(reaffirmed 2026-06-29 after migrations 014/015)*

Two helpers are the canonical authorization primitives — do not reintroduce the dropped duplicates (`get_household_id_for_current_user`, `get_user_id_from_clerk`):
- **`is_member_of(household_id)`** — household-membership gating, wherever the check is pure membership.
- **`get_current_user_id()`** — caller-identity / ownership checks (owner-is-you) and crew-keyed policies (no `household_id`).
Both are SECURITY DEFINER with a pinned `search_path`. The `auth.uid()`-vs-uuid comparison is a permanent anti-pattern here (Clerk returns a text `sub`, never a uuid); harness check A5 guards the four 014 tables against any revert.

### Declutter cycle — cross-tab view primitive *(designed 2026-06-30; not yet built — `docs/SPEC_declutter_cycle.md`)*

The declutter control is a **cross-tab UI primitive, not a per-screen widget.** Browse and Shop share the same shape: a filter/declutter axis + a grouped/flat axis, expressed as one fixed 48×48 icon (bg light/dark = Filter Off/On; line shape tapering/equal = Grouped/Flat) cycling through 3 phases (all-shown/grouped → noise-hidden/grouped → hidden/flat A–Z). **Two axes, kept separate:** the *cycle* handles the **view** axis (how you see the list — grouped/flat + hide-noise); filter *pills* handle the **content** axis (what's shown). This split must hold as Shop's filters grow (who-added, per-store). **Design rule: the cycle changes view only and never clears filters or checked-state.** Build the Browse phase-2 flat render by lifting Shop's existing `showCategories` flat pattern (`src/App.js` ~2003–2063). Reference mockup: `docs/mockups/cycle_dual_readout.html`.

### id-based toggleChecked *(Jun 16)*

`toggleChecked(itemName, catalogItemId)` now resolves the target row via `catalogItemId` passed from the caller (carried on `listRows` → `shoppingList` items → tap handlers). Falls back to `catalogRef.current[itemName]?.id` only if no id arrives. Eliminates "not in catalog" failures on rolled-forward items whose names may have diverged from the current catalog map.

### Invite-code sessionStorage bridge *(Jun 19)*

Clerk's sign-up redirect strips URL query parameters for users who are not yet signed in. An invite link carrying `?invite=CODE` loses the code before the React app can read it. Fix: capture the code in `index.js` at module level — before `ClerkProvider` mounts, the earliest point in the page lifecycle — and persist to `sessionStorage("pending_invite_code")`. Bootstrap reads the URL param first and falls back to the stored code. Cleared unconditionally after the bootstrap attempt, regardless of whether the join succeeded.

### Durable-intent over one-shot side effects — invite-join `pendingJoinId` *(2026-07-01 — `src/App.js`)*

**Cross-cutting pattern.** Where an action's *trigger* is consumed on the very load that carries it — a stripped URL param, a single-use invite/token, a cleared `sessionStorage` flag — the resulting state change must NOT be a one-shot that depends on that load completing uninterrupted. Hold the **intent** in React state and reconcile it reactively against the authoritative source when it arrives.

First applied to invite-join activation. The auto-switch into a joined household was an inline one-shot: `bootstrap_new_user` strips `?invite=` and the invite is single-use, so the `just_joined_household*` flags exist only on the consuming load. It survived reload only because `switchHousehold` writes `localStorage.activeHouseholdId`; if that write was interrupted (slow `refreshHouseholds`, mid-flight reload, membership guard rejecting on a slow network), the flags were already stripped and the invite spent, so the next context-init re-pinned the prior household with no recovery. Fix: when the join flags are read, store `joinedId` as `pendingJoinId` state; a `[pendingJoinId, myHouseholds]` effect fires `switchHousehold(pendingJoinId)` (then clears it) once `myHouseholds` contains that id. Intent now outlives the stripped flags and localStorage timing. Preserves the single-writer invariant below — the switch still routes through `switchHousehold`, never `setHousehold`. Candidate lens for the broader household-scoped UI-state audit.

> **Confirmed on deployed dev (2026-07-01), not from the migration file:** `bootstrap_new_user` returns `joined_via_invite=true` for an existing user accepting a valid, unconsumed invite — the invite branch takes priority and does NOT short-circuit for established users. Verified by observing a fresh-invite consuming load auto-switch a multi-household user into the joined household, resolving the standing CLAUDE.md caution that the SQL editor may hold a stale function version. The join-activation defect was therefore purely client-side; the RPC was not touched.

**The lens is the single writer.** `ActiveHouseholdContext` is the sole authority on the active household. Any join path — Route A (`?invite=` via bootstrap) or a future wired paste-a-code UI — lands the active household through `switchHousehold`, never by calling `setHousehold` directly. The dead `acceptInvite` in `useProvisions` (which swaps its own `household` state directly and would leave `activeHouseholdId` stale) is the anti-pattern this invariant pre-empts: wiring it as-is would create a split-brain where `household` and `activeHouseholdId` disagree.

### Client-authoritative active context + `is_member_of` authorization *(Jun 17)*

Write paths are migrated from `= get_current_household_id()` (server picks one household) to `is_member_of(household_id)` (caller names the household, server authorizes). Three-role split:
- **`ActiveHouseholdContext`** — holds and persists `activeHouseholdId` (localStorage); enumerates via `get_my_households()`.
- **`is_member_of(household_id)`** — SECURITY DEFINER boolean: "is the caller a member of this household?" Fails closed on null. Used in RLS `using` / `with check` clauses on write policies.
- **`get_current_household_id()`** — legacy helper; still used by some policies pending their 005-migration conversion. Do NOT add new callers.

Migration 004 converts `list_items` write gates (hot path). Migration 007 converts the remaining five gates (household_members select, waste_events, catalog_items select+insert, household_invites insert). `get_current_household_id()` is now retired from all active RLS policy paths.

### classifyFetchError + ConnectivityPill — offline/retry handling *(Jun 20)*

Transport-layer failures (no HTTP response) are classified separately from real HTTP errors, RLS denials, and Supabase error codes so the app can degrade gracefully without alarming the user.

- **`src/lib/classifyFetchError.js`** — pure function (no imports). Returns `'transient'` for: message includes "Failed to fetch", "NetworkError", "ERR_CONNECTION", "ERR_NETWORK", "ERR_INTERNET_DISCONNECTED", "ERR_NAME_NOT_RESOLVED"; `name === 'AbortError'`; `name === 'TypeError'` with message matching `/fetch|network/i`. Returns `'real'` for everything else. **Default is `'real'`** (fail safe — a loud real error surfacing is better than silently swallowing one).
- **`src/contexts/ConnectivityContext.js`** — state machine. `connState` starts `'online'`. `reportTransientFailure()`: if online or recovered → `'reconnecting'`; after 3 consecutive calls → `'offline'`. `reportSuccess()`: if reconnecting or offline → `'recovered'` + starts 2s timer → `'online'`; timer cleared on re-entry to prevent stacking. `failureCount` is a ref (UI doesn't need to render from it); `connState` is state. `ConnectivityProvider` wraps the tree outside `ActiveHouseholdProvider`. `useConnectivity()` hook.
- **`src/components/ConnectivityPill.js`** — returns `null` when `connState === 'online'`. Three visible states: *Reconnecting* (sand `#EFE2CC`, amber `#B8860B` pulsing dot, 1.3s ease-in-out opacity+scale); *Offline* (`#F0E0BE`, steady dark dot, "showing last saved"); *Back online* (teal `#CDEDE8`, teal dot). Fixed bottom-center (`bottom: 28px`, mirrors toast), `pointerEvents: none`, `role=status aria-live=polite`.
- **Read-path pattern:** catch block calls `classifyFetchError(err)`. Transient → `reportTransientFailure()`; keep last-good data; return without `setError`. Real → existing `setError(...)` unchanged. `reportSuccess()` called on boot load success and 20s catalog-poll success. Applied to: catalog-refresh ×2, `loadListItems`, household-fetch in `loadForHousehold`.
- **Write-path pattern:** rollback is **unconditional** (runs on any catch — transient AND real). Then branch: transient → `reportTransientFailure()`, real → `setError(...)`. `reportSuccess()` after server confirms the write. Applied to: `updateQty`, `toggleChecked`.

### Active Household Context *(built Jun 17 — `src/contexts/ActiveHouseholdContext.js`)*

App-level context that is the single source of truth for which household is active.
- **Provider props:** `getToken`, `clerkId` (same values `useProvisions` receives from Clerk's `useAuth`/`useUser`), `onRemoval(householdName, provisioned)` — callback fired when the user is detected as removed; `provisioned` = true when a fresh household was auto-created.
- **State exposed:** `myHouseholds [{id, name, role}]`, `activeHouseholdId`, `loadingHouseholds`, `switchHousehold(id)`, `refreshHouseholds()`, `hasMultiple`, `resolveAfterHouseholdLoss(lostId, notifyRemoval, lostName)`, `beginDeliberateLoss()`/`endDeliberateLoss()` — the deliberate-loss guard raised by the delete/leave handlers before their RPC (see Key Patterns).
- **Data source:** `db.rpc("get_my_households")` on mount — maps `row.household_id` → `id`. `getTokenRef` stabilization pattern. `myHouseholdsRef` kept in sync so `switchHousehold` validates without stale closure.
- **Resolution:** reads `localStorage("activeHouseholdId")`; if valid in `myHouseholds` use it, else fall back to first returned (`get_my_households` orders `joined_at ASC` = oldest = default).
- **`refreshHouseholds()`:** re-fetches `get_my_households()` and updates `myHouseholds` + `myHouseholdsRef` WITHOUT touching `activeHouseholdId`. MUST be called after any mutation that changes the household roster (create, rename, future delete/join) — the context does not auto-refresh.
- **Silent-join paths must call `refreshHouseholds()` explicitly.** `switchHousehold` (auto-switch, household create) triggers a refresh cascade internally; the silent-join path has no such trigger. The join-banner effect in `App.js` calls `refreshHouseholds()` on any confirmed join, regardless of whether an active-context switch occurs.
- **Mounting:** `ShoppingListApp` (thin exported wrapper) wraps `<ActiveHouseholdProvider>` around inner `ProvisionsApp`. A consumer cannot live above the provider it mounts — this split is the structural prerequisite for `useProvisions` calling `useActiveHousehold()`.

### Two-effect hook pattern *(established Jun 17 — `src/hooks/useProvisions.js`)*

`useProvisions` uses a deliberate two-effect split to separate identity setup from household-scoped data loading:

- **Effect 1** (deps: `userId, clerkId, email`): creates the Supabase client once (guarded by `if (!supabaseRef.current)` against GoTrueClient stacking), runs `bootstrap_new_user`, stores the fallback household id and internal user id into refs, then sets `bootstrapped` STATE to `true`. **Deps key on IDENTITY only (2026-06-29):** `fullName` was removed — it is a cosmetic attribute that only feeds `bootstrap_new_user`'s `p_full_name` (a no-op for existing users). Including it meant a display-name edit (which writes Clerk → changes `fullName`) re-fired full session bootstrap, calling `setLoading(true)` with no matching clear (the success-path `setLoading(false)` is owned by Effect 2, which did not re-run), wedging the app on "LOADING YOUR PROVISIONS…". Session-bootstrap effects must depend on identity, never cosmetic state.
- **Effect 2** (deps: `activeHouseholdId, userId, clerkId, bootstrapped`): resolves the target household by trusting `activeHouseholdId` unconditionally (already set to the joined household on auto-switch via `switchHousehold`, unchanged on silent join); falls back to bootstrap fallback only when context is empty (fresh device / pre-restore). `justJoinedViaInviteRef` is still set from bootstrap but is no longer read in the resolver. Effect 2 runs all household-scoped loads + polls, and on teardown clears intervals + resets per-household state (`listRows`, `quantities`, `checked`, etc.).

**Critical invariant:** the cross-effect handoff gate MUST be a STATE value (`bootstrapped`), not a ref. A ref change cannot re-trigger Effect 2. If Effect 2 runs before bootstrap finishes (which is intermittent), it returns early — and if only a ref is set, nothing re-fires. Using state ensures React re-runs Effect 2 the moment bootstrap completes. The `cancelled` flag in Effect 2 cleanup prevents stale async writes after a household switch mid-flight.

### Client-side reconciliation effects — Effect 1b (`full_name` from Clerk) *(2026-07-01 — `src/hooks/useProvisions.js`)*

**Cross-cutting pattern:** Clerk-sourced user attributes that bootstrap cannot reliably capture must be reconciled by their own idempotent effect, decoupled from bootstrap. `bootstrap_new_user` writes such attributes at most once, at the worst possible time (Clerk's `firstName`/`lastName` often arrive *after* the initial session), is a no-op on later sessions, and — critically — cannot take `fullName` as a dep without reintroducing the loading-wedge (see Two-effect pattern). So an attribute written only by bootstrap is written once, too early, and never reconciled.

**Effect 1b** is the reference implementation for `users.full_name`:
- **Own effect**, deps `[fullName, bootstrapped]` — re-evaluates once bootstrap finishes and again whenever Clerk's name arrives/changes.
- **Guards:** body no-ops unless `bootstrappedRef.current` && `internalUserIdRef.current` are set and the trimmed name is non-empty.
- **`lastSyncedNameRef`** prevents a write loop / repeated no-op writes; a reads-before-writes check skips the update when the stored value already equals the incoming name (avoids needless realtime churn).
- **Reuses the RLS-proven write path** (`db.from("users").update({ full_name }).eq("id", internalUserIdRef.current)` — the same update `updateFullName` runs, which RLS already permits for a user's own row). **Never calls `bootstrap_new_user`**, sidestepping its 4-overload ambiguity entirely.
- **Non-fatal:** on error it logs and returns — attribution degrades to the email-prefix fallback, never blocks the app.
- **MUST stay decoupled from the bootstrap effect** — coupling reintroduces the `fullName` loading-wedge the Effect 1 dep-list warns about.
- **Self-heal, no backfill:** existing NULL `full_name` rows repopulate the next time each user opens the app with a Clerk name present. Do not hand-write names into `users`.

### App-Level Toast *(built Jun 17 — `src/App.js`)*

Single-slot app-level toast — the in-app notification primitive.
- State: `toastMessage | null` + `toastTimerRef` held in `ProvisionsApp`.
- `showToast(message)` sets message; cancels any pending timer; auto-clears after 2500ms.
- Fixed-position dark pill, rendered in `App.js` so it outlives the modal that triggered it (`zIndex: 2000`).
- Used for: household-create confirmation, rename confirmation. Reuse for: item added, list rolled, etc.

### Household-scoped UI state resets on active-household change *(2026-06-29 — `src/App.js`)*

Any UI state that *describes a specific household* must be cleared when the active household changes, or it goes stale and contradicts the new context. Three such surfaces were found and fixed this session; the class is systemic (elevated to a next-session audit). Because creating a new household auto-switches active context, a single reset keyed on the active household covers BOTH the switch and create-new paths — no separate create handling needed.

- **Invite-link reset:** `useEffect(() => { setInviteUrl(null); setInviteCopied(false); }, [household?.id])`. The Share panel's generated `inviteUrl` is scoped to the household it was generated for; surviving a switch let a user share the wrong household's link. `createInvite` was already correct (reads live `householdRef.current`) — the bug was purely stale displayed state.
- **Join-banner auto-dismiss:** keyed on `[joinBanner, household?.name]`, with a 5s timer and immediate clear when the active household name no longer equals the banner. **Arrival-race guard (`bannerSeenRef`):** the explicit-accept flow sets the banner BEFORE the async `switchHousehold(joinedId)` lands, so for an existing user there is a window where the banner shows the joined name while `household` is still the prior one. A naive "name !== banner → clear" would fire in that window and kill the banner on its own arrival. The ref records whether the joined household has actually been active at least once; a name mismatch only clears once it has. General rule: when UI state is set before an async context switch completes, guard "switched away" against "not yet arrived."

### Display-name resolution — Supabase `full_name` first *(2026-06-29 — cross-cutting, `src/App.js`)*

All member-name render sites resolve in the same order: Supabase `full_name` → email-prefix (`email.split("@")[0]`) → role-aware generic (`"You"` / `"Member"` / `"this member"`). The email-prefix is a deliberate fallback (best handle an owner has for an invited-but-unnamed member), not the primary. Clerk-derived names (`user.fullName`) are NOT read for *member* display — Supabase is the source of truth; Clerk is auth-only (see DECISIONS LOG 2026-06-29). Applied at the roster, the "Created by" creator label, and the remove-member confirm; the "added by" label was the pre-existing reference implementation.

**How Supabase `full_name` gets populated (2026-07-01):** it is reconciled *from* Clerk each session by Effect 1b (see "Client-side reconciliation effects" above) — Clerk remains the upstream origin, Supabase the durable source of truth all display reads hit. The one place a Clerk name is read directly at render is the **profile-sheet heading** (`App.js` ~2639), whose own-user fallback chain is `profileName || [firstName, lastName].filter(Boolean).join(" ") || email` — composing from Clerk's name *parts* prevents an email-over-email display when Clerk's composed `fullName` is empty but the parts are set. Long-term this heading should seed `profileName` from `users.full_name` (single source of truth); the compose-from-parts form is the immediate fix.

**Divergence to watch:** `householdMembers.users.full_name` — the embedded snapshot in the client's member array — can lag the base `users.full_name` (the source of truth), so two viewers may briefly see different names for the same member until the stale client re-fetches. This underlies the ~30s propagation symptom; same family as the household-scoped-UI-state-reset pattern. Confirm the member load reads the same source of truth once reconciliation is broadly live.

### Membership-presence polling — realtime fallback when RLS suppresses soft-delete events *(Jun 22)*

When Supabase realtime cannot deliver a soft-delete event to the affected user (because the SELECT policy filters `deleted_at is null` and the new row image fails that check), poll instead.

- **Interval:** 30s, keyed only on `clerkId` in the effect dep array — all household state read via refs to avoid stale closures.
- **Guard:** `error || !data` — holds position only on genuine transient failures (error truthy or null data). A successful empty result (`{error:null, data:[]}`) is a legitimate removal signal (user was removed from their only household) and is allowed through to the auto-provision branch. A `data.length === 0` clause was deliberately removed when it was found to suppress valid auto-provision on the only-household path. Confirmed safe: PostgREST never returns `{error:null, data:[]}` on a network failure — those always surface as `error` truthy or `data` null.
- **In-flight guard:** any create-on-detect action (auto-provision `create_household`) uses a ref flag to prevent duplicate spawns on double-fire.
- **Disambiguation:** the deliberate-loss guard (`deliberateLossRef`, raised by `handleDeleteHousehold`/`handleLeaveHousehold` before their RPC and cleared in `finally`) makes the poll defer to a user-initiated leave/delete rather than firing a removal notice for it; a forced external removal has no deliberate handler running, so the poll fires normally. See the "Deliberate-loss guard" Key Pattern.
- **General rule:** any future realtime-on-soft-delete feature using an `is_member_of`-style policy will hit the same RLS suppression — use this polling pattern as the fallback.

### System-message channel *(seeded Jun 22, not yet built)*

The Layer 2 removal notice introduces a typed message shape: `{ kind, text, subtext, durationMs, dismissible }`. This is the intended consolidation point for `showToast`, `joinBanner`, and connectivity/trip events — a single rendering slot with priority and queue. **Not yet built** — only the first tenant (removal notice) exists. Queueing and migration of existing notification paths deferred until a second real tenant emerges.

### refreshMembers — on-demand member list reload *(Jun 22)*

A `useCallback` (refs-only, empty deps — same pattern as `refreshCatalog`) that re-fetches `household_members` + `get_household_member_profiles` for the current household and commits to `householdMembers` state + `householdMembersRef`. Exposed from `useProvisions` alongside `refreshCatalog`.

- **Layer 1 use (now):** called after `remove_member` succeeds — the actor's member list updates live without a household switch or page reload.
- **Layer 2 use (next session):** the `household_members` realtime subscription handler will call `refreshMembers()` on any INSERT/DELETE event, then check if the removed `user_id` matches the current user (for the "you were removed" notice + auto-switch).

The member query always selects `role` — both `loadForHousehold` and `refreshMembers` include it so creator-detection in the UI works correctly after a live refresh.

### Sticky-resolved-value ref pattern *(Jun 24 — `activeHouseholdNameRef` in `ActiveHouseholdContext.js`)*

When a ref value can be clobbered by a background mutation (e.g. `myHouseholdsRef` is overwritten by `refreshHouseholds` before `checkPresence` reads it), use a sticky ref that only updates when the value can be *positively resolved*:

```js
const activeHouseholdNameRef = useRef(null);
const resolved = myHouseholds.find((h) => h.id === activeHouseholdId)?.name;
if (resolved) activeHouseholdNameRef.current = resolved; // skip update when unresolvable
```

The sticky ref updates on every render where the active household is still in `myHouseholds`. After `refreshHouseholds` drops the departed household from the list, subsequent renders find `resolved = undefined` and skip the update — the ref **retains the last known correct name**. A belt-and-suspenders `??` fallback inside the consumer (`nameForNotice = activeHouseholdNameRef.current ?? oldListLookup`) provides "never worse than today" guarantees. This pattern applies to any mutable-ref value that can be pre-clobber by a concurrent async mutation before the interval reads it.

### Function body verification via pg_proc.prosrc *(Jun 20)*

The Supabase dashboard SQL editor auto-appends `limit 100`, which silently breaks scalar-returning calls like `pg_get_functiondef('fn'::regprocedure)` with a misleading parse error. Reliable verification path: query `pg_proc.prosrc` with a position check:

```sql
SELECT proname, position('ON CONFLICT' in prosrc) > 0 AS upsert_present
FROM pg_proc WHERE proname = 'insert_list_item';
```

Returns a clean boolean, immune to the auto-limit. Use this pattern over `pg_get_functiondef` whenever you need to confirm a function body change was saved. (Extends the existing "SQL Editor may silently keep old versions" caution in CLAUDE.md.)

### Header layering principle *(established 2026-06-28 — `SPEC_household_indicator.md`)*

The app shell has two distinct chrome layers with different rendering scopes:

- **Outer chrome** (avatar row, active-household indicator, kebab menu): App-level. Always rendered whenever the user is signed in. Survives household switches — it wraps them. Correct home for identity signals and cross-household navigation.
- **Inner chrome** (title bar, wordmark, action buttons, SHOP/BROWSE/PROFILE tabs): Household-context layer. Rendered inside the active-household scope. Reflects the current household's state (member count, wordmark singular/plural).

Design rule: any chrome element that must remain stable across household switches belongs in the outer layer. Any element that reflects the *current* household's state belongs in the inner layer. Mixing them (e.g. household name in the title bar) creates a flash-of-old-name on switch. The active-household indicator (Phase I) lives in the outer layer for this reason.

### Cascade integrity check — probe prod before migration apply *(established 2026-06-28)*

Before applying any migration that adds a column (or any other additive schema change) to a table that exists on prod:

1. Run a live column-existence query against the **prod SQL editor tab** (not dev, not docs, not memory):
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_schema='public' AND table_name='<table>' AND column_name='<column>';
   ```
2. Confirm the result is empty (column does not yet exist) before issuing the `ALTER TABLE`.
3. After apply, verify via `pg_proc.prosrc` (for RPCs) or a schema query (for columns).

This pattern caught a potential `shopping_sessions.deleted_at` double-add on 2026-06-28 — the prod table already had the column (from an earlier untracked apply), which would have caused the `ALTER TABLE` to fail with a duplicate-column error if issued without checking first. **Never trust docs or session logs as prod-state authority.** The DB is the source of truth.

### Dev-environment hygiene — multi-user removal testing *(established Jun 25)*

Junk household accumulation and lookalike `+testN` accounts invalidate test signals. Before any multi-user removal/membership test:

1. **Read-only inventory first.** Run queries mapping live users → live memberships → households (all joins filtered `deleted_at IS NULL`). Establish DB ground truth before touching anything.
2. **Keep-list + reversible soft-delete.** Declare which accounts/households to keep; `SET deleted_at = now()` on everything outside the list. Never hard-delete test artifacts — they remain recoverable.
3. **Build fresh fixtures via the real invite flow.** Create `+testN` accounts using the actual invite-join path, not SQL inserts. Invite-first guarantees the account is single-household with no personal My Household — the clean point-4 fixture.

Root cause of four consecutive false signals before this discipline: two accounts both showed "My Household" in the switcher (lookalike aliases), and the observed window was a non-member account.

### Point-4 test gate — DB assertion before only-household removal *(established Jun 25)*

Before triggering an only-household removal test, assert the victim's state directly in the DB — do not trust the UI or memory. Expected: `live_household_count = 1` and the household name matches the expected fixture. A pre-existing "My Household" (from a prior auto-provision or fallback) invalidates the test: the user would switch to it rather than triggering auto-provision. Only proceed when the DB gate passes cleanly.

### Contributor Merge Logic (app-side)
When a user adds an item already on the list:
1. Do NOT insert a new `list_items` row.
2. Increment `list_items.quantity`.
3. Upsert into `list_item_contributors` — increment `quantity_added` if row exists, insert if not.

On decrement: reverse the above. If `quantity_added` hits 0, delete contributor row. If `list_items.quantity` hits 0, remove list item entirely.

### Budget / Price Display
- Real prices only shown on My List.
- `~` prefix indicates estimated totals using `category_avg_prices` view.
- "Show prices & budget" toggle in user profile defaults to hidden. Stored in localStorage.

### User Preference: Show Prices & Budget
Persisted via localStorage. Defaults to `false`. Set in profile sheet. Applies globally across the list view.

### User Preference: List text size — `--op-list-scale` *(2026-07-01 — `src/App.js`)*
Device-local list text sizing driven by a single CSS variable. `--op-list-scale` is declared on `:root` with a default of `1` (in the `<style>` block, so it resolves before the effect runs — no first-paint flash), and re-applied on `documentElement` by an effect keyed on the stepper index. Five steps `[0.9, 1.0, 1.2, 1.45, 1.75]` labelled Compact/Default/Large/XL/XXL; the **index** (0–4, default 1) is persisted under `localStorage.op_list_text_size` — the index, not the scale, so the step ladder can be retuned without migrating stored values. Six row-content classes scale via `calc(<existing> * var(--op-list-scale))` — Browse `.item-name` / `.price-display` / `.item-subtotal` and My List `.li-name` / `.li-qty` / `.li-subtotal`; all chrome (category titles, progress, budget, tabs, header) stays fixed. `.list-item` and `.item-top` get `flex-wrap: wrap` so XL/XXL wrap to a second line instead of overflowing. Device-local by design — never account-synced (text size is a property of the screen and the light, not the person); the control lives in Preferences (set ~once per device), not on the list. Governs Browse and My List with one variable so the setting is one coherent choice across tabs.

### Insert-only / no-SELECT RLS pattern *(established 2026-07-05 — `beta_signups`)*
First table accepting writes from unauthenticated (anon) users. The `rls_auto_enable` event trigger locks it on creation. Grant the `anon` role one INSERT policy with `with check (true)` and **deliberately NO SELECT, UPDATE, or DELETE policy**. The absence of a SELECT policy is the security model: a visitor can write a row but can never read one back, protecting founder-only operational columns (`status`, `fit_note`) from visitor reads. This is the first Supabase surface in the system that runs without a Clerk identity — correct and deliberate for pre-auth beta applicants.

### iOS install coach-mark pattern *(established 2026-07-06 — `SPEC_pwa_install_coachmark.md`)*
Detection gate: iOS + Safari + `navigator.standalone === false` + localStorage dismissal-count < 2. Two-step dismissal ladder: first open shows the coach-mark; next fresh open re-offers with softer "last call" copy; second dismiss → never again. "Visit" = fresh app open (distinguishes opens from background resume). Counter persisted in localStorage — per-device by design; clearing data or using a new device re-offers, which is correct for a home-screen nudge. Android untouched — Chrome's native Add-to-Home-Screen prompt handles it. Goal: remove Dan from the install loop on both platforms.

### New-user cold-start gate *(established 2026-07-06 — `SPEC_new_user_coldstart.md`)*
A timed walk must prove before the signup email flips to self-serve: (1) a zero-state Clerk identity creates a household without confusion, (2) adds a first item that persists, (3) Realtime behaves for a solo brand-new household, and (4) the first screen is a warm empty-state — not a void. Cold-start is a test-and-fix cycle, not a feature build. Full self-serve "come aboard" link is honest only once a true zero-state user is verified to onboard cleanly; until green, the email stays personal.

---

## Household Members

| Name | Role | Status |
|---|---|---|
| Dan | Owner | Primary user / founder |
| Helen | Member | Active household |
| Elly | Member | Active household |
| Jean Hennessy | Owner | Independent test household |
| Tyler Hennessy | Owner | Independent test household |

---

## Velayo OS — Company Operating System

### Repo & Deployment

| Item | Value |
|---|---|
| Repo | `Velayo-ai/velayo-os` (private) |
| Hosting | Cloudflare Pages (`velayo-os` project), Git push-to-deploy |
| Live URL | `harbour.velayo.ai` (HTTPS, custom domain) |
| Access control | Cloudflare Zero Trust — OTP policy "Crew only" (named emails + `@velayo.ai` domain) |
| Contents | `index.html` (The Harbour dashboard), `velayo_os_flight_checklist.html` |

### Three-Repo Separation Principle
`velayo-os` (how the company runs) / `velayo-platform` (product infra shipped into apps) / app repos (the fleet). The OS never ships to a customer and is never a production dependency. Cockpit ≠ engine.

### Design Principles
- **Narrative layer vs. environment layer split on different clocks.** The session log (narrative) can stay unified long after repos/deploys/access (environment) must separate. Don't let "keep it simple" creep from the log layer into the deploy layer.
- **No secrets on the dashboard.** The Harbour lists doors (links), never contents; targets are independently auth-gated so "leaked = low stakes" stays true.

### Known Gotcha — Cloudflare Access
Access gates a *hostname*, not a Worker — sibling routes (`workers.dev`, preview URLs) aren't covered by the custom-domain app. The standalone Access app must be explicitly **Created** (not just policy-saved), or the door stays open. Hit this live: first incognito test loaded through because the app was unsaved.

### Secret-Handling Confirmation (OurProvisions)
`.env`/`.env.local` hold only publishable/anon keys (Supabase anon, Clerk `pk_`), correctly gitignored. No `service_role`/`sk_` secrets in client files. RLS is the real lock, not key-hiding.

---

## Velayo Harbor — App Ecosystem

| App | Group | Status |
|---|---|---|
| **OurProvisions** | Household | Active development |
| **OurManifest** | Crew / Trip | Planned |
| **OurDiscovery** | Family | Planned |
| **OurChef** | Household | Phase 5 |
| **OurGarden** | Household | Future |
| **OurHelper** | Neighborhood | Future |

### Domain / brand layering *(direction set 2026-06-29)*
Three layers, top to bottom: **vanity domain (`.app`)** → **app (running deploy)** → **Harbour (`velayo-os` shared identity)**. The domain is a label on the front door, not the address of the house. Vanity `.app` domains (ourprovisions / ourkeep / ourmanifest / ourpoker) are sayable front doors that may repaint or multiply freely; the Harbour (shared identity + combined fleet data + OurExperience) is the house and can unify without changing what users type. The **auth domain stays singular and platform-owned** from the start — protecting Phase II shared-login across the fleet and letting an app (e.g. ourpoker) opt out later without a migration. Near-term: `ourprovisions.app` becomes canonical with the `velayo.ai` subdomain redirecting to it; auth-domain unification is deferred to Phase II and all near-term domain work stays auth-neutral and reversible.

---

*Velayo, Inc. — velayo.ai — dan@velayo.ai*
*390 NE 191st St STE 93618, Miami, FL 33179*
