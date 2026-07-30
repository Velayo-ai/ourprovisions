-- ============================================================
-- FIXTURE — dev_meals_seed.sql   ⚠️ DEV ONLY — NEVER APPLY TO PROD
-- ============================================================
-- Seeds meals so the Browse Meals lens (add-path only, migration 025)
-- can be validated on the dev preview BEFORE the create-meal UI exists.
-- Same convention as migrations/007_dev_restore_role_grants.sql: a
-- dev-sandbox helper that lives in the repo but is never part of the
-- prod migration run.
--
-- RE-RUNNABLE: safe to run repeatedly and after a dev schema rebuild.
-- It resolves live ids at run time (no hardcoded UUIDs), drops its own
-- prior fixture meals first (CASCADE clears their ingredients +
-- provenance links), and resets its pre-seeded manual list item.
--
-- WHAT IT EXERCISES (per the dev verification plan):
--   * 3 meals.
--   * Meal A and Meal B SHARE one global catalog item → adding both
--     drives the "Multiple meals" badge AND the increment-against-a-
--     live-row path.
--   * One meal ingredient (v_items[1]) is ALSO pre-seeded as a MANUAL
--     live list item, so adding Meal A increments a pre-existing,
--     manually-added row (meal + manual mixing — the "already commonly
--     on the list" case).
--   * Meal C includes a CUSTOM catalog item ("Fixture Spice Blend
--     (dev)") — the fixture for the meal_ingredients.catalog_item_id
--     ON DELETE CASCADE behavior when that custom item is later deleted.
--
-- TARGET HOUSEHOLD: you MUST fill in v_household_id below with the id of the
-- household you are actively in. It is deliberately NOT a name default — dev
-- has ~42 households and a name like 'My Household' exists but may not be the
-- one you're looking at, so a name default would seed loudly into the wrong
-- place. Left as the sentinel, the fixture RAISEs instead of guessing.
--   Find your id:  select id, name from households
--                  where deleted_at is null order by updated_at desc;
-- The fixture ends with a NOTICE echoing the household + counts it seeded, so
-- you can confirm it landed where you can see it — not merely that it ran.
-- ============================================================

DO $$
DECLARE
  -- ⚠️ FILL THIS IN before running (all-zeros sentinel = "not set" → raises).
  v_household_id uuid := '00000000-0000-0000-0000-000000000000';
  v_household   uuid;
  v_hh_name     text;
  v_user        uuid;
  v_items       uuid[];
  v_names       text[];
  v_custom      uuid;
  v_meal_a      uuid;
  v_meal_b      uuid;
  v_meal_c      uuid;
  v_meal_count  integer;
  v_ing_count   integer;
BEGIN
  IF v_household_id = '00000000-0000-0000-0000-000000000000' THEN
    RAISE EXCEPTION 'dev_meals_seed: set v_household_id to your active dev household id first (still the placeholder sentinel)';
  END IF;

  -- Resolve + validate: must be a LIVE household. A tombstoned or unknown id
  -- RAISEs rather than silently seeding nowhere useful.
  SELECT id, name, created_by INTO v_household, v_hh_name, v_user
    FROM households
    WHERE id = v_household_id AND deleted_at IS NULL;
  IF v_household IS NULL THEN
    RAISE EXCEPTION 'dev_meals_seed: household % not found or soft-deleted', v_household_id;
  END IF;

  -- Grab 5 real global catalog items to compose from. Using whatever
  -- globals actually exist guarantees valid FKs regardless of the seed
  -- catalog on this DB; overlap between meals is engineered by index,
  -- not by relying on a specific item being present.
  SELECT array_agg(id ORDER BY name), array_agg(name ORDER BY name)
    INTO v_items, v_names
    FROM (
      SELECT id, name FROM catalog_items
      WHERE is_global = true AND deleted_at IS NULL
      ORDER BY name
      LIMIT 5
    ) s;
  IF coalesce(array_length(v_items, 1), 0) < 5 THEN
    RAISE EXCEPTION 'dev_meals_seed: need >= 5 global catalog items, found %', coalesce(array_length(v_items, 1), 0);
  END IF;

  -- A self-contained CUSTOM catalog item so the CASCADE fixture is
  -- reproducible (create once, reuse on re-run).
  SELECT id INTO v_custom
    FROM catalog_items
    WHERE household_id = v_household AND is_global = false
      AND name = 'Fixture Spice Blend (dev)' AND deleted_at IS NULL
    LIMIT 1;
  IF v_custom IS NULL THEN
    INSERT INTO catalog_items (name, category, is_global, household_id, created_by)
      VALUES ('Fixture Spice Blend (dev)', 'Household', false, v_household, v_user)
      RETURNING id INTO v_custom;
  END IF;

  -- Re-runnable: drop prior fixture meals. meal_ingredients.meal_id and
  -- list_item_meals.meal_id are ON DELETE CASCADE, so this clears their
  -- ingredients and any provenance links from earlier test runs.
  DELETE FROM meals
    WHERE household_id = v_household
      AND name IN ('Lemon Pasta (dev)', 'Sheet-pan Salmon (dev)', 'Taco Night (dev)');

  -- ---- Meal A: Lemon Pasta (dev) — 3 global ingredients.
  INSERT INTO meals (household_id, name, base_servings, created_by)
    VALUES (v_household, 'Lemon Pasta (dev)', 1, v_user)
    RETURNING id INTO v_meal_a;
  INSERT INTO meal_ingredients (meal_id, catalog_item_id, quantity_per_serving) VALUES
    (v_meal_a, v_items[1], 1),   -- also pre-seeded as a MANUAL live list item (below)
    (v_meal_a, v_items[2], 2),
    (v_meal_a, v_items[3], 3);   -- SHARED with Meal B → "Multiple meals" badge

  -- ---- Meal B: Sheet-pan Salmon (dev) — shares v_items[3] with A.
  INSERT INTO meals (household_id, name, base_servings, created_by)
    VALUES (v_household, 'Sheet-pan Salmon (dev)', 1, v_user)
    RETURNING id INTO v_meal_b;
  INSERT INTO meal_ingredients (meal_id, catalog_item_id, quantity_per_serving) VALUES
    (v_meal_b, v_items[3], 1),   -- SHARED with Meal A
    (v_meal_b, v_items[4], 2);

  -- ---- Meal C: Taco Night (dev) — includes the CUSTOM item.
  INSERT INTO meals (household_id, name, base_servings, created_by)
    VALUES (v_household, 'Taco Night (dev)', 1, v_user)
    RETURNING id INTO v_meal_c;
  INSERT INTO meal_ingredients (meal_id, catalog_item_id, quantity_per_serving) VALUES
    (v_meal_c, v_items[5], 2),
    (v_meal_c, v_custom, 1);     -- CASCADE fixture: delete this custom item later

  -- ---- "Already commonly on the list": pre-seed a MANUAL live list item
  --      for v_items[1] (also in Meal A). Adding Meal A then increments a
  --      pre-existing manually-added row. Re-runnable: reset the row (the
  --      DELETE also clears any provenance link via CASCADE).
  DELETE FROM list_items
    WHERE household_id = v_household AND catalog_item_id = v_items[1];
  INSERT INTO list_items (household_id, catalog_item_id, quantity, status, added_by)
    VALUES (v_household, v_items[1], 1, 'pending', v_user);

  -- Echo what actually landed (counts read back from the DB, not assumed).
  SELECT count(*) INTO v_meal_count
    FROM meals
    WHERE household_id = v_household
      AND name IN ('Lemon Pasta (dev)', 'Sheet-pan Salmon (dev)', 'Taco Night (dev)')
      AND deleted_at IS NULL;
  SELECT count(*) INTO v_ing_count
    FROM meal_ingredients mi
    JOIN meals m ON m.id = mi.meal_id
    WHERE m.household_id = v_household
      AND m.name IN ('Lemon Pasta (dev)', 'Sheet-pan Salmon (dev)', 'Taco Night (dev)')
      AND mi.deleted_at IS NULL;

  RAISE NOTICE 'dev_meals_seed OK — seeded into "%" (%) | % meals, % ingredients | shared item: "%" | manual-preseed item: "%" | custom item: "Fixture Spice Blend (dev)"',
    v_hh_name, v_household, v_meal_count, v_ing_count, v_names[3], v_names[1];
END $$;
