-- 053_learning_qualification.sql
-- SPEC_learning_qualification.md — global exclusion flags + the aisle-order
-- qualification view. Supersedes SPEC_learning_exclusion.md (never built).
--
-- WHAT
--   1. users.excluded_from_learning      boolean not null default false
--      households.excluded_from_learning boolean not null default false
--      Global exclusion (D1a): nothing an excluded account or household produces
--      counts for ANY learning task. Set retroactively, by explicit list, never
--      by heuristic (D3). The marking is a DATA step, environment-specific, and
--      lives in migrations/fixtures/053_learning_marking_<env>.sql — read back
--      before and after, confirmed by Dan. It is NOT in this file.
--   2. View aisle_order_sessions (D4, D5, D6, D7). One row per live shopping
--      session, exposing the three D4 measurements, the two global flags, each
--      leg as its own boolean, the composite verdict, and reason_codes = the
--      SET of failing legs (not the first one — with store resolution empty on
--      both databases a first-failure code would read no_store everywhere and
--      hide whether a trip would have passed Traverses and Paced).
--      NOTHING is stored: measurements are computed at read time from
--      list_item_events, the verdict is derived, and a floor change is a
--      re-read, never a rewrite (D6).
--
-- NAME (D5): aisle_order_sessions, never learning_sessions. A view named after
--   "learning" gets reused by the next task's query (staples) and silently
--   starves it of every errand — the exact failure D1 exists to prevent.
--
-- FLOORS (D6): deliberately permissive placeholders, declared once in the
--   `floors` CTE at the top of the view. Do not tune here; tune from the
--   observed reason-code distribution across real households. Changing one is
--   one line, and history is re-read, not rewritten.
--
-- LEGS (D4) — each rejects a specific false lesson:
--   Anchored   store_id is not null            a demo at the kitchen table → a route with no layout
--   Traverses  distinct sections ≥ floor        the milk run → learns the errand, not the store
--   Paced      median inter-check gap ≥ floor   the cashier blast → learns the app's own sort order
--   A session with fewer than two checks has no gap to measure; it fails Paced
--   (reason no_pacing) because it cannot be shown to pace, not because it is
--   suspected of anything.
--   "Section" = catalog_items.category of the checked item (open-set text). A
--   check whose catalog row is gone (046 SET NULL) has no section and is not
--   counted toward traversal.
--
-- NO POLICY CHANGE. A boolean on an already-readable row adds no exposure. No
--   UPDATE policy is added for the flags. (Finding, not fixed here: both tables
--   already carry row-scoped UPDATE policies plus a full table grant, so a
--   signed-in user can PATCH any column of their own rows through PostgREST —
--   the 051 exposure one layer down, at tables. Queued in ROADMAP.)
--
-- VIEW ACCESS: security_invoker = on (the 033 lesson) so it never runs as the
--   owner; revoked from public / anon / authenticated. It is a learning
--   instrument read by the owner and service_role, not a client surface.
--
-- APPLY: dev first via the MCP (records in supabase_migrations), then the
--   marking script with read-backs, then the dev fixtures, then the six
--   verification reads. Prod by hand in the SQL editor with the prod marking
--   list confirmed by Dan. Number 053 from the live catalog high-water mark
--   (close_cycle carries the 052 marker on both databases), not the folder.

begin;

alter table public.users
  add column if not exists excluded_from_learning boolean not null default false;

alter table public.households
  add column if not exists excluded_from_learning boolean not null default false;

comment on column public.users.excluded_from_learning is
  '053 — global learning exclusion (D1a). True = nothing this account produces counts for any learning task. Set by explicit list, retroactively; a lens over append-only events, never an edit.';
comment on column public.households.excluded_from_learning is
  '053 — global learning exclusion (D1a) for a fixture/demo household. Flag a household for what it IS, never for what it currently has.';

create or replace view public.aisle_order_sessions
with (security_invoker = on) as
with floors as (
  -- ── PERMISSIVE PLACEHOLDERS (D6). Tune from the observed distribution. ──
  select
    2::integer     as min_distinct_sections,    -- Traverses: a route needs ≥ 2 sections
    2.0::numeric   as min_median_gap_seconds    -- Paced: under this, check order = display order
),
checks as (
  select e.session_id, e.created_at, e.sequence, ci.category
  from public.list_item_events e
  left join public.catalog_items ci on ci.id = e.catalog_item_id
  where e.event_type = 'checked'
    and e.session_id is not null
),
gaps as (
  select
    session_id, created_at, category,
    extract(epoch from (created_at - lag(created_at) over (
      partition by session_id order by created_at, sequence))) as gap_s
  from checks
),
measures as (
  select
    session_id,
    count(*)                                              as check_count,
    count(distinct category)                              as distinct_sections,
    percentile_cont(0.5) within group (order by gap_s)    as median_gap_seconds,
    min(created_at)                                       as first_check,
    max(created_at)                                       as last_check
  from gaps
  group by session_id
),
legs as (
  select
    ss.id                                        as session_id,
    ss.household_id,
    ss.user_id,
    ss.cycle_id,
    ss.started_at,
    ss.ended_at,
    ss.store_id,
    coalesce(m.check_count, 0)::integer          as check_count,
    coalesce(m.distinct_sections, 0)::integer    as distinct_sections,
    round(m.median_gap_seconds::numeric, 1)      as median_gap_seconds,
    m.first_check,
    m.last_check,
    u.excluded_from_learning                     as excluded_account,
    h.excluded_from_learning                     as excluded_household,
    (ss.store_id is not null)                    as leg_anchored,
    (coalesce(m.distinct_sections, 0) >= f.min_distinct_sections)            as leg_traverses,
    (m.median_gap_seconds is not null
       and m.median_gap_seconds >= f.min_median_gap_seconds)                  as leg_paced,
    f.min_distinct_sections                      as floor_min_distinct_sections,
    f.min_median_gap_seconds                     as floor_min_median_gap_seconds
  from public.shopping_sessions ss
  cross join floors f
  join public.users u      on u.id = ss.user_id
  join public.households h on h.id = ss.household_id
  left join measures m     on m.session_id = ss.id
  where ss.deleted_at is null
)
select
  l.*,
  (not l.excluded_account and not l.excluded_household
     and l.leg_anchored and l.leg_traverses and l.leg_paced)                 as qualified,
  -- D7: the SET of failing legs, in spec order. Empty iff qualified.
  array_remove(array[
    case when l.excluded_account   then 'excluded_account'   end,
    case when l.excluded_household then 'excluded_household' end,
    case when not l.leg_anchored   then 'no_store'           end,
    case when not l.leg_traverses  then 'no_traversal'       end,
    case when not l.leg_paced      then 'no_pacing'          end
  ], null)::text[]                                                            as reason_codes
from legs l;

comment on view public.aisle_order_sessions is
  '053 — per-session aisle-order qualification (SPEC_learning_qualification.md). Measurements computed at read time; verdict derived, never stored. Consumers read WHERE qualified. Named after the task (D5): the staples task must NOT read this view.';

revoke all on public.aisle_order_sessions from public;
revoke all on public.aisle_order_sessions from anon;
revoke all on public.aisle_order_sessions from authenticated;
grant select on public.aisle_order_sessions to service_role;

commit;

-- =====================================================================
-- VERIFY — row-returning. Expect: both columns boolean / NO / false;
-- view present with security_invoker=true; anon and authenticated cannot
-- select; reason_codes empty iff qualified (partition_clean = true).
-- =====================================================================
select
  (select string_agg(table_name || '.' || column_name || ':' || data_type || ':' || is_nullable || ':' || column_default, ', ' order by table_name)
     from information_schema.columns
    where table_schema = 'public' and column_name = 'excluded_from_learning')     as flag_columns,
  (select reloptions::text from pg_class where oid = 'public.aisle_order_sessions'::regclass) as view_options,
  has_table_privilege('anon', 'public.aisle_order_sessions', 'select')           as anon_can_select,
  has_table_privilege('authenticated', 'public.aisle_order_sessions', 'select')  as authenticated_can_select,
  has_table_privilege('service_role', 'public.aisle_order_sessions', 'select')   as service_role_can_select,
  (select count(*) from public.aisle_order_sessions)                             as sessions_in_view,
  (select bool_and((cardinality(reason_codes) = 0) = qualified)
     from public.aisle_order_sessions)                                           as partition_clean;
