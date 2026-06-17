# OurProvisions — Architecture
*Last updated: 2026-06-17*

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
- **Role model:** `owner` = creator; can rename household, remove members, delete household. All list actions are shared across all roles. Succession on owner departure: oldest remaining member becomes owner. No co-owners.
- **Re-scoping risk (multi-household):** `useProvisions` + realtime subscriptions must tear down and re-subscribe to the new `household_id` on switch, or stale realtime updates leak from the old household. Inspect before coding the switcher.
- **Ordering:** `joined_at` is the timestamp column (not `created_at`). `get_current_household_id()` orders `DESC` (newest); `get_my_households()` orders `ASC` (oldest = context default); `bootstrap_new_user` step 3 now orders `DESC` (migration 002 stopgap). See three-way ordering bug in Known Debt.
- **Fragility:** `useProvisions.js:244` does `.from("households").eq("id", bootstrapData.household_id).single()` — throws if bootstrap and `get_current_household_id()` disagree on which household is current (RLS blocks the read → 0 rows → `.single()` fails). Currently masked by migration 002 stopgap. Real fix is bootstrap/active-household unification.

#### `catalog_items`
The item library. Items are either **global/seed** (system-owned) or **household custom** (household-owned). The `is_global` boolean is the ownership discriminator and drives the Hide/Delete verb model:
- `is_global = true` → seed item. System-owned (only Velayo creates/edits/deletes, via code or future admin UI). `household_id` and `created_by` are NULL. Members can **Hide** (per-user) but never delete.
- `is_global = false` → custom item. Household-owned. `household_id` + `created_by` set. Any member can add or **Delete** (household-wide); members can also Hide it from their own view.
- `id`, `name`, `category`, `unit`, `is_global`, `created_by`, `household_id`
- `external_id` (future retailer SKU), `price_hint` (fallback price), `is_staple` (⭐ toggle)
- `created_at`, `deleted_at`
- **Seed set: 50 distinct items.** (Cleaned June 8 — collapsed 3 fragmented "Bakery" categories into canonical `Bakery`, re-homed 5 misfiled items, removed 10 unreferenced duplicate seed rows. 10 both-referenced duplicate seed items remain — Flour, Sugar, Bananas, Broccoli, Carrots, Garlic, Lemons, Potatoes, Spinach, Tomatoes — pending the merge logic that ships with/after Delete.)

#### `list_items`
The living household list. Items are never hard deleted — they move through statuses. Realtime enabled.
- `id`, `household_id`, `catalog_item_id`, `quantity`, `price_per_unit`, `status` (pending/bought/skipped/deferred)
- `added_by`, `checked_by`
- `cycle_id` (→ `provision_cycles`), `rolled_from_item_id` (→ `list_items`, self-ref for carry-forward)
- Phase 2 forward refs: `session_id`, `checked_sequence`, `checked_lat`, `checked_lng`
- Phase 4: `deferred_reason`
- `created_at`, `updated_at`, `deleted_at`
- **Unique constraint:** `list_items_household_catalog_unique (household_id, catalog_item_id)` — named explicitly to match prod; `close_cycle`'s upsert targets this constraint.

#### `waste_events`
Every thrown-away unconsumed item. Most important AI training data in the app.
- `id`, `household_id`, `catalog_item_id`, `quantity`, `reason`, `wasted_at`

#### `list_item_contributors` *(added June 1, 2026)*
One row per person who contributed to a given list item. Powers contributor badges `[D][H][E]`.
- `id`, `list_item_id`, `user_id`, `quantity_added`, `added_at`
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
- `id`, `household_id`, `started_at`, `closed_at`, `item_count`, `sessions_count`, `seeded_from`, `cycle_type`, `label`

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

---

### Canonical Functions (17)

All are `SECURITY DEFINER`. Where auth-scoped, they use `auth.jwt()->>'sub'` — **never `auth.uid()`**, which returns the Clerk string ID rather than an internal UUID. The event trigger is listed last.

| Function | Purpose |
|---|---|
| `bootstrap_new_user(p_clerk_id, p_email, p_invite_code, p_full_name)` | Atomic onboarding. **4-arg is canonical** — prod had 4 overloads; 3 dead ones dropped in baseline. |
| `get_current_household_id()` | Returns calling user's household UUID. Used by RLS policies to avoid self-referential recursion. |
| `get_current_user_id()` | Returns calling user's internal UUID from Clerk sub. |
| `get_household_id_for_current_user()` | Near-duplicate of `get_current_household_id` — **KNOWN DEBT: consolidate.** |
| `get_user_id_from_clerk()` | Near-duplicate of `get_current_user_id` — **KNOWN DEBT: consolidate.** |
| `get_household_user_ids()` | Returns array of user UUIDs in the calling user's household. |
| `get_household_member_profiles()` | Returns member profiles for the calling user's household. |
| `get_list_items_for_household()` | Primary list read — returns rows with name/category/is_staple inline. Bypasses stale `auth.uid()` RLS. |
| `get_catalog_names_by_ids(p_ids uuid[])` | Batch catalog name lookup by ID array. |
| `insert_custom_catalog_item(...)` | Inserts a household-owned catalog item. |
| `insert_list_item(...)` | Inserts a `list_items` row. |
| `delete_custom_catalog_item(p_catalog_item_id)` | Hard-deletes a custom catalog item + cascades to referencing rows. |
| `get_active_cycle(p_household_id)` | Returns the current open provision cycle. |
| `close_cycle(p_household_id)` | Archives a cycle — upserts items forward (targets `list_items_household_catalog_unique`), clears badges. Live version supersedes the 005 file. |
| `archive_trip_items(...)` | Archives trip items at session close. |
| `match_known_store(p_lat, p_lng, p_household_id)` | Bounding-box pre-filter + Haversine nearest-store lookup (no PostGIS). Returns closest store within `radius_m`; app enforces the radius. This IS the "auto-select via GPS" behavior from Scenario D. |
| `get_my_households()` *(migration 001)* | Returns `(household_id, name, role)` for ALL of the caller's active, non-deleted memberships, `joined_at ASC`. SECURITY DEFINER — bypasses the `household_members` SELECT policy (which is scoped to the active household). Identity resolved via `get_current_user_id()` internally; takes no user-id parameter. Applied to DEV; prod pending. |
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
- **Migrations 001 + 002 applied to DEV only** — prod application pending before multi-household ships.

---

### Views

#### `category_avg_prices`
Aggregates average `price_per_unit` per category across all list_items with real prices. Used as fallback estimate in the UI with a `~` prefix. Unrestricted (expected — inherits RLS from underlying list_items at query time).

---

### Queued Migrations (not yet live)

| Migration | Contents | Status |
|---|---|---|
| — | `price_history` | Phase 3 |
| — | `receipts` | Phase 3 |
| — | `household_category_overrides` | Queued — designed, not built |
| — | `household_audit_log` | NEW — concept wanted (who-did-what-when); use cases TBD; must stay distinct from behavioral/analytics event stream |

---

## Design Principles

- **The shared list is sacred.** No per-user view preference (Hide, filter) ever suppresses what the household has put on the shared list. Personalization lives in the view layer; the list is shared truth. *(Established June 8 — the principle behind the per-user-hide fix.)*
- **Hide vs. Delete are different verbs for different scopes.** Hide = personal view preference (any item, per-user, reversible). Delete = household action on ownership (custom items only, household-wide, cascades). Item type (`is_global`) determines which verbs are available. See `SPEC_hide_delete.md`.
- **Own the data from day one.** No vendor lock-in on the data layer.
- **Capture behavioral signals silently.** Sequence, location, timing — no user configuration.
- **Soft delete everything.** Never hard delete user data.
- **Schema stays ahead of the roadmap.** Add role fields and source fields early; populate later.
- **Prices are infrastructure, not UI.** Manual price entry creates friction. Price data builds passively through receipt scanning.
- **Merge don't duplicate.** When multiple users add the same item, merge with quantity increment + contributor attribution.
- **`window.location.reload()` is an anti-pattern.** Always use `refreshCatalog()` instead.
- **Two roles only (owner/member). UI shows capability, not role nouns.** Internal shorthand "captain/crew"; DB stores owner/member; product surfaces a Remove button, not a "Captain" badge. No nautical labels in the product.
- **Switcher reveals progressively.** No switcher chrome at 1 household. A tappable household-name sub-line appears only at 2+ households. "Create new household" is the act that unlocks it. Zero friction for the common case.
- **Store awareness is its own arc, sequenced after multi-household ships.** Don't interleave features. Foundation is already designed (migration 005); the arc begins with verification, not design.
- **Vercel CI treats ESLint warnings as errors.** All declared variables must be used before pushing to main.
- **Stable UUID is the key for all item actions; name strings are display only.** `catalog_item_id` from `listRows` is the durable identifier for every list/catalog operation (`toggleChecked`, `removeFromList`, `hideItem`, `deleteItem`). Item names are used only for optimistic UI state keys and display. Name-keyed lookups into `catalogRef`/`catalogMap` are a fallback of last resort, not the primary path. *(Established Jun 16 — the root cause of two separate name-key bugs: multi-session sync chain + "not in catalog" on rolled-forward items.)*

---

## Key Patterns

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

### SECURITY DEFINER helpers break RLS recursion *(June 12)*
Policies on `household_members` that self-reference trigger `infinite recursion detected in policy for relation "household_members"`. The fix: write policies as `household_id = get_current_household_id()` where `get_current_household_id()` is a SECURITY DEFINER function that reads `household_members` without re-triggering the policy. This is the pattern in prod's live RLS (captured in `008_policies.sql`). The phase-1 migration files used self-referential subqueries and must not be re-applied.

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

### id-based toggleChecked *(Jun 16)*

`toggleChecked(itemName, catalogItemId)` now resolves the target row via `catalogItemId` passed from the caller (carried on `listRows` → `shoppingList` items → tap handlers). Falls back to `catalogRef.current[itemName]?.id` only if no id arrives. Eliminates "not in catalog" failures on rolled-forward items whose names may have diverged from the current catalog map.

### Active Household Context *(built Jun 17 — `src/contexts/ActiveHouseholdContext.js`)*

App-level context that is the single source of truth for which household is active.
- **Provider props:** `getToken`, `clerkId` (same values `useProvisions` receives from Clerk's `useAuth`/`useUser`).
- **State exposed:** `myHouseholds` `[{id, name, role}]`, `activeHouseholdId`, `loadingHouseholds`, `switchHousehold(id)`, `hasMultiple`.
- **Data source:** `db.rpc("get_my_households")` — maps `row.household_id` → `id`. `getTokenRef` stabilization pattern (per `useProvisions`). `myHouseholdsRef` kept in sync so `switchHousehold` validates without stale closure.
- **Resolution:** reads `localStorage("activeHouseholdId")`; if valid in `myHouseholds` use it, else fall back to first returned (`get_my_households` orders `joined_at ASC` = oldest = default).
- **Mounting:** wraps `ShoppingListApp`'s return JSX in `App.js`. `HouseholdDebugLog` null-component hosts the hook call (a component cannot consume a provider it renders). ⚠️ Temp verification `console.log` still present — remove next session.
- **Critical risk (unresolved):** `useProvisions` + realtime subscriptions must tear down and re-subscribe when the active household changes. Not yet implemented — the switcher UI is not yet built.

### App-Level Toast *(designed Jun 16, not yet built)*

Single-slot app-level toast — the first in-app notification primitive. Design:
- State: `{message} | null` held in `App.js`.
- `showToast(message)` sets it; `setTimeout` (~2.5s) clears it; a new call replaces the current toast (no queue).
- Fixed-position pill, rendered in `App.js` so it outlives the modal that triggered it.
- First use: household-create confirmation. Intended to be reused for: item added, list rolled, etc.

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

---

*Velayo, Inc. — velayo.ai — dan@velayo.ai*
*390 NE 191st St STE 93618, Miami, FL 33179*
