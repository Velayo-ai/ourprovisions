-- 058_meal_cooks.sql
-- SPEC_replan_cook_history.md — re-plan keeps every cook: the cook log,
-- cook_meal, and (client-side) time-based leftovers.
--
-- WHY
--   meal_placements has one row per (household, meal). Re-planning a meal whose
--   placement is closed reopens that same row and appendPlacement clears
--   cooked_at, so a household that cooks Salmon every week keeps at most ONE
--   record of it — and loses even that the moment Salmon is re-planned. Three
--   readers were wrong after a re-plan: the library's Made before filter, the
--   Plan welcome's copy, and the Leftovers sheet. The outcome half of the
--   consumption signal (intention → receipt → outcome) was being overwritten.
--
-- WHAT (spec D1–D3, D7)
--   * meal_cooks — append-only log, one row per Cooked it. The placement row is
--     unchanged: it stays the plan's CURRENT state; this table is the history.
--   * cook_meal(p_household_id, p_meal_id) — the ONLY write path. Closes the
--     open placement and inserts the log row in one transaction (D2). A cook is
--     a server-confirmed transition (D3): if no open placement was closed (a
--     partner already tapped it, or a double tap) it inserts nothing and
--     returns null. Same rule as the 2026-09-21 `checked` fix.
--   * cooked_by = the user who TAPPED Cooked it (D7), not necessarily the cook.
--   * Backfill from the placements that currently carry cooked_at, guarded by
--     NOT EXISTS on (household, meal, cooked_at) so it is safe to re-run — and it
--     IS re-run once on prod after the client deploys (spec §Promotion). The
--     guard relies on cook_meal writing ONE v_now to both tables.
--
-- WHAT IS NOT HERE (spec D6, §Out of scope)
--   * Skip / ready history still overwrite on re-plan. Accepted.
--   * Cooks already lost to earlier re-plans are gone; nothing recorded them.
--   * No column-scoped grant yet stops a client writing meal_placements.cooked_at
--     directly (the NEXT "table grants and column scoping" row).
--
-- PATTERNS OF RECORD
--   * FKs follow meal_placements (047): cascade with the household or a
--     hard-purged meal (meals are soft-deleted, so in practice never); a cook
--     outlives its tapper (SET NULL).
--   * Grants are load-bearing (046): revoke from public, anon AND authenticated
--     by name, then grant back exactly SELECT. No insert/update/delete policy —
--     rows arrive only through cook_meal (SECURITY DEFINER), never change, never
--     die except by cascade.
--   * cook_meal is the 051 pattern: security definer, pinned search_path,
--     is_member_of FIRST (42501), the caller from the JWT via
--     get_current_user_id() (the helper the 051 bodies use — read from
--     pg_proc.prosrc on dev 2026-09-29), never from an argument. ACL per 045:
--     CREATE grants EXECUTE to PUBLIC; revoke it and read proacl back.
--
-- APPLY
--   dev: this file, whole, comments and all (the 054 lesson) —
--   system_identifier 7642734024280108049. Prod is its own promotion day
--   (Dan, SQL editor), then the backfill statement once more after the client
--   deploys. The closing SELECT is the VERIFY; paste its row into the commit.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. meal_cooks — the log
-- ─────────────────────────────────────────────────────────────────────
create table public.meal_cooks (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  meal_id      uuid        not null references public.meals(id)      on delete cascade,
  cooked_at    timestamptz not null default now(),
  cooked_by    uuid        references public.users(id) on delete set null
);

comment on table public.meal_cooks is
  '058 — append-only cook log (SPEC_replan_cook_history.md D1): one row per Cooked it. Written ONLY by cook_meal (D2), in the same transaction that closes the open placement; a row is inserted only when a placement was actually closed (D3). meal_placements stays the plan''s current state; this table is the history. Never updated, never deleted except by cascade.';
comment on column public.meal_cooks.cooked_at is
  '058 — the SAME now() that cook_meal writes to meal_placements.cooked_at. The backfill''s NOT EXISTS guard matches on it, which is what makes the prod re-run after the client deploy catch exactly the cooks the old client closed directly and nothing twice.';
comment on column public.meal_cooks.cooked_by is
  '058 D7 — the user who tapped Cooked it, from the JWT (get_current_user_id()), not necessarily the person who cooked. Nullable: a cook outlives its tapper (SET NULL). Backfilled from meal_placements.updated_by.';

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

-- ─────────────────────────────────────────────────────────────────────
-- 2. cook_meal — the one write path (051 pattern)
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.cook_meal(p_household_id uuid, p_meal_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller uuid;
  v_now    timestamptz;
  v_closed integer;
begin
  -- 051: membership FIRST. SECURITY DEFINER bypasses RLS, so this is the guard.
  if not is_member_of(p_household_id) then
    raise exception 'cook_meal: not a member of household %', p_household_id using errcode = '42501';
  end if;

  -- The caller from the JWT, never from an argument (051; the helper its
  -- bodies use). Null here would mean a JWT with no matching users row, which
  -- is_member_of has already ruled out — raise rather than log a null tapper.
  v_caller := get_current_user_id();
  if v_caller is null then
    raise exception 'cook_meal: no user for the JWT subject';
  end if;

  -- The meal must be this household's, live, and a real meal: no-shop cards
  -- (leftovers / out / other, 055/057) have no Cooked it.
  if not exists (
    select 1 from meals m
     where m.id = p_meal_id
       and m.household_id = p_household_id
       and m.deleted_at is null
       and m.kind = 'meal'
  ) then
    raise exception 'cook_meal: meal % is not a live meal of household %', p_meal_id, p_household_id;
  end if;

  -- One timestamp for both tables (the backfill guard relies on it).
  v_now := now();

  -- Close the OPEN placement. The predicate is the transition: a placement
  -- already cooked or skipped matches nothing.
  update meal_placements
     set cooked_at  = v_now,
         updated_at = v_now,
         updated_by = v_caller
   where household_id = p_household_id
     and meal_id      = p_meal_id
     and cooked_at  is null
     and skipped_at is null;
  get diagnostics v_closed = row_count;

  -- D3: nothing closed → nothing logged. The meal is cooked, just not by this
  -- tap (a partner got there first, or this is a double tap).
  if v_closed = 0 then
    return null;
  end if;

  insert into meal_cooks (household_id, meal_id, cooked_at, cooked_by)
  values (p_household_id, p_meal_id, v_now, v_caller);

  return v_now;
end;
$$;

comment on function public.cook_meal(uuid, uuid) is
  '058 — the ONLY write path to meal_cooks (SPEC_replan_cook_history.md D2). Closes the open meal_placements row and inserts the log row with ONE now() in one transaction. Returns that timestamp, or NULL when no open placement was closed (D3: a cook is a server-confirmed transition — a partner''s earlier tap or a double tap logs nothing). 051 pattern: is_member_of first (42501), caller from the JWT via get_current_user_id().';

-- ACL per 051 / the 045 lesson: CREATE grants EXECUTE to PUBLIC by default.
revoke all on function public.cook_meal(uuid, uuid) from public;
revoke all on function public.cook_meal(uuid, uuid) from anon;
grant execute on function public.cook_meal(uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Backfill — today's cooked placements become the first log rows
-- ─────────────────────────────────────────────────────────────────────
-- cooked_by comes from updated_by, which the close wrote at cook time; closed
-- rows are not reordered, so it is still the tapper. Soft-deleted households'
-- rows are included — they're history; is_member_of already hides them.
-- Safe to re-run (NOT EXISTS on household + meal + cooked_at): run once more
-- on prod after the client deploy to catch the cooks the old client closed
-- directly in between. Cooks already lost to re-plan are gone; nothing
-- reconstructs them.
insert into public.meal_cooks (household_id, meal_id, cooked_at, cooked_by)
select mp.household_id, mp.meal_id, mp.cooked_at, mp.updated_by
  from public.meal_placements mp
 where mp.cooked_at is not null
   and not exists (select 1 from public.meal_cooks mc
                    where mc.household_id = mp.household_id
                      and mc.meal_id      = mp.meal_id
                      and mc.cooked_at    = mp.cooked_at);

commit;

-- =====================================================================
-- VERIFY — row-returning; paste the row into the commit body.
-- Expect: system_identifier 7642734024280108049 on dev (prod differs);
-- rls_on true; sel 1 / ins 0 / upd 0 / del 0; relacl with authenticated=r and
-- NO anon entry; household_fk CASCADE, meal_fk CASCADE, cooked_by_fk SET NULL;
-- idx_count 2 (pkey + household index); cook_meal_count 1, secdef true,
-- search_path pinned, proacl with no anon and no bare =X (PUBLIC) entry,
-- membership check present; cooks_rows = placements_cooked (backfill parity).
-- =====================================================================
select
  (pg_control_system()).system_identifier                                        as system_identifier,
  c.relrowsecurity                                                                as rls_on,
  count(p.polname) filter (where p.polcmd = 'r')                                   as sel,
  count(p.polname) filter (where p.polcmd = 'a')                                   as ins,
  count(p.polname) filter (where p.polcmd = 'w')                                   as upd,
  count(p.polname) filter (where p.polcmd = 'd')                                   as del,
  c.relacl::text                                                                  as relacl,
  (select count(*) from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'meal_cooks'
       and g.grantee = 'anon')                                                      as anon_privs,
  (select string_agg(g.privilege_type, ',' order by g.privilege_type)
     from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'meal_cooks'
       and g.grantee = 'authenticated')                                             as authenticated_privs,
  (select case k.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'a' then 'NO ACTION' else k.confdeltype::text end
     from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and k.conname = 'meal_cooks_household_id_fkey') as household_fk,
  (select case k.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'a' then 'NO ACTION' else k.confdeltype::text end
     from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and k.conname = 'meal_cooks_meal_id_fkey')      as meal_fk,
  (select case k.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'a' then 'NO ACTION' else k.confdeltype::text end
     from pg_constraint k where k.conrelid = c.oid and k.contype = 'f' and k.conname = 'meal_cooks_cooked_by_fkey')    as cooked_by_fk,
  (select count(*) from pg_indexes i where i.schemaname = 'public' and i.tablename = 'meal_cooks')                   as idx_count,
  (select count(*)   from pg_proc f where f.proname = 'cook_meal' and f.pronamespace = 'public'::regnamespace)         as cook_meal_count,
  (select f.prosecdef from pg_proc f where f.proname = 'cook_meal' and f.pronamespace = 'public'::regnamespace)        as cook_meal_secdef,
  (select f.proconfig::text from pg_proc f where f.proname = 'cook_meal' and f.pronamespace = 'public'::regnamespace)  as cook_meal_search_path,
  (select f.proacl::text from pg_proc f where f.proname = 'cook_meal' and f.pronamespace = 'public'::regnamespace)     as cook_meal_acl,
  (select position('is_member_of' in f.prosrc) > 0 from pg_proc f
     where f.proname = 'cook_meal' and f.pronamespace = 'public'::regnamespace)                                         as cook_meal_has_is_member_of,
  (select count(*) from public.meal_cooks)                                                                           as cooks_rows,
  (select count(*) from public.meal_placements where cooked_at is not null)                                          as placements_cooked
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.oid = 'public.meal_cooks'::regclass
group by c.oid, c.relrowsecurity, c.relacl;
