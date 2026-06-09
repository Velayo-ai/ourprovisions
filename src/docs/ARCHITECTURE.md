# OurProvisions — Architecture
*Last updated: June 8, 2026*

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
| Database | Supabase (PostgreSQL) | Project ID: `parpauldmbetptkmdwbd`, US East |
| Hosting | Vercel | Auto-deploys from `main` branch |
| DNS | Cloudflare | DNS only, not proxied |
| AI | Anthropic Claude API | Receipt scanning, smart suggestions, pantry vision |

---

## Repository & Git Workflow

- **Org:** `Velayo-ai` on GitHub
- **Dev branch:** `dev` — all active work committed here first
- **Production branch:** `main` — merge dev → main; Vercel auto-deploys
- **Local path:** `C:\Users\mr_dh\ourprovisions`

---

## Core Files

| File | Role |
|---|---|
| `src/App.js` | Main React component — all UI, tabs, modals, list rendering |
| `src/hooks/useProvisions.js` | All data logic — Supabase queries, state, real-time subscriptions |
| `src/supabaseClient.js` | Supabase client initialization with Clerk JWT auth |
| `public/index.html` | Shell — Open Graph tags, Clerk script, favicon |
| `CLAUDE.md` (repo root) | Claude Code standing context + Session Scribe routine |
| `src/docs/SESSION_LOG.md` | Rolling session history (newest on top); maintained by the Scribe |
| `src/docs/ROADMAP.md` | Now/Next/Later/Done + Decisions log |
| `src/docs/SPEC_hide_delete.md` | Implementation spec for the Hide/Delete build |

### Auth Pattern
Clerk is configured as a Third-Party Auth provider in Supabase via JWKS endpoint. JWT uses RS256 (not HS256). Legacy anon key format required. All Supabase calls include explicit `apikey` + `Authorization` headers. `SECURITY DEFINER` functions required for RLS helpers that call `auth.jwt()`. `bootstrap_new_user` RPC handles new user onboarding atomically.

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

### Migration Files (in order)

| File | Contents |
|---|---|
| `001_initial_schema.sql` | Full Phase 1 schema — all core tables |
| `002_harbor_crew.sql` | `velayo_crews`, `velayo_crew_members`, `crew_id` on households |
| `003_live_schema_audit_june2026.sql` | Delta audit — documents column drift, views, undocumented tables |
| `004_list_item_contributors.sql` | Contributor badges table (live as of June 1, 2026) |
| `005_provision_cycles_sessions_stores.sql` | `provision_cycles`, `shopping_sessions`, `known_stores`; `cycle_id` + `rolled_from_item_id` on `list_items`; `get_active_cycle`, `close_cycle`, `match_known_store`, `archive_trip_items` RPCs (live June 6, 2026) |

---

### Live Tables (public schema)

#### `users`
Maps Clerk user IDs to internal UUIDs. Created via `bootstrap_new_user` RPC on first login.
- `id`, `clerk_id`, `email`, `full_name`, `created_at`, `deleted_at`

#### `households`
One per family group. Each user belongs to one household (multiple household support queued).
- `id`, `name`, `created_by`, `crew_id` (→ velayo_crews), `created_at`, `deleted_at`

#### `household_members`
Join table. Realtime enabled.
- `id`, `household_id`, `user_id`, `role` (owner/member), `joined_at`, `deleted_at`

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
- Phase 2 forward refs: `session_id`, `checked_sequence`, `checked_lat`, `checked_lng`
- Phase 4: `deferred_reason`
- `created_at`, `updated_at`, `deleted_at`

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
- **Vercel CI treats ESLint warnings as errors.** All declared variables must be used before pushing to main.

---

## Key Patterns

### SHOP list renders from the RPC, not from catalogMap *(June 8)*
The SHOP list is grouped directly from `get_list_items_for_household`'s returned rows (`listRows` state — name, category, is_staple inline), NOT rebuilt from local `catalogMap`. This keeps `catalogMap` out of the display path, so a stale or incomplete local catalog can never drop a synced list row. The RPC is the single source of truth for what's on the list; rendering is a pure function of its response.

### refreshCatalog()
Replaces all `window.location.reload()` calls. Prevents jarring full-page reloads on mobile. Fetches fresh catalog data and updates state in-place.

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
