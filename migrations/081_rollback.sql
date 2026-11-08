-- 081_rollback.sql — removes the contributor rows 081 restored (the rolled rows go back to no "Added by").
-- Only if 081 must be undone. Paste the ids from that database's "081 contributor ids: …" warning
-- (postgres log, the apply time) into the array; nothing else is touched.
--   dev  (applied 2026-11-08 03:31:49 UTC): '39e18e8c-e65b-4118-8b8f-fa993e16c4ba' (Board Walk, the only row)
--   prod (applied by Dan):     see the 081 warning on prod

begin;

delete from public.list_item_contributors
 where id = any(array[
   -- '<uuid>', …
 ]::uuid[]);

commit;
