# SPEC — Roll-forward keeps "Added by"

**Scope:** OurProvisions · **Status:** Ready to build · **Touches:** DB functions `close_cycle` (079) and `archive_trip_items` (080), prod
**Found:** 2026-11-07, Dan, on the live list after a Wrap up: rolled items showed no "Added by" line.

> **Amended 2026-11-07 (after the first dev walk failed):** the wipe lived in **two** functions. `wrapUpTrip` calls `archive_trip_items(household, rolled ids)` and *then* `close_cycle(cycle, rolled ids)`, and `archive_trip_items` deleted the contributor rows of every `list_items` row in the household, rolled ones included, before `close_cycle` ran. 079 alone passed its own fixture and still failed the walk. **079 + 080 together are the fix.**
>
> **Lesson:** a fixture must call the client's real RPC sequence, not one function.

## What's happening

At Wrap up, the client first calls `archive_trip_items(p_household_id, p_keep_item_ids = rolled ids)`. It archives bought rows and un-rolled pending rows, then **deletes every `list_item_contributors` row for every `list_items` row in the household**, kept ones included ("Rolled-forward items get fresh attribution next cycle").

Then it calls `close_cycle(p_cycle_id, p_roll_item_ids)`. For each rolled item, the function:

1. looks up the household's existing `list_items` row for that catalog item,
2. **deletes every `list_item_contributors` row for it** ("clear contributor badges"),
3. upserts the row back to `pending` on the new cycle.

Because `list_items` is unique on `(household_id, catalog_item_id)`, the row step 1 finds is always **the row being rolled**. So step 2 wipes that item's own contributor ledger. Either delete alone is enough to lose the line.

`added_by` does survive. But the UI deliberately ignores it: App.js treats `added_by` as a stale scalar and builds the "Added by …" line only from the `list_item_contributors` ledger, which is the source of truth. Ledger empty → no line.

What survives a roll today: quantity, price, `added_by`, `picked_by_labels` ("Picked by Easton"), and meal links (`list_item_meals`, so "For Taco Night" stays). The only thing lost is the contributor ledger. That's why the bug shows up on catalog adds and not on meal ingredients.

## Decision

**A rolled item is the same need carried forward, not a new add, so its attribution comes with it.**

The delete dates from when a new cycle meant a fresh slate of badges. Since then the roll has kept quantity, and the provenance line now relies on the ledger. Wiping the ledger while keeping quantity also leaves `quantity_added` out of step with `quantity`. Keeping the ledger fixes that too.

Same principle as the rest of the shared list: never show state the data doesn't support, and never drop state the data *does* support.

## Change

### A. Migration: `close_cycle` without the wipe
Assign the number at build. Recreate `public.close_cycle(uuid, uuid[])` from the **live** definition (currently migration 052; read `prosrc` from `pg_proc` on dev first, don't trust the file) with exactly two removals:

- the `v_existing_id` lookup (`select id into v_existing_id …`) and its `declare`
- the `if v_existing_id is not null then delete from list_item_contributors … end if;` block

Everything else stays byte-identical: SECURITY DEFINER, pinned `search_path`, `is_member_of` guard (051), the 052 `ready_at` stamp, the upsert, plus the revoke/grant block. Add a marker comment: `-- 0NN: roll-forward keeps the contributor ledger`.

Built as **079** (`079_rollforward_keeps_attribution.sql`).

### A2. Migration 080: `archive_trip_items` keeps rolled items' contributors
Recreate `public.archive_trip_items(uuid, uuid[])` from the **live** definition (051) with one change. The contributor delete skips the kept (rolled) ids, using the same keep test as the archive update above it:

```sql
delete from list_item_contributors
where list_item_id in (select id from list_items where household_id = p_household_id)
  and (array_length(p_keep_item_ids, 1) is null or list_item_id != all(p_keep_item_ids));
```

Archived rows (bought, or pending and not rolled) still lose attribution, so a re-add starts fresh. Rolled rows keep theirs. An empty keep list still clears everything. Same SECURITY DEFINER, `search_path`, `is_member_of` guard and grants. The fixture runs the client's real order: `archive_trip_items(keep = rolled ids)`, then `close_cycle`. 080's VERIFY refuses to commit unless `close_cycle` is 079's, so on prod 079 goes first.

### B. Backfill (optional; Dan to decide)
Items that were already rolled have lost their ledger. For pending, live rows that came from a roll and have no contributors, restore one contributor from `added_by`:

```sql
insert into list_item_contributors (list_item_id, user_id, quantity_added)
select li.id, li.added_by, li.quantity
from list_items li
where li.rolled_from_item_id is not null
  and li.deleted_at is null
  and li.status = 'pending'
  and li.added_by is not null
  and not exists (select 1 from list_item_contributors c where c.list_item_id = li.id)
on conflict (list_item_id, user_id) do nothing;
```

Tradeoff: it puts back a single name. If two people had added the item, the second name is gone for good. And `added_by` can be stale after a remove → re-add. Without it, the next roll still fixes everything going forward, and the current list stays blank until people re-add. **Recommend running it.** A mostly-right name beats a blank on a shared list, and these are the household's own rows.

No client change.

## Verify (dev first, then prod: this touches a SECDEF function)

1. Function read-back: one `close_cycle`, secdef true, anon false, authenticated true, service_role false, markers for 051, 052 and the new migration all true, and `prosrc not like '%delete from list_item_contributors%'`. Then one `archive_trip_items` with the same security and grants, markers for 051 and 080, the keep test in the delete, and `close_cycle` still 079's.
2. Walk on the dev preview with two members: Elly adds Mustard, Dan adds Ranch. Shop and leave both unchecked, then Wrap up and roll both forward. Expect "Added by Elly" on Mustard and "Added by you" on Ranch on the new list, on **both** devices (realtime).
3. Multiple contributors: both members add the same item, roll it, and both names should survive.
4. Meal row: roll a meal ingredient. "For [meal]" should still show, with no change.
5. If you run B: count the rows it would hit before the insert, and confirm the same rows show "Added by" after it.

## Done when
A rolled item shows the same "Added by" line after Wrap up as it did before, on dev and prod, verified by a live walk.
