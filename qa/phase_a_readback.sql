-- Phase A object read-back — read-only, runs on dev or prod. One row; each column is one marker.
select
  (select system_identifier from pg_control_system())::text                                    as which_db,
  -- 072
  to_regclass('public.meal_gifts') is not null
    and to_regclass('public.meal_gift_receipts') is not null                                    as m072_tables,
  exists (select 1 from information_schema.columns where table_schema='public'
          and table_name='meal_photos' and column_name='kind')                                  as m072_kind_col,
  to_regprocedure('public.give_meal(uuid, text)') is not null
    and to_regprocedure('public.preview_meal_gift_public(text)') is not null
    and to_regprocedure('public.accept_gift_photo(uuid, uuid, text, text, integer, integer)') is not null
                                                                                                as m072_rpcs,
  exists (select 1 from storage.buckets where id='gift-photos')                                 as m072_bucket,
  -- 073
  to_regprocedure('public.set_photo_kind(uuid, text)') is not null                              as m073_set_photo_kind,
  coalesce((select pg_get_indexdef(to_regclass('public.meal_photos_one_live_per_cook')) ilike '%kind%'), false)
                                                                                                as m073_cook_idx_cook_only,
  -- 074
  exists (select 1 from information_schema.columns where table_schema='public'
          and table_name='meal_gifts' and column_name='photo_ext')                              as m074_photo_ext,
  to_regprocedure('public.attach_gift_photo(uuid, text)') is not null                           as m074_attach_gift_photo,
  coalesce((select 'image/jpeg' = any(allowed_mime_types) from storage.buckets where id='gift-photos'), false)
                                                                                                as m074_bucket_jpeg,
  -- 075
  coalesce((select prosrc ilike '%''is_giving_place'',%' from pg_proc
            where oid = to_regprocedure('public.preview_meal_gift(text, uuid)')), false)       as m075_is_giving_place,
  -- 076
  (select count(*) from information_schema.columns where table_schema='public' and table_name='meal_photos'
     and column_name in ('showcased_by','showcased_at','received_at'))                          as m076_cols_of_3,
  to_regclass('public.meal_photos_one_live_showcase_per_meal') is not null                      as m076_per_meal_idx,
  to_regclass('public.meal_photos_one_live_showcase_per_person') is null                        as m076_per_person_idx_gone,
  to_regprocedure('public.add_showcase_photo(uuid, text, text, integer, integer)') is null      as m076_add_showcase_gone,
  -- whole-body fingerprint of every Phase A function (compare prod to dev after 076)
  (select md5(string_agg(p.proname || ':' || md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), ''), '|' order by p.proname))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in
      ('mint_gift_code','give_meal','preview_meal_gift','preview_meal_gift_public','record_meal_gift_receipt',
       'revoke_meal_gifts','gift_photo_readable','gift_photo_writable','accept_gift_photo','set_photo_kind',
       'attach_gift_photo','add_meal_photo'))                                                   as fn_fingerprint;
