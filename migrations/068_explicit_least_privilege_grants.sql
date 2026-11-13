-- 068_explicit_least_privilege_grants.sql
-- SPEC_grants_least_privilege_067.md — G1–G8 with the Amendment 2026-10-23 rulings R1–R3.
--
-- WHY
--   Supabase stops automatic grants for new objects in public on 2026-10-30. Existing objects
--   keep theirs, so nothing live breaks; a rebuild (new project, db reset, branch) would not.
--   Fifteen tables, a view and a dozen functions took some or all of their privileges from
--   platform defaults, never from a GRANT in migrations/ — and those defaults were far too wide:
--   anon held every table privilege on 15 RLS tables (writes, TRUNCATE — which bypasses RLS —
--   REFERENCES, TRIGGER, and MAINTAIN on prod); authenticated held the same extras on 19;
--   get_catalog_names_by_ids (SECURITY DEFINER) was executable by anon. Dev and prod disagreed
--   (prod has MAINTAIN; 007_dev_restore_role_grants.sql predates PostgreSQL 17).
--   Ruling: write the TARGET once — least privilege for what the app does — and converge both
--   databases onto it (G1). Step 0 (2026-10-23) found no app or landing path that reaches a
--   table as anon except the landing's beta_signups insert (Prefer: return=minimal).
--
-- SCOPE — every relation in public on prod (24 tables, 3 views) and 13 functions.
--   OUT: 065/066 objects (meal_photos, meal_cook_ratings, add_meal_photo, remove_meal_photo,
--   rate_cook — dev-only, already explicit; they promote with Meal Photos unchanged).
--   OUT: the trigger functions list_items_resurrect_cleanup and rls_auto_enable (G5: firing
--   does not depend on caller EXECUTE). OUT: ALTER DEFAULT PRIVILEGES (G6 — the 10-30 rollout
--   owns it; new objects are covered by the per-migration rule).
--
-- TARGET
--   anon            beta_signups INSERT; EXECUTE on health() (067). Nothing else (G2 as amended).
--   authenticated   SELECT, INSERT, UPDATE, DELETE where live held arwd — no TRUNCATE,
--                   REFERENCES, TRIGGER or MAINTAIN anywhere (G3). Narrower where live was
--                   narrower: list_item_events SELECT, INSERT · meal_placements SELECT, INSERT,
--                   UPDATE · meal_cooks SELECT · stores SELECT. category_avg_prices SELECT only (R3).
--                   beta_signups nothing (R2). meal_ready_events, aisle_order_sessions,
--                   trip_reality nothing.
--     G3 note — four tables whose own migrations grant authenticated LESS than live held:
--     household_staples (016: select, insert, delete), meals and meal_ingredients (025: select,
--     insert, update, delete — complete), list_item_meals (025: select, insert, delete). 068
--     writes the LIVE DML down (SELECT, INSERT, UPDATE, DELETE) — narrowing them is a behaviour
--     change and its own decision (spec: out of scope).
--   service_role    ALL where live held it (unchanged, now written down) — incl. meal_ready_events
--                   and the three views. stores: NO service_role grant, as 054 intended (G4).
--   functions       get_catalog_names_by_ids, get_current_household_id, get_current_user_id,
--                   get_my_households, is_member_of: EXECUTE revoked from PUBLIC and anon;
--                   authenticated + service_role written down. The RLS policies that call them
--                   are evaluated by authenticated (granted); postgres, service_role and the
--                   read-only user bypass RLS. Step 0: no policy anon reaches calls any of them
--                   (beta_signups' one policy is WITH CHECK (true)).
--                   join_household, bootstrap_new_user (4-arg), discard_unclaimed_household,
--                   cook_meal, get_trip_reality, answer_trip_reality: authenticated + service_role
--                   written down. mint_referral_code: service_role only.
--
-- HOW — REVOKE first, then GRANT, then VERIFY. Every grant on both databases was made by postgres
--   (grantor read 2026-10-23), and a REVOKE only removes the revoker's own grants — so this MUST
--   run as postgres (the SQL editor); the preflight refuses anything else. Idempotent; one
--   transaction, so no request ever sees the stripped state.
--
-- ORDER ON PROD (R1): 067 applied → the Splunk synthetic repointed to POST /rest/v1/rpc/health
--   with the sb_publishable_ key → TWO GREEN RUNS → this file. Before the repoint, 068 would 401
--   the old catalog_items probe and page Critical. The preflight refuses if health() is missing.
--
-- APPLY: dev (7642734024280108049) first and walked, then prod (7606130613603586966, confirm the
--   slug parpauldmbetptkmdwbd). Dev: ledger row by hand. Prod: no ledger, by decision.
-- ROLLBACK: 068_rollback.sql (pre-068 prod ACLs exactly; never applied unless needed).
-- G7: 007_dev_restore_role_grants.sql moved to scripts/dev-only/ in the same commit — as a
--   migration, any replay would run it and re-create wide defaults.

begin;

-- ── 0. Preflight ────────────────────────────────────────────────────────
do $preflight$
declare
  missing text;
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '068: unknown database %', (select system_identifier from pg_control_system());
  end if;
  if current_user <> 'postgres' then
    raise exception '068: run as postgres (every grant was made by postgres; a REVOKE removes only the revoker''s own) — current_user is %', current_user;
  end if;
  if to_regprocedure('public.health()') is null then
    raise exception '068: public.health() is missing — apply 067 and repoint the synthetic first';
  end if;
  select string_agg(o, ', ') into missing
    from unnest(array[
      'beta_signups', 'catalog_items', 'household_invites', 'household_members', 'household_staples',
      'households', 'known_stores', 'list_item_contributors', 'list_item_events', 'list_item_meals',
      'list_items', 'meal_cooks', 'meal_ingredients', 'meal_placements', 'meal_ready_events', 'meals',
      'provision_cycles', 'shopping_sessions', 'stores', 'user_hidden_items', 'users',
      'velayo_crew_members', 'velayo_crews', 'waste_events',
      'aisle_order_sessions', 'category_avg_prices', 'trip_reality'
    ]) o
   where to_regclass('public.' || o) is null;
  if missing is not null then
    raise exception '068: relations missing: %', missing;
  end if;
end
$preflight$;

-- ── 1. Strip: every in-scope relation, from PUBLIC, anon and authenticated ──
revoke all on table
  public.beta_signups, public.catalog_items, public.household_invites, public.household_members,
  public.household_staples, public.households, public.known_stores, public.list_item_contributors,
  public.list_item_events, public.list_item_meals, public.list_items, public.meal_cooks,
  public.meal_ingredients, public.meal_placements, public.meal_ready_events, public.meals,
  public.provision_cycles, public.shopping_sessions, public.stores, public.user_hidden_items,
  public.users, public.velayo_crew_members, public.velayo_crews, public.waste_events,
  public.aisle_order_sessions, public.category_avg_prices, public.trip_reality
from public, anon, authenticated;

-- ── 2. anon — the landing form only (G2) ────────────────────────────────
grant insert on table public.beta_signups to anon;

-- ── 3. authenticated — the live DML, nothing more (G3, R2, R3) ──────────
grant select, insert, update, delete on table
  public.catalog_items, public.household_invites, public.household_members, public.household_staples,
  public.households, public.known_stores, public.list_item_contributors, public.list_item_meals,
  public.list_items, public.meal_ingredients, public.meals, public.provision_cycles,
  public.shopping_sessions, public.user_hidden_items, public.users, public.velayo_crew_members,
  public.velayo_crews, public.waste_events
to authenticated;
grant select, insert on table public.list_item_events to authenticated;
grant select, insert, update on table public.meal_placements to authenticated;
grant select on table public.meal_cooks, public.stores, public.category_avg_prices to authenticated;

-- ── 4. service_role — what it had, written down (G4) ────────────────────
grant all on table
  public.beta_signups, public.catalog_items, public.household_invites, public.household_members,
  public.household_staples, public.households, public.known_stores, public.list_item_contributors,
  public.list_item_events, public.list_item_meals, public.list_items, public.meal_cooks,
  public.meal_ingredients, public.meal_placements, public.meal_ready_events, public.meals,
  public.provision_cycles, public.shopping_sessions, public.user_hidden_items, public.users,
  public.velayo_crew_members, public.velayo_crews, public.waste_events,
  public.aisle_order_sessions, public.category_avg_prices, public.trip_reality
to service_role;
revoke all on table public.stores from service_role;   -- 054: stores has no service_role grant

-- ── 5. Functions (G5) ───────────────────────────────────────────────────
-- The five that policies and the client call: off PUBLIC and anon.
revoke all on function
  public.get_catalog_names_by_ids(uuid[]), public.get_current_household_id(),
  public.get_current_user_id(), public.get_my_households(), public.is_member_of(uuid)
from public, anon;
grant execute on function
  public.get_catalog_names_by_ids(uuid[]), public.get_current_household_id(),
  public.get_current_user_id(), public.get_my_households(), public.is_member_of(uuid)
to authenticated, service_role;

-- The service_role EXECUTE these held only by default, written down (authenticated was explicit).
revoke all on function
  public.join_household(text), public.bootstrap_new_user(text, text, text, text),
  public.discard_unclaimed_household(uuid), public.cook_meal(uuid, uuid),
  public.get_trip_reality(uuid), public.answer_trip_reality(uuid, text)
from public, anon;
grant execute on function
  public.join_household(text), public.bootstrap_new_user(text, text, text, text),
  public.discard_unclaimed_household(uuid), public.cook_meal(uuid, uuid),
  public.get_trip_reality(uuid), public.answer_trip_reality(uuid, text)
to authenticated, service_role;

-- mint_referral_code: service_role only (042 revoked the rest).
revoke all on function public.mint_referral_code() from public, anon, authenticated;
grant execute on function public.mint_referral_code() to service_role;

commit;

-- VERIFY — one row, IDENTICAL on dev and prod (G8). Expect:
--   known_db true · checked 160 · mismatches 0 · mismatch_detail '' ·
--   anon_extra_rel '' · anon_extra_fn '' · forbidden_privs 0
-- checked = 27 relations × 4 grantees (PUBLIC, anon, authenticated, service_role)
--         + 13 functions × 4 grantees. ALL = the eight PostgreSQL 17 table privileges.
-- anon_extra_rel / anon_extra_fn sweep ALL of public (065/066 included): anything anon or
--   PUBLIC holds beyond beta_signups INSERT, health() and the two trigger functions (V2).
-- forbidden_privs: TRUNCATE / REFERENCES / TRIGGER / MAINTAIN held by anon or authenticated on
--   any relation in public (V3).
with
rel_target (obj, public_p, anon_p, auth_p, svc_p) as (values
  ('beta_signups',           '', 'INSERT', '',                         'ALL'),
  ('catalog_items',          '', '',       'DML',                      'ALL'),
  ('household_invites',      '', '',       'DML',                      'ALL'),
  ('household_members',      '', '',       'DML',                      'ALL'),
  ('household_staples',      '', '',       'DML',                      'ALL'),
  ('households',             '', '',       'DML',                      'ALL'),
  ('known_stores',           '', '',       'DML',                      'ALL'),
  ('list_item_contributors', '', '',       'DML',                      'ALL'),
  ('list_item_meals',        '', '',       'DML',                      'ALL'),
  ('list_items',             '', '',       'DML',                      'ALL'),
  ('meal_ingredients',       '', '',       'DML',                      'ALL'),
  ('meals',                  '', '',       'DML',                      'ALL'),
  ('provision_cycles',       '', '',       'DML',                      'ALL'),
  ('shopping_sessions',      '', '',       'DML',                      'ALL'),
  ('user_hidden_items',      '', '',       'DML',                      'ALL'),
  ('users',                  '', '',       'DML',                      'ALL'),
  ('velayo_crew_members',    '', '',       'DML',                      'ALL'),
  ('velayo_crews',           '', '',       'DML',                      'ALL'),
  ('waste_events',           '', '',       'DML',                      'ALL'),
  ('list_item_events',       '', '',       'INSERT,SELECT',            'ALL'),
  ('meal_placements',        '', '',       'INSERT,SELECT,UPDATE',     'ALL'),
  ('meal_cooks',             '', '',       'SELECT',                   'ALL'),
  ('meal_ready_events',      '', '',       '',                         'ALL'),
  ('stores',                 '', '',       'SELECT',                   ''),
  ('category_avg_prices',    '', '',       'SELECT',                   'ALL'),
  ('aisle_order_sessions',   '', '',       '',                         'ALL'),
  ('trip_reality',           '', '',       '',                         'ALL')
),
fn_target (sig, public_p, anon_p, auth_p, svc_p) as (values
  ('public.get_catalog_names_by_ids(uuid[])',                 '', '',        'EXECUTE', 'EXECUTE'),
  ('public.get_current_household_id()',                       '', '',        'EXECUTE', 'EXECUTE'),
  ('public.get_current_user_id()',                            '', '',        'EXECUTE', 'EXECUTE'),
  ('public.get_my_households()',                              '', '',        'EXECUTE', 'EXECUTE'),
  ('public.is_member_of(uuid)',                               '', '',        'EXECUTE', 'EXECUTE'),
  ('public.join_household(text)',                             '', '',        'EXECUTE', 'EXECUTE'),
  ('public.bootstrap_new_user(text, text, text, text)',       '', '',        'EXECUTE', 'EXECUTE'),
  ('public.discard_unclaimed_household(uuid)',                '', '',        'EXECUTE', 'EXECUTE'),
  ('public.cook_meal(uuid, uuid)',                            '', '',        'EXECUTE', 'EXECUTE'),
  ('public.get_trip_reality(uuid)',                           '', '',        'EXECUTE', 'EXECUTE'),
  ('public.answer_trip_reality(uuid, text)',                  '', '',        'EXECUTE', 'EXECUTE'),
  ('public.mint_referral_code()',                             '', '',        '',        'EXECUTE'),
  ('public.health()',                                         '', 'EXECUTE', '',        'EXECUTE')
),
expected (kind, obj, grantee, privs) as (
  select 'rel', t.obj, v.grantee,
         case v.p when 'ALL' then 'DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'
                  when 'DML' then 'DELETE,INSERT,SELECT,UPDATE'
                  else v.p end
    from rel_target t,
         lateral (values ('PUBLIC', t.public_p), ('anon', t.anon_p), ('authenticated', t.auth_p), ('service_role', t.svc_p)) v (grantee, p)
  union all
  select 'fn', t.sig, v.grantee, v.p
    from fn_target t,
         lateral (values ('PUBLIC', t.public_p), ('anon', t.anon_p), ('authenticated', t.auth_p), ('service_role', t.svc_p)) v (grantee, p)
),
actual as (
  select e.kind, e.obj, e.grantee, e.privs as want,
         coalesce(case e.kind
           when 'rel' then (select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                              from pg_class c, aclexplode(c.relacl) a
                             where c.oid = to_regclass('public.' || e.obj)
                               and a.grantee = case e.grantee when 'PUBLIC' then 0 else e.grantee::regrole::oid end)
           else           (select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
                              from pg_proc p, aclexplode(p.proacl) a
                             where p.oid = to_regprocedure(e.obj)
                               and a.grantee = case e.grantee when 'PUBLIC' then 0 else e.grantee::regrole::oid end)
         end, '') as got,
         case e.kind when 'rel' then to_regclass('public.' || e.obj) is not null
                     else to_regprocedure(e.obj) is not null end as present
    from expected e
)
select
  (select system_identifier from pg_control_system())::text
    in ('7642734024280108049', '7606130613603586966')                                         as known_db,
  (select count(*) from actual)                                                                as checked,
  (select count(*) from actual where got <> want or not present)                               as mismatches,
  (select coalesce(string_agg(obj || '/' || grantee || ' want [' || want || '] got [' || got || ']'
                              || case when present then '' else ' MISSING' end, '; ' order by obj, grantee), '')
     from actual where got <> want or not present)                                             as mismatch_detail,
  (select coalesce(string_agg(distinct c.relname || ':' || coalesce(r.rolname, 'PUBLIC') || ':' || a.privilege_type, ', '), '')
     from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
     left join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and (a.grantee = 0 or a.grantee = 'anon'::regrole)
      and not (c.relname = 'beta_signups' and a.grantee = 'anon'::regrole and a.privilege_type = 'INSERT')) as anon_extra_rel,
  (select coalesce(string_agg(distinct p.proname || ':' || coalesce(r.rolname, 'PUBLIC'), ', '), '')
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace, aclexplode(p.proacl) a
     left join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public' and (a.grantee = 0 or a.grantee = 'anon'::regrole)
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.proname not in ('list_items_resurrect_cleanup', 'rls_auto_enable')
      and not coalesce(p.oid = to_regprocedure('public.health()') and a.grantee = 'anon'::regrole, false)) as anon_extra_fn,
  (select count(*)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and a.grantee in ('anon'::regrole, 'authenticated'::regrole)
      and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'))              as forbidden_privs;
