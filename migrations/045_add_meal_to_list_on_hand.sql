-- 045_add_meal_to_list_on_hand.sql
-- SPEC_meal_ondhand_ingredients.md — teach add_meal_to_list about on-hand ingredients.
--
-- ⚠️ THIS DROPS THE 3-ARG FUNCTION FIRST, DELIBERATELY.
-- CREATE OR REPLACE cannot change a function's argument list, so adding
-- p_include_on_hand_ids would have created a SECOND function rather than replacing
-- the first. Both would then match a 3-argument call and PostgREST would fail with
-- "function is not unique" — the same overload trap migration 037 had to clean up
-- after (037_drop_bootstrap_new_user_4arg.sql). Drop, then create.
--
-- Dropping also drops the EXECUTE grants, so they are restored explicitly at the
-- bottom. The pre-drop ACL was {postgres=X, authenticated=X, service_role=X} —
-- note there is deliberately NO anon grant, and this migration does not add one.
--
-- The ONLY behavioural change is the FOR loop's WHERE clause. Everything else is
-- carried over verbatim from the live dev definition, including the cycle-resolution
-- block, the resurrect/tombstone handling, and the two-counter upsert. If you are
-- diffing this against the previous version, the loop predicate is the whole story.

drop function if exists add_meal_to_list(uuid, integer, uuid);

create or replace function add_meal_to_list(
  p_meal_id uuid,
  p_servings integer default 1,
  p_cycle_id uuid default null::uuid,
  p_include_on_hand_ids uuid[] default '{}'::uuid[]
)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $$
DECLARE
  v_household_id  uuid;
  v_user_id       uuid;
  v_cycle_id      uuid;
  v_ingredient    record;
  v_qty           integer;
  v_list_item_id  uuid;
  v_was_tombstoned boolean;
  v_count         integer := 0;
BEGIN
  -- Resolve the meal + its owning household (live meals only).
  SELECT household_id INTO v_household_id
    FROM meals
    WHERE id = p_meal_id
      AND deleted_at IS NULL;

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'Meal % not found or deleted', p_meal_id;
  END IF;

  -- Authorize: caller must belong to the meal's household.
  IF NOT is_member_of(v_household_id) THEN
    RAISE EXCEPTION 'Not authorized for household %', v_household_id;
  END IF;

  v_user_id := get_current_user_id();

  -- Serialize concurrent adds for THIS household so the resolve-and-open
  -- block below can't let two callers open two cycles at once. Transaction-
  -- scoped (auto-released at function end), household-scoped (does not
  -- serialize unrelated households). Backstop until the partial unique index
  -- on provision_cycles(household_id) WHERE closed_at IS NULL lands (027),
  -- after which it may be redundant.
  PERFORM pg_advisory_xact_lock(hashtext(v_household_id::text));

  -- Resolve the cycle to stamp SERVER-SIDE — do not trust the client's
  -- p_cycle_id, which can be a stale/closed cycle (the race that stranded
  -- prod rows). p_cycle_id is a HINT: honor it only if it is genuinely open
  -- for this household; otherwise the household's newest open cycle; otherwise
  -- open a fresh planned one (per design decision — items are always
  -- cycle-attributed). "Open" = closed_at IS NULL AND deleted_at IS NULL:
  -- delete_household (migration 013) soft-deletes cycles WITHOUT setting
  -- closed_at, so a deleted cycle can look open unless deleted_at is checked.
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
    -- started_at / created_at / updated_at all DEFAULT now() (baseline +
    -- archive/005); existing cycle-inserts (openCycle, wrapUpTrip) omit them
    -- and rely on the defaults, so no explicit set is needed here.
    INSERT INTO provision_cycles (household_id, cycle_type, created_by)
      VALUES (v_household_id, 'planned', v_user_id)
      RETURNING id INTO v_cycle_id;
  END IF;

  -- ── on_hand (044) — the three cases, as one predicate ──────────────────────
  --   on_hand = false                        -> include (unchanged behaviour)
  --   on_hand = true,  NOT in include list    -> skip entirely: no list_items
  --                                              upsert, no list_item_meals row
  --   on_hand = true,  IS  in include list    -> include at the REAL
  --                                              quantity_per_serving
  --
  -- The include list carries CATALOG_ITEM_IDs, not meal_ingredients ids — that is
  -- what the client has to hand and what the spec specifies.
  --
  -- The override is ONE-TIME and scoped to this call: this function never writes
  -- meal_ingredients.on_hand. "Include this time" must not quietly become "include
  -- from now on", or the next Add silently changes meaning.
  --
  -- COALESCE guards an explicit NULL: `x = ANY(NULL)` evaluates to NULL, not false,
  -- which would silently drop every on-hand row a caller meant to include.
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

    -- Detect a RESURRECT before the upsert: is the existing row (at most one,
    -- per the full unique constraint) currently a soft-deleted tombstone?
    -- Zero rows → SELECT INTO assigns NULL, which the IF below treats as false.
    SELECT (deleted_at IS NOT NULL) INTO v_was_tombstoned
      FROM list_items
      WHERE household_id = v_household_id
        AND catalog_item_id = v_ingredient.catalog_item_id;

    INSERT INTO list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id)
      VALUES (v_household_id, v_ingredient.catalog_item_id, v_qty, 'pending', v_user_id, v_cycle_id)
    ON CONFLICT (household_id, catalog_item_id) DO UPDATE
      SET quantity   = CASE
                         WHEN list_items.deleted_at IS NOT NULL THEN EXCLUDED.quantity   -- resurrected tombstone: reset
                         ELSE list_items.quantity + EXCLUDED.quantity                    -- live row: increment
                       END,
          status     = 'pending',
          deleted_at = NULL,
          -- Stamp the SERVER-RESOLVED open cycle unconditionally (v_cycle_id is
          -- guaranteed open, or freshly opened). Fresh, live, and resurrected
          -- rows all join the cycle we're acting in — a row touched now belongs
          -- to NOW, same as close_cycle's roll-forward. This also HEALS any live
          -- row still pointing at a closed cycle, and cannot re-strand.
          -- (insert_list_item, migration 008, still has the stale-cycle
          -- COALESCE bug that stranded prod rows — fixed identically in 026.)
          cycle_id   = v_cycle_id,
          updated_at = now()
    RETURNING id INTO v_list_item_id;

    -- A resurrected tombstone carries STALE provenance from before it was
    -- removed. Clear it so the revived item starts fresh — only this add's
    -- meal(s) own it. RESURRECT BRANCH ONLY: a live row keeps accruing
    -- provenance (adding meal B to a live item is additive, by design).
    IF v_was_tombstoned THEN
      DELETE FROM list_item_meals WHERE list_item_id = v_list_item_id;
    END IF;

    -- Record the AMOUNT this meal contributed, not merely that it did.
    -- Additive on conflict, mirroring the list_items.quantity increment
    -- above so the two numbers can never drift apart: add the same meal
    -- twice and both its footprint and the item's quantity grow by v_qty.
    -- (DO NOTHING here was the quantity gap — a second add silently
    -- recorded nothing, leaving deleteMeal with no amount to subtract.)
    -- Two counters on one conflict, deliberately in the same statement:
    -- quantity_contributed (039) records HOW MUCH this meal put here, add_count
    -- (040) records HOW MANY TIMES it was added. They must move together or
    -- they drift, which is exactly why this is one upsert and not two.
    --
    -- NOTE FOR ANYONE FOLLOWING THE SPEC: SPEC_meal_add_count.md quotes this
    -- clause as "ON CONFLICT ... DO NOTHING" and says to replace it. That text
    -- predates 039. Replacing rather than extending would have dropped the
    -- quantity_contributed increment and broken deleteMeal/removeMealFromList.
    INSERT INTO list_item_meals (list_item_id, meal_id, quantity_contributed, add_count)
      VALUES (v_list_item_id, p_meal_id, v_qty, 1)
    ON CONFLICT (list_item_id, meal_id) DO UPDATE
      SET quantity_contributed = list_item_meals.quantity_contributed + EXCLUDED.quantity_contributed,
          add_count            = list_item_meals.add_count + 1;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ⚠️ RESTORE THE ACL — THE REVOKES ARE NOT OPTIONAL.
-- Granting alone is NOT enough and was wrong on the first pass here. CREATE
-- FUNCTION grants EXECUTE to PUBLIC by default, and Supabase's default privileges
-- add anon on top, so the recreated function came back as
--   {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}
-- when the pre-drop ACL was
--   {postgres=X, authenticated=X, service_role=X}
-- i.e. the drop-and-recreate silently handed EXECUTE to anon and PUBLIC. Verified
-- and corrected on dev the same session. SECURITY DEFINER makes this worse, not
-- better: the function runs as its owner, so the caller check inside it is the only
-- thing standing between anon and a household write. This project already has an
-- anon-exposure incident on record (migration 022, SPEC_anon_catalog_exposure.md).
--
-- Revoke first, then grant. Revoking from PUBLIC does not remove an explicit anon
-- grant, so anon is revoked by name as well.
revoke all on function add_meal_to_list(uuid, integer, uuid, uuid[]) from public;
revoke all on function add_meal_to_list(uuid, integer, uuid, uuid[]) from anon;
grant execute on function add_meal_to_list(uuid, integer, uuid, uuid[]) to authenticated;
grant execute on function add_meal_to_list(uuid, integer, uuid, uuid[]) to service_role;

-- Post-condition to check by hand after applying (CLAUDE.md: verify the save, the
-- SQL Editor has silently kept old versions before):
--   select oid::regprocedure, proacl::text from pg_proc where proname='add_meal_to_list';
-- Expect exactly ONE row, signature (uuid,integer,uuid,uuid[]), ACL
--   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
