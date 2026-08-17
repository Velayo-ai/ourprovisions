-- 034_pin_search_path_secdef.sql
-- Authorization Part 5 — pin search_path on the five SECURITY DEFINER functions that
-- still have proconfig IS NULL.
--
-- NUMBERING: 033 is the highest on disk and is applied to dev + prod. 031 remains
-- reserved for cycle-integrity (SPEC_cycle_integrity_031). 034 is independent of every
-- other open part — it touches no table, no policy, no grant, and no function body.
--
-- WHY THIS IS A REAL GAP
-- A SECURITY DEFINER function executes with the OWNER's privileges (owner here is
-- `postgres`). With a mutable search_path, a caller able to create objects in a schema
-- that sorts earlier on that path can shadow a table or function the body references and
-- have their object execute as the owner. That is the standard privilege-escalation
-- shape, and it is why Supabase's advisor flags it as `function_search_path_mutable`.
--
-- OBSERVED STATE BEFORE THIS MIGRATION (2026-08-17, read-only, BOTH environments)
--   select proname, pg_get_function_arguments(oid), proconfig
--   from pg_proc
--   where pronamespace = 'public'::regnamespace and prosecdef and proconfig is null;
-- returns the IDENTICAL five-row set on dev (7642734024280108049) and prod
-- (7606130613603586966) — no drift on these five. Databases identified by
-- pg_control_system().system_identifier, not by server label.
--
--   archive_trip_items(uuid, uuid[])
--   close_cycle(uuid, uuid[])
--   get_active_cycle(uuid)
--   get_household_user_ids(uuid)
--   match_known_store(uuid, float8, float8)
--
-- `bootstrap_new_user` was pinned by 029 and is correctly absent from that set.
--
-- WHY `public, extensions` IS SAFE FOR THESE FIVE (checked, not assumed)
-- Pinning search_path is only behaviour-neutral if nothing in the body resolves through
-- a schema being removed from the path. All five bodies were inspected on dev before
-- authoring: NONE references auth.*, storage.*, extensions.*, or the earthdistance/cube
-- operators. Every object reference resolves within `public`. `extensions` is included
-- as the house convention (it is where Supabase installs pgcrypto/uuid-ossp, which a
-- future edit to these bodies would reach for) — it is belt-and-braces here, not load-
-- bearing. match_known_store computes distance arithmetically and does NOT use
-- earthdistance, despite taking lat/lng.
--
-- NO BEHAVIOUR CHANGE, NO REWRITE. `alter function ... set search_path` mutates only
-- pg_proc.proconfig. It does NOT use CREATE OR REPLACE, so bodies, argument defaults,
-- return types, grants and OIDs are all untouched — there is no window in which a
-- function is dropped or redefined, and no regression surface in the client. This is the
-- lowest-risk migration in the authorization series.

begin;

alter function public.archive_trip_items(uuid, uuid[])        set search_path = public, extensions;
alter function public.close_cycle(uuid, uuid[])               set search_path = public, extensions;
alter function public.get_active_cycle(uuid)                  set search_path = public, extensions;
alter function public.get_household_user_ids(uuid)            set search_path = public, extensions;
alter function public.match_known_store(uuid, float8, float8) set search_path = public, extensions;

commit;

-- =====================================================================
-- VERIFY
-- =====================================================================
-- (1) THE headline check — no SECURITY DEFINER function in public is left unpinned:
--
-- select proname, pg_get_function_arguments(oid) as args, proconfig
-- from pg_proc
-- where pronamespace = 'public'::regnamespace and prosecdef and proconfig is null;
--
-- Expect ZERO ROWS, in BOTH environments.
--
-- (2) Positive confirmation on exactly these five (a zero-row result above could also
--     mean the query was wrong; assert the values directly):
--
-- select proname, proconfig
-- from pg_proc
-- where pronamespace = 'public'::regnamespace
--   and proname in ('archive_trip_items','close_cycle','get_active_cycle',
--                   'get_household_user_ids','match_known_store')
-- order by proname;
--
-- Expect all five -> {"search_path=public, extensions"}.
--
-- (3) Advisor: re-run get_advisors(security) -> the `function_search_path_mutable`
--     warnings for these five should be gone. Other warnings may remain (the 59-warning
--     backlog is NOT all Part 5); check the five by name rather than the total count.
--
-- (4) Smoke the core loop on the deployed dev preview, not localhost. These five sit on
--     the cycle/shop path (useProvisions.js cycles + sessions call sites). A pinned
--     search_path that broke resolution would present as a runtime 42P01/42883 inside
--     the RPC, not as a migration error — so the migration succeeding is NOT proof the
--     functions still run. Exercise at least get_active_cycle (loads on app open) and
--     close_cycle before promoting to prod.
