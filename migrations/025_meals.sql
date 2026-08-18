-- ============================================================
-- Migration 025 — Meals data model (add-path foundation)
-- ============================================================
-- Specs:
--   docs/specs/active/SPEC_meals_model.md   (this migration)
--   docs/specs/active/SPEC_meal_sharing.md  (giving — NOT built here)
--
-- ✅ APPLIED TO PROD 2026-08-18 (with 026 + 038, one batch). Verified shape,
-- confirmed by name against prod — no duplicates, every policy {authenticated}
-- only, zero anon:
--   meals             SELECT / INSERT / UPDATE / DELETE   (4)
--   meal_ingredients  SELECT / INSERT / UPDATE / DELETE   (4)
--   list_item_meals   SELECT / INSERT / DELETE            (3)  <- no UPDATE,
--     deliberately: a provenance linkage row is delete-and-reinserted, never
--     updated. That is the right shape, not an omission.
--   TOTAL = 11 policies. If a future reference says 10, it is wrong.
-- add_meal_to_list: SECURITY DEFINER, search_path pinned, anon EXECUTE revoked
-- (has_function_privilege('anon', …) = false on prod, re-confirmed post-apply).
--
-- SCOPE (add-path only): three tables + household-scoped RLS + the
-- add-a-meal-to-list RPC. Deliberately OUT of this migration:
--   * meal_shares / giving between households (own build).
--   * remove-a-meal-from-list (needs the meal-vs-manual quantity
--     question resolved — an OPEN QUESTION in the spec).
--   * the serving dial (schema is scaling-ready; behavior is flat).
--
-- BUILD STRATEGY (from the spec): schema is Option 1 (scaling-ready),
-- behavior is Option 3 (no dial). quantity_per_serving is stored as a
-- ratio ALWAYS; base_servings defaults to 1, so today it reads as a
-- flat quantity. Lighting up scaling later is additive — no migration,
-- no re-model.
--
-- ⚠️ NUMBER: this is 025.
--   022 = anon catalog fix    (applied dev+prod)
--   023 = referral primitive  (specced, NOT applied — number reserved)
--   024 = household photo      (applied dev+prod)
--   025 = this
--
-- APPLY PATH: manual SQL-editor paste. DEV FIRST → verify (see bottom)
-- → PROD. SAFE TO RE-RUN: every DDL statement is IF NOT EXISTS /
-- CREATE OR REPLACE / idempotent.
-- ============================================================


-- ------------------------------------------------------------
-- 1. meals — household-owned recipe/bundle. Mirrors catalog_items
--    ownership (household_id + created_by + soft-delete).
--
--    created_by is a LOAD-BEARING SEAM, not disposable metadata: it
--    answers "who first authored this," which OurChef will later use
--    to assemble a person's cookbook across households. household_id
--    answers "who owns this version." Two different concepts.
-- ------------------------------------------------------------
create table if not exists public.meals (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  name           text not null,
  base_servings  integer not null default 1,   -- native recipe yield; 1 today, load-bearing for future scaling
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
  -- photo_url deferred: generalizes from the OurBanner image pipeline; don't couple now.
);

-- Read path is always "meals for THIS household" → index household_id.
create index if not exists idx_meals_household
  on public.meals (household_id)
  where deleted_at is null;


-- ------------------------------------------------------------
-- 2. meal_ingredients — a meal's ingredient list. THE LOAD-BEARING
--    CHOICE: catalog_item_id is an FK to catalog_items, not free
--    text. A meal ingredient IS a catalog item — that is exactly
--    what lets it flow into list_items (which keys on
--    catalog_item_id) when the meal is added to the list.
--
--    quantity_per_serving is stored as a ratio ALWAYS. With
--    base_servings = 1 today it reads as a flat quantity. Same
--    column, two readings — the seam that makes flat→scaling free.
--    No `override` column yet (that's the dial's "olive oil stays
--    at 0" behavior); earns its place when the dial exists.
--
--    FK NOTE — catalog_item_id is ON DELETE CASCADE. This is a
--    DELIBERATE, DOCUMENTED exception to the "all FKs referencing
--    catalog_items are NO ACTION" invariant, mirroring the
--    household_staples carve-out (migration 016): a meal ingredient
--    is a REFERENCE that cannot outlive its item, not sacred list
--    history. It also keeps this migration self-contained — the
--    existing hard-delete path delete_custom_catalog_item (which
--    DELETEs the catalog row after clearing list_items/contributors/
--    etc.) continues to work UNMODIFIED: the cascade clears any
--    meal_ingredients reference instead of a NO ACTION FK blocking
--    the delete. Recorded in docs/ARCHITECTURE.md as a scoped
--    carve-out. (meal_id is also CASCADE — an ingredient row cannot
--    outlive its meal on a hard delete; soft-delete leaves it intact.)
-- ------------------------------------------------------------
create table if not exists public.meal_ingredients (
  id                    uuid primary key default gen_random_uuid(),
  meal_id               uuid not null references meals(id)         on delete cascade,
  catalog_item_id       uuid not null references catalog_items(id) on delete cascade,
  quantity_per_serving  numeric not null,
  created_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- Read path is "ingredients for THIS meal" → index meal_id.
create index if not exists idx_meal_ingredients_meal
  on public.meal_ingredients (meal_id)
  where deleted_at is null;


-- ------------------------------------------------------------
-- 3. list_item_meals — provenance join (which meal(s) put an item
--    on the list). One row per (list_item, meal). "Multiple meals"
--    badge = count(*) > 1 for a list_item.
--
--    Chosen as a JOIN table (not an array column on list_items) for
--    referential integrity on the sacred shared list: an array would
--    leave dangling meal ids and tax every future list-reading
--    feature. Both FKs CASCADE: a hard-deleted list_item or meal
--    cannot leave a dangling provenance link. list_item_id CASCADE
--    is also what keeps delete_custom_catalog_item's
--    `DELETE FROM list_items` unblocked.
-- ------------------------------------------------------------
create table if not exists public.list_item_meals (
  list_item_id  uuid not null references list_items(id) on delete cascade,
  meal_id       uuid not null references meals(id)      on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (list_item_id, meal_id)
);

-- The remove-a-meal flow (later) reads "all list_items for this meal"
-- → index meal_id. (The PK already covers list_item_id lookups.)
create index if not exists idx_list_item_meals_meal
  on public.list_item_meals (meal_id);


-- ============================================================
-- 4. RLS — household-scoped, via the Harbour standard primitive
-- is_member_of(household_id) (migration 003). Identity claim is
-- auth.jwt()->>'sub' (Clerk third-party auth) — NEVER auth.uid().
-- ============================================================

-- ---- meals: members of the owning household have full CRUD.
--      (Soft-delete is an UPDATE of deleted_at, covered by the UPDATE
--       policy; a hard DELETE policy is included for completeness but
--       is normally unused — meals soft-delete.)
alter table public.meals enable row level security;

drop policy if exists meals_select on public.meals;
create policy meals_select on public.meals
  for select to authenticated
  using (is_member_of(household_id));

drop policy if exists meals_insert on public.meals;
create policy meals_insert on public.meals
  for insert to authenticated
  with check (is_member_of(household_id));

drop policy if exists meals_update on public.meals;
create policy meals_update on public.meals
  for update to authenticated
  using (is_member_of(household_id))
  with check (is_member_of(household_id));

drop policy if exists meals_delete on public.meals;
create policy meals_delete on public.meals
  for delete to authenticated
  using (is_member_of(household_id));

-- ---- meal_ingredients: gated THROUGH the parent meal's household
--      (this table has no household_id of its own).
alter table public.meal_ingredients enable row level security;

drop policy if exists meal_ingredients_select on public.meal_ingredients;
create policy meal_ingredients_select on public.meal_ingredients
  for select to authenticated
  using (exists (
    select 1 from public.meals m
    where m.id = meal_ingredients.meal_id
      and is_member_of(m.household_id)
  ));

drop policy if exists meal_ingredients_insert on public.meal_ingredients;
create policy meal_ingredients_insert on public.meal_ingredients
  for insert to authenticated
  with check (exists (
    select 1 from public.meals m
    where m.id = meal_ingredients.meal_id
      and is_member_of(m.household_id)
  ));

drop policy if exists meal_ingredients_update on public.meal_ingredients;
create policy meal_ingredients_update on public.meal_ingredients
  for update to authenticated
  using (exists (
    select 1 from public.meals m
    where m.id = meal_ingredients.meal_id
      and is_member_of(m.household_id)
  ))
  with check (exists (
    select 1 from public.meals m
    where m.id = meal_ingredients.meal_id
      and is_member_of(m.household_id)
  ));

drop policy if exists meal_ingredients_delete on public.meal_ingredients;
create policy meal_ingredients_delete on public.meal_ingredients
  for delete to authenticated
  using (exists (
    select 1 from public.meals m
    where m.id = meal_ingredients.meal_id
      and is_member_of(m.household_id)
  ));

-- ---- list_item_meals: gated THROUGH the list_item's household.
--      SELECT powers the "Multiple meals" badge; INSERT/DELETE are
--      for the (SECURITY DEFINER) add/remove flows and any direct
--      client provenance edits.
alter table public.list_item_meals enable row level security;

drop policy if exists list_item_meals_select on public.list_item_meals;
create policy list_item_meals_select on public.list_item_meals
  for select to authenticated
  using (exists (
    select 1 from public.list_items li
    where li.id = list_item_meals.list_item_id
      and is_member_of(li.household_id)
  ));

drop policy if exists list_item_meals_insert on public.list_item_meals;
create policy list_item_meals_insert on public.list_item_meals
  for insert to authenticated
  with check (exists (
    select 1 from public.list_items li
    where li.id = list_item_meals.list_item_id
      and is_member_of(li.household_id)
  ));

drop policy if exists list_item_meals_delete on public.list_item_meals;
create policy list_item_meals_delete on public.list_item_meals
  for delete to authenticated
  using (exists (
    select 1 from public.list_items li
    where li.id = list_item_meals.list_item_id
      and is_member_of(li.household_id)
  ));


-- ============================================================
-- 5. Grants (table privileges) — matches the public-schema grant
-- baseline (migrations/007_dev_restore_role_grants.sql). RLS still
-- governs WHICH rows; the grant only opens the table-level privilege.
-- (The add_meal_to_list EXECUTE grant lives in section 6, right after
-- the function.)
-- ============================================================
grant select, insert, update, delete on public.meals             to authenticated;
grant select, insert, update, delete on public.meal_ingredients  to authenticated;
grant select, insert, delete         on public.list_item_meals   to authenticated;


-- ============================================================
-- 6. add_meal_to_list — the add-path engine. (Its EXECUTE grant is
--    the last statement of this section, right after the function.)
--
-- For each live ingredient of the meal, compute its quantity and
-- fold it into the household's live list, then record provenance.
-- SECURITY DEFINER (bypasses RLS to write list_items + provenance
-- atomically), so it AUTHORIZES explicitly: the caller must be a
-- member of the meal's owning household.
--
-- QUANTITY: qty = quantity_per_serving * p_servings. p_servings
-- defaults to 1 (flat behavior today; the future dial passes the
-- chosen count). Rounded to an integer, floored at 1 — you cannot
-- shop a fractional/zero unit on the add path. (base_servings is a
-- future scaling input, NOT part of the flat formula.)
--
-- UPSERT: ON CONFLICT infers the TOTAL unique constraint on
-- (household_id, catalog_item_id) — list_items_household_catalog_unique
-- (dev auto-name: list_items_household_id_catalog_item_id_key), the same
-- constraint insert_list_item (migration 008) upserts against. Total (no
-- WHERE) means at most ONE row per (household, catalog item), live OR dead,
-- so a tombstone conflicts and resurrects in place; the partial
-- uq_live_list_item (migration 020) is a separate guard that additionally
-- forbids two LIVE rows. If the item already LIVES, INCREMENT its quantity.
-- If only a soft-deleted tombstone exists, RESURRECT it and RESET quantity
-- (do not add onto the dead row's stale count), and adopt the current cycle.
-- Then insert the (list_item, meal) provenance link, idempotent on the PK.
--
-- PROVENANCE ON RESURRECT: a resurrected tombstone's OLD meal links are
-- stale (they predate the manual removal), so they are CLEARED before the
-- new link is recorded — a revived item starts fresh, owned only by the
-- meal(s) adding it now. A LIVE row keeps accruing links (adding meal B to
-- a live item is additive by design). Pruning provenance on a plain manual
-- removal is the deferred remove-a-meal flow's job, not the add path's.
--
-- CYCLE: resolved SERVER-SIDE, not trusted from the client. p_cycle_id is
-- only a HINT (kept for contract compatibility) — honored solely if it is
-- genuinely open for this household; otherwise the household's newest open
-- cycle; otherwise a fresh planned cycle is opened. Every insert/upsert then
-- stamps that resolved cycle unconditionally, so a row touched now always
-- belongs to the current open cycle (matching close_cycle's roll-forward).
-- WHY server-side: a client-passed cycle_id could be a STALE/closed cycle
-- (stale activeCycleRef), which is exactly what inserted live prod rows into
-- already-closed cycles. Resolving here — the same way household_id and the
-- user are already resolved — makes that race impossible. (insert_list_item,
-- migration 008, still trusts the client and carries the same bug; fixed
-- identically in 026.)
--
-- p_cycle_id STATUS (deliberate, not vestigial-yet): today it is a real
-- disambiguation hint — while multiple open cycles can still exist (the
-- corruption we're cleaning in 027), it lets the client name WHICH open cycle
-- to use instead of the RPC arbitrarily picking newest. Once 027's partial
-- unique index guarantees exactly one open cycle per household, the hint
-- becomes redundant and this parameter should be REMOVED (both here and in
-- the hook call). Tracked with the 027 cycle-integrity pass — do not leave it
-- ambiguous, retire it then.
--
-- Returns the number of ingredient rows folded into the list.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_meal_to_list(
  p_meal_id  uuid,
  p_servings integer DEFAULT 1,
  p_cycle_id uuid    DEFAULT NULL
)
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

  FOR v_ingredient IN
    SELECT catalog_item_id, quantity_per_serving
      FROM meal_ingredients
      WHERE meal_id = p_meal_id
        AND deleted_at IS NULL
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

    INSERT INTO list_item_meals (list_item_id, meal_id)
      VALUES (v_list_item_id, p_meal_id)
    ON CONFLICT (list_item_id, meal_id) DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;

-- SECURITY DEFINER + writes to the shared list: RLS does NOT apply, so the
-- in-function is_member_of() guard is the ONLY gate. Postgres grants EXECUTE
-- to PUBLIC by default — lock it down. Revoking PUBLIC also strips the grant
-- authenticated inherits through it, hence the explicit re-grant below.
REVOKE EXECUTE ON FUNCTION public.add_meal_to_list(uuid, integer, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_meal_to_list(uuid, integer, uuid) TO authenticated;


-- ============================================================
-- 7. DEV VERIFICATION (run by hand in the dev SQL Editor — NOT part of
-- the migration body). The SQL Editor runs as postgres and BYPASSES
-- RLS, so it can prove policies EXIST but NOT that they WORK — the
-- membership gate must be proven from the running app (a non-member
-- + anon denied). It has also silently kept old function versions
-- before, so confirm the RPC actually saved.
--
--   -- a. Tables + RLS armed:
--   select relname, relrowsecurity from pg_class
--   where relname in ('meals','meal_ingredients','list_item_meals');
--
--   -- b. Policies present (expect the set created above):
--   select tablename, policyname, cmd from pg_policies
--   where tablename in ('meals','meal_ingredients','list_item_meals')
--   order by tablename, policyname;
--
--   -- b2. FK delete behavior — the invariant guard. Run as its OWN
--   --     statement (multiple SELECTs in one execution return only the
--   --     LAST result set). confdeltype must be 'c' (CASCADE) on
--   --     meal_ingredients.catalog_item_id, list_item_meals.list_item_id,
--   --     and list_item_meals.meal_id. A NO ACTION ('a') on any of these
--   --     is a live-path break: delete_custom_catalog_item hard-deletes
--   --     catalog_items + list_items and knows nothing about these child
--   --     tables, so a NO ACTION FK throws behind an optimistic UI remove.
--   select conrelid::regclass as tbl, conname, confdeltype
--   from pg_constraint
--   where conrelid in ('meal_ingredients'::regclass, 'list_item_meals'::regclass)
--     and contype = 'f';
--
--   -- c. RPC saved with the membership guard + increment/resurrect:
--   select pg_get_functiondef(oid) from pg_proc
--   where proname = 'add_meal_to_list';
--
--   -- d. FK cascade behavior — deleting a catalog item used in a meal
--   --    must NOT be blocked (cascade clears the meal_ingredient), and
--   --    delete_custom_catalog_item must still succeed end-to-end.
--
--   -- e. Add-path smoke (as a real member, via the app / PostgREST so
--   --    auth.jwt() is populated): create a meal + 2 ingredients, call
--   --    add_meal_to_list, confirm 2 live list_items with the right
--   --    quantities and 1 list_item_meals row each; call again and
--   --    confirm quantities INCREMENT (no duplicate rows) and the
--   --    provenance link is idempotent.
--
-- LIVE RLS TEST (post-merge, from the app — the done-when gate):
--   a non-member and anon must be DENIED read/write of another
--   household's meals / meal_ingredients / list_item_meals.
-- ============================================================
