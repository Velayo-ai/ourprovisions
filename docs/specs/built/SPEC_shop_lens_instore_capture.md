# SPEC — Shop lens, in-store Add, and the first smart-ordering capture

**Status:** Active — designed, ready to build
**Scope:** OurProvisions
**Migration:** next unclaimed number — **046 at time of writing**; confirm at point-of-build (the 027/031 lesson)
**Design session:** 2026-09-10
**Approved mockup:** `docs/mockups/mockup_shop_lens_instore.html` — **the tiebreaker if this prose disagrees**
**Supersedes:** the three-phase `CycleIcon` on the Shop tab (App.js ~683 comment block: `funnel → equal → flat`). Browse keeps its own cycle icon — out of scope here.
**Related:** `SPEC_rls_and_rpc_authorization.md` (policy idiom), `032_rls_cycle_tables.sql` (session RLS, verified by inspection only until this ships), `STRATEGY_consumption_signal.md` (why events)

---

## Summary

Four things, one session, one migration:

1. **The Shop tab's three-phase cycle becomes one two-segment lens** (Aisles | A–Z) plus a place for checked items — a collapsed **"In cart"** tray at the bottom of the list. Hide/show checked stops being a control.
2. **Add from the aisle.** A floating + opens a search sheet that reuses Browse's exact add path. Items land unchecked, in their aisle, tagged "added here" for the trip.
3. **Shopping sessions finally get wired.** `startSession()` has existed unwired since the Phase 2 sketch; the first in-store action now starts one, with an optional one-line store prompt.
4. **Every in-store action is recorded as an event** — `added_in_store`, `checked`, `unchecked` — in a new append-only table. This is the capture side of Phase 2 smart list ordering. The learning side is designed here and built later.

Voice is **designed into the Add sheet and not built.**

Time box: ~5 hours. If it slips, the lens + tray + Add sheet ship and the store prompt is the first thing to cut.

---

## Why (the decisions)

**D1 — The tri-state failed because it fused two axes.** `CycleIcon` cycled through *checked shown → checked hidden → flat*. Hide/show and grouped/flat are independent; a cycle makes one state unreachable (flat + shown) and, after two weeks, unmemorable. Restoring them as separate concerns is the fix, not a relabel.

**D2 — Checked items get a place, not a toggle.** Nobody wants checked rows interleaved with unchecked ones while pushing a cart; that state exists only because the cycle offered it. Checked items sink to a collapsed **In cart** tray at the bottom, in both views. Un-checking happens from inside the tray. The hide toggle disappears because the thing it hid now lives somewhere visible.

**D3 — A control shows its state, never its next state.** A first draft labeled the lens button by destination ("A–Z" while in Aisles). Dan read it as the current state within seconds — the tri-state problem again. The lens is a two-segment control with both words visible and the active one filled. Record this as a Shop-tab principle.

**D4 — "Aisles", not "Categories".** Once store ordering learns a layout, grouping *is* aisle order. Name it for what it becomes.

**D5 — Add is a floating +, not a bar or a pill.** A permanent search field is the heaviest thing on a phone screen; a labeled pill reserved a band of real estate. A 56px + in the thumb corner, floating over the list, reserving nothing. The mic will live in the same sheet, so voice adds no header cost later.

**D6 — In-store adds land unchecked.** "I realized I needed X" usually precedes grabbing X. Also structural: a checked-on-add row would vanish into the tray the instant it appeared.

**D7 — Unknown items create with category `Other`.** Dan's call. `Other` is **not** a seed category — the set is open and the 📦 fallback covers it — so `Other` comes into existence as a new aisle on first use. Acceptable; categorize later from Browse. A category picker in the sheet was rejected as cockpit.

**D8 — The record is an event log, not columns on `list_items`.** `list_items` rows are **reused across cycles** (the `008` upsert revives the same `(household, catalog_item)` row), so `created_at` is the first-ever add and any `checked_*` column holds only the latest trip. Learning a layout needs every trip. `list_items.checked_by / session_id / checked_sequence / checked_lat / checked_lng` are dead columns (never written — `toggleChecked` updates `status` only) and are **superseded by this spec**; drop them in a later cleanup migration, not in 046.

**D9 — Store is a property of the session, not the event.** One GPS fix at session start places the trip; per-tap GPS would cost battery for nothing. `store_id` stays null until Phase 2 recognition; `store_name_raw` from the prompt is what makes the data readable before then and what seeds `known_stores` later.

**D10 — Ask the store, don't guess it.** Sessions are per person. Two people can shop one list in two stores at once, so prefilling from a partner's recent session would put the wrong store in the eyebrow. The prompt asks every time, with the partner's current store as the **first chip** — same store is one tap, different store is one tap.

**D11 — Sessions expire after 8 hours** without Wrap up. Per session, so an abandoned one on one side never touches the other's.

**D12 — Event writes are best-effort and never block the tap.** The event insert fires after the status update commits and its failure is logged, not surfaced. Shopping is the product; telemetry is not allowed to slow it.

---

## Data model

### New table — `list_item_events` (append-only)

```sql
create table public.list_item_events (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id),
  list_item_id     uuid references public.list_items(id),          -- nullable: row may be soft-deleted later
  catalog_item_id  uuid not null references public.catalog_items(id),
  user_id          uuid not null references public.users(id),
  session_id       uuid references public.shopping_sessions(id),   -- nullable: an add can precede GPS resolution
  cycle_id         uuid references public.provision_cycles(id),
  event_type       text not null check (event_type in ('added_in_store','checked','unchecked')),
  sequence         integer,                                         -- client counter per session; tiebreaker only
  created_at       timestamptz not null default now()
);
create index on public.list_item_events (household_id, session_id, created_at);
create index on public.list_item_events (household_id, catalog_item_id);
```

`event_type` is a CHECK, not an enum, so `added_browse` / `added_meal` / `added_voice` land later as a one-line migration. **Only the three values above are written tonight.**

Ordering truth is `created_at` (server `now()`, so server-ordered, not phone-clock-ordered). `sequence` is a client-side counter reset per session, used only to break ties in bursts and offline retries.

### RLS — copy the `032` idiom exactly

- `select` — `is_member_of(household_id)`
- `insert` — `is_member_of(household_id) AND user_id = (users row for auth.jwt()->>'sub')` — write only as yourself
- **no update, no delete policies.** Append-only by construction. (Same shape as `list_item_meals` — and remember `041`: a client write to a table with no matching policy matches zero rows and raises **no error**. That is the intended behaviour here, but it means the verification must read the table back, never trust a 2xx.)
- `revoke all on public.list_item_events from anon;` — no anon path, no exceptions. Re-read `proacl`/grants after applying (the `045` lesson).
- Apply script ends with a row-returning `SELECT` (the SQL editor never surfaces `raise notice`).

### `shopping_sessions` — no schema change

Existing columns cover it: `user_id`, `household_id`, `cycle_id`, `store_id` (null for now), `store_name_raw`, `gps_lat/lng`, `started_at`, `ended_at`. This spec is the first thing that **writes** to it. Its `032` policies were verified by inspection only; this build is their first live traffic. **Named risk — verify on dev with two accounts before promote.**

---

## Session lifecycle

| Moment | Behaviour |
|---|---|
| First in-store action on Shop (first check **or** first in-store add) | `startSession()` — existing hook, now called. Captures GPS best-effort (existing 4s timeout). Then shows the store prompt if `store_name_raw` is unset. |
| Store prompt | One card above the list (mockup frame D). Chips = household's distinct `store_name_raw` values, most recent first, **partner's currently-open session store first if one exists**. "Somewhere else…" → text field. **Skip** is honest — GPS still captured. Answer collapses into the eyebrow line. |
| Eyebrow line | *Shopping at **Market Basket** ▾* — tap re-opens the prompt. Only rendered while a session is open. |
| Wrap up | Ends the session (`ended_at`) — existing `endSession` path. |
| Expiry | On Shop mount and on each in-store action: if the open session's `started_at` is > 8h ago, end it and start fresh. Client-side check; no cron. |
| Partner's checks | Status lives on the shared row, so a partner's check drops the item into *your* tray with their initial. Correct — it's bought. Their event carries *their* session. |

---

## UI — build from the mockup

Header, top to bottom: store eyebrow (session only) → `[count] [Aisles|A–Z] [Wrap up]` → progress bar. Nothing else. The descriptor line under the header (`declutter-desc` / phase copy) is **deleted**.

**Vocabulary is one set:** "4 of 12 **in cart**", tray titled "**In cart**", flat eyebrow "8 **to find**". The word "checked" leaves the Shop tab.

**Aisles view** — today's grouped render, minus the phase machinery. Rows unchanged.

**A–Z view** — a different mode, not the same rows minus headers: rows ~8px vertical padding (vs 14), 18px check circle, no provenance lines, no prices (Trip Total stays), qty inline, Playfair letter dividers. Frame B.

**In cart tray** — bottom of the list in both views. Collapsed by default; expanded state persists for the trip (component state, not DB). Hidden entirely at 0 items. Rows inside are struck-through at 55% opacity; tapping the circle un-checks and the row animates back up into its aisle. A small initial on rows the current user did not check. A checked row animates *down* into the tray so the person sees where it went.

**Floating +** — 56px espresso circle, `position: fixed`, bottom-right above the footer, floats over content, **reserves no space**; the only clearance is one row-height of padding at the very end of the list so the tray chevron isn't covered when scrolled to the bottom. Hidden while the Wrap-up modal or Add sheet is open. No label.

**Add sheet** — bottom sheet, grab handle, title "Add something", search box autofocused. Reuses Browse's `searchResults` + `hiddenLiveMatch` + `addSearchedItem` **unchanged in behaviour** — extract the search box + results list into a shared component; do not fork the logic (the hidden-item reveal rule is load-bearing). Result rows show name + category and add at one tap. No results → "Add **'{typed}'** as a new item…" → `addSearchedItem('Other')`. On add: sheet closes, row appears in its aisle with an **"added here"** tag (this trip only, teal outline pill — mockup frame A), and the event is written. Mic button present, styled as the Galley's `.op-mic-btn`, **disabled with a `LATER` badge** — do not wire it.

**Lens state** — persist the Aisles/A–Z choice per device (same mechanism the phase index used, if any; otherwise component state). Default Aisles.

---

## Writes — who writes what, when

| Action | `list_items` | `shopping_sessions` | `list_item_events` |
|---|---|---|---|
| First check / add of trip | — | insert (existing `startSession`) | — |
| Store chip / text | — | update `store_name_raw` (own session only) | — |
| Check | `status = 'bought'` (existing) | — | `checked`, after the update resolves |
| Uncheck | `status = 'pending'` (existing) | — | `unchecked` |
| In-store add | via `addSearchedItem` → existing `updateQty` / `insert_custom_catalog_item` | (starts session if none) | `added_in_store` |
| Wrap up | existing archive path | `ended_at` (existing) | — |

The event insert is a plain client insert (RLS-gated), not an RPC. It runs **after** the primary write succeeds and is wrapped so that its own failure never reaches the user.

---

## The learning side — designed, not built (Phase 2)

For each `(household, store)`: take every ended session with ≥ N checks; for each `checked` event compute `position = rank / total_checks_in_session` (0 first, 1 last); discard a `checked` followed by `unchecked` on the same item within 10s (mis-tap). Map each event to its category via `catalog_item_id`. Rank categories by **median position** across sessions. That ranked list is the store's aisle order.

Apply only after **≥ 3 sessions** at that store; fall back to `CATEGORY_ORDER` until then. Market Basket (dairy near 0, produce near 1) and Hannaford (the reverse) fall out of the same query with no store-specific code. Household-scoped because `known_stores` is; cross-household layout sharing at the same GPS point is a Phase 2+ conversation.

Not in this build: no query, no UI, no `known_stores` rows. Capture only.

---

## Voice — designed, not built

Mic in the Add sheet reuses `startListening` / `stopListening` and the `.op-mic-btn` listening state from Ask the Galley. Transcript fills the search box and runs the identical add path — no LLM for a single item. Multi-item utterances ("eggs, milk and butter") split on commas and "and" first; Claude parsing only if that proves flaky. Event type for these will be `added_voice` (one-line CHECK amendment when built). `micBlocked` handling carries over.

---

## Verification (dev, before any promote)

1. Cycle icon gone from Shop; Browse's untouched. Aisles|A–Z toggles; choice survives a reload.
2. Check an item → it animates into the tray; count reads "1 of N in cart"; tray shows "1 item". Un-check from the tray → returns to its aisle.
3. Tray behaves identically in A–Z. Tray absent at 0.
4. First check of a trip creates a `shopping_sessions` row **for this user only** (query it); store prompt appears; chip writes `store_name_raw`; eyebrow renders; Skip leaves it null and eyebrow hidden.
5. **Two accounts, same household:** A starts a trip at "Market Basket"; B's first check shows the prompt with "Market Basket" as first chip, B picks "Hannaford"; two session rows, two stores. B's check drops the item into A's tray with B's initial.
6. `list_item_events`: one `checked` row per check, one `unchecked` per un-check, one `added_in_store` per sheet add — **read the table back**; a 2xx is not evidence (the `041` lesson). `user_id` matches the actor, `session_id` matches that user's open session.
7. As account A, attempt to insert an event with B's `user_id` → **zero rows, no error** (policy rejects silently). Attempt as `anon` → rejected outright.
8. Add sheet: catalog hit adds unchecked into its aisle with the "added here" tag; hidden-item reveal still works (hide "Limes" on Browse, add "Limes" from Shop → un-hidden, not duplicated); no-results path creates under `Other`, which appears as a new aisle.
9. + hides while Wrap-up modal and Add sheet are open; last row + tray chevron reachable when scrolled to the end.
10. Wrap up sets `ended_at`. Manually backdate `started_at` by 9h on dev → next check starts a fresh session.
11. Kill network, check an item → optimistic check holds (existing behaviour), event insert fails silently, no toast.

Prod promote is a separate gate: migration first, then `dev→main`, then a real trip. **Dan's next real grocery run is the live test** — schedule the promote so it lands before it.

---

## Out of scope tonight

Browse's cycle icon · dropping the dead `checked_*` columns · `known_stores` writes · any ordering query · voice wiring · `added_browse` / `added_meal` events · per-event GPS.

## Open questions (build-time, not design-time)

- Does the phase index persist anywhere today? If yes, reuse that slot for the lens; if no, component state is fine for v1.
- Where does the lens/tray/Add sheet code live — inline in `App.js` (current pattern) or is this the moment to lift Shop into its own file? Claude Code's call; the spec doesn't care, the 6,000-line file might.

## ROADMAP_DECISIONS (for SESSION END)

| 2026-09-10 | Shop tab controls: state-not-destination labels; checked items are a place (tray), not a filter. Tri-state `CycleIcon` retired on Shop. |
| 2026-09-10 | Phase 2 smart-ordering capture begins via append-only `list_item_events` (046). `list_items.checked_*` columns superseded — drop in a later cleanup. Learning query designed (median normalized check position per category, ≥3 sessions), not built. |
| 2026-09-10 | `startSession()` wired for the first time; store captured as `store_name_raw` via a skippable prompt; sessions are per person, always asked, partner's store offered first; 8h expiry. |
| 2026-09-10 | Unknown in-store items create under `Other` (a new, non-seed category). |
