-- 064_all_on_hand.sql
-- SPEC_all_on_hand.md (design chat + Dan's Step 0 rulings, 2026-10-19) — a meal you
-- don't need to shop for is ready.
--
-- WHY
--   Add to Shop with every ingredient marked "I have it" added nothing, and the meal
--   looped back to "Add to Shop" on every surface; the only exit was the board ⋯
--   freezer-pizza Cooked it. Everything is already in the house, there is no trip —
--   the meal is ready to cook (C2: no trip exists, so no wrap-up is skipped).
--
-- WHAT
--   1. add_meal_to_list (D1): after the ingredient loop, when the call processed NO
--      ingredient (v_count = 0: every one on hand and none included), the meal has at
--      least one live ingredient, and the meal has no live linked list row, stamp its
--      OPEN placement (cooked_at, skipped_at, ready_at all null) ready_at = now(). Same
--      transaction, same advisory lock as the add. Body otherwise VERBATIM from 049
--      (live on dev and prod, identical modulo CRLF — Step 0, 2026-10-19).
--   2. public.meal_ready_events (D3): append-only record of the moment a meal became
--      cookable WITHOUT a trip, for Phase 4 (no-trip meals, savings / earth-kind
--      gamification). The RPC is its ONLY writer, and only IF FOUND (a placement was
--      actually stamped). source 'wrap_up' is allowed by the CHECK for a later writer;
--      nothing writes it now (close_cycle is untouched). No counter, no UI.
--
-- ready_at, WIDENED (D2 — recorded in ARCHITECTURE): the moment this meal became
--   cookable — at wrap-up (close_cycle 052: every item bought or removed), or at Add
--   to Shop when everything was on hand (here). close_cycle stamps only where
--   ready_at IS NULL, so it never re-stamps these rows; a re-plan (the client's
--   appendPlacement upsert) clears it — replanning starts over.
--
-- NOT CHANGED
--   * Signature, return type (integer — the count stays 0 for all on hand; the client
--     reloads placements after a 0 count), SECURITY DEFINER, search_path, the
--     is_member_of check as the first membership statement, the ACL (re-stated below
--     so the read-back proves it).
--   * close_cycle, cook_meal, every RLS policy on existing tables.
--
-- GRANTS (CLAUDE.md new-table rule): Supabase's default privileges give a new table
--   ALL to authenticated, and RLS does not cover all of it (TRUNCATE bypasses RLS).
--   meal_ready_events revokes from public, anon AND authenticated, has RLS on and NO
--   policies; the VERIFY row proves authenticated and anon hold nothing.
--
-- APPLY: dev first, by Dan in the SQL editor (project zxwtxjjmssykhqrghouf,
--   system_identifier 7642734024280108049), then VERIFY A, then DRY RUN B, BEFORE the
--   client that reads the stamp ships to dev. Prod later: 064 before the client, as
--   063 was. Idempotent: create if not exists + create or replace.

begin;

-- ── 2. meal_ready_events ────────────────────────────────────────────────
create table if not exists public.meal_ready_events (
  id           uuid        primary key default gen_random_uuid(),
  household_id uuid        not null references public.households(id) on delete cascade,
  meal_id      uuid        not null references public.meals(id) on delete cascade,
  source       text        not null check (source in ('on_hand', 'wrap_up')),
  created_by   uuid        null references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.meal_ready_events is
  '064 — append-only: the moment a meal became cookable. source ''on_hand'' = Add to Shop with everything on hand (no trip), written ONLY by add_meal_to_list (SECURITY DEFINER). ''wrap_up'' reserved; nothing writes it yet. No client access: RLS on, no policies, no grants to public/anon/authenticated. For Phase 4 (no-trip meals); no counter or UI reads it yet. SPEC_all_on_hand D3, 2026-10-19.';

create index if not exists meal_ready_events_household_created_idx
  on public.meal_ready_events (household_id, created_at);

alter table public.meal_ready_events enable row level security;

revoke all on table public.meal_ready_events from public;
revoke all on table public.meal_ready_events from anon;
revoke all on table public.meal_ready_events from authenticated;

-- ── 1. add_meal_to_list ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_meal_to_list(p_meal_id uuid, p_servings integer DEFAULT 1, p_cycle_id uuid DEFAULT NULL::uuid, p_include_on_hand_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_household_id  uuid;
  v_user_id       uuid;
  v_cycle_id      uuid;
  v_ingredient    record;
  v_qty           integer;
  v_list_item_id  uuid;
  v_was_tombstoned boolean;
  v_existing_status text;
  v_count         integer := 0;
BEGIN
  -- INVARIANT (049): for any live pending list_items row,
  --   quantity = SUM(list_item_meals.quantity_contributed) over its links.
  -- quantity_contributed = how much of the row this meal STILL OWNS (049),
  -- no longer "how much it put here" (039). add_count is history and never
  -- moves except +1 per add.
  SELECT household_id INTO v_household_id
    FROM meals
    WHERE id = p_meal_id
      AND deleted_at IS NULL;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Meal % not found or deleted', p_meal_id;
  END IF;

  IF NOT is_member_of(v_household_id) THEN
    RAISE EXCEPTION 'Not authorized for household %', v_household_id;
  END IF;

  v_user_id := get_current_user_id();

  PERFORM pg_advisory_xact_lock(hashtext(v_household_id::text));

  IF p_cycle_id IS NOT NULL THEN
    SELECT id INTO v_cycle_id
      FROM provision_cycles
      WHERE id = p_cycle_id
        AND household_id = v_household_id
        AND closed_at IS NULL
        AND deleted_at IS NULL;
  END IF;

  IF v_cycle_id IS NULL THEN
    SELECT id INTO v_cycle_id
      FROM provision_cycles
      WHERE household_id = v_household_id
        AND closed_at IS NULL
        AND deleted_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1;
  END IF;

  IF v_cycle_id IS NULL THEN
    INSERT INTO provision_cycles (household_id, cycle_type, created_by)
      VALUES (v_household_id, 'planned', v_user_id)
      RETURNING id INTO v_cycle_id;
  END IF;

  -- on_hand (044) three cases as one predicate:
  --   on_hand = false                      -> include (unchanged)
  --   on_hand = true, NOT in include list  -> skip entirely
  --   on_hand = true, IS  in include list  -> include at real quantity
  -- The include list carries CATALOG_ITEM_IDs. This function never writes
  -- meal_ingredients.on_hand: the override is one-time, scoped to this call.
  -- COALESCE guards an explicit NULL, since x = ANY(NULL) is NULL, not false.
  FOR v_ingredient IN
    SELECT catalog_item_id, quantity_per_serving
      FROM meal_ingredients
      WHERE meal_id = p_meal_id
        AND deleted_at IS NULL
        AND (
          on_hand = false
          OR catalog_item_id = ANY (COALESCE(p_include_on_hand_ids, '{}'::uuid[]))
        )
  LOOP
    v_qty := GREATEST(1, round(v_ingredient.quantity_per_serving * p_servings)::integer);

    -- 049: read the conflicting row's state under a row lock BEFORE the upsert,
    -- so the branch decision below and the ledger write see the same row.
    -- Both are NULL when no row exists yet.
    v_was_tombstoned  := NULL;
    v_existing_status := NULL;
    SELECT (deleted_at IS NOT NULL), status INTO v_was_tombstoned, v_existing_status
      FROM list_items
      WHERE household_id = v_household_id
        AND catalog_item_id = v_ingredient.catalog_item_id
      FOR UPDATE;

    -- 048: three-way branch on the conflicting row.
    --   tombstone      -> reset to this add's quantity (026 clears the stale links)
    --   live, pending  -> increment
    --   live, bought   -> the NEW NEED: this add's quantity, back to pending,
    --                     checked_by cleared. Never old + new — the household
    --                     already has the old unit; the purchase lives on as
    --                     a 'checked' event in list_item_events.
    INSERT INTO list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id)
      VALUES (v_household_id, v_ingredient.catalog_item_id, v_qty, 'pending', v_user_id, v_cycle_id)
    ON CONFLICT (household_id, catalog_item_id) DO UPDATE
      SET quantity   = CASE
                         WHEN list_items.deleted_at IS NOT NULL THEN EXCLUDED.quantity
                         WHEN list_items.status = 'bought'      THEN EXCLUDED.quantity
                         ELSE list_items.quantity + EXCLUDED.quantity
                       END,
          status     = 'pending',
          checked_by = CASE
                         WHEN list_items.deleted_at IS NULL AND list_items.status = 'bought' THEN NULL
                         ELSE list_items.checked_by
                       END,
          deleted_at = NULL,
          cycle_id   = v_cycle_id,
          updated_at = now()
    RETURNING id INTO v_list_item_id;

    IF v_was_tombstoned THEN
      -- Provenance dies with the row (026 does this too on the UPDATE path).
      DELETE FROM list_item_meals WHERE list_item_id = v_list_item_id;
    ELSIF v_existing_status = 'bought' THEN
      -- 049: the earlier meals' units are bought — they own nothing on the row
      -- any more. Zero what they own, keep their add_count (history). The
      -- adding meal's link below then owns exactly the row's new quantity,
      -- and the invariant holds.
      UPDATE list_item_meals
         SET quantity_contributed = 0
       WHERE list_item_id = v_list_item_id;
    END IF;

    INSERT INTO list_item_meals (list_item_id, meal_id, quantity_contributed, add_count)
      VALUES (v_list_item_id, p_meal_id, v_qty, 1)
    ON CONFLICT (list_item_id, meal_id) DO UPDATE
      SET quantity_contributed = list_item_meals.quantity_contributed + EXCLUDED.quantity_contributed,
          add_count            = list_item_meals.add_count + 1;

    v_count := v_count + 1;
  END LOOP;

  -- 064 (SPEC_all_on_hand D1): ALL ON HAND. A call that processed no ingredient because
  -- every one is on hand and none was included is a meal that needs no trip: stamp its
  -- OPEN placement ready, in the same transaction and under the same advisory lock.
  -- close_cycle's 052 stamp requires ready_at IS NULL, so it never re-stamps this row;
  -- a re-plan (appendPlacement) clears it.
  IF v_count = 0
     AND EXISTS (SELECT 1 FROM meal_ingredients
                  WHERE meal_id = p_meal_id AND deleted_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM list_item_meals lim
                       JOIN list_items li ON li.id = lim.list_item_id
                      WHERE lim.meal_id = p_meal_id
                        AND li.household_id = v_household_id
                        AND li.deleted_at IS NULL)
  THEN
    UPDATE meal_placements
       SET ready_at = now(), updated_at = now(), updated_by = v_user_id
     WHERE household_id = v_household_id AND meal_id = p_meal_id
       AND cooked_at IS NULL AND skipped_at IS NULL AND ready_at IS NULL;
    -- D3: the no-trip moment, only when a placement was actually stamped.
    IF FOUND THEN
      INSERT INTO meal_ready_events (household_id, meal_id, source, created_by)
        VALUES (v_household_id, p_meal_id, 'on_hand', v_user_id);
    END IF;
  END IF;

  RETURN v_count;
END;
$function$;

-- The ACL as it stands on dev and prod (Step 0): {postgres=X, authenticated=X, service_role=X}.
revoke all on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) from public;
revoke all on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) from anon;
grant execute on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) to authenticated;
grant execute on function public.add_meal_to_list(uuid, integer, uuid, uuid[]) to service_role;

commit;

-- =====================================================================
-- VERIFY A — run after the block above. One row. Expect:
--   which_db 7642734024280108049 (dev) · fn_acl
--   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres} ·
--   fn_secdef true · fn_has_064 true · fn_signature add_meal_to_list(uuid,integer,uuid,uuid[]) ·
--   table_exists 1 · rls_on true · policies 0 · grants_public '' · grants_anon '' ·
--   grants_authenticated '' (NOTHING — the new-table rule) · rows 0
-- =====================================================================
select
  (select system_identifier from pg_control_system())                                         as which_db,
  (select proacl::text from pg_proc where oid = 'public.add_meal_to_list(uuid,integer,uuid,uuid[])'::regprocedure) as fn_acl,
  (select prosecdef from pg_proc where oid = 'public.add_meal_to_list(uuid,integer,uuid,uuid[])'::regprocedure)    as fn_secdef,
  (select prosrc like '%064 (SPEC_all_on_hand D1)%' from pg_proc
     where oid = 'public.add_meal_to_list(uuid,integer,uuid,uuid[])'::regprocedure)                as fn_has_064,
  (select oid::regprocedure::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'add_meal_to_list') as fn_signature,
  (select count(*) from information_schema.tables
     where table_schema = 'public' and table_name = 'meal_ready_events')                         as table_exists,
  (select relrowsecurity from pg_class where oid = 'public.meal_ready_events'::regclass)          as rls_on,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'meal_ready_events') as policies,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_ready_events' and grantee = 'PUBLIC')         as grants_public,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_ready_events' and grantee = 'anon')           as grants_anon,
  (select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'meal_ready_events' and grantee = 'authenticated')  as grants_authenticated,
  (select count(*) from public.meal_ready_events)                                                as rows;

-- =====================================================================
-- DRY RUN B — NOT part of the apply. Kept in a comment so a whole-file run can never let
-- its closing exception touch the migration. Run the DO block ON ITS OWN, in a new query,
-- after VERIFY A (or Claude Code runs it over the dev MCP). ALWAYS ROLLS BACK: it ends by raising an
-- exception carrying the result, so every insert, the stamp and the event row are undone
-- and the SQL editor shows the result as the ERROR text (the editor does not surface
-- RAISE NOTICE). It acts as a real member of a real household (request.jwt.claims), on
-- two throwaway meals with one placement each:
--   case 1: one ingredient, on hand, nothing included → count 0, stamped, 1 event;
--   case 2: one ingredient, NOT on hand              → count 1, not stamped, 0 events.
-- Expect exactly:
--   ERROR: DRY RUN (rolled back) — all on hand: count=0 stamped=t events=1 | not on hand: count=1 stamped=f events=0
-- =====================================================================
/*
do $$
declare
  v_hh uuid; v_clerk text; v_cat uuid;
  v_m1 uuid; v_m2 uuid; v_c1 int; v_c2 int; v_r1 timestamptz; v_r2 timestamptz; v_e1 int; v_e2 int;
begin
  select hm.household_id, u.clerk_id into v_hh, v_clerk
    from household_members hm join users u on u.id = hm.user_id join households h on h.id = hm.household_id
   where hm.deleted_at is null and u.deleted_at is null and h.deleted_at is null
   limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_clerk)::text, true);
  select id into v_cat from catalog_items where deleted_at is null order by id limit 1;

  insert into meals (household_id, name) values (v_hh, '064 dry run 1 (rolled back)') returning id into v_m1;
  insert into meal_ingredients (meal_id, catalog_item_id, quantity_per_serving, on_hand) values (v_m1, v_cat, 1, true);
  insert into meal_placements (household_id, meal_id, sort_order) values (v_hh, v_m1, 9998);
  v_c1 := add_meal_to_list(v_m1, 1, null, '{}'::uuid[]);
  select ready_at into v_r1 from meal_placements where household_id = v_hh and meal_id = v_m1;
  select count(*) into v_e1 from meal_ready_events where meal_id = v_m1 and source = 'on_hand';

  insert into meals (household_id, name) values (v_hh, '064 dry run 2 (rolled back)') returning id into v_m2;
  insert into meal_ingredients (meal_id, catalog_item_id, quantity_per_serving, on_hand) values (v_m2, v_cat, 1, false);
  insert into meal_placements (household_id, meal_id, sort_order) values (v_hh, v_m2, 9999);
  v_c2 := add_meal_to_list(v_m2, 1, null, '{}'::uuid[]);
  select ready_at into v_r2 from meal_placements where household_id = v_hh and meal_id = v_m2;
  select count(*) into v_e2 from meal_ready_events where meal_id = v_m2;

  raise exception 'DRY RUN (rolled back) — all on hand: count=% stamped=% events=% | not on hand: count=% stamped=% events=%',
    v_c1, (v_r1 is not null), v_e1, v_c2, (v_r2 is not null), v_e2;
end $$;
*/
