-- ============================================================
-- 024 — Household photo header ("OurBanner")
-- ============================================================
-- Per-household photo as the app header background, with the
-- household's own framing (position + zoom) and its own choice of
-- how loud the OurProvisions wordmark sits over it.
--
-- Spec: docs/specs/active/SPEC_household_photo_header.md
-- Approved mockup: docs/mockups/mockup_ourbanner.html
--
-- ⚠️ NUMBER: this is 024, NOT 023.
--   021 = beta_signups          (applied dev+prod)
--   022 = anon catalog fix      (applied dev+prod 2026-07-18)
--   023 = referral primitive    (specced, not applied)
--   024 = this
-- An earlier same-night draft claimed 023 and collides with the
-- referral primitive. That draft is superseded — delete it.
-- ============================================================

alter table households
  add column photo_path        text,
  add column photo_position_x  smallint not null default 50,
  add column photo_position_y  smallint not null default 50,
  add column photo_zoom        smallint not null default 100,
  add column banner_wordmark   text     not null default 'large';

-- photo_path is the STORAGE OBJECT PATH, not a URL.
-- URLs embed project refs and expiry and break across dev/prod.
-- Resolve to a URL at read time. Null = no photo = espresso
-- fallback = no banner control (the control is gated on presence).

-- Percent units, mapping 1:1 to CSS with no conversion layer:
--   background-size:     {photo_zoom}% auto;
--   background-position: {photo_position_x}% {photo_position_y}%;
-- Framing is non-destructive: the stored original is never
-- modified after EXIF normalization. Reframing writes 3 integers.

alter table households
  add constraint households_photo_pos_x_range
    check (photo_position_x between 0 and 100),
  add constraint households_photo_pos_y_range
    check (photo_position_y between 0 and 100),
  add constraint households_photo_zoom_range
    check (photo_zoom between 100 and 320),
  add constraint households_banner_wordmark_valid
    check (banner_wordmark in ('large','small','hidden'));

-- Zoom floor of 100 is meaningful: below it the photo would not
-- fill the band. Ceiling of 320 matches the tuner's range.

-- ============================================================
-- RLS — no change required.
--
-- The existing households policy is is_member_of(household_id)
-- for ALL commands, so any member can already update these
-- columns. That IS the intended permission model: photo, framing,
-- banner, and name are all any-member.
--
-- Delete household stays creator-gated IN THE CLIENT, as today.
-- Do not add a DB-level gate here — separate decision.
-- ============================================================

-- ============================================================
-- STORAGE — bucket + policies
--
-- Run AFTER creating the bucket `household-photos` as PRIVATE
-- (Dashboard → Storage → New bucket, public = off).
--
-- Object path: {household_id}/header.jpg
-- First path segment is the household id, which is what
-- storage.foldername(name))[1] extracts.
--
-- Reuses is_member_of() — the same SECURITY DEFINER helper the
-- catalog and list policies use. Clerk identity throughout;
-- never auth.uid().
--
-- ANON GETS NOTHING. Migration 022 (same session) found a policy
-- named "Anyone can read global catalog items" whose predicate had
-- no is_global check — it leaked 133 custom rows including a beta
-- user's parent's medication schedule to the open internet. A
-- household photo is a picture of where people live. There is no
-- anon policy here, and the absence IS the security.
-- ============================================================

create policy "household photos readable by members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'household-photos'
    and is_member_of((storage.foldername(name))[1]::uuid)
  );

create policy "household photos writable by members"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'household-photos'
    and is_member_of((storage.foldername(name))[1]::uuid)
  );

create policy "household photos updatable by members"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'household-photos'
    and is_member_of((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'household-photos'
    and is_member_of((storage.foldername(name))[1]::uuid)
  );

create policy "household photos deletable by members"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'household-photos'
    and is_member_of((storage.foldername(name))[1]::uuid)
  );

-- ============================================================
-- VERIFY — columns and constraints
-- ============================================================
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'households'
  and column_name in ('photo_path','photo_position_x','photo_position_y',
                      'photo_zoom','banner_wordmark')
order by column_name;

select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.households'::regclass
  and (conname like 'households_photo%' or conname like 'households_banner%');

-- ============================================================
-- VERIFY — storage policies
-- ============================================================
select polname, polcmd, polroles::regrole[] as roles
from pg_policy
where polrelid = 'storage.objects'::regclass
  and polname like 'household photos%';

-- ============================================================
-- VERIFY — defaults are sane on existing rows
-- Expect: every household photo_path null, x/y 50, zoom 100,
-- banner_wordmark 'large' → i.e. today's header, unchanged.
-- ============================================================
select count(*)                                              as households,
       count(photo_path)                                     as with_photo,
       count(*) filter (where banner_wordmark = 'large')     as banner_large
from households
where deleted_at is null;

-- ============================================================
-- NOTE ON VERIFYING STORAGE RLS
--
-- The SQL editor runs as role `postgres` and BYPASSES RLS. It
-- cannot confirm the storage policies above. The queries here only
-- prove the policies EXIST, not that they WORK.
--
-- Test for real:
--   1. Authenticated non-member requests another household's
--      object  → must fail
--   2. Anon requests any object                → must fail
--   3. Member requests own household's object  → must succeed
--
-- Same lesson as 022: a policy's name is not its predicate, and
-- the editor will happily lie to you about both.
-- ============================================================
