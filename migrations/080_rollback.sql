-- 080_rollback.sql — restores archive_trip_items to 051's body verbatim (the household-wide contributor
-- wipe returns, rolled items included). Only if 080 must be undone; roll back 080 before 079.
-- Then read back: md5(prosrc) = 'a76ae07cdce99787009e0a8641c0e815'.

begin;

create or replace function public.archive_trip_items(p_household_id uuid, p_keep_item_ids uuid[])
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_item_id uuid;
begin
  if not is_member_of(p_household_id) then
    raise exception 'archive_trip_items: not a member of household %', p_household_id using errcode = '42501';
  end if;

  -- Archive all bought items
  update list_items
  set deleted_at = now()
  where household_id = p_household_id
    and status = 'bought'
    and deleted_at is null;

  -- Archive pending items NOT in the keep list
  update list_items
  set deleted_at = now()
  where household_id = p_household_id
    and status = 'pending'
    and deleted_at is null
    and (
      array_length(p_keep_item_ids, 1) is null
      or id != all(p_keep_item_ids)
    );

  -- Clear ALL contributor badges for this household's items
  -- Rolled-forward items get fresh attribution next cycle
  delete from list_item_contributors
  where list_item_id in (
    select id from list_items
    where household_id = p_household_id
  );

end;
$function$;

revoke all on function public.archive_trip_items(uuid, uuid[]) from public;
revoke all on function public.archive_trip_items(uuid, uuid[]) from anon;
revoke all on function public.archive_trip_items(uuid, uuid[]) from service_role;
grant execute on function public.archive_trip_items(uuid, uuid[]) to authenticated;

commit;

select md5(prosrc) = 'a76ae07cdce99787009e0a8641c0e815' as body_is_051,
       prosecdef as secdef,
       has_function_privilege('anon', oid, 'execute') as anon,
       has_function_privilege('authenticated', oid, 'execute') as authenticated,
       has_function_privilege('service_role', oid, 'execute') as service_role
from pg_proc where proname = 'archive_trip_items' and pronamespace = 'public'::regnamespace;
