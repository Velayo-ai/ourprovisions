-- ============================================================
-- 022 — Restrict anon catalog reads to global items only
-- ============================================================
-- BUG: policy "Anyone can read global catalog items" (role anon,
-- cmd SELECT) had predicate `(deleted_at IS NULL)`. The name says
-- global; the SQL never checked is_global. Result: all 183 rows of
-- catalog_items — including 133 household-custom rows containing
-- user-authored free text (medication reminders, personal notes) —
-- were readable by any anonymous visitor with the publishable anon
-- key. Confirmed in prod via incognito DevTools, 2026-07-17.
--
-- FIX: add the is_global check the policy name always claimed.
--
-- ALTER POLICY (not DROP/CREATE): no window where the table sits
-- without an anon policy, no risk of a failed recreate leaving it
-- open. is_global is `boolean default false`, so custom rows fail
-- closed — a row must be explicitly marked global to be public.
--
-- Does NOT touch catalog_items_select (role authenticated), which
-- is already correct: ((is_global = true) OR is_member_of(household_id)).
-- ============================================================

alter policy "Anyone can read global catalog items"
  on public.catalog_items
  to anon
  using (is_global = true and deleted_at is null);

-- ============================================================
-- VERIFY — policy shape
-- Expect: ((is_global = true) AND (deleted_at IS NULL))
-- ============================================================
select polname,
       pg_get_expr(polqual, polrelid) as using_expr,
       polroles::regrole[] as roles
from pg_policy
where polrelid = 'public.catalog_items'::regclass
  and polcmd = 'r';

-- ============================================================
-- VERIFY — actual anon visibility
--
-- The check above only proves the predicate text. It does NOT prove
-- the leak is closed: this editor runs as role `postgres` and
-- bypasses RLS entirely, so a plain count here returns all 183 rows
-- whether the fix worked or not.
--
-- This block impersonates anon in-session to exercise the policy.
-- Expect: 50 visible_rows, 0 custom_rows_visible.
-- ============================================================
begin;
  set local role anon;
  select count(*) as visible_rows,
         count(*) filter (where not is_global) as custom_rows_visible
  from public.catalog_items
  where deleted_at is null;
rollback;

-- Belt and braces: confirm from outside the database with the anon
-- key over PostgREST (PowerShell) — this is the path the browser uses.
--
--   $anon = "<prod anon key>"
--   $h = @{ apikey = $anon; Authorization = "Bearer $anon" }
--   $r = Invoke-RestMethod -Uri "https://parpauldmbetptkmdwbd.supabase.co/rest/v1/catalog_items?deleted_at=is.null&select=name,is_global" -Headers $h
--   "$($r.Count) rows; $(($r | Where-Object { -not $_.is_global }).Count) custom"
--
-- Expect: "50 rows; 0 custom"   (was: "183 rows; 133 custom")
