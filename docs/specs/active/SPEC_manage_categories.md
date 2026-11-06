# SPEC_manage_categories.md — Manage Categories as list → detail, with Ask settings

**Status:** Design settled in the design chat, 2026-11-04 (evening); D9 decided 2026-11-06. Not built, except D4's stopgap (on prod).
**Scope:** OurProvisions · Browse · Manage Categories modal + Ask settings
**Depends on:** `SPEC_ask.md`, `SPEC_ask_amendment_2026-11-03.md`, the 11-03 handoff rulings (Ask in Browse as a category with a handover), 077 (`asks`, `ask_shelf_items`) on dev.
**Mock:** claude.ai Design canvas "Manage Categories + Ask settings" (private to Dan): https://claude.ai/artifact/6GQUbk6LNwZKJDD36xdEH6. Screens: 1 list · 2 Ask Easton detail · 3 Browse header entry · 4 your category (rename / delete).

---

## Why

Ask is a category with a handover (principle: *extend a primitive before inventing a surface*). So an ask's settings belong where categories are managed, not on a screen of their own. Today's modal is three dropdowns ("pick a category, then act"). That works for rename and delete, but it can't hold an ask's pick target, screen style, labels toggle and shelf. Reading the current code also turned up four real defects that this redesign fixes (see **Defects in today's code**).

## Decisions (Dan, 2026-11-04)

**D1 — List, then detail.** Manage Categories becomes a list. **Your categories** are tappable rows: plain ones show the name; asks show a hand icon and a summary line ("Ask · pick 3 · 10 on shelf", "Ask · Simple · pick 1 · 4 on shelf"). **Standard** categories collapse into one locked line ("Produce · Dairy · Deli · Breads · +8", lock icon) with the text "Standard categories can't be renamed or deleted." Footer: *Restore default categories* (danger, red) left, **Done** right, with clear space between them (no shadow over the link).

**D2 — One create field, one switch.** "Create new" input + **Create**, and under it a checkbox: *Make this an Ask — someone picks from it on your phone*.
- Unchecked → a custom category (see D9 for persistence).
- Checked → creates an ask through the **same atomic creation path as Browse's "+ New shelf"** (Ask Slice 2, never a half-built ask), then opens its detail (D7). There are two doors and one creation function.

**D3 — Your category, opened (screen 4).** Back chevron + title. **Name** field (editable; "Renaming keeps every item in it. Saves when you tap Done."). **Items · N**, each row with **Move** (re-homes that one item to another aisle). **Turn into an Ask** toggle (D6). **Delete category** section (D4). **Done**.

**D4 — Delete never deletes items. The picker is required.** If the category has items, "Its N items move to [picker]" must be answered before the red **Delete {name}** button acts. Preselect **Pantry** (falls back to the first standard category if Pantry ever leaves `CATEGORY_ORDER`). Today's "— delete all items too —" path is **removed**. **SHIPPED to prod 2026-11-05** as a stopgap (`2e987eb` + `454d140`); the redesign keeps the same rule. Why: a delete that also destroys items is a silent data loss one tap from a rename. Anyone who wants items gone can delete them as items.

**D5 — Rename is one server call.** Replace the client loop in `renameCategory` with an RPC, `rename_household_category(p_household_id, p_old, p_new)`, in one transaction (see **Defects** #2 and #3 for why).

**D6 — Turn into an Ask (kept, Dan).** Converting runs one RPC, `convert_category_to_ask(p_household_id, p_category, p_label, p_rehome_to)`, atomically:
1. Creates an `asks` row: label = the category name (editable before confirming), style **Standard**, target **min(3, item count)**.
2. Puts every live item of the category on the new shelf (`ask_shelf_items`, keeping the category's current order as `position`).
3. Re-homes those items to `p_rehome_to` (the same picker as D4, same Other default), so Shop still knows their aisle.
4. The category itself is then gone (no item carries it).
Items never leave the catalog. The confirm text under the toggle: "Its items stay on the new shelf and move to an aisle you pick, so Shop still knows where to find them."
There is **no reverse conversion** (ask → category) in v1. Deleting an ask leaves its items in their aisles.

**D7 — Ask detail (screen 2).** Back chevron, title, a small **ASK** tag. **Name**. **Ask settings** card: *Pick target* stepper (1 … shelf size), *Screen* Standard / Simple segmented control, *Show names under photos* toggle. **Shelf · N** grid of photo tiles (name tile on the house tint when no photo, per 11-03), ending in an **Add to shelf** tile that opens a picker over the household's live catalog (search + category filter); header note "Items stay in their aisle too". Tapping a tile lets you change its photo or remove it from the shelf. Footer: **Delete this Ask** (soft delete, `asks.deleted_at`; shelf rows go with it; catalog items untouched) and **Done**. All edits go through 077's column grants (label / style / target / deleted_at); no new columns.

**D8 — Browse header for an ask (reconciles screen 3 with 11-03).** The 11-03 ruling stands: the ask's section header holds **"Hand it to Easton →"** where "+ New item" sits. This spec adds a **⋯** button beside it that opens D7, the same detail view Manage Categories opens. That gives one screen with two ways in. **"+ Add to shelf" lives in D7** and in the empty-shelf state ("Nothing on Everett's shelf yet. Add a few favourites he can pick from." → Add to shelf). It is *not* on the header. Screen 3 of the mock shows "+ Add to shelf" on the header; the mock is superseded on that point. The "also in Snacks" sub-line on shelf rows in Browse is a WATCH: keep it if it reads as reassuring in the walk, drop it if it reads as clutter.

**D9 — An empty custom category must survive a reload. DECIDED (Dan, 2026-11-06): (b-light).** Today `createCategory` only adds to client state (`householdCategories`). A category is an item label (`catalog_items.category`), so an empty one disappears on reload or on another member's phone. Two ways out:
- **Chosen: (b-light)** — a small `household_categories` table that only records a household's category names (household_id, name, created_at; unique per household, case-insensitive), so a category exists even with no items, on every member's phone. Items keep their text label (`catalog_items.category`); nothing that reads categories today changes, it just also unions in these names. Create writes a row; rename and delete update / remove it in the same RPC as the items; convert-to-Ask removes it.
- Why it changed from (a): since 2026-11-05 Edit can move an item to another category (`50abe70`), so emptying a category by tidying is easy — moving the last two Breads items to Pantry made "Breads" vanish. (a) only covered creation.
- Rejected for now: (a) first-item-at-create (doesn't cover moving out); (b-full) items referencing category rows (big migration; revisit with Phase 2 store-specific aisle order).

**D10 — Copy fixes (ship with slice 1, no decision needed).** The text under Delete must say "can't be deleted", not repeat the Rename text. The duplicated text goes away anyway in the list design (one locked line).

## Defects in today's code (found reading `src/App.js` on `dev`, 2026-11-04)

1. **Delete can destroy items.** `deleteCategory(raw, null)` calls `deleteItem` on every item; the move picker's empty choice is labelled "— delete all items too —". → D4.
2. **Rename is not atomic.** `renameCategory` loops, from the client, over global items (insert a household copy, then hide the global row), then updates household items. A failure partway leaves a category half-renamed. → D5.
3. **Rename hides globals for one member only.** The hide row goes to `user_hidden_items` keyed by **the renamer's `clerk_id`**. Every other member then sees the global item in the old category **and** the copy in the new one. Step 0 must confirm against dev data, and D5's RPC must hide for the household (or the model must change; see Step 0 #3).
4. **Empty categories don't persist.** → D9.
5. **Restore defaults vs asks.** `handleResetCategories` soft-deletes **every** household custom catalog item and clears hidden rows **for this user only**. With 077, shelf rows survive (soft delete doesn't cascade) but point at dead items. → Restore's confirm must state counts ("Removes N items you added and M categories"). Ask detail and the handover must hide shelf rows whose item is soft-deleted. Step 0 must confirm what `land_ask_picks` does with such an id (expected: refused as "not a live catalog item", 22023).

## Data rules

- No new columns on `asks` / `ask_shelf_items`. D6 and D7 use 077's shape.
- New RPCs (migration **078**, Step 0 confirms the number): `rename_household_category`, `convert_category_to_ask`, and, if D4's move stays client-side, nothing else. Moving items is a household-scoped `UPDATE` today; consider folding D4 into a `delete_household_category(p_household_id, p_category, p_rehome_to)` RPC for atomicity (Claude Code's call at Step 0, report it).
- RPCs follow 070 / 077 conventions: `SECURITY DEFINER`, search_path `''`, schema-qualified, membership check → 42501, bad input → 22023, revoke from public / anon / service_role, VERIFY through `aclexplode`, rollback file, fixture in a savepoint.
- Standard categories (`CATEGORY_ORDER`) are refused by all three RPCs (22023), not just hidden in the UI.
- Converting or deleting never touches `list_items`. Live list rows keep their catalog item, and the aisle change shows on Shop on the next read.

## Telemetry / privacy

Category names and ask labels are household data. The new list rows, detail titles, Name inputs and the ⋯ button must **not** use any replay allow-listed class, and the ⋯ `aria-label` must not contain the label (use "Ask settings", not "Ask Easton settings"; the mock's aria-label is superseded). The existing `CategorySelect` index-valued options rule (replay, 2026-10-19) applies to the D4 / D6 picker. Ask settings add no span and no hash route.

## Step 0 (Claude Code, read-only, report before building)

1. Answered 2026-11-05: `CATEGORY_ORDER` = Produce, Meat & Seafood, Dairy, Pantry, Beverages, Household, Bakery (no Other). Remaining: where Add-sheet "no match creates under `Other`" items should live, given Other is not standard.
2. Every consumer of `householdCategories` / `categories` / `selectedCategories` that a rename, delete or conversion must update (the 08-10 lesson). Include Browse's pill rail and the Staples predicate.
3. `user_hidden_items`: is it per user by design? Count dev / prod households where a member has a global hidden that another member hasn't (Defect #3 in the wild).
4. Behaviour of `land_ask_picks` and the shelf read with a soft-deleted catalog item (Defect #5).
5. Whether any global items carry a non-standard category (the reason `renameCategory` handles globals at all).
6. Next free migration number on dev's ledger (D9's table rides in 078 with the rename RPC).

## Slices

1. **Client only:** list → detail for custom categories, D4 required picker (client move, then remove), D10 copy, footer spacing, Restore confirm with counts. No migration.
2. **078:** `rename_household_category` (+ the household-wide hide), and `delete_household_category` if Step 0 recommends it. Dev first, parse check, then real run.
3. **Ask detail + D8 ⋯ entry + D2 checked path** (rides on Ask Slice 2's creation function and screens). Lands after, or as part of, Ask Slice 2.
4. **`convert_category_to_ask`** (078 or 079) + the D6 toggle.

## Done when (on dev)

- Deleting a custom category with items asks where they go, defaults to Other, and no item is ever deleted by it.
- A rename by member A shows correctly on member B's phone: no duplicate of a global item and no item left in the old name.
- Create with the switch on gives an ask that opens in its detail; Browse shows it as a pill and a section with "Hand it to {Label} →" and ⋯; ⋯ opens the same detail.
- Converting a 2-item category gives an ask with both items on the shelf, both items in the chosen aisle on Shop, and no trace of the old category.
- No category name or ask label appears in an allow-listed class or span (guard test).
- Prod untouched.

## Out of scope

- Reordering categories (a reason for D9 (b), not this spec).
- Reverse conversion (ask → category).
- Renaming standard categories.
- Plain photo shelves for adults (the 11-03 WATCH).

## Open

- **Seed items in non-standard categories** (Deli, Breads are not in `CATEGORY_ORDER`): if seed rows carry such categories, rename (copy + per-user hide) and the shipped delete-move (household rows only) both leave them behind. Read-only query requested 2026-11-06; result decides whether the delete-move gap jumps to the top of NEXT.
- **"also in Snacks" sub-line** (D8 WATCH): judged in the walk.
- **Two "E"s badge rule** (carried from 11-03, Slice 2).
