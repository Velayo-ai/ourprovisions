# SPEC_store_identity.md

**Scope:** OurProvisions · a new global `stores` table, `known_stores` as the household↔store link, and the resolver that creates them · Phase 2 prerequisite
**Status:** ACTIVE — Step 0 must report before any DDL (three reads that can change the shape).
**Authored:** 2026-09-20 (design chat)
**Depends on:** migration `053` (`SPEC_learning_qualification.md`) landing first, so the Anchored leg has something to qualify against.

---

## Why

Confirmed on **both** databases (2026-09-20, read-only):

| | prod | dev |
|---|---|---|
| shopping sessions | 25 | 47 |
| sessions with `store_id` set | **0** | **0** |
| rows in `known_stores` (live / all-time) | **0 / 0** | **0** |
| sessions with `store_name_raw` | 3 | 7 |
| sessions with GPS | 3 | 27 |

Capture works — GPS and the raw store name reach the session. `match_known_store` exists. **Nothing ever promotes a raw name into a store row**, so the matcher has an empty table to match against, by construction, forever. This is not a bug; it is an unimplemented half of a handshake.

Everything store-shaped is blocked behind it: aisle-order learning cannot qualify a single session (the Anchored leg), and no layout — learned or inherited — has anywhere to live.

It also has product pull. Store-aware list ordering is the one feature a stranger asked for **before being shown it** (demo, 2026-09-15). It is the reason someone tries the app.

---

## The product constraint that shapes this

**The app learns the store. It never asks the user to describe it.**

A layout the household types in is configuration — the user doing the system's work for a benefit the system should deliver itself. That is the same mistake as asking "was this trip real?" at Wrap Up, and it is rejected for the same reason.

Cold start is therefore solved by **priors, not questions**, in three tiers:

1. **Chain** — chains standardize layouts deliberately. The first Market Basket anyone shops teaches a rough Market Basket prior, so a household entering a Market Basket in a town nobody has shopped starts warm.
2. **Store** — anyone who has shopped *this* store contributes. The second household at Market Basket Madbury inherits the first one's route.
3. **Household** — your own trips refine on top; your route is yours, and you may skip an aisle every time.

Trip one is grouped by category, exactly as today. Not magic, no worse than the current app, and nothing was promised otherwise.

**The line, and it is the whole spec:** *identifying* the store is a fact about right now — one tap in the store prompt that already exists, eventually just GPS. *Describing* the store is the app's job forever, and never a question.

This spec builds identity only. The layout learner is a separate spec and does not exist yet.

---

## Decisions

| # | decision | rationale |
|---|---|---|
| **D1** | **Two levels: a global `stores` table (a real-world place) and `known_stores` as the household↔store link.** `known_stores` keeps its household scope and its RLS; it gains `store_id → stores.id`. | Priors at chain and store level are impossible if a store is a per-household private row — there is nothing to inherit from. Splitting identity (global) from relationship (household) gives exactly the three tiers above, and keeps each household's own naming, history and refinements private. |
| **D2** | **`shopping_sessions.store_id` keeps pointing at `known_stores`.** The chain is session → known_store → store. | Purely additive; no FK change on a live table, and the session's store stays scoped to the household that made it. |
| **D3** | **The global `stores` row carries no household or user reference. At all.** Not `created_by`, not `household_id`, not a creator audit column. | A store is a public place, but *who created the row* would reveal where a household shops. Absent beats restricted — an unwanted column cannot leak, a policy can be misread later. Same reasoning as "unwanted rules must be absent, not merely weaker." |
| **D4** | **Chain is a normalized slug on `stores` (`chain_slug`), not a table, in v1.** "Market Basket #23", "MARKET BASKET", "Market Basket Madbury" → `market-basket`. | The chain prior is a `group by chain_slug` until it needs its own attributes. A table now is a join with nothing in it. One-line ALTER to normalize later, same reasoning as 046's CHECK-not-enum. |
| **D5** | **Creation happens inside a SECURITY DEFINER resolver RPC. No client INSERT on `stores` ever.** `resolve_store(p_household_id, p_name_raw, p_lat, p_lng)` returns a `known_stores.id`, creating the global store and the household link as needed. | A globally-visible table written directly by clients is a vandalism and dedup surface. One entry point means one place to improve matching. Follows 051: `is_member_of` first statement, `search_path` pinned, ACL to `authenticated` only. |
| **D6** | **The household never sees another household's naming.** The label shown in the UI comes from the household's own `known_stores` row. The global row's canonical name is used for matching and priors only. | Contains vandalism and personal shorthand ("the good one") by construction rather than moderation. A joke name cannot propagate to another household's screen. |
| **D7** | **Match by geography first, name second, and only within reach.** With GPS: an existing store within a small radius wins; else a normalized-name match among nearby stores; else create. **Without GPS: match only against this household's own `known_stores` history**, never the global table — else create a store with no geo. | Name-only matching against a global table would confidently merge Market Basket Madbury with Market Basket in another state. Absent location, the household's own history is the only trustworthy context. |
| **D8** | **Duplicates are accepted in v1 and merged later, never prevented by asking.** | The alternative is a disambiguation prompt — a question, which this spec exists to avoid. Two rows for one store degrade a prior; they do not corrupt a household's own data, since the household's link points at whichever row it matched. A merge path is a later spec. |

**Deliberately not in this spec:** the layout learner itself; cross-household layout *reads* (this spec creates the shared entity those will hang on, nothing more); a store merge/admin path; chain as its own table; any automatic GPS-only store selection that removes the existing prompt.

---

## Invariants (→ `ARCHITECTURE.md`)

- ★ **Identify, never describe.** The app may ask *where you are*. It may never ask *what the store looks like*. Any feature requiring the household to describe a store's layout is out of bounds by construction.
- ★ **Global identity, household relationship.** `stores` is a place; `known_stores` is a household's relationship to it. Anything private belongs on the link, never on the place.
- ★ **The global store row references no household and no user.**
- ★ Store creation happens only through the resolver RPC.

---

## Step 0 — read and report before any DDL

Three reads. Any of them can change the shape of this spec; report and stop rather than adapting silently.

1. **`known_stores`' actual columns and RLS.** Does it have `household_id`? What holds the name today, and is there any geo? Its policies were repaired by `014` to use `is_member_of()` — confirm that is still what's live, by reading `pg_policies`, not the migration file.
2. **`match_known_store`'s live definition** (`prosrc`, not `pg_get_functiondef` — it truncates). Its signature and matching logic decide whether D7 extends it or replaces it.
3. **`shopping_sessions`' store-related columns** and the client path that sets them (`setSessionStore`, `storeSuggestions`, the store prompt). Confirm `store_name_raw` is the only thing captured today and that nothing else writes `store_id`.

If `known_stores` turns out to be **global already** (no `household_id`), D1 collapses to adding `chain_slug` plus a household link table, and the spec needs revisiting before build.

---

## Change shape (for Claude Code; not the diff)

Migration number assigned at point-of-build from the live catalog.

1. **`stores`** — `id`, `canonical_name`, `chain_slug`, `lat`, `lng`, `created_at`, `updated_at`, `deleted_at`. **No household or user column** (D3). RLS on: `SELECT` to `authenticated`; **no INSERT/UPDATE/DELETE policy** — writes only via the resolver. Grants revoked from `PUBLIC`, `anon` and `service_role`, per 051.
2. **`known_stores`** — add `store_id uuid references stores(id)`, nullable during transition. Existing RLS untouched.
3. **`resolve_store(...)`** — SECURITY DEFINER, `is_member_of` as the first statement raising `42501`, `search_path` pinned, ACL to `authenticated` only. Implements D7's ladder, normalizes `chain_slug` (D4), returns the `known_stores.id`. Idempotent for a repeat visit: same inputs, same row, no duplicate.
4. **Client** — the existing store prompt calls `resolve_store` where it currently writes `store_name_raw`, and sets `shopping_sessions.store_id` from the returned id. **No new UI.** The prompt's copy, chips and D10 behaviour ("ask, don't guess; sessions are per person") are untouched.

---

## Verification

Dev first. Reads, never a trusted 2xx — remember 041: a write no policy admits matches zero rows and raises **no error**.

1. Schema and policy read-back on both tables: `stores` has no household or user column; its policy set is SELECT-only; grants match 051's shape.
2. Anon probe: `resolve_store` with no JWT → `42501`, and no row created.
3. **First visit** — a session with GPS and a raw name creates exactly one `stores` row, one `known_stores` row, and sets `sessions.store_id`. Read all three back.
4. **Repeat visit, same household** — same store, no new rows, `store_id` set again.
5. **Second household, same store** — reuses the **same** `stores` row and creates its **own** `known_stores` row. This is the D1 guarantee that priors are possible at all; if it fails, stores are still private and the feature cannot work.
6. **Chain normalization** — "Market Basket #23" and "MARKET BASKET" at different coordinates produce two stores sharing one `chain_slug`.
7. **No-GPS path** — a session with a name and no GPS does not match a distant global store; it matches only this household's history, or creates.
8. **053's Anchored leg comes alive** — a session that just resolved a store now reports the Anchored leg true in `aisle_order_sessions`, where every session previously reported `no_store`.

Done when 1–8 pass on dev, the four invariants are in `ARCHITECTURE.md`, and one real trip on prod resolves a store end to end.

---

## Risks

- **Duplicate stores.** Accepted (D8). Two rows for one place weaken a future prior; they do not corrupt any household's own data. Watch the count of `stores` versus distinct `chain_slug`+geo clusters; a merge path is a later spec.
- **GPS is rare in practice** — 3 of 25 prod sessions. The no-GPS path (D7) will be the common one at first, which means early stores are matched from household history alone and inter-household sharing starts slow. Expected, not a defect; it improves as GPS permission and usage grow.
- **A shared table invites a shared-data question.** D3 and D6 keep household identity and naming off the global row, but this is the first genuinely cross-household entity in the schema. The crew RLS bug (Clerk-string-vs-uuid) is a standing reminder that cross-household access is where this codebase has been bitten; nothing here reads another household's rows, and that boundary should be re-argued explicitly before the layout learner does.
- **Chain slugs are a heuristic.** "Hannaford" and "Hannaford Supermarket" normalize together; a regional chain with an idiosyncratic name may not. Wrong-slug only weakens a prior — it never misroutes a household's own data.

---

## Step 0 — reads and decisions (2026-09-20, Claude Code; confirmed by Dan)

Read-only on both databases. **D1 does not collapse**: `known_stores` is household-scoped
(`household_id uuid NOT NULL → households`), so it is already the link and `stores` is new.

| read | finding |
|---|---|
| 1 `known_stores` | Columns: `id`, `household_id NOT NULL`, `name NOT NULL`, `chain`, `lat NOT NULL`, `lng NOT NULL`, `radius_m default 150`, `visit_count default 1`, `last_visited_at`, `confirmed_by_receipt default false`, `added_by → users`, timestamps, `deleted_at`. RLS on; three live policies identical on dev and prod — select / insert / update, each `is_member_of(household_id)`, no delete (the 014 repair is what is live). Grants: `authenticated` full, **no anon entry**. Indexes on `household_id` and `(lat, lng)`, both partial on `deleted_at is null`. **Zero rows on both databases.** |
| 2 `match_known_store` | `(p_household_id uuid, p_lat, p_lng double precision) returns uuid`; SECURITY DEFINER, `search_path` pinned, 051 membership check first, ACL `{postgres, authenticated}`. Body: ±0.05° bounding box, household-scoped, nearest by planar distance, `limit 1`. No name matching; `radius_m` unused. Byte-identical on dev and prod (line endings normalised). **No client code calls it** — it has never been invoked. |
| 3 session store path | `ensureSession` writes `gps_lat` / `gps_lng` at session insert when the browser grants position. `setSessionStore` writes only `store_name_raw` on the caller's own open session (reads the row back — 041). The store prompt is a chip picker over the partner's session name + the household's distinct past raw names. **Nothing writes `store_id`, anywhere.** |

**Decisions taken on the findings:**

- **`known_stores.lat` / `lng` → nullable, in this migration.** Three of twenty-five prod sessions
  carry GPS; a no-GPS path that cannot create a link means resolution almost never fires and the
  feature stays dead. Zero rows on both databases, so no data risk. **Column semantics, to be written
  at the column:** a `known_stores` row with null geo means *"we know you shop here by name; we don't
  know where it is."* A legitimate state, not a defect — and it upgrades itself: when a later
  GPS-bearing session resolves to the same store, `resolve_store` fills the coordinates in.
  Progressive enrichment, no question asked. **This is part of the resolver's job.**
- **Keep `match_known_store`.** Not wired, not dropped here. `resolve_store` supersedes it and says so
  in its header. Retiring it is a separate NEXT item once `resolve_store` is proven on prod — dropping
  a function in the same migration that adds two tables and an RPC is stacking, and the codebase
  already carries one function that lives only in the live database with no migration file.
- **Reuse, don't duplicate:** the resolver maintains the existing `visit_count` and `last_visited_at`
  on the link row. `confirmed_by_receipt` is the Phase 3 forward-reference; leave it alone, invent no
  parallel column.
- **Build order unchanged:** this spec lands after 053 is on prod and verified there.
