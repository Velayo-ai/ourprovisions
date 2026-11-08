-- 081_rollback.sql — removes the contributor rows 081 restored (the rolled rows go back to no "Added by").
-- Only if 081 must be undone. Paste the ids from that database's "081 contributor ids: …" warning
-- (postgres log, the apply time) into the array; nothing else is touched.
--   dev  (applied 2026-11-08 03:31:49 UTC): '39e18e8c-e65b-4118-8b8f-fa993e16c4ba' (Board Walk, the only row)
--   prod (applied by Dan 2026-11-08 04:16:28 UTC; Golf Weekend - October 2026, all 8 rows):
--        '0647cc8e-cc72-40f6-a0b9-b1c92cf24e6a', '4446be7c-4a81-41c0-85b4-3f7cfabbe556',
--        '6aec040d-b4fd-448d-a390-d00c18fb9e6a', '6d9cacf6-3a37-46f2-997c-4ccc1493b0e9',
--        '954ef3ea-4e86-4347-882a-e4f6fcee9c76', 'b96957c1-b51d-4ce8-98f6-68b4c2e5fbb3',
--        'd23295c2-2b35-43ce-8476-3d26d73f2fc4', 'faa4838d-9d55-46f8-ab22-76908904d792'

begin;

delete from public.list_item_contributors
 where id = any(array[
   -- '<uuid>', …
 ]::uuid[]);

commit;
