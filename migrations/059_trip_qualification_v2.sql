-- 059_trip_qualification_v2.sql
-- SPEC_trip_qualification_v2.md — tell a real trip from a demo by observing the
-- trip, with no hand-maintained list.
--
-- WHY
--   053 fused two questions into one view: "is this trip real?" and "is this
--   trip useful for aisle order?". Its answer to the first was a hand-maintained
--   exclusion flag per account, which only ever worked for people we could name
--   (reversed for the founder account 2026-09-30 — it was throwing away the best
--   real data in the system). This migration splits the two: Layer 1 is trip
--   reality, shared by every learning task; Layer 2 is each task's own legs on
--   top of "real". 053's Paced leg rejects a cashier blast, but a cashier blast
--   is a REAL trip that simply teaches nothing about aisle order. That is the
--   seam.
--
-- WHAT (spec D1-D11)
--   * shopping_sessions gains three columns: reality_answer ('real'|'testing'),
--     reality_answered_at, reality_asked_at. The answer is the ONLY thing stored
--     (D10); signals and verdict are computed at read time, so a floor change is
--     a re-read and never rewrites history.
--   * view trip_reality — the three signals, their measurements, demo_votes,
--     verdict and verdict_source, floors as columns. security_invoker, revoked
--     from public/anon/authenticated, select to service_role (the 053 pattern).
--   * get_trip_reality(p_session_id) — reads the verdict AND stamps
--     reality_asked_at the first time it returns 'pending', so the ask is shown
--     once and the ask rate (D11) is measurable.
--   * answer_trip_reality(p_session_id, p_answer) — the ONLY write path to the
--     answer. Clients hold no UPDATE on these columns.
--   * aisle_order_sessions amended: the two excluded_* legs are replaced by one
--     `leg_real` (trip_reality.verdict <> 'excluded', reason code 'not_real').
--     Anchored / Traverses / Paced are unchanged, floors included.
--
-- ============================================================================
-- S1 SOURCE DECISION (spec Step 0.1 — read on dev before authoring, 2026-10-01)
-- ============================================================================
--   QUESTION: does a resurrected list_items row get a FRESH add timestamp?
--   ANSWER: NO. Two paths were read from pg_proc.prosrc and neither touches
--   created_at:
--     * insert_list_item — ON CONFLICT (household_id, catalog_item_id) DO UPDATE
--       SET quantity, status, deleted_at, cycle_id, price_per_unit,
--       updated_at = now(). created_at is absent from the SET list, so a
--       resurrected row keeps its FIRST-EVER add time.
--     * trigger trg_list_items_resurrect -> function list_items_resurrect_cleanup
--       (different names; the spec names the trigger). It deletes list_item_meals
--       rows and re-homes cycle_id. No timestamp write.
--   THEREFORE list_items.created_at is NOT an add time for a re-added staple, and
--   S1 reads list_item_events.event_type = 'added_in_store' in the same session,
--   per the spec's stated fallback.
--
--   A THIRD CANDIDATE WAS TESTED AND RULED OUT. list_item_contributors.added_at
--   defaults to now() and looked fully covered. It is unusable here:
--   archive_trip_items DELETEs every contributor row for the household during
--   wrap-up, and wrap-up runs BEFORE the summary mounts and reads this view.
--   Measured on dev across 12 wrapped sessions: 0 surviving contributor rows,
--   every one. The action immediately preceding the read destroys the evidence.
--   Do not "restore" it as the S1 source without first changing that delete.
--
--   COVERAGE GAP, measured on dev 2026-10-01 (the spec asked for it explicitly):
--   3 of 396 checked items (0.8%) carry an added_in_store event, across 3 of 84
--   sessions. added_in_store is still emitted and is correct — it fires only from
--   the Shop Add sheet (handleShopAddNew), i.e. the in-aisle add; a Browse-at-home
--   add fires no event. So S1 reads 'unknown' for 81 of 84 dev sessions, which is
--   the honest answer and also the common REAL case (a list written at home).
--   CONSEQUENCE, stated so nobody treats it as a bug: with S1 unknown, 3 demo
--   votes is unreachable, so the worst outcome for a trip with no GPS fix is an
--   ASK, never silent exclusion. That is D4 holding a fortiori, not failing.
--
--   S1'S SHARE DENOMINATOR is ALL checked items, not just the measured ones.
--   The spec's reasoning requires it: "a real in-store add is one item, not the
--   whole cart - hence the 80% share, not any single item." Three aisle-added
--   items in a 20-item cart is 15%, not a demo. Unmeasured items therefore push
--   the share DOWN (the safe direction: they can never create a demo vote), while
--   the >= 3-measured gate is what separates 'unknown' from 'not_demo'.
--
-- PATTERNS OF RECORD
--   * Floors live in ONE floors CTE (053's pattern) so a tune is one line and a
--     re-read. EVERY NUMBER HERE IS A PLACEHOLDER FROM THE SPEC AND IS NOT TUNED
--     IN THIS MIGRATION (spec §Tuning: no floor is tuned on data that has not had
--     the gap-bucketed duplicate sweep).
--   * S2 orders by created_at, NEVER by sequence — sequence restarts on every
--     page load.
--   * Both RPCs are the 051 pattern: security definer, pinned search_path,
--     is_member_of FIRST (42501), caller identity from auth.jwt()->>'sub'.
--   * ACL per 051 / the 045 lesson: CREATE grants EXECUTE to PUBLIC by default;
--     revoke from public and anon by name, then grant execute to authenticated
--     only, and read proacl back in VERIFY.
--   * aisle_order_sessions is DROPped and recreated, not CREATE OR REPLACEd:
--     replacing cannot remove the two excluded_* columns. Checked before writing
--     this — pg_depend and pg_proc.prosrc both show ZERO dependents, so the drop
--     cascades to nothing.

begin;

-- ---------------------------------------------------------------------------
-- 1. The three columns. Additive; the answer is the only stored fact (D10).
-- ---------------------------------------------------------------------------
alter table public.shopping_sessions
  add column if not exists reality_answer text
    check (reality_answer in ('real','testing')),
  add column if not exists reality_answered_at timestamptz,
  add column if not exists reality_asked_at timestamptz;

comment on column public.shopping_sessions.reality_answer is
  '059 — the person''s answer to "Quick trip, or just testing?" (SPEC_trip_qualification_v2 D5). Beats the signals, loses to the admin exclusion flag. NULL = unanswered, which counts as REAL (D6). Written only by answer_trip_reality.';
comment on column public.shopping_sessions.reality_answered_at is
  '059 — when the answer was given.';
comment on column public.shopping_sessions.reality_asked_at is
  '059 — when the ask was first SHOWN (stamped by get_trip_reality on its first pending read). Makes the ask once-only and the ask rate measurable (D11).';

-- ---------------------------------------------------------------------------
-- 2. view trip_reality — Layer 1. Derived at read time (D10).
-- ---------------------------------------------------------------------------
create or replace view public.trip_reality
with (security_invoker = on) as
with floors as (
  -- ── PLACEHOLDER FLOORS (spec §Tuning). Tune by moving ONE line, then re-read
  -- the eight named test cases; if any named case changes verdict, the tune is
  -- wrong. Do NOT tune before the gap-bucketed duplicate sweep.
  select
    15::integer      as s1_fresh_minutes,     -- added within N min of its check
    0.80::numeric    as s1_demo_share,        -- share of ALL checked items (see header)
    3::integer       as s1_min_measured,      -- below this, S1 is 'unknown'
    5::integer       as s2_min_checks,        -- below this, S2 is 'unknown'
    30::numeric      as s2_max_gap_seconds,   -- any gap >= this is walking
    3::numeric       as s2_max_span_minutes   -- span >= this is not a burst
),
-- One row per (session, item) actually checked. min() collapses any residual
-- duplicate 'checked' rows (the sub-2s race is fixed, bf4f9cc; the >=60s reload
-- mechanism is NOT swept — spec §Tuning step 1).
checks as (
  select e.session_id, e.list_item_id, min(e.created_at) as checked_at
  from public.list_item_events e
  where e.event_type = 'checked' and e.session_id is not null
  group by e.session_id, e.list_item_id
),
-- The only add time available per the S1 source decision in the header.
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
-- S2 orders by created_at ONLY. sequence restarts on every page load.
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
    -- S1 Fresh list. Tri-state (D2): missing data is 'unknown', never 'demo'.
    case
      when coalesce(s1.s1_measured_items, 0) < f.s1_min_measured then 'unknown'
      when coalesce(s1.s1_fresh_items, 0)::numeric
           >= f.s1_demo_share * greatest(coalesce(s1.s1_checked_items, 0), 1) then 'demo'
      else 'not_demo'
    end                                                             as s1_fresh_list,
    -- S2 No walking.
    case
      when coalesce(s2.s2_check_count, 0) < f.s2_min_checks then 'unknown'
      when s2.s2_max_gap_seconds < f.s2_max_gap_seconds
       and s2.s2_span_minutes   < f.s2_max_span_minutes then 'demo'
      else 'not_demo'
    end                                                             as s2_no_walking,
    -- S3 Not at a store. No GPS fix is 'unknown' — never suspicious (D2).
    case
      when ss.gps_lat is null or ss.gps_lng is null then 'unknown'
      when ss.store_id is null then 'demo'
      else 'not_demo'
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
  -- Precedence (D5): admin flag -> the person's answer -> the signals.
  -- Vote table (D3): 0-1 real · 2 pending (ask) · 3 excluded.
  -- 'pending' is REAL for every consumer until answered (D6).
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
  '059 — Layer 1 trip reality (SPEC_trip_qualification_v2.md). One row per live session. Three tri-state signals (S1 fresh list, S2 no walking, S3 not at a store), their measurements, demo_votes, and a verdict of real/pending/excluded by the precedence admin flag -> answer -> signals. Derived at read time; only the answer is stored (D10). pending counts as REAL until answered (D6). S1 reads added_in_store events only — see the migration header for why, and for the measured coverage gap. Consumers read verdict, not the signals.';

revoke all on public.trip_reality from public;
revoke all on public.trip_reality from anon;
revoke all on public.trip_reality from authenticated;
grant select on public.trip_reality to service_role;

-- ---------------------------------------------------------------------------
-- 3. get_trip_reality — read the verdict, and stamp the ask once.
-- ---------------------------------------------------------------------------
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
begin
  select household_id into v_household_id
  from public.shopping_sessions
  where id = p_session_id and deleted_at is null;

  if v_household_id is null then
    raise exception 'get_trip_reality: session % not found', p_session_id
      using errcode = '42704';
  end if;

  -- 051 pattern: membership FIRST, before anything is read or written.
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

  -- Stamp the ask the FIRST time it is shown, so it is shown once (D6: an
  -- unanswered ask is not re-raised) and the ask rate is measurable (D11).
  -- The returned row carries the stamp this call just made.
  if v_verdict = 'pending' and v_asked_at is null then
    update public.shopping_sessions
       set reality_asked_at = now(), updated_at = now()
     where id = p_session_id and reality_asked_at is null;

    select to_jsonb(t) into v_row
    from public.trip_reality t
    where t.session_id = p_session_id;
  end if;

  return v_row;
end;
$$;

comment on function public.get_trip_reality(uuid) is
  '059 — the ONLY read path to trip_reality for a client (SPEC_trip_qualification_v2 D8). Returns the view row as jsonb and stamps reality_asked_at the first time the verdict is pending, so the ask is shown once and the ask rate is measurable. 051 pattern: is_member_of first (42501). jsonb rather than a composite so a view column added later does not break every caller.';

revoke all on function public.get_trip_reality(uuid) from public;
revoke all on function public.get_trip_reality(uuid) from anon;
grant execute on function public.get_trip_reality(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. answer_trip_reality — the ONLY write path to the answer.
-- ---------------------------------------------------------------------------
create or replace function public.answer_trip_reality(p_session_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_household_id uuid;
  v_row          jsonb;
begin
  if p_answer is null or p_answer not in ('real','testing') then
    raise exception 'answer_trip_reality: answer must be real or testing, got %', p_answer
      using errcode = '22023';
  end if;

  select household_id into v_household_id
  from public.shopping_sessions
  where id = p_session_id and deleted_at is null;

  if v_household_id is null then
    raise exception 'answer_trip_reality: session % not found', p_session_id
      using errcode = '42704';
  end if;

  if not is_member_of(v_household_id) then
    raise exception 'answer_trip_reality: not a member of household %', v_household_id
      using errcode = '42501';
  end if;

  -- Last answer wins: Count it after a testing answer must be able to undo it
  -- (D7 — a household's own data is never irreversibly excluded).
  update public.shopping_sessions
     set reality_answer      = p_answer,
         reality_answered_at = now(),
         updated_at          = now()
   where id = p_session_id;

  select to_jsonb(t) into v_row
  from public.trip_reality t
  where t.session_id = p_session_id;

  return v_row;
end;
$$;

comment on function public.answer_trip_reality(uuid, text) is
  '059 — the ONLY write path to shopping_sessions.reality_answer (SPEC_trip_qualification_v2 D8). Accepts real|testing, returns the recomputed trip_reality row. Last answer wins so Count it can undo a testing answer (D7). 051 pattern: is_member_of first (42501). Clients hold no UPDATE on these columns.';

revoke all on function public.answer_trip_reality(uuid, text) from public;
revoke all on function public.answer_trip_reality(uuid, text) from anon;
grant execute on function public.answer_trip_reality(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. aisle_order_sessions amended — the two excluded_* legs become one not_real.
--    DROP + recreate: CREATE OR REPLACE cannot remove columns. Zero dependents
--    confirmed via pg_depend and pg_proc.prosrc before writing this.
--    Anchored / Traverses / Paced and BOTH their floors are unchanged. Traverses
--    stays at 2 and is still too low — raising it is a 053 change, not a v2 one.
-- ---------------------------------------------------------------------------
drop view if exists public.aisle_order_sessions;

create view public.aisle_order_sessions
with (security_invoker = on) as
with floors as (
  select
    2::integer     as min_distinct_sections,
    2.0::numeric   as min_median_gap_seconds
),
checks as (
  select e.session_id, e.created_at, e.sequence, ci.category
  from public.list_item_events e
  left join public.catalog_items ci on ci.id = e.catalog_item_id
  where e.event_type = 'checked' and e.session_id is not null
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
    -- 059: Layer 1 replaces the two excluded_* legs. pending counts as real (D6).
    tr.verdict                                   as reality_verdict,
    tr.verdict_source                            as reality_verdict_source,
    (tr.verdict <> 'excluded')                   as leg_real,
    (ss.store_id is not null)                    as leg_anchored,
    (coalesce(m.distinct_sections, 0) >= f.min_distinct_sections)            as leg_traverses,
    (m.median_gap_seconds is not null
       and m.median_gap_seconds >= f.min_median_gap_seconds)                  as leg_paced,
    f.min_distinct_sections                      as floor_min_distinct_sections,
    f.min_median_gap_seconds                     as floor_min_median_gap_seconds
  from public.shopping_sessions ss
  cross join floors f
  join public.trip_reality tr on tr.session_id = ss.id
  left join measures m        on m.session_id = ss.id
  where ss.deleted_at is null
)
select
  l.*,
  (l.leg_real and l.leg_anchored and l.leg_traverses and l.leg_paced)        as qualified,
  -- D7 of 053: the SET of failing legs, in spec order. Empty iff qualified.
  array_remove(array[
    case when not l.leg_real       then 'not_real'      end,
    case when not l.leg_anchored   then 'no_store'      end,
    case when not l.leg_traverses  then 'no_traversal'  end,
    case when not l.leg_paced      then 'no_pacing'     end
  ], null)::text[]                                                           as reason_codes
from legs l;

comment on view public.aisle_order_sessions is
  '053, amended by 059 — per-session aisle-order qualification. Measurements computed at read time; verdict derived, never stored. Consumers read WHERE qualified. Named after the task (053 D5): the staples task must NOT read this view. 059: the excluded_account / excluded_household legs are replaced by one leg_real = trip_reality.verdict <> ''excluded'' (reason code not_real); the admin flags now live only inside trip_reality. Anchored / Traverses / Paced and both floors unchanged — Traverses is still 2 and still known too low.';

revoke all on public.aisle_order_sessions from public;
revoke all on public.aisle_order_sessions from anon;
revoke all on public.aisle_order_sessions from authenticated;
grant select on public.aisle_order_sessions to service_role;

commit;

-- =====================================================================
-- VERIFY — row-returning. Expect: 3 reality columns present; both views
-- security_invoker with anon/authenticated at 0 privileges and service_role
-- select; both functions secdef, search_path pinned, is_member_of present,
-- execute to authenticated only and NOT to anon/public; aisle_order_sessions
-- carrying leg_real and NOT the two excluded_* columns.
-- =====================================================================
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='shopping_sessions'
      and column_name in ('reality_answer','reality_answered_at','reality_asked_at'))  as reality_columns,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='aisle_order_sessions'
      and column_name in ('excluded_account','excluded_household'))                    as stale_excluded_cols,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='aisle_order_sessions'
      and column_name = 'leg_real')                                                     as has_leg_real,
  (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('trip_reality','aisle_order_sessions')
      and c.reloptions::text ilike '%security_invoker=on%')                             as views_security_invoker,
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name in ('trip_reality','aisle_order_sessions')
      and grantee in ('anon','authenticated'))                                          as view_privs_anon_auth,
  (select count(*) from information_schema.role_table_grants
    where table_schema='public' and table_name in ('trip_reality','aisle_order_sessions')
      and grantee='service_role' and privilege_type='SELECT')                           as view_select_service_role,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_trip_reality','answer_trip_reality')
      and p.prosecdef
      and p.proconfig::text ilike '%search_path=public, extensions%'
      and position('is_member_of' in p.prosrc) > 0)                                     as rpcs_secdef_pinned_guarded,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_trip_reality','answer_trip_reality')
      and (p.proacl::text ilike '%anon=X%' or p.proacl::text ilike '%=X/%postgres%,%public%'))  as rpc_anon_or_public_exec,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('get_trip_reality','answer_trip_reality')
      and p.proacl::text ilike '%authenticated=X%')                                     as rpc_authenticated_exec;
