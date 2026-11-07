# SPEC — Roll-forward keeps "Added by"

**Scope:** OurProvisions · **Status:** Ready to build · **Touches:** DB function `close_cycle` (migration), prod
**Found:** 2026-11-07, Dan, on the live list after a Wrap up: rolled items showed no "Added by" line.

## What's happening

At Wrap up, the client calls `close_cycle(p_cycle_id, p_roll_item_ids)`. For each rolled item, the function:

1. looks up the household's existing `list_items` row for that catalog item,
2. **deletes every `list_item_contributors` row for it** ("clear contributor badges"),
3. upserts the row back to `pending` on the new cycle.

Because `list_items` is unique on `(household_id, catalog_item_id)`, the row step 1 finds is always **the row being rolled**. So step 2 wipes that item's own contributor ledger.

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

1. Function read-back: one `close_cycle`, secdef true, anon false, authenticated true, service_role false, markers for 051, 052 and the new migration all true, and `prosrc not like '%delete from list_item_contributors%'`.
2. Walk on the dev preview with two members: Elly adds Mustard, Dan adds Ranch. Shop and leave both unchecked, then Wrap up and roll both forward. Expect "Added by Elly" on Mustard and "Added by you" on Ranch on the new list, on **both** devices (realtime).
3. Multiple contributors: both members add the same item, roll it, and both names should survive.
4. Meal row: roll a meal ingredient. "For [meal]" should still show, with no change.
5. If you run B: count the rows it would hit before the insert, and confirm the same rows show "Added by" after it.

## Done when
A rolled item shows the same "Added by" line after Wrap up as it did before, on dev and prod, verified by a live walk.
