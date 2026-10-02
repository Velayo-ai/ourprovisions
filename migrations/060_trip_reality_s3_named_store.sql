-- 060_trip_reality_s3_named_store.sql
-- SPEC_trip_qualification_v2.md — amendment 2026-10-01 (S3 rule) + the
-- first_ask flag get_trip_reality needs for verification step 4.
--
-- WHY (found reproducing the eight named test cases against prod, 2026-10-01)
--   Case 7, Madbury 8ee6e792 (2026-09-12), read S3 = 'demo' under 059: GPS was
--   present and store_id was NULL. But store_name_raw = 'Market Basket Lee'.
--   The session predates 054 store identity (2026-09-20), so the store was
--   NAMED but never RESOLVED — and a named store is evidence of being at a
--   store, not evidence of a demo. 059's S3 treated the two as the same thing
--   and cast a demo vote against the spec's own reference genuine shop.
--
-- WHAT
--   1. S3 (Not at a store) reads:
--        not_demo  when store_id is resolved OR store_name_raw is non-null
--        unknown   when neither is set and there is no GPS fix
--        demo      ONLY when GPS is present and BOTH are null
--      Store evidence is checked before GPS presence, so a named store with no
--      fix is still not_demo. D4 (exclusion needs GPS) still holds: a demo vote
--      still requires a GPS fix.
--   2. get_trip_reality returns `first_ask: true` in its jsonb when THIS call
--      is the one that stamped reality_asked_at. The client shows the ask only
--      on first_ask; a later read of the same pending session returns the row
--      with the stamp and no flag, so the ask is never re-raised (D6, and the
--      spec's verification step 4). Without this the client could not tell a
--      first read from a reload — the RPC stamps before it returns, so
--      reality_asked_at is never null in a pending response. 059's stamping
--      guard (pending AND null, re-checked in the UPDATE's WHERE) is unchanged.
--
-- NOT CHANGED
--   Floors, S1, S2, the vote table, precedence, answer_trip_reality, the
--   aisle_order_sessions amendment, and every ACL. The view is CREATE OR
--   REPLACEd (same column list, same order) so aisle_order_sessions, which
--   joins it, is untouched. Same grants re-asserted after, by name.
--
-- EXPECTED RE-READS (prod, inline replication — prod has no view)
--   Madbury 8ee6e792: S3 demo -> not_demo, votes 1 -> 0, verdict real (unchanged).
--   Its Layer 2 stays no_store (leg_anchored reads store_id, which is still NULL)
--   until the pre-054 backfill queued in ROADMAP NEXT.

begin;

create or replace view public.trip_reality
with (security_invoker = on) as
with floors as (
  select
    15::integer      as s1_fresh_minutes,
    0.80::numeric    as s1_demo_share,
    3::integer       as s1_min_measured,
    5::integer       as s2_min_checks,
    30::numeric      as s2_max_gap_seconds,
    3::numeric       as s2_max_span_minutes
),
checks as (
  select e.session_id, e.list_item_id, min(e.created_at) as checked_at
  from public.list_item_events e
  where e.event_type = 'checked' and e.session_id is not null
  group by e.session_id, e.list_item_id
),
adds as (
  select a.session_id, a.list_item_id, min(a.created_at) as added_at
  from public.list_item_events a
  where a.event_type = 'added_in_store' and a.session_id is not null
  group by a.session_id, a.list_item_id
),
s1 as (
  select
    c.session_id,
    count(*)                                                        as s1_checked_items,
    count(a.added_at)                                               as s1_measured_items,
    count(*) filter (
      where a.added_at is not null
        and c.checked_at - a.added_at < make_interval(mins => f.s1_fresh_minutes)
    )                                                               as s1_fresh_items
  from checks c
  cross join floors f
  left join adds a
    on a.session_id = c.session_id and a.list_item_id = c.list_item_id
  group by c.session_id
),
gaps as (
  select
    c.session_id,
    c.checked_at,
    extract(epoch from (c.checked_at - lag(c.checked_at) over (
      partition by c.session_id order by c.checked_at))) as gap_s
  from checks c
),
s2 as (
  select
    session_id,
    count(*)                                        as s2_check_count,
    max(gap_s)                                      as s2_max_gap_seconds,
    extract(epoch from (max(checked_at) - min(checked_at))) / 60.0 as s2_span_minutes
  from gaps
  group by session_id
),
signals as (
  select
    ss.id                                   as session_id,
    ss.household_id,
    ss.user_id,
    ss.cycle_id,
    ss.started_at,
    ss.ended_at,
    ss.store_id,
    ss.gps_lat,
    ss.gps_lng,
    ss.reality_answer,
    ss.reality_answered_at,
    ss.reality_asked_at,
    (u.excluded_from_learning or h.excluded_from_learning)          as admin_excluded,
    coalesce(s1.s1_checked_items, 0)::integer                       as s1_checked_items,
    coalesce(s1.s1_measured_items, 0)::integer                      as s1_measured_items,
    coalesce(s1.s1_fresh_items, 0)::integer                         as s1_fresh_items,
    coalesce(s2.s2_check_count, 0)::integer                         as s2_check_count,
    round(s2.s2_max_gap_seconds::numeric, 1)                        as s2_max_gap_seconds,
    round(s2.s2_span_minutes::numeric, 2)                           as s2_span_minutes,
    case
      when coalesce(s1.s1_measured_items, 0) < f.s1_min_measured then 'unknown'
      when coalesce(s1.s1_fresh_items, 0)::numeric
           >= f.s1_demo_share * greatest(coalesce(s1.s1_checked_items, 0), 1) then 'demo'
      else 'not_demo'
    end                                                             as s1_fresh_list,
    case
      when coalesce(s2.s2_check_count, 0) < f.s2_min_checks then 'unknown'
      when s2.s2_max_gap_seconds < f.s2_max_gap_seconds
       and s2.s2_span_minutes   < f.s2_max_span_minutes then 'demo'
      else 'not_demo'
    end                                                             as s2_no_walking,
    -- 060: store evidence FIRST. A resolved OR a named store is not_demo; only
    -- a GPS fix with neither is a demo vote; no fix and no store is unknown.
    case
      when ss.store_id is not null or ss.store_name_raw is not null then 'not_demo'
      when ss.gps_lat is null or ss.gps_lng is null then 'unknown'
      else 'demo'
    end                                                             as s3_not_at_store,
    f.s1_fresh_minutes, f.s1_demo_share, f.s1_min_measured,
    f.s2_min_checks, f.s2_max_gap_seconds as floor_s2_max_gap_seconds,
    f.s2_max_span_minutes
  from public.shopping_sessions ss
  cross join floors f
  join public.users      u on u.id = ss.user_id
  join public.households h on h.id = ss.household_id
  left join s1 on s1.session_id = ss.id
  left join s2 on s2.session_id = ss.id
  where ss.deleted_at is null
),
voted as (
  select
    sg.*,
    ((sg.s1_fresh_list   = 'demo')::integer
   + (sg.s2_no_walking   = 'demo')::integer
   + (sg.s3_not_at_store = 'demo')::integer)::integer as demo_votes
  from signals sg
)
select
  v.session_id, v.household_id, v.user_id, v.cycle_id,
  v.started_at, v.ended_at, v.store_id, v.gps_lat, v.gps_lng,
  v.s1_fresh_list, v.s2_no_walking, v.s3_not_at_store,
  v.s1_checked_items, v.s1_measured_items, v.s1_fresh_items,
  v.s2_check_count, v.s2_max_gap_seconds, v.s2_span_minutes,
  v.demo_votes,
  v.admin_excluded,
  v.reality_answer, v.reality_answered_at, v.reality_asked_at,
  case
    when v.admin_excluded                then 'excluded'
    when v.reality_answer = 'real'       then 'real'
    when v.reality_answer = 'testing'    then 'excluded'
    when v.demo_votes >= 3               then 'excluded'
    when v.demo_votes  = 2               then 'pending'
    else                                      'real'
  end                                                               as verdict,
  case
    when v.admin_excluded                then 'admin_flag'
    when v.reality_answer is not null    then 'answer'
    else                                      'signals'
  end                                                               as verdict_source,
  v.s1_fresh_minutes, v.s1_demo_share, v.s1_min_measured,
  v.s2_min_checks, v.floor_s2_max_gap_seconds, v.s2_max_span_minutes
from voted v;

comment on view public.trip_reality is
  '059, S3 amended by 060 — Layer 1 trip reality (SPEC_trip_qualification_v2.md). One row per live session. Three tri-state signals, demo_votes, verdict real/pending/excluded by precedence admin flag -> answer -> signals. Derived at read time; only the answer is stored (D10). pending counts as REAL until answered (D6). S1 reads added_in_store only; its 80% share is of ALL checked items. 060: S3 is not_demo for a resolved OR named store, demo only for a GPS fix with neither, unknown with no fix. Consumers read verdict, not the signals.';

revoke all on public.trip_reality from public;
revoke all on public.trip_reality from anon;
revoke all on public.trip_reality from authenticated;
grant select on public.trip_reality to service_role;

create or replace function public.get_trip_reality(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_household_id uuid;
  v_row          jsonb;
  v_verdict      text;
  v_asked_at     timestamptz;
  v_stamped      integer := 0;
begin
  select household_id into v_household_id
  from public.shopping_sessions
  where id = p_session_id and deleted_at is null;

  if v_household_id is null then
    raise exception 'get_trip_reality: session % not found', p_session_id
      using errcode = '42704';
  end if;

  if not is_member_of(v_household_id) then
    raise exception 'get_trip_reality: not a member of household %', v_household_id
      using errcode = '42501';
  end if;

  select to_jsonb(t), t.verdict, t.reality_asked_at
    into v_row, v_verdict, v_asked_at
  from public.trip_reality t
  where t.session_id = p_session_id;

  if v_row is null then
    raise exception 'get_trip_reality: no reality row for session %', p_session_id
      using errcode = '42704';
  end if;

  -- Stamp the ask the FIRST time it is shown (pending AND still null; the
  -- UPDATE re-checks null so two concurrent calls cannot overwrite the first
  -- timestamp). 060: report whether THIS call did the stamping as first_ask,
  -- so the client shows the ask once and never on a re-read (D6, verification 4).
  if v_verdict = 'pending' and v_asked_at is null then
    update public.shopping_sessions
       set reality_asked_at = now(), updated_at = now()
     where id = p_session_id and reality_asked_at is null;
    get diagnostics v_stamped = row_count;

    select to_jsonb(t) into v_row
    from public.trip_reality t
    where t.session_id = p_session_id;
  end if;

  return v_row || jsonb_build_object('first_ask', v_stamped = 1);
end;
$$;

comment on function public.get_trip_reality(uuid) is
  '059, amended by 060 — the ONLY client read path to trip_reality (SPEC_trip_qualification_v2 D8). Returns the view row as jsonb plus first_ask (true only on the call that stamped reality_asked_at), so the ask is shown once and never re-raised on a re-read. Stamps only when the verdict is pending AND the stamp is still null, double-guarded. 051 pattern: is_member_of first (42501).';

revoke all on function public.get_trip_reality(uuid) from public;
revoke all on function public.get_trip_reality(uuid) from anon;
grant execute on function public.get_trip_reality(uuid) to authenticated;

commit;

-- =====================================================================
-- VERIFY — row-returning. Expect: view security_invoker, 0 anon/authenticated
-- privileges, service_role SELECT; RPC secdef, pinned, is_member_of present,
-- authenticated execute, no anon execute; the S3 named-store branch and the
-- first_ask key present in the live definitions; aisle_order_sessions still
-- joins trip_reality (it was not dropped).
-- =====================================================================
select
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='trip_reality'
      and c.reloptions::text ilike '%security_invoker=on%')                           as view_security_invoker,
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name='trip_reality'
      and grantee in ('anon','authenticated'))                                         as view_privs_anon_auth,
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name='trip_reality'
      and grantee='service_role' and privilege_type='SELECT')                          as view_select_service_role,
  (select position('store_name_raw is not null' in pg_get_viewdef('public.trip_reality'::regclass)) > 0) as s3_named_store_branch,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_trip_reality'
      and p.prosecdef
      and p.proconfig::text ilike '%search_path=public, extensions%'
      and position('is_member_of' in p.prosrc) > 0
      and position('first_ask' in p.prosrc) > 0)                                       as rpc_secdef_pinned_guarded_first_ask,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_trip_reality'
      and p.proacl::text ilike '%anon=X%')                                             as rpc_anon_exec,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='get_trip_reality'
      and p.proacl::text ilike '%authenticated=X%')                                    as rpc_authenticated_exec,
  (select position('trip_reality' in pg_get_viewdef('public.aisle_order_sessions'::regclass)) > 0) as aisle_view_still_joins_reality;
