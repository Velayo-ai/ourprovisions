-- 077_rollback.sql — NEVER APPLIED unless 077 must be undone.
-- SPEC_ask.md + SPEC_ask_amendment_2026-11-03.md, Slice 1.
--
-- Undoes 077_ask.sql in reverse section order, landing on 051 / 026's shape: land_ask_picks
-- dropped, get_list_items_for_household back to its 9 columns (051, verbatim), the two
-- label-clearing edits reverted (remove_list_item = 051, list_items_resurrect_cleanup = 026,
-- verbatim), the attribution guard trigger + function dropped, the item-photos policies and bucket removed, household_item_photos + its two RPCs,
-- ask_shelf_items and asks dropped, and list_items.picked_by_labels + its CHECK + helper dropped.
--
-- REFUSES, rather than losing data silently, while any of these exist: a live list row with a
--   label (a household would lose "Picked by" mid-trip), an ask (live or soft-deleted), a
--   household_item_photos row, or an object in item-photos (Supabase refuses to drop a bucket
--   that holds objects; empty it through the Storage API first). Clear them deliberately, then
--   run this.
--
-- CLIENT: roll the client back FIRST. The 077 client calls land_ask_picks and reads
--   picked_by_labels from the list RPC; the pre-077 client reads neither.
--
-- Run as postgres, dev 7642734024280108049 or prod 7606130613603586966.
-- Then remove the dev ledger row by hand: delete from supabase_migrations.schema_migrations
-- where name = '077_ask';

begin;

do $preflight$
begin
  if (select system_identifier from pg_control_system())::text
       not in ('7642734024280108049', '7606130613603586966') then
    raise exception '077_rollback: unknown database';
  end if;
  if current_user <> 'postgres' then
    raise exception '077_rollback: run as postgres — current_user is %', current_user;
  end if;
  if exists (select 1 from public.list_items where deleted_at is null and picked_by_labels is not null) then
    raise exception '077_rollback: live list rows still carry pick labels';
  end if;
  if to_regclass('public.asks') is not null and exists (select 1 from public.asks) then
    raise exception '077_rollback: asks exist — delete them deliberately first';
  end if;
  if to_regclass('public.household_item_photos') is not null and exists (select 1 from public.household_item_photos) then
    raise exception '077_rollback: household_item_photos rows exist';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'item-photos') then
    raise exception '077_rollback: item-photos still holds objects — empty it through the Storage API first';
  end if;
end
$preflight$;

-- §8
drop function if exists public.land_ask_picks(uuid, uuid, uuid[]);

-- §7 — 051's 9-column body, verbatim.
drop function if exists public.get_list_items_for_household(uuid);
create function public.get_list_items_for_household(p_household_id uuid)
returns table (id uuid, catalog_item_id uuid, quantity integer, price_per_unit numeric, status text,
               added_by uuid, name text, category text, is_staple boolean)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not is_member_of(p_household_id) then
    raise exception 'get_list_items_for_household: not a member of household %', p_household_id using errcode = '42501';
  end if;

  return query
  select
    li.id, li.catalog_item_id, li.quantity, li.price_per_unit,
    li.status, li.added_by,
    ci.name, ci.category,
    exists (
      select 1 from household_staples hs
      where hs.household_id = p_household_id
        and hs.catalog_item_id = ci.id
    ) as is_staple
  from list_items li
  join catalog_items ci on ci.id = li.catalog_item_id
  where li.household_id = p_household_id
    and li.deleted_at is null
    and li.status in ('pending','bought')
    and ci.deleted_at is null;
end;
$function$;
revoke all on function public.get_list_items_for_household(uuid) from public;
revoke all on function public.get_list_items_for_household(uuid) from anon;
revoke all on function public.get_list_items_for_household(uuid) from service_role;
grant execute on function public.get_list_items_for_household(uuid) to authenticated;

-- §6 — 026 and 051, verbatim.
create or replace function public.list_items_resurrect_cleanup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
BEGIN
  -- (a) Provenance dies with the row: clear stale meal links.
  DELETE FROM list_item_meals WHERE list_item_id = NEW.id;

  -- (b) Re-home the row on the current open cycle (NULL if none).
  --     SELECT INTO with zero rows assigns NULL — the intended state.
  SELECT id INTO NEW.cycle_id
    FROM provision_cycles
    WHERE household_id = NEW.household_id
      AND closed_at IS NULL
      AND deleted_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1;

  RETURN NEW;
END;
$function$;

create or replace function public.remove_list_item(p_household_id uuid, p_catalog_item_id uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clerk_id text;
  v_user_id uuid;
  v_list_item_id uuid;
  v_cleared int := 0;
begin
  if not is_member_of(p_household_id) then
    raise exception 'remove_list_item: not a member of household %', p_household_id using errcode = '42501';
  end if;

  -- Identify the caller from the Clerk subject claim (NOT auth.uid()).
  v_clerk_id := auth.jwt()->>'sub';
  if v_clerk_id is null then
    raise exception 'remove_list_item: no clerk subject on JWT';
  end if;

  select id into v_user_id from users where clerk_id = v_clerk_id;
  if v_user_id is null then
    raise exception 'remove_list_item: no user for clerk_id %', v_clerk_id;
  end if;

  -- Resolve the single ACTIVE list_items row for this household+catalog item.
  -- UNIQUE(household_id, catalog_item_id) => at most one match.
  select id into v_list_item_id
  from list_items
  where household_id = p_household_id
    and catalog_item_id = p_catalog_item_id
    and deleted_at is null;

  -- Already removed / never present: no-op, report nothing changed.
  if v_list_item_id is null then
    return json_build_object(
      'removed', false,
      'list_item_id', null,
      'contributors_cleared', 0
    );
  end if;

  -- Clear contributor attribution for this list item.
  delete from list_item_contributors
  where list_item_id = v_list_item_id;
  get diagnostics v_cleared = row_count;

  -- Soft-delete the list_items row.
  update list_items
  set deleted_at = now()
  where id = v_list_item_id;

  return json_build_object(
    'removed', true,
    'list_item_id', v_list_item_id,
    'contributors_cleared', v_cleared
  );
end;
$function$;

-- §5
drop policy if exists "item photos readable by members" on storage.objects;
drop policy if exists "item photos writable by members" on storage.objects;
delete from storage.buckets where id = 'item-photos';

-- §4 – §2
drop function if exists public.set_household_item_photo(uuid, uuid, text, text);
drop function if exists public.remove_household_item_photo(uuid);
drop table if exists public.household_item_photos;
drop table if exists public.ask_shelf_items;
drop table if exists public.asks;

-- §1
drop trigger if exists trg_list_items_picked_by_guard on public.list_items;
drop function if exists public.list_items_picked_by_guard();
alter table public.list_items drop constraint if exists list_items_picked_by_labels_valid;
alter table public.list_items drop column if exists picked_by_labels;
drop function if exists public.picked_by_labels_valid(text[]);

notify pgrst, 'reload schema';

do $verify$
begin
  if to_regclass('public.asks') is not null or to_regclass('public.ask_shelf_items') is not null
     or to_regclass('public.household_item_photos') is not null
     or to_regprocedure('public.land_ask_picks(uuid, uuid, uuid[])') is not null
     or exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'list_items' and column_name = 'picked_by_labels')
     or exists (select 1 from storage.buckets where id = 'item-photos')
     or to_regprocedure('public.list_items_picked_by_guard()') is not null
     or exists (select 1 from pg_trigger where tgname = 'trg_list_items_picked_by_guard') then
    raise exception '077_rollback: an 077 object survived';
  end if;
  if (select md5(replace(prosrc, chr(13), '')) from pg_proc
       where oid = to_regprocedure('public.remove_list_item(uuid, uuid)')) <> 'c8af57125208213cb5d9e4541d8db327'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc
          where oid = to_regprocedure('public.list_items_resurrect_cleanup()')) <> 'a39601c2e87249aae1aed10f3bc8f2e4'
     or (select md5(replace(prosrc, chr(13), '')) from pg_proc
          where oid = to_regprocedure('public.get_list_items_for_household(uuid)')) <> '66439853a086e87f770f71412014fc27' then
    raise exception '077_rollback: a restored body does not match its pre-077 hash';
  end if;
end
$verify$;

commit;
