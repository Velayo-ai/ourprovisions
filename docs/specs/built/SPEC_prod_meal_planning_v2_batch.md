# SPEC: Prod promotion of Meal Planning v2 (055 → 056 → 057 + the board client)

**Scope:** OurProvisions
**Status:** GO decided 2026-09-22 (twelve of twelve walked on dev with two accounts, DH + DT). Execute on 2026-09-23, fresh eyes, per the 09-20 rule.
**Parent spec:** `docs/specs/active/SPEC_meal_planning_v2_pick_commit_cook.md`. It moves to `built/` when this runbook's **Done when** is met, not before.
**Who:** Dan applies SQL in the **prod** SQL editor and walks the app. Cody does git, the build, the bundle checks, and read-backs over `supabase-prod-readonly`.

---

## What this ships

- **Schema:** 055 (`meals.kind`, `from_meal_id`), then 056 (`from_meal_ids uuid[]`, drop `from_meal_id`), then 057 (`kind` check widened to include `'other'`). All three are additive to live behaviour. Prod already has 047–054.
- **Client:** **the whole board.** Prod's client has never carried any board code, so this is the 14 v1 board commits (`a596cb0..cc9303e`) **plus** v2 (`edfb11d … feaee4a`). After 09-21, `main` is dev minus exactly the board commits. So the promotion should make `main`'s `src/` byte-identical to dev's `src/`. Step C0 proves that before anything moves.
- **`rum.js` changes this time** (v2 added the Plan-control click allow-list). Review it on purpose (C2).

## Why this order is safe (and the reverse is not)

- **Schema first is harmless.** The current prod client never reads `kind` or `from_meal_ids`, and never wrote `from_meal_id`. New meals default to `kind = 'meal'`. The window between the SQL and the deploy can be as long as it needs to be.
- **Client first breaks meal loading for every prod household.** The board client selects `kind` and `from_meal_ids`, and a missing column returns a 400. Never push the client before 057's VERIFY reads clean.
- **Rollback is client-only.** 055–057 are additive and the old client ignores them. If the new client misbehaves, roll Vercel back to the previous production deployment. **Never** reverse the migrations.

---

## Part A: prod pre-flight (Dan, prod SQL editor; Cody reads the same values back)

⚠️ The Supabase badge reads `main PRODUCTION` on the **dev** project too. Confirm the prod project by the URL slug `parpauldmbetptkmdwbd` **and** by the identifier below.

```sql
select
  (pg_control_system()).system_identifier                                   as sysid,          -- expect 7606130613603586966
  to_regclass('public.meal_placements') is not null                         as placements_exist, -- expect true
  (select pg_get_functiondef(oid) like '%052:%'
     from pg_proc where proname = 'close_cycle'
      and pronamespace = 'public'::regnamespace)                            as close_cycle_052,  -- expect true
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'meals'
             and column_name in ('kind','from_meal_id','from_meal_ids'))    as v2_cols_already,  -- expect false
  (select count(*) from public.meals)                                       as meals_total,      -- RECORD IT
  (select count(*) from public.meals where deleted_at is null)              as meals_live,       -- record
  (select count(*) from public.meal_placements)                             as placements_total; -- record (expect 0 or near)
```

**Stop** if `sysid` is wrong, if `close_cycle_052` is false, or if `v2_cols_already` is true (it means something was already applied, so find out what before touching anything).

---

## Part B: apply the schema (Dan), one file at a time

Rules, earned 09-20:
- **Paste the file from the repo exactly as it is**, with its comments. Don't retype, trim or reformat it. (The 054 resolver was once applied with its comments stripped and hashed differently.)
- Each file ends with its own VERIFY SELECT. **Read every value against the table below before opening the next file.**
- Cody reads the same state back through `supabase-prod-readonly` after each file. Both reads must agree.
- **Any mismatch: stop.** Don't apply the next file and don't push the client.

| File | VERIFY field | Expected on prod |
|---|---|---|
| **055** | `system_identifier` | `7606130613603586966` |
| | `kind_col` | `text / NO / 'meal'::text` |
| | `from_meal_col` | `uuid / YES` |
| | `kind_check` | `CHECK ((kind = ANY (ARRAY['meal'::text, 'leftovers'::text, 'out'::text])))` |
| | `from_meal_fk` | `FOREIGN KEY (from_meal_id) REFERENCES meals(id) ON DELETE SET NULL` |
| | `rows_not_meal` | `0` |
| | `rows_total` | = `meals_total` from Part A |
| **056** | `from_meal_ids_col` | `ARRAY / YES` |
| | `from_meal_id_gone` | `true` |
| | `rows_with_sources` | `0` (prod has never had a leftovers row) |
| | `unresolved_elements` | `0` |
| | `noshop_rows` | `0` |
| **057** | `kind_check` | the four-value CHECK: `meal, leftovers, out, other` |
| | `default_still_meal` | `true` |
| | `rows_by_kind` | `meal:<meals_total>` and nothing else |

After 057, the prod site is still the old client, and it should behave exactly as before. Dan does a 30-second smoke test on `ourprovisions.velayo.ai`: open Plan and Shop, and add and remove one item. Nothing should change.

---

## Part C: promote the client (Cody)

**C0 — Prove scope before branching.**
- Run `git fetch`. Confirm local `main` = `origin/main` (expected `b6afec6`; if it's anything else, say so) and local `dev` = `origin/dev`. Pull on this machine first; desktop/Surface drift is a standing risk.
- Run `git log --oneline main..dev -- src/` and **quote the whole list in the report.** Every commit must be one of the 14 v1 board commits (`a596cb0..cc9303e`) or a v2 commit (`edfb11d … feaee4a`, including the review-pass fixes). **Stop and report** if any other commit touches `src/`.

**C1 — Build the promote branch.**
- `git switch -c promote/meal-planning-v2 main`
- `git checkout dev -- src/`
- Add any `migrations/047…057` files that `main` lacks. They're **documentation only, never re-applied**, which is the `8ca6da2` precedent.
- **No `docs/` in this commit.** Keep the promotion to code and migration files.
- `git diff dev -- src/` must be **empty**. That proves the tree is identical, which replaces the bundle-byte-identity proof that the classifier blocked on 09-21.

**C2 — Review `rum.js` on purpose.**
- `git diff main promote/meal-planning-v2 -- src/rum.js` must show **only** additions to the prod click-text allow-list for Plan chrome: labels like Add to Shop, Cooked it, + Meals, the Leftovers / Eating out / Something else foot buttons, See on list.
- **Reject any selector that could match household content:** meal titles, the "From …" line, Eating-out place names, a Something-else name, or `body`. On prod those are household data and must stay masked.
- The `isProd` split, the Clerk excludes (listed last) and `setHousehold` must be unchanged.

**C3 — Local checks.**
- `grep -rn "Lock in" src/` returns nothing.
- `CI=true npm run build` is clean (ESLint warnings fail it on Vercel).

**C4 — Commit, then pre-push range check, then push.**
- Commit message: `promote: meal planning board v1 + v2 to prod (hand-authored; src == dev)`.
- **Before pushing, record the current production deployment id** (the rollback target).
- Run `git log --oneline origin/main..promote/meal-planning-v2` and **quote it.** It should be exactly the one promote commit.
- Fast-forward `main`, then `git push origin main`. **Do not push `dev`** unless its range has also been listed and approved.

**C5 — Verify the deployed prod bundle**, once Vercel shows READY on the promote SHA, aliased to `ourprovisions.velayo.ai`.
- **Present:** `Add to Shop`, `Cooked it`, `Something else`, `None of these add anything to Shop`, `Meal Library`.
- **Absent:** `Lock in`.
- **RUM:** the constant-fold still reads `maskAllInputs:e,maskAllText:e` with `e=!0`, and the new allow-list selectors are present. The unmask-body rule exists only as the dead branch, as on 09-20.
- Prove each marker the 09-20 way: absent from the previous bundle, present in the new one.

---

## Part D: prod walk (Dan, two accounts)

⚠️ **Don't walk in Madbury or any real household.** The walk adds and cooks meals on the real list. Use a prod test household with Dan + Dan Test User (create one if it doesn't exist). Prod's Test House will self-heal its half-closed cycle on its first Wrap up, which is fine if you use it.

1. **Plan three meals** from the library. The board shows 01 / 02 / 03, and nothing lands on Shop.
2. **Add to Shop** on 01, then use the subtitle link for the rest. The sand banner appears.
3. **DT adds a meal** while DH has a Shop session open. It appears on DH's list within about 2 s.
4. **Check everything and Wrap up.** The meals turn Ready and the teal banner appears. **This is the `close_cycle` path that broke prod for six days on 09-14. Watch it succeed.**
5. **Cooked it** on 01: the afterglow shows and the rest renumber.
6. **Leftovers** (two sources), **Eating out** and **Something else**. All are cream cards, all off Shop, and × on each clears it.
7. **Console:** DevTools shows no red. The prod banner shows **no** Clerk dev-keys warning.

**Read-back** (Cody, over `supabase-prod-readonly`, with the prod household id):
- `meal_placements` for that household: `ready_at` stamped once at the Wrap up instant, `cooked_at` on 01, and `skipped_at` on the no-shop rows.
- `meals` for the no-shop rows: `kind` in `leftovers | out | other`, and `deleted_at` set after ×.
- `list_item_meals` / `list_items`: one live row per shared ingredient.

---

## Done when

- [ ] Part A pre-flight read and recorded. Both reads agree.
- [ ] 055, 056 and 057 applied in order, each VERIFY matching the table and read back by Cody.
- [ ] `main`'s `src/` byte-identical to dev's, `rum.js` diff reviewed and quoted, range check quoted, deployed bundle markers proven.
- [ ] Prod walk steps 1–7 pass with two accounts, and the read-back matches.
- [ ] ROADMAP records **promoted** with the SHA and deployment id, and the parent spec moves to `docs/specs/built/`.

If any box fails: **hold**, roll back the client via Vercel if it's already deployed, leave the schema in place (it's additive), and record the reason in ROADMAP.

---

## Watch-outs for day one on prod

- **Existing prod meals won't be on anyone's board.** The old client never wrote `meal_placements`, so every household starts with an empty board even if last week's "Add all" put meal items on their list. That's expected. Households Plan from the library to fill it. Worth a line in the next beta email.
- **Re-planning a cooked meal wipes its `cooked_at`**, so Made before and the cook history forget it. This is pre-existing behaviour from 050 and is already live on prod since 09-20. It now becomes *visible*. It's the first fix after promotion (NEXT, raised in priority).
- **Staples land on Shop** with every meal (olive oil, cumin, chili powder). This is the known `default_add` gap and will likely be the first beta comment.
- **Nothing alerts on a failing `close_cycle`** yet (NEXT). For the first few days, check that prod households' Wrap ups close cycles: `provision_cycles.closed_at` should keep moving.
