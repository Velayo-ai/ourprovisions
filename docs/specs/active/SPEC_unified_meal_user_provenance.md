# SPEC: Unified Meal + User Provenance on the Shared List

**Status:** active — decided 2026-08-20, build this week (before Vegas demo Sat 2026-08-22)
**Scope:** OurProvisions
**Touches:** schema (migration), `add_meal_to_list` RPC (already live in prod), `useProvisions.js` (`deleteMeal`, and any `removeMealFromList` path), `App.js` (SHOP row provenance display)

**One root cause, three symptoms.** `list_item_meals` (meal provenance) and
`list_item_contributors` (user provenance) are two parallel ledgers on the same
`list_items` row that were never taught to reconcile. Part 1 fixes the **quantity**
side (meal contributions have no recorded amount, so they can't be decremented
precisely). Part 2 fixes the **display** side (a row with one human + one meal renders
only the meal, silently erasing the human contributor). Part 3 fixes a **sync** side
(the meal-provenance badge refreshes only on navigation, not on the 2s poll, so a
passive second viewer sees fresh quantities over a stale provenance map). All three
surfaced during `deleteMeal` verification on 2026-08-20 and are folded here
deliberately so they're built against one shared model of the two ledgers.

---

# PART 1 — Quantity accounting

## The gap

`list_item_meals` is provenance-only — `(list_item_id, meal_id)`, no quantity. It
records *that* a meal contributed to a list item, never *how much*. This was called
out as a known limitation when `SPEC_meal_planning_v1.md` was written and was
originally parked for its own future session.

**It surfaced today, concretely, during `deleteMeal` verification (2026-08-20):**
Test1 (1× "test") and Test2 (1× "test") both added to the list → merged to a single
`list_items` row, quantity `×2`. Deleting Test1 correctly removed its provenance link
(the badge now reads "from Test2," not "from Test1, Test2" — `fetchMealProvenance`'s
`deleted_at` filter works as built). But the quantity stayed at `×2` instead of
dropping to `×1`, because nothing recorded that Test1's specific contribution was 1
unit. There's no data to subtract.

**Decision (2026-08-20): pull the fix into this week rather than re-park it**, using
the pattern already proven for user contributions.

## The precedent already in the schema

`list_item_contributors` solves the identical problem for **users**:

```sql
create table list_item_contributors (
  list_item_id   uuid not null references list_items(id),
  user_id        uuid not null references users(id),
  quantity_added integer not null default 1,
  ...
);
```

One row per (item, contributor), each carrying how much that contributor added.
`updateQty` (useProvisions.js ~line 746-766) upserts this row whenever a user sets a
quantity, and removal logic can subtract a specific contributor's share rather than
guessing. `list_item_meals` should carry the same shape for meals.

## The fix

### 1. Migration — add `quantity_contributed` to `list_item_meals`

```sql
alter table public.list_item_meals
  add column if not exists quantity_contributed numeric not null default 0;
```

Mirrors `list_item_contributors.quantity_added` in spirit (numeric here since
`meal_ingredients.quantity_per_serving` is numeric, not integer — match the existing
type rather than force a round). Assign the real migration number at build time, not
here (`039` is the next open slot as of this session, but confirm — Cody assigns at
point-of-build per house convention).

**Backfill caveat — flag this explicitly, don't silently skip it:** any existing
`list_item_meals` rows (dev seed data, and anything already in prod from earlier
`add_meal_to_list` calls) will have `quantity_contributed = 0` by default. That's
inert, not wrong — it just means a pre-migration meal-contribution can't be
decremented precisely until it's re-added. For the dev seed set, re-adding the 8–10
real meals after this migration ships is the cleanest fix. Note it in the build
verification step; don't let it surface as a surprise during the dry-run.

### 2. `add_meal_to_list` RPC — write the contribution

Currently (025_meals.sql, `add_meal_to_list`):

```sql
INSERT INTO list_items (household_id, catalog_item_id, quantity, status, added_by, cycle_id)
VALUES (...)
ON CONFLICT (...) DO UPDATE
  SET quantity = CASE
                   WHEN list_items.deleted_at IS NOT NULL THEN EXCLUDED.quantity
                   ELSE list_items.quantity + EXCLUDED.quantity
                 END;
...
INSERT INTO list_item_meals (list_item_id, meal_id) VALUES (...)
```

Change the `list_item_meals` insert to an upsert that tracks the meal's cumulative
contribution, mirroring the `list_items.quantity` increment logic exactly — same
increment-on-conflict shape, so the two numbers can never drift apart:

```sql
INSERT INTO list_item_meals (list_item_id, meal_id, quantity_contributed)
VALUES (v_list_item_id, p_meal_id, v_qty)
ON CONFLICT (list_item_id, meal_id) DO UPDATE
  SET quantity_contributed = list_item_meals.quantity_contributed + EXCLUDED.quantity_contributed;
```

This is additive by design: if a meal is added to the list twice (e.g., tapped Add
again later, or at different servings), its total footprint accumulates the same way
`list_items.quantity` already does. The two stay in lockstep.

### 3. `deleteMeal` (and any `removeMealFromList` path) — decrement by the recorded amount

Replace the current binary "shared → leave untouched / unshared → zero via
`updateQty`" branch with a single decrement-and-floor flow, for **pending items
only** (bought items are never touched — same rule as before, unchanged):

1. For each of the meal's live `list_item_meals` rows (pending items only): read
   `quantity_contributed`.
2. Subtract it from `list_items.quantity`.
3. If the result is `<= 0`, the item's contribution is fully spent — remove it via
   the existing `remove_list_item` RPC (same path `updateQty`'s `qty<=0` branch
   already uses), which also clears any remaining `list_item_contributors` rows.
4. If the result is `> 0`, update `list_items.quantity` to the new value directly.
5. Either way, delete this meal's `list_item_meals` row (or let it cascade if the
   item itself got removed in step 3 — the FK is already `on delete cascade`).

This replaces last session's "leave the row intact" call for the shared case — that
was a reasonable stopgap given no quantity data existed, but now that the data
exists, decrementing precisely is strictly better and was the actual intent all
along.

**Legacy-row handling:** if `quantity_contributed` is `0` (pre-migration row, never
backfilled), step 2 is a no-op — the item's quantity is untouched and only the
provenance link is dropped. This degrades gracefully to today's shipped behavior
rather than incorrectly zeroing something it has no basis to touch.

## Verification (dev, real auth — not the SQL editor)

Re-run the four original `deleteMeal` scenarios, plus the specific case that
surfaced this gap:

1. Delete a meal with live pending ingredients, unshared → item leaves the list.
2. Delete a meal with live pending ingredients, shared with another active meal →
   quantity decrements by exactly this meal's contribution; the item survives if
   the remaining amount is `> 0`.
3. **The Test1/Test2 case, re-run:** two meals each contributing 1 of the same
   item → merged `×2` → delete one → confirm it now reads `×1`, not `×2`.
4. Bought items are never touched, regardless of quantity math.
5. No phantom provenance badge survives (already verified, shouldn't regress).

# PART 2 — Unified provenance display

## The gap

The SHOP item row (App.js ~line 3730-3762) renders provenance from two independent
sources that never reconcile:

- `mealOriginBadge(catalogItemId)` (App.js ~line 1295) — reads `mealProvenance`
  (from `list_item_meals`). Renders "from {meal}" or "Multiple meals" whenever ANY
  meal link exists.
- The **contributor** name-line / avatar cluster — reads `item.contributors` (from
  `list_item_contributors`). Renders only when `contributors.length > 1` (avatar
  cluster) OR `contributors.length === 1 && !isOwnItem` (single name line). Your own
  sole-contributed items show no name-line by design.

**The hole (observed 2026-08-20):** DH manually adds Apples → 1 contributor row (DH).
DT then adds Test1, which includes Apples → this writes a `list_item_meals` row, NOT
a `list_item_contributors` row. Apples still has exactly one contributor: DH. On DH's
screen: `contributors.length === 1` and the sole contributor is DH → `isOwnItem` is
true → the contributor name-line is suppressed. The ONLY thing left rendering is
`mealOriginBadge` → **"from Test1"**. DH's own contribution has silently vanished; the
row now reads as though the meal is the entire reason Apples is on the list.

This is a **display** defect, not a data-loss one — both ledger rows survive in the
DB. But it violates the shared-list provenance invariant: the list must be an honest
record of who and what put an item there, and right now a meal touching an item erases
the human who also asked for it.

## Root cause

A meal contribution is not counted as a "contributor." The two ledgers are rendered by
separate, mutually-unaware conditionals, and they only visibly coexist when there are
2+ *user* contributors. One human + one meal is the unhandled combination.

## The fix — render both, always, in one provenance block

Treat meal origin and user contribution as **two facets of one provenance line**, not
two competing badges. On any given row, the SHOP item should be able to show *both*
"from Test1" (meal origin) *and* a human contributor indication, when both are true.

Minimum correct behavior:

1. **Meal badge stays as-is** — `mealOriginBadge` continues to show "from {meal}" /
   "Multiple meals" whenever meal links exist. No change to that function.
2. **The contributor line must no longer be suppressed purely because a meal link
   also exists.** The `isOwnItem`-suppresses-own-name rule was correct when a row's
   only story was "you added this." It's wrong when a *meal* (possibly added by
   someone else) is also on the row. Specifically: when a row has BOTH a meal link
   AND at least one human contributor, surface the human contributor even if that
   human is the current user — because the meal badge is now claiming origin the user
   contribution needs to sit alongside, not be hidden behind.
3. Keep it visually calm — this is the shared list, not a debug view. One provenance
   region under the item name: the teal "from {meal}" line, and where a distinct human
   contributor also applies, the existing avatar/name treatment. Don't stack three
   redundant lines; the goal is "Apples — from Test1 · added by you" reading as one
   honest sentence, not a pile of badges. Exact layout is a build-time visual call
   against the shipped brand tokens (teal `#0D9488` for meal origin, clay `#C9A97A`
   for contributor, already in use) — mock it in the row if it's not obvious.

**Do NOT solve this by writing a `list_item_contributors` row from the meal-add
path.** That would conflate "a person put this here" with "a meal put this here" and
corrupt the user-contribution ledger the same way the quantity gap corrupted the
count. The two ledgers stay separate in data; they unify only at the display layer.

## Verification (dev, real auth, two accounts — DH + DT)

Reproduce the exact observed case:

1. DH adds Apples manually.
2. DT adds a meal (Test1) that includes Apples → Apples merges to `×N`.
3. **On DH's screen:** the Apples row shows BOTH "from Test1" AND that DH is a
   contributor — DH's contribution is no longer erased.
4. **On DT's screen:** the row honestly reflects both the meal DT added and DH's
   prior manual contribution.
5. Regression: a plain manually-added own item (no meal) still shows no redundant
   "added by you" clutter — the fix must not make every own-item noisy. It only
   surfaces the contributor when a meal link is *also* present on the row.

# PART 3 — Provenance refresh on the poll (passive-viewer sync)

## The gap

`mealProvenance` (the map powering the "from {meal}" / "Multiple meals" badge)
refreshes only on **navigation**, not on the 2-second list poll. App.js ~line 1246:

```js
useEffect(() => {
  if (MEALS_ENABLED && household?.id && (view === "list" || view === "plan")) {
    refreshProvenance();
  }
}, [household?.id, view, refreshProvenance]);
```

`refreshProvenance` also fires inline for the *acting* client right after it adds a
meal (App.js ~line 1256, `handleAddMealToList`). So the person who adds the meal
always sees correct provenance. But the list itself syncs via the 2s poll
(`loadListItems`), which updates quantities and contributors — and never touches
`mealProvenance`. The refresh comment even says so: "Cheap read; no poll."

**The hole (observed 2026-08-20, two-account test):** DH is on SHOP. DT adds Test1
(which includes Apples). DH's quantity updates 1→2 on the next poll tick, but the
"from Test1" badge never appears — DH's `mealProvenance` map is stale until DH
navigates away and back (confirmed: tab-away/refresh makes the badge appear). DH is a
passive viewer looking at fresh quantities over a stale provenance map.

This is the same defect family as the June Hide-poll bug: the poll updates one slice
of coupled state but not the other, and they drift until something forces a re-fetch.

## Scope note — why this is real but not demo-critical

This only manifests with **two people editing the same list live**, where the passive
viewer is already sitting on SHOP and doesn't navigate. In the Saturday demo (one
driver, constantly navigating tabs) it will almost certainly never trigger — the
acting client always renders correctly. It's fixed this week anyway because the fix is
small and it's a correctness bug on the shared-list invariant, not because it threatens
the demo. If build time runs short against higher-priority demo work, this is the one
of the three parts that can slip to Friday's buffer without demo risk. Parts 1 and 2
cannot — they show on the acting client.

## The fix — refresh provenance when the poll sees the list change

Do NOT simply call `refreshProvenance()` unconditionally on every 2s tick — that's an
extra full `fetchMealProvenance` query every 2 seconds for every client regardless of
whether anything changed, the needless-query-multiplier the original "no poll" comment
was avoiding. Instead, refresh provenance **only when the poll detects the list
actually changed.**

Cleanest shape (build-time judgment on exact wiring):

1. `loadListItems` already computes the fresh list each tick. Have it detect whether
   the set of live items or their meal-links could have changed since the last tick —
   simplest reliable signal is a change in the set of `list_item` ids present, or a
   change in total row count / a cheap hash of `(catalog_item_id, quantity)` pairs.
2. When that signal fires, trigger a `refreshProvenance()` (the poll lives in the
   hook; `refreshProvenance` lives in App.js — so either lift a provenance-refresh
   callback into the poll via a ref, mirroring the existing `refreshCatalogRef`
   pattern the catalog poll already uses at line ~1453, or expose a "list changed"
   flag/counter from the hook that App.js watches in an effect to call
   `refreshProvenance`). The ref pattern is already established in this file for
   exactly this hook→App callback shape — prefer it over inventing a new channel.
3. Keep the navigation-triggered refresh as-is; it's the correct behavior for a client
   that just arrived on the surface. This adds a second trigger, it doesn't replace
   the first.

The bar: a passive viewer on SHOP sees the badge update within one poll cycle of
another member adding a meal, WITHOUT a full unconditional provenance re-fetch every
tick.

## Verification (dev, real auth, two accounts — DH + DT)

1. DH sits on SHOP, does not navigate. DT adds a meal including a shared item.
2. Within ~one poll cycle (≤~2-4s), DH's row shows the "from {meal}" badge — no
   manual refresh, no tab-away.
3. Confirm the provenance query is NOT firing every 2s when nothing changed (check
   the network tab on an idle client — provenance should be quiet until the list
   moves).
4. Regression: the acting client (DT) still sees the badge immediately, as before.

# Why this doesn't touch prod risk beyond what's already there

`add_meal_to_list` is already live in prod (migrations 025/026), but the meals UI
itself was never promoted — nothing is calling it in production today. Redeploying
the RPC with `CREATE OR REPLACE FUNCTION` (same signature, additive column) is safe
to ship to prod's function definition ahead of the UI promotion, exactly like the
RLS/RPC hardening series did. Standard order still applies: dev first, verified,
then prod — and UI promotion stays gated on this shipping and being verified, per
the 2026-08-20 decision.
