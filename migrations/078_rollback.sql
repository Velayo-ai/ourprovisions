-- 078_rollback.sql — NEVER APPLIED unless 078 must be undone.
-- SPEC_ask_slice2.md, "078 — create_ask".
--
-- Undoes 078_create_ask.sql in reverse section order, landing on 077's shape: INSERT on asks back
-- to authenticated (077's grant), create_ask dropped, asks_household_label_live_uq dropped.
--
-- KEEPS every ask and shelf row: create_ask writes ordinary 077 rows, valid without 078. Nothing is
--   lost, so nothing is refused. Without the index two live asks may share a label again.
--
-- CLIENT: roll the client back FIRST. The Slice 2 client (C2) creates asks only through create_ask;
--   with 078 gone, + New shelf fails.
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '078_create_ask';

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '078_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '078_rollback: run as postgres — current_user is %', current_user;
  end if;
  if to_regclass('public.asks') is null then
    raise exception '078_rollback: no asks table — 077 is not here, so neither is 078';
  end if;
end
$preflight$;

-- §3
grant insert on table public.asks to authenticated;

-- §2
drop function if exists public.create_ask(uuid, uuid, text, text, text, smallint, uuid[]);

-- §1
drop index if exists public.asks_household_label_live_uq;

notify pgrst, 'reload schema';

do $verify$
begin
  if to_regprocedure('public.create_ask(uuid, uuid, text, text, text, smallint, uuid[])') is not null
     or to_regclass('public.asks_household_label_live_uq') is not null then
    raise exception '078_rollback: an 078 object survived';
  end if;
  if (select string_agg(distinct a.privilege_type, ',' order by a.privilege_type)
        from pg_class c, aclexplode(c.relacl) a
       where c.oid = 'public.asks'::regclass and a.grantee = 'authenticated'::regrole::oid
         and a.privilege_type <> 'MAINTAIN') is distinct from 'INSERT,SELECT' then
    raise exception '078_rollback: authenticated on asks is not 077''s INSERT,SELECT';
  end if;
end
$verify$;

commit;
