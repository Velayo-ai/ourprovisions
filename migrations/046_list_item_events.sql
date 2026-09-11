-- 046_list_item_events.sql
-- SPEC_shop_lens_instore_capture.md — the first smart-ordering capture (Phase 2).
--
-- WHAT
--   A new APPEND-ONLY table, list_item_events, recording every in-store action as
--   an event: 'checked', 'unchecked', 'added_in_store'. This is the capture side of
--   Phase 2 aisle-order learning; the learning query is designed, not built.
--
-- WHY A TABLE, NOT COLUMNS (spec D8)
--   list_items rows are REUSED across cycles — the 008 upsert revives the same
--   (household, catalog_item) row — so any checked_* column on list_items can only
--   ever hold the latest trip. Learning a layout needs every trip. The five
--   Phase-2 forward-ref columns on list_items (checked_by, session_id,
--   checked_sequence, checked_lat, checked_lng) were never written and are
--   SUPERSEDED by this table. They are NOT dropped here — a later cleanup
--   migration does that; 046 stays purely additive.
--
-- SHAPE
--   * event_type is a CHECK, not an enum, so added_browse / added_meal /
--     added_voice land later as a one-line ALTER. Only the three values below are
--     written by the client tonight.
--   * created_at (server now()) is the ordering truth. sequence is a client-side
--     per-session counter used only to break ties in bursts / offline retries.
--   * list_item_id is nullable — the row may be soft-deleted later and the event
--     must outlive it. session_id is nullable — an add can precede session
--     resolution. Neither FK cascades: an event is history.
--
-- RLS — the 032 idiom
--   * SELECT  — is_member_of(household_id)
--   * INSERT  — is_member_of(household_id) AND user_id = get_current_user_id()
--               (write only as yourself; same predicate 032 uses for sessions)
--   * NO UPDATE, NO DELETE policies — append-only by construction. Same shape as
--     list_item_meals. Remember 041: a client write that no policy admits matches
--     ZERO rows and raises NO error. That is the intended behaviour here, which is
--     why verification reads the table back and never trusts a 2xx.
--   * revoke all from anon — no anon path. Re-read the grants after applying.
--   Role is `authenticated`, the direction of travel for new policies (032 §2).
--
-- APPLY
--   Paste the whole file into the dev SQL editor. It ends in a row-returning
--   SELECT because the editor never surfaces `raise notice`. Expected result: one
--   row, rls_on = true, sel = 1, ins = 1, upd = 0, del = 0, anon_privs = 0,
--   check_present = true, idx_count = 3 (pkey + the two indexes below).

begin;

create table public.list_item_events (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households(id),
  list_item_id     uuid references public.list_items(id),          -- nullable: row may be soft-deleted later
  catalog_item_id  uuid not null references public.catalog_items(id),
  user_id          uuid not null references public.users(id),
  session_id       uuid references public.shopping_sessions(id),   -- nullable: an add can precede session resolution
  cycle_id         uuid references public.provision_cycles(id),
  event_type       text not null check (event_type in ('added_in_store','checked','unchecked')),
  sequence         integer,                                         -- client counter per session; tiebreaker only
  created_at       timestamptz not null default now()
);

create index list_item_events_hh_session_created_idx
  on public.list_item_events (household_id, session_id, created_at);
create index list_item_events_hh_catalog_idx
  on public.list_item_events (household_id, catalog_item_id);

alter table public.list_item_events enable row level security;

create policy list_item_events_select on public.list_item_events
  for select to authenticated
  using (is_member_of(household_id));

create policy list_item_events_insert on public.list_item_events
  for insert to authenticated
  with check (
    is_member_of(household_id)
    and user_id = get_current_user_id()
  );

-- No UPDATE policy. No DELETE policy. Append-only.

-- No anon path, no exceptions. Revoking from PUBLIC does not remove an explicit
-- anon grant (the 045 lesson), so anon is revoked by name as well.
revoke all on table public.list_item_events from public;
revoke all on table public.list_item_events from anon;
grant select, insert on table public.list_item_events to authenticated;
grant all on table public.list_item_events to service_role;

commit;

-- =====================================================================
-- VERIFY — row-returning, so the SQL editor shows it. Paste the result back.
-- =====================================================================
select
  c.relname,
  c.relrowsecurity                                                        as rls_on,
  count(p.polname) filter (where p.polcmd = 'r')                           as sel,
  count(p.polname) filter (where p.polcmd = 'a')                           as ins,
  count(p.polname) filter (where p.polcmd = 'w')                           as upd,
  count(p.polname) filter (where p.polcmd = 'd')                           as del,
  (select count(*) from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'list_item_events'
       and g.grantee = 'anon')                                              as anon_privs,
  (select string_agg(g.privilege_type, ',' order by g.privilege_type)
     from information_schema.role_table_grants g
     where g.table_schema = 'public' and g.table_name = 'list_item_events'
       and g.grantee = 'authenticated')                                     as authenticated_privs,
  exists (select 1 from pg_constraint k
            where k.conrelid = c.oid and k.contype = 'c'
              and pg_get_constraintdef(k.oid) like '%event_type%')          as check_present,
  (select count(*) from pg_indexes i
     where i.schemaname = 'public' and i.tablename = 'list_item_events')    as idx_count
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.oid = 'public.list_item_events'::regclass
group by c.relname, c.relrowsecurity, c.oid;
