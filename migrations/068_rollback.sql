-- 068_rollback.sql — NEVER APPLIED unless 068 must be undone.
-- SPEC_grants_least_privilege_067.md, Amendment 2026-10-23 (Rollback).
--
-- Re-grants the pre-068 PROD ACLs exactly (Step 0 inventory, prod 7606130613603586966,
-- 2026-10-23; grantor postgres throughout). 068 only narrowed or restated, so undoing it is
-- grants only — nothing to revoke:
--   anon           ALL on 15 tables + the category_avg_prices view (068 left beta_signups INSERT)
--   authenticated  ALL on 19 tables + category_avg_prices (068 left DML / SELECT)
--   PUBLIC, anon   EXECUTE on get_catalog_names_by_ids, get_current_household_id,
--                  get_current_user_id, get_my_households, is_member_of
-- Unchanged by 068, so untouched here: every service_role grant (stores has none), and
-- authenticated on list_item_events (SELECT, INSERT), meal_placements (SELECT, INSERT, UPDATE),
-- meal_cooks (SELECT), stores (SELECT); the service_role function grants 068 wrote down.
-- 067's health() stays (drop it only after the synthetic points elsewhere).
--
-- DEV: pre-068 dev had no MAINTAIN for anon / authenticated (007_dev_restore_role_grants
--   predates PostgreSQL 17). GRANT ALL gives MAINTAIN, so on dev also run the commented
--   block at the end to land on dev's pre-068 shape exactly.
-- Run as postgres (the grantor of record).

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '068_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '068_rollback: run as postgres — current_user is %', current_user;
  end if;
end
$preflight$;

grant all on table
  public.beta_signups, public.catalog_items, public.household_members, public.household_staples,
  public.households, public.list_item_contributors, public.list_item_meals, public.list_items,
  public.meal_ingredients, public.meals, public.user_hidden_items, public.users,
  public.velayo_crew_members, public.velayo_crews, public.waste_events,
  public.category_avg_prices
to anon;

grant all on table
  public.beta_signups, public.catalog_items, public.household_invites, public.household_members,
  public.household_staples, public.households, public.known_stores, public.list_item_contributors,
  public.list_item_meals, public.list_items, public.meal_ingredients, public.meals,
  public.provision_cycles, public.shopping_sessions, public.user_hidden_items, public.users,
  public.velayo_crew_members, public.velayo_crews, public.waste_events,
  public.category_avg_prices
to authenticated;

grant execute on function
  public.get_catalog_names_by_ids(uuid[]), public.get_current_household_id(),
  public.get_current_user_id(), public.get_my_households(), public.is_member_of(uuid)
to public, anon;

commit;

-- DEV ONLY — land on dev's pre-068 shape (no MAINTAIN for anon / authenticated):
-- revoke maintain on table
--   public.beta_signups, public.catalog_items, public.household_members, public.household_staples,
--   public.households, public.list_item_contributors, public.list_item_meals, public.list_items,
--   public.meal_ingredients, public.meals, public.user_hidden_items, public.users,
--   public.velayo_crew_members, public.velayo_crews, public.waste_events, public.category_avg_prices
-- from anon;
-- revoke maintain on table
--   public.beta_signups, public.catalog_items, public.household_invites, public.household_members,
--   public.household_staples, public.households, public.known_stores, public.list_item_contributors,
--   public.list_item_meals, public.list_items, public.meal_ingredients, public.meals,
--   public.provision_cycles, public.shopping_sessions, public.user_hidden_items, public.users,
--   public.velayo_crew_members, public.velayo_crews, public.waste_events, public.category_avg_prices
-- from authenticated;

-- VERIFY — one row. Expect (prod, and dev before the commented block):
--   anon_all 16 · authenticated_all 20 · fn_public_exec 5 · fn_anon_exec 5
with all8 as (select 'DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE'::text as v),
rel_privs as (
  select c.relname, r.rolname, string_agg(distinct a.privilege_type, ',' order by a.privilege_type) as privs
    from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
    join pg_roles r on r.oid = a.grantee
   where n.nspname = 'public' and c.relkind in ('r', 'v') and r.rolname in ('anon', 'authenticated')
   group by c.relname, r.rolname
),
fn_privs as (
  select p.oid, a.grantee from pg_proc p, aclexplode(p.proacl) a
   where p.oid in ('public.get_catalog_names_by_ids(uuid[])'::regprocedure, 'public.get_current_household_id()'::regprocedure,
                   'public.get_current_user_id()'::regprocedure, 'public.get_my_households()'::regprocedure,
                   'public.is_member_of(uuid)'::regprocedure)
     and a.privilege_type = 'EXECUTE'
)
select
  (select count(*) from rel_privs, all8 where rolname = 'anon' and privs = all8.v)          as anon_all,
  (select count(*) from rel_privs, all8 where rolname = 'authenticated' and privs = all8.v) as authenticated_all,
  (select count(distinct oid) from fn_privs where grantee = 0)                                as fn_public_exec,
  (select count(distinct oid) from fn_privs where grantee = 'anon'::regrole)                  as fn_anon_exec;
