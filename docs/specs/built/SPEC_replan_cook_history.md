# SPEC — Re-plan keeps every cook: the cook log, `cook_meal`, and time-based leftovers

**Status:** Decided 2026-09-29 (design chat). Build on dev next (Claude Code). Prod is its own promotion day.
**Scope:** OurProvisions
**Replaces:** ROADMAP NOW P1 "Re-plan overwrites cook history" (+ the leftover-eligibility scope added 2026-09-28).
**Migration number:** take the next free number at build (`ls migrations/`). 058 exists only on paper inside `SPEC_meal_library_v1.md` and is not applied anywhere, so do not assume it.

---

## Why

`meal_placements` has one row per `(household_id, meal_id)`. Re-planning a meal whose placement is closed reopens that same row, and `appendPlacement` clears `cooked_at`, `ready_at` and `skipped_at`. So a household that cooks Salmon every week keeps at most one record of it, and the moment Salmon is re-planned, even that record is gone.

Three things read that record today and all three are wrong after a re-plan:

- **Made before** (library filter) drops the meal.
- **The Plan welcome** shows "Add your first meal" to a household that has cooked before.
- **The Leftovers sheet** drops a re-planned meal, and separately counts its window in wrap-ups, not days, so a household that rarely wraps up sees weeks-old meals (Pizza on dev, 2026-09-28).

The outcome half of the consumption signal (intention → receipt → outcome) is being overwritten. Live on prod for real households since 2026-09-23.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Cook history lives in a new append-only table, `meal_cooks`. One row per Cooked it.** The placement row is unchanged: it stays the plan's current state; the log is the history. | Frequency, not just recency, is the honest shape for the signal. Already needed by the 09-27 designs: "first Cooked it on a gifted meal" and the week's record on Home. Rejected: `last_cooked_at` on placements (keeps one cook), a row per plan instance (changes the PK every reader keys on). |
| D2 | **A cook is written only by a `cook_meal` RPC that closes the placement and inserts the log row in one transaction.** Clients get SELECT on `meal_cooks` and nothing else. | The history is the point of the fix, so it can't be best-effort. Two client writes would lose the cook silently when the second fails. With no client INSERT grant, a cook row can't be forged or duplicated from the browser. |
| D3 | **A cook is a server-confirmed transition.** `cook_meal` inserts a log row only if it actually closed an open placement. Zero rows closed (a partner already tapped it, or a double tap) → no log row, returns null. | Same rule as the 2026-09-21 `checked` fix: an event is a transition the server confirmed, never a closure's opinion. Two devices can't log one dinner twice. |
| D4 | **Leftover sources = open board meals ∪ meals with a cook in the last `LEFTOVER_WINDOW_DAYS` (4) days.** `fetchLeftoverCutoff` and its cycle read are deleted. | Leftovers are a fridge fact, not a shopping-cycle fact. 4 days is a starting point. **Leftovers is a helper, not essential — tune N by listening to households, not by reasoning.** Keep N in exactly one named constant. |
| D5 | **Made before = any meal with ≥ 1 row in `meal_cooks`.** The Plan welcome's copy follows automatically (it reads `madeBefore`). | One source of truth for "has this household cooked this". |
| D6 | **Skip and ready history are still overwritten on re-plan. Accepted.** | They matter far less than cooks. C (a row per plan instance) is the fix if that ever changes. |
| D7 | **`cooked_by` = the user who tapped Cooked it**, not necessarily the person who cooked. | The who's-cooking design session may add an assignment later; this column keeps its meaning and never needs a rename. |

## Schema (one migration, dev first)

```sql
-- NNN_meal_cooks.sql  (number taken at build)
begin;

create table public.meal_cooks (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  meal_id      uuid        not null references public.meals(id)      on delete cascade,
  cooked_at    timestamptz not null default now(),
  cooked_by    uuid        references public.users(id) on delete set null
);
-- FKs follow meal_placements (047): cascade with the household or a hard-purged
-- meal (meals are soft-deleted, so in practice never); a cook outlives its tapper.

create index meal_cooks_household_cooked_idx
  on public.meal_cooks (household_id, cooked_at desc);

alter table public.meal_cooks enable row level security;

create policy meal_cooks_select on public.meal_cooks
  for select to authenticated
  using (is_member_of(household_id));
-- NO insert / update / delete policies. Rows arrive only through cook_meal
-- (SECURITY DEFINER). Rows never change and never die (except by cascade).

-- Grants are load-bearing (046): revoke from all three by name, grant back SELECT only.
revoke all on table public.meal_cooks from public;
revoke all on table public.meal_cooks from anon;
revoke all on table public.meal_cooks from authenticated;
grant select on table public.meal_cooks to authenticated;
grant all    on table public.meal_cooks to service_role;
```

### `cook_meal(p_household_id uuid, p_meal_id uuid) returns timestamptz`

The 051 pattern, in this order:

1. `language plpgsql security definer set search_path = public, extensions`.
2. **First statement:** `if not is_member_of(p_household_id) then raise exception ... using errcode = '42501'`.
3. **Caller from the JWT**, never an argument. Derive the internal user id exactly as the 051 bodies do. Read one of them from `pg_proc.prosrc` on dev; don't take the helper's name from this spec.
4. The meal must belong to the household, be live, and be `kind = 'meal'` (no-shop cards have no Cooked it). Otherwise raise.
5. `v_now := now()`. Close the open placement:
   `update meal_placements set cooked_at = v_now, updated_at = v_now, updated_by = <caller> where household_id = p_household_id and meal_id = p_meal_id and cooked_at is null and skipped_at is null`.
6. **If no row was updated, return null and insert nothing (D3).**
7. `insert into meal_cooks (household_id, meal_id, cooked_at, cooked_by) values (p_household_id, p_meal_id, v_now, <caller>)`.
   **The same `v_now` is written to both tables.** The backfill guard below relies on it.
8. Return `v_now`.

ACL: `revoke execute ... from public, anon; grant execute ... to authenticated`. Read `proacl` back after apply (the 045 lesson: a fresh function carries Supabase's default grants).

### Backfill (same migration, after the table)

```sql
insert into public.meal_cooks (household_id, meal_id, cooked_at, cooked_by)
select mp.household_id, mp.meal_id, mp.cooked_at, mp.updated_by
  from public.meal_placements mp
 where mp.cooked_at is not null
   and not exists (select 1 from public.meal_cooks mc
                    where mc.household_id = mp.household_id
                      and mc.meal_id      = mp.meal_id
                      and mc.cooked_at    = mp.cooked_at);
commit;
```

- `cooked_by` comes from `updated_by`, which the close wrote at cook time. Closed rows are not reordered, so it is still the tapper. Close enough for history.
- The `not exists` guard makes the statement safe to re-run. **It is re-run once on prod after the client deploys** (see Promotion).
- Soft-deleted households' rows are included (e.g. "Board Walk (prod)"). They're history; `is_member_of` already hides them.
- **Cooks already lost to re-plan are gone.** Nothing records them (`list_item_events` holds checks, not cooks). Say so; don't reconstruct.

### VERIFY (row-returning, run in the editor, paste into the commit body)

One row with:

- `system_identifier` from `pg_control_system()`. The environment proof; it differs between dev and prod.
- Table and RLS: `rls_on = true`; policy counts `sel 1 / ins 0 / upd 0 / del 0`.
- Grants: `relacl` shows `authenticated=r/postgres` and no `anon` entry.
- Foreign keys: `household_fk = CASCADE`, `meal_fk = CASCADE`, `cooked_by_fk = SET NULL`; index count 2 (pkey + the household index).
- `cook_meal`: count 1, `prosecdef = true`, `proconfig` carries the pinned `search_path`, `proacl` has no `anon` and no bare `=X` (PUBLIC) entry, and `prosrc` contains `is_member_of`.
- Backfill parity: `cooks_rows` and `placements_cooked` (count of `meal_placements where cooked_at is not null`), expected equal at apply time.

## Client — `src/hooks/useProvisions.js`

- **`markCooked(mealId)`** calls `db.rpc("cook_meal", { p_household_id, p_meal_id })` instead of `closePlacement(..., "cooked_at")`.
  - Keep the optimistic close (the card mutes at once; the ✓ Cooked afterglow is unchanged).
  - **Non-null** return: add the cook to the local cooks map.
  - **Null** return (D3): reload placements and cooks, no toast, return true. The meal is cooked, just not by this tap.
  - **Error**: reload placements, toast as today.
- **Cooks state:** `cooks = { [mealId]: { lastCookedAt, count } }`, household-scoped.
  - Read: `from("meal_cooks").select("meal_id, cooked_at").eq("household_id", hh.id).order("cooked_at", { ascending: false }).limit(1000)`, reduced client-side. The limit is a known bound (years of cooking); a summary view replaces it when it matters.
  - Load it with the household (Effect 2) and after every `markCooked`. Reset it on household switch and in the sign-out reset, beside `placements`.
  - **Partner cooks:** don't add a poll. In `loadPlacements`, when any `cookedAt` in the new map differs from the previous one, re-read cooks once. A partner's cook changes a placement, so the existing 2 s Plan poll is already the change signal (the list-fingerprint pattern).
- **`madeBefore`** reads `cooks`, not `placements.cookedAt` (D5). Rewrite the "known limit of the single-row shape" comment block: it's no longer a limit.
- **Delete `fetchLeftoverCutoff`** and its export.
- `appendPlacement` is **unchanged**. Clearing `cooked_at` on the placement is now correct: the placement is the plan, and the log keeps the history.

## Client — `src/App.js`

- `const LEFTOVER_WINDOW_DAYS = 4;` in one place, commented as a starting point to tune from household feedback (D4).
- Delete `leftoverCutoff` state and the `fetchLeftoverCutoff` call in `openLeftoversSheet`. Record `leftoverSince = now − N days` when the sheet opens, so the memo is stable while it is open.
- `leftoverSources` = open board meals (non-no-shop, as today) ∪ library meals **not already open** whose `cooks[id].lastCookedAt >= leftoverSince`, sorted by `lastCookedAt` desc. Remove its dependence on `placements[..].cookedAt`.
- The Plan welcome needs no change: it reads `madeBefore`.
- `grep -n "fetchLeftoverCutoff\|leftoverCutoff" src/` returns nothing when done.

## Verification — dev, deployed preview, two accounts (DH + DT), read back from the tables

A 2xx is not evidence. Each step names the table read that proves it.

1. **Cook once.** Plan X, Add to Shop, shop, Wrap up (Ready), then Cooked it. `meal_cooks`: 1 row for X with `cooked_by` = DH. The placement's `cooked_at` equals that row's `cooked_at` exactly.
2. **Re-plan keeps it.** Plan X again from the library. The placement's `cooked_at` is null; `meal_cooks` still has 1 row. The library's Made before still lists X.
3. **Cook again.** Take X through to Cooked it. `meal_cooks` has **2 rows for X with distinct `cooked_at`**. *(The Done-when.)*
4. **The double tap.** DH and DT tap Cooked it on the same open card within about a second. Exactly **one** new row appears; neither device toasts; the card leaves both boards.
5. **Leftovers window.** Open the sheet. It offers open board meals plus X (cooked today). Backdate a dev test cook row to 5 days ago by SQL (dev only, named in the report). That meal is absent; at 3 days ago it is present. A meal both open and recently cooked appears once, in the board section. The Pizza case no longer appears.
6. **Welcome copy.** In a fresh dev household, the empty board says "Add your first meal". Cook one meal, re-plan it, then × it off the board so the board is empty. It now says "**Add a meal**".
7. **Probes.**
   - Anon-key REST call to `cook_meal` → `401` / `42501`.
   - A signed-in non-member calling `cook_meal` for DH's household → `42501`.
   - A signed-in member POSTing directly to `/rest/v1/meal_cooks` → refused. Read the table back: count unchanged.
8. **Backfill.** Every dev placement with `cooked_at` not null has exactly one matching `meal_cooks` row (the parity count from VERIFY).

`CI=true` build clean; `origin/dev..dev` listed and quoted before the push (the dev branch already carries unpushed docs commits); deployed bundle grepped for `cook_meal` present and `fetchLeftoverCutoff` absent.

## Promotion to prod (its own session, fresh eyes)

1. Migration in the prod SQL editor by Dan; VERIFY read against the table, with the prod `system_identifier`. Additive: the old client never reads `meal_cooks` and keeps working.
2. The client by the tree-identity method (the 2026-09-28 rule): `git diff dev main -- <paths>` empty, push range quoted, deployment READY.
3. **Re-run the backfill statement once after the deploy.** Between steps 1 and 2 the old client still closes placements directly and logs nothing. The `not exists` guard makes the re-run catch exactly those cooks and nothing twice (D2 step 7 is why).
4. Walk steps 1–3 and 5 on prod in a test household; read back over `supabase-prod-readonly`.

Rollback: the client only, via Vercel. The table, RPC and rows stay; the old client ignores them.

## Out of scope (logged, not built)

- Stopping clients from writing `meal_placements.cooked_at` directly (column-scoped grant). This belongs with the NEXT row "Extend the 051 authorization pass to table grants and column scoping".
- Undo for Cooked it.
- Cook counts or "last cooked" shown on library cards (Meal Library v1 can read `cooks` when it builds).
- The week's record on Home, the gifted-meal "How was it?" prompt, and who's-cooking assignment. All three now have their data source.
- Keeping skip/ready history across re-plans (D6).
- A `meal_cooked` RUM event.
