# SPEC — Surface "added more than once" on planned meal cards

**Scope:** OurProvisions
**Status:** Design approved, ready to build
**Session decision date:** 2026-08-21
**Author:** Design-chat Claude → for Claude Code
**Migration number:** assign at build time (per convention — not reserved here)

---

## Why this exists

The "Planned" badge (this session, earlier) tells you a meal is on the list at all,
but not whether someone tapped Add once or five times. `add_meal_to_list` is
deliberately additive (bumps `list_items.quantity` on every call, by design — see
025), so repeat-adding is a normal, expected action. Right now there's no way to
tell it happened.

**The blocker:** `list_item_meals` rows are inserted `ON CONFLICT DO NOTHING`. A
second, third, Nth add of the same meal touches `list_items.quantity` but leaves
`list_item_meals` completely untouched — no row, no timestamp, nothing changes.
The count genuinely does not exist anywhere today. This is a schema + RPC change,
not a derived-from-existing-data UI change like the last two.

**Rejected alternative:** infer "added more than once" from `list_items.quantity`
being higher than one batch's worth. Rejected because quantity is polluted by
manual +/- edits and by OTHER meals sharing the same ingredient — it's not a
reliable signal of *this meal's* add count.

---

## Decisions locked this session

| Decision | Choice | Rationale |
|---|---|---|
| Where does the count live? | New column `list_item_meals.add_count integer not null default 1` | Same table already carrying per-(list_item, meal) provenance; no new table needed |
| How does it increment? | `ON CONFLICT (list_item_id, meal_id) DO UPDATE SET add_count = list_item_meals.add_count + 1` (replaces `DO NOTHING`) | Minimal change to the existing upsert; count lives exactly where the conflict already fires |
| What happens on resurrect? | Nothing new — the existing `DELETE FROM list_item_meals WHERE list_item_id = v_list_item_id` (resurrect branch) still fires first, so the fresh row starts at `add_count = 1` | A revived item already "starts fresh, owned only by the meal(s) adding it now" (025's own comment) — count resets for free, no special-casing |
| Per-meal display value, when a meal's rows disagree (edit-between-adds edge case) | `MAX(add_count)` across the meal's live `list_item_meals` rows | Conservative — "at least this many times" rather than a possibly-wrong average; documented tradeoff, not engineered around |
| Display threshold | Only show the count when `> 1` | "Added 1×" is just "Planned" restated — noise |

---

## Changes, by file

### `NNN_meal_add_count.sql` (new migration, number TBD at build)

```sql
alter table public.list_item_meals
  add column if not exists add_count integer not null default 1;
```

### `025`'s `add_meal_to_list` function — one line change

Currently:
```sql
INSERT INTO list_item_meals (list_item_id, meal_id)
  VALUES (v_list_item_id, p_meal_id)
ON CONFLICT (list_item_id, meal_id) DO NOTHING;
```
→
```sql
INSERT INTO list_item_meals (list_item_id, meal_id)
  VALUES (v_list_item_id, p_meal_id)
ON CONFLICT (list_item_id, meal_id) DO UPDATE
  SET add_count = list_item_meals.add_count + 1;
```
`CREATE OR REPLACE FUNCTION public.add_meal_to_list(...)` — same signature, same
grants, no re-grant needed.

### `useProvisions.js` — `fetchMealProvenance`

Add `add_count` to the select, and fold it into the returned map:
```js
.select("meal_id, add_count, list_items!inner(catalog_item_id, household_id, deleted_at), meals!inner(name, deleted_at, created_by)")
```
```js
map[ci].push({ mealId: row.meal_id, name: row.meals?.name, createdBy: row.meals?.created_by ?? null, addCount: row.add_count });
```

### `App.js` — `plannedMealIds` becomes a count map

Currently (this session, earlier):
```js
const plannedMealIds = useMemo(
  () => new Set(Object.values(mealProvenance).flat().map(p => p.mealId)),
  [mealProvenance]
);
```
→
```js
const plannedMealCounts = useMemo(() => {
  const map = {};
  Object.values(mealProvenance).flat().forEach((p) => {
    map[p.mealId] = Math.max(map[p.mealId] || 0, p.addCount || 1);
  });
  return map;
}, [mealProvenance]);
```
Pass `plannedMealCounts={plannedMealCounts}` into `<MealsLens />` instead of
`plannedMealIds`.

### `MealsLens` — read the count, not just membership

```js
const addCount = plannedMealCounts?.[m.id] || 0;
const isPlanned = addCount > 0;
```
Next to the existing "Planned" label, append the count only when `> 1`:
```jsx
{isPlanned && (
  <span style={{ color: "#0D9488", fontWeight: 700, fontSize: "0.68rem", letterSpacing: "1px", textTransform: "uppercase", marginLeft: "8px" }}>
    Planned{addCount > 1 ? ` · Added ${addCount}×` : ""}
  </span>
)}
```

### No RLS changes, no new policies — `add_count` is just a column on an
existing RLS-covered table.

---

## Verification (deployed dev preview, not localhost)

1. Apply migration on **dev**, confirm column exists with `add_count | integer | NO | 1`.
2. Redeploy `add_meal_to_list`, confirm via `pg_proc.prosrc` the `DO UPDATE` clause saved (not silently kept as `DO NOTHING`).
3. From the app: tap Add on a meal once → card shows "Planned" only (no count).
4. Tap Add again on the same meal → card shows "Planned · Added 2×" within one poll tick.
5. Tap Add a third time → "Added 3×".
6. Remove/re-tombstone the underlying list item some other way (or run the existing resurrect path), re-add the meal → count resets to "Planned" (no suffix), confirming resurrect still clears provenance.
7. Two-client check (DH + DT): DT taps Add on a meal DH already added once → DH's client shows "Added 2×" within the existing provenance poll, without DH doing anything.

**Done when:** all seven pass on the deployed dev preview URL.
