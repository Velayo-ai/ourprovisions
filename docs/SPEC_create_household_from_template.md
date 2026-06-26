# SPEC — Create household with cloned catalog

**Scope:** OurProvisions
**Status:** Design approved (chat). Ready for Claude Code build — dev first.
**Feature:** When creating a new household, clone the **custom catalog** forward
from an existing household the caller belongs to. Catalog only — never lists.

---

## Product decision (locked)

- Clone **custom catalog items only** (`is_global = false`). Categories + item
  definitions are the reusable scaffolding.
- **Never** clone `list_items`, `waste_events`, `provision_cycles`, sessions, or
  prices. Lists are situational and independent — tangling them breaks
  "the shared list is sacred." New household opens with an **empty shopping list**.
- User **chooses the source household** at create time (dropdown of their
  households). A "Start blank" option clones nothing (global seed only).
- **Default selection = clone from the most-recently-active household**
  (pre-selected). Rationale: users expect their catalog to carry forward; blank
  is the deliberate, rarer choice.
- **Dedup against global:** skip any source custom item whose `name` already
  exists as a `is_global = true` catalog row — prevents doubles in the new
  household's `cMap[item.name]` keying.
- **Carry forward per row:** `name`, `category`, `unit`, `price_hint`,
  `is_staple`. New row gets fresh `id`, new `household_id`, `is_global = false`,
  `created_by = caller`.

---

## DB — new migration (next number in sequence, e.g. 013)

New SECURITY DEFINER RPC `create_household_from_template`. It **wraps** the
existing `create_household` (migration 006) — does NOT modify it. When
`p_source_household_id` is null, behavior is identical to today's create.

```sql
-- ============================================================
-- OurProvisions — Migration 0XX
-- create_household_from_template(p_name, p_clerk_id, p_source_household_id)
-- ============================================================
-- Creates a household (delegating to create_household for the atomic
-- household + owner-membership insert), then clones the SOURCE household's
-- CUSTOM catalog into it. Catalog only — no list_items, waste, cycles.
--
-- Security: SECURITY DEFINER. The caller MUST be a member of the source
-- household (is_member_of check) or the function raises — prevents reading
-- another household's custom catalog. When p_source_household_id is null,
-- this is a passthrough to create_household (Start-blank path).
--
-- Dedup: source custom items whose name matches an existing global item are
-- skipped (avoids duplicate names in the new household's catalog).
--
-- Returns json: { household_id, household_name, items_cloned }
-- Depends on: create_household (006), is_member_of (003), catalog_items.
-- Dev-first.
-- ============================================================

create or replace function public.create_household_from_template(
  p_name text,
  p_clerk_id text,
  p_source_household_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_result json;
  v_new_household_id uuid;
  v_caller uuid;
  v_cloned int := 0;
begin
  -- Resolve internal caller id (for created_by on cloned rows)
  select id into v_caller from users where clerk_id = p_clerk_id;
  if v_caller is null then
    raise exception 'create_household_from_template: no user for clerk_id %', p_clerk_id;
  end if;

  -- Create the household + owner membership via the proven RPC
  v_result := create_household(p_name, p_clerk_id);
  v_new_household_id := (v_result->>'household_id')::uuid;

  -- Clone path only when a source is named
  if p_source_household_id is not null then
    -- SECURITY: caller must belong to the source household
    if not is_member_of(p_source_household_id) then
      raise exception 'create_household_from_template: caller not a member of source %',
        p_source_household_id;
    end if;

    insert into catalog_items
      (name, category, unit, is_global, household_id, created_by, price_hint, is_staple)
    select
      src.name, src.category, src.unit, false, v_new_household_id, v_caller,
      src.price_hint, src.is_staple
    from catalog_items src
    where src.household_id = p_source_household_id
      and src.is_global = false
      and src.deleted_at is null
      -- dedup against global seed by name
      and not exists (
        select 1 from catalog_items g
        where g.is_global = true
          and g.deleted_at is null
          and lower(g.name) = lower(src.name)
      );

    get diagnostics v_cloned = row_count;
  end if;

  return json_build_object(
    'household_id', v_new_household_id,
    'household_name', v_result->>'household_name',
    'items_cloned', v_cloned
  );
end;
$function$;

grant execute on function public.create_household_from_template(text, text, uuid)
  to authenticated;
```

### Verification (dev, before prod)
1. `pg_proc.prosrc` check that the function body is present (not
   `pg_get_functiondef` — SQL Editor LIMIT-100 quirk).
2. Functional: as a user in household A (with N custom items), call with
   `p_source_household_id = A`. Assert returned `items_cloned` = N minus any
   name-collisions with global seed. Confirm new household has those custom rows
   and **zero** `list_items`.
3. Security: as a user NOT in household A, call with `p_source_household_id = A`.
   Assert it raises (no rows cloned, no leak).
4. Passthrough: call with `p_source_household_id = null`. Assert identical to
   `create_household` (household created, `items_cloned = 0`, empty list).

---

## Client wiring

**`useProvisions.js` — `createHousehold`:**
- Add optional `sourceHouseholdId` param.
- Call `create_household_from_template` (replacing the `create_household` call)
  with `p_source_household_id: sourceHouseholdId ?? null`.
- After create: `switchHousehold(newId)` → `refreshHouseholds()` (existing flow).
- Toast: if `items_cloned > 0`, "<name> created — N items carried forward."
  Else existing "<name> created."

**Create-household sheet (in `App.js` unified manage-household sheet):**

The create flow is INLINE in the existing manage-household sheet (name field +
Cancel/Create row, directly under the household switcher list). The source
picker is a **single dropdown line** inserted BETWEEN the name input and the
Cancel/Create row — NOT a stack of cards. Rationale: the switcher above already
uses tappable household cards (tap-to-switch); a second card stack
(tap-to-choose-source) in the same sheet collides visually. One dropdown line
adds minimal height and stays visually distinct from the switcher.

- **Closed (trigger) line:** reads `Catalog from <Household>` for a source
  household, or `Catalog: Standard provisions` when standard is chosen. Right
  side shows the item count (households) or `no custom items` (standard) plus a
  chevron.
- **Open menu:** the caller's households from `get_my_households()`, then a
  divider, then the `Standard provisions` option last.
- **Pre-select the most-recently-active household** (trigger pre-filled to it;
  menu shows `· most recent` beside it). Most-recent = reuse whatever the
  switcher already treats as "current/active" — align with existing
  active-household resolution, DO NOT invent a new ordering (there is already a
  documented three-way `joined_at` ordering situation; don't add a fourth).
- **`Standard provisions` option** = the null-source path (clones nothing;
  household gets only the global seed catalog, as every household always does).
  Value passed to the RPC = `null` for `p_source_household_id`.
  - Label string EXACTLY: `Standard provisions`
  - Sub-label EXACTLY: `no custom items`
  - **Typeset in Playfair Display, 15px, roman (NOT italic), in MUTED
    sand-brown** (≈`#9C8466`, the secondary-text family — NOT espresso). Two
    cues separate it from the real household rows: the serif (the brand wordmark
    face) says "different kind of thing," and the muted color says "quiet system
    default, not a place you'd tap." Household names stay dark espresso; this
    recedes. Same 15px size as the sans household rows. This muted-serif
    treatment carries into the closed trigger line when selected.
- **Hint line** under the dropdown restates the catalog/list distinction on
  EVERY selection (keeps it visible at the decision point). Exact strings:
  - Source household: `Copies the categories and items from <Household>. The shopping list starts empty.`
  - Standard provisions: `Starts with the standard catalog everyone gets — none of your custom items carried forward. The shopping list starts empty.`
- Per-option custom-item count: count of `catalog_items` where
  `household_id = X and is_global = false and deleted_at is null`. Either extend
  `get_my_households()` to return the count, or add a small companion RPC
  `get_my_household_catalog_counts()`. **Decision needed** — see Open question.

**Color tokens (confirm against canonical token file):** sheet frame + active
card espresso `#2C1A0E`; surface cream `#FAF4EC`; active border sand `#C9A97A`;
Create button clay `#A06A3E`. Dropdown fills (`#F1E6D4` trigger, `#F7EFE2`
standard-option, `#E7D5BC` switcher/Cancel, `#DCC9AC`/`#EBDCC6` borders) are
interpolated from the sand ramp — Claude Code should map these to the canonical
token values rather than hardcoding the hexes above.

---

## Open question (flag, don't invent)

**Item counts in the picker** — `get_my_households()` doesn't return custom-item
counts today. Two options:
- (a) Extend `get_my_households()` with a `custom_item_count` column.
- (b) New `get_my_household_catalog_counts()` RPC, called once when the sheet opens.

Leaning (a) — one round trip, the switcher already calls it. But it changes a
prod RPC's shape; confirm nothing else depends on its exact column set before
altering. Resolve in Claude Code before building the picker.

---

## Out of scope (deferred, by design)

- A persistent personal/fleet catalog layer (three-tier `is_global` model).
  Considered and rejected for now — solves a sync pain you don't have yet and
  destabilizes the `is_global` binary that drives the Hide/Delete verb model.
  Revisit only if living multi-household catalog sync becomes a real need.
