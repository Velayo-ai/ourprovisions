# SPEC — Meal Library v1: "What sounds good?"

**Scope:** OurProvisions
**Status:** Design approved 2026-09-22, ready for BUILD **after** the meal-planning v2 go/no-go (see Sequencing)
**Mockup of record:** `docs/mockups/mockup_meal_library_v1.html` (four screens: Library, Day one, Filter sheet, Edit meal). **The mockup is the tiebreaker over this prose.**
**Builds on:** `SPEC_meal_planning_v2_pick_commit_cook.md` (library section superseded by this spec; board untouched)
**Exploration canvas (reference only):** design canvas "Plan: What Sounds Good" (colour rules A/B/C, the letter-initial tile). Not source of truth.

---

## Why this exists

The v2 library is a vertical list of rows: category tile · name · meta · one +, with filter pills (All · Made before · Ours) and an ON THE BOARD tag. It works, but it reads like administering a recipe database, the tile carries an ingredient-category word nobody chose, and there is no way to say *when* a meal is eaten. An advisor pass and two mockup rounds in the design chat settled a calmer, more browsable library that keeps v2's one-verb rule (the library's only action is **Plan**).

Mental model, unchanged from v2: **the library decides *what*, the board decides *when*.** The library answers "What sounds good?"; + puts a meal on the board and nothing else.

---

## Decisions locked

| # | Decision | Rationale |
|---|---|---|
| 1 | **Two-column card grid**, not the list and not three columns. One column only below ~340 px. | Three columns at 390 px leaves ~114 px per card — names like "Garlic Roasted Potatoes" collapse. Two columns at real phone width let the name breathe and keep the + obvious. |
| 2 | **Card = coloured top + white strip.** The top carries the **first occasion word** (small caps) with the **meal name directly under it** (serif, 20 px). The strip carries **"{n} ingredients"** and the round **+ / ✓**. | The colour block does real work: it says what the meal is for and names it. Hierarchy: occasion → name → count → action. The meal name is what you're shopping for. |
| 3 | **No letters, icons or stock photos.** The oversized italic initial explored on the canvas is dropped. | It was manufacturing visual interest. Colour + occasion + typography is enough identity. |
| 4 | **Photos are optional household content, never required application content.** No stock or generated food photography, ever, as a default. With no photo the typographic card is the finished design; a household's own photo can later sit **behind the text in the coloured top**. | Replaces v2 decision 9 ("Photos stay out"). A family's own photo among restrained cards will feel personal precisely because photography isn't wallpaper. Nothing in v1 renders a photo. |
| 5 | **Tile tone stays keyed to the meal's dominant ingredient category** (`mealTone`, v2's rule), **not** to occasion. | Most meals are dinners; tone-by-occasion turns the grid into a wall of one colour (seen on the canvas, rule B). Same meal, same tone, library and board. The occasion is the *word*, not the colour. |
| 6 | **New `meals.occasion` — an ordered list (`text[]`) of seven values.** The first entry is the one shown on the card; the rail filter matches **any** entry. | Pizza is lunch and dinner; pancakes breakfast and dessert. Going single → list later is a data migration; list now costs nothing. Order carries meaning (first = card). |
| 7 | **The occasion rail shows only occasions that at least one meal carries**, in a fixed order, always preceded by **All**. With **zero** tagged meals the rail is **hidden** and a one-line prompt shows instead; the prompt disappears permanently the moment any meal is tagged. | A pill that filters to nothing is a dead end. Browse's rail starts with global categories; a household's meal library starts empty of tags. The rail teaches itself once it exists. |
| 8 | **Occasion ≠ attribute.** The rail is only for occasion. **From**, **Made before** and **Ours** live in a **Filter sheet** behind a Filter button. | Two different kinds of question; mixing them on one rail muddles both. |
| 9 | **The filter section is "From", and in v1 it filters by `meals.created_by`** — who added the meal to this household's library. Lists only household members with ≥1 library meal. Single-select. | "From" is chosen now so the section can later hold people outside the household — a recipe's credited author (Grandma Phillis) and the person who shared it — without a rename. v1's `created_by` is *who added it*, not *whose recipe it is*: Dan typing Grandma's chili files it under Dan until the author field exists (see Recipe attribution, below). A chip that returns nothing is a dead end, same rule as the rail. |
| 10 | **Active filters are always visible:** the Filter button shows a dot when any filter is on, and each active filter shows as a removable chip under the search bar ("Andrew's ×", "Made before ×", "Ours ×"). | ★ Surfaces must self-identify state — a filtered grid must never read as a short library. |
| 11 | **On the board = ✓, quiet.** The + becomes a ✓ on a sand fill (`#EFE6D6`), espresso check, disabled. The ON THE BOARD tag and the " · on the board" meta suffix are removed. | The check says it more cleanly. One placement per meal is enforced by the placements PK, so there is no duplicate case to design for. |
| 12 | **Zero teal in the library.** + is espresso outline; ✓ is sand/espresso; rail and chips use the filled-espresso on-state. | v2 decision 4 — teal means the household finished something. Planning isn't finishing. |
| 13 | **Edit-sheet field "Good for"** — multi-select chips, order kept by tap order, helper *"Choose any that fit. The first appears on the card."*; the first selected chip carries a small ON CARD marker. | "Good for" reads as flexible discovery tags, not a rigid classification. |
| 14 | **Tapping a card (not the +) opens Edit Meal.** | Grid cards can't host the v2 swipe-to-Edit. Library tap = edit (author-facing) was decided 2026-09-14; the board keeps its own tap behaviour. |
| 15 | Page copy: title **"What sounds good?"**, sub **"Pick something for this week."** "Meal Library" and "Discover. Save. Plan for your week." leave the UI. | The user-facing concept is the question, not the database. `planScreen === "library"` keeps its internal name. |

---

## The screen

Top to bottom (mockup screen 1):

1. **Household header** — unchanged (photo banner / wordmark as everywhere else).
2. **Head row** — back chevron (→ board) · *What sounds good?* / *Pick something for this week.* · round **+** (→ New meal). The head row stays the Helm's compact sentinel exactly as v2 wired it (`controlRowRef`); the Helm's compact + on this screen opens New meal.
3. **Search + Filter** — Browse's search field pattern, placeholder *Search your meals…*; a square Filter button to its right with a dot when any attribute filter is active.
4. **Active-filter chips** — only when ≥1 attribute filter is on (screen 3).
5. **Occasion rail** — reuse Browse's horizontal rail (same scrolling, peek, and styled-scrollbar behaviour; never shrink pills to fit). Order: **All · Dinner · Breakfast · Lunch · Snacks · Sides · Appetizers · Dessert**, filtered to present occasions. Selected pill = filled espresso. If the selected occasion stops being present (its last meal untagged or deleted), fall back to All.
   - **Day one** (screen 2): no rail; instead the line *"Sort meals by when you eat them — open any meal to mark it Dinner, Lunch…"* (13 px, muted). Shown iff no library meal has a non-empty `occasion`.
6. **Grid** — two columns, 12 px gap, 16 px side gutter. Card:
   - Coloured top, min-height ~92 px, padding 11/12/14: occasion word (first entry, uppercase, 11.5 px, 700, letter-spacing .13em; blank row kept when untagged so names align) then the meal name (Playfair Display 700, 20 px, 1.15 line-height, wraps, never truncated to one line). Text colour is the tone's precomputed `fg`.
   - White strip: *"{n} ingredient(s)"* (12.5 px, muted) · round button 40 px. **The on-hand suffix leaves the library card** (it lives in the meal sheet; the card is too narrow and it is subordinate information).
   - Cards in a row share height (grid stretch); the strip pins to the bottom.
7. **Create tile** — full-width dashed sand row after the grid: *Something new?* / *Build your own, or let the Galley help.* · **+ Create** (outline) → the existing New meal sheet (Galley section inside it, unchanged). This **replaces** the v2 library's terminal create row and the separate Ask AI card — one door, not two. Signed-out: keep the existing gated state (*Sign in to create meals*, 2026-09-05 rule); the head-row + is hidden when signed out, as today.
8. **Helm** — unchanged, PLAN lit.

**Toast on plan:** *"{Meal} is on the board."* with a **BOARD** action (replaces *"Planned. Add to Shop from the board when you're ready."*). The user stays on the library to add more.

**Search:** client-side, case-insensitive substring on the meal name and on occasion words (singular and plural: "dessert", "snacks"). Combines (AND) with the rail and the filters. Architecture note: route matching through one `matchesQuery(meal, q)` function so smarter search can replace it later without UI change. No semantic/AI search.

**Empty results:** *"Nothing matches that yet."* The v2 Made-before empty copy (*"Nothing cooked from the board yet — Cooked it fills this."*) is kept for the case where Made before alone empties the grid.

---

## Filter sheet (mockup screen 3)

Bottom sheet, title *Filter meals*.

- **FROM** — one chip per household member with ≥1 library meal (`created_by`): their monogram (reuse the existing contributor/member monogram and colour) + first name. Single-select; tapping the selected chip clears it. Helper: *"Only people with meals in your library show here."*
- **HISTORY** — two switches: **Made before** (*Meals you've cooked from the board* — v2's `madeBefore` set) and **Ours** (*Made in this household, not shared in* — v2's existing predicate, unchanged).
- Footer: **Clear** (outline) · **Show {N} meals** (espresso fill), where N is the live count of the grid with the sheet's current selection applied (occasion and search included). The sheet applies on Show; Clear resets the three filters only (not the occasion or the search).
- **Favorites** stays out (no data). **Cuisine / prep time / on hand** — not in v1.

**From edge (decided 2026-09-22):** when a member leaves, their chip leaves with them — the meals do not. Meals belong to the household and stay in the library under All and on the board. A meal whose `created_by` is not a current member simply has no chip. No read of non-member names in v1.

---

## Edit meal — Good for (mockup screen 4)

In the existing MealSheet (create and edit), between the name field and Ingredients: label **GOOD FOR**, the seven chips in fixed order (*Dinner, Breakfast, Lunch, Snack, Side, Appetizer, Dessert*), multi-select, stored in tap order. Deselecting the first promotes the next. Helper line as in decision 13.

- `isDirty` (the Escape / backdrop guard from 2026-09-09) **must include the occasion list** — a changed tag is unsaved work.
- Create and update write `occasion` alongside the existing plain writes (`createMeal` / `updateMeal`).
- Galley-drafted meals arrive untagged in v1 (the Edge Function does not emit occasion — prompt-contract change is a separate gate, see Out of scope). The chips are editable on the draft before Save.

---

## Architecture

### Migration `058_meals_occasion.sql` — additive; **take the next free number at build** (058 expected; 055–057 are the v2 kinds)

```sql
alter table meals
  add column occasion text[] not null default '{}'
    constraint meals_occasion_values check (
      occasion <@ array['breakfast','lunch','dinner','snack','side','appetizer','dessert']::text[]
    );

comment on column meals.occasion is
  'When the meal is good for. Ordered: occasion[1] is the word shown on the library card; the rail matches any element. Empty = untagged (shows under All only). Meal Library v1, 2026-09-22.';
```

- **`not null default '{}'`** — every existing row becomes untagged with no backfill; nothing breaks, every meal stays under All. No `NULL` vs empty ambiguity for the client.
- **Duplicates** are not constrained in SQL (Postgres cannot check array uniqueness in a plain CHECK without a function); the client never writes one. Accept.
- **RLS:** none needed. The four `meals_*` policies are row-level `is_member_of(household_id)`; a new column inherits them (the `043` precedent). No policy edit.
- **Grants:** adding a column inherits the table's grants; no grant change. Do **not** add a column-level grant.
- **No RPC touched.** `add_meal_to_list`, `close_cycle`, `decrement_meal_from_list` never read occasion.
- **No-shop rows** (`kind <> 'meal'`) keep `'{}'` — the library read already filters `kind = 'meal'`.
- **VERIFY select** (end the file with it; the SQL editor does not surface `raise notice`):
  ```sql
  select
    (select system_identifier from pg_control_system())          as db,
    (select data_type from information_schema.columns
       where table_name='meals' and column_name='occasion')      as occasion_type,     -- ARRAY
    (select is_nullable from information_schema.columns
       where table_name='meals' and column_name='occasion')      as nullable,          -- NO
    (select count(*) from pg_constraint where conname='meals_occasion_values') as check_present, -- 1
    (select count(*) from meals where occasion <> '{}')          as tagged_rows;       -- 0 on first apply
  ```
- **Dev first**, read back on the same system identifier. Prod as its own promotion (see Sequencing).

### Hook — `src/hooks/useProvisions.js`

- Every meals read that feeds the library selects `occasion`.
- `createMeal` / `updateMeal` accept and write `occasion` (array, validated client-side against the seven values, de-duplicated, order kept).
- No new RPC.

### App.js

- `MealsLens` / library body: replace the list with the grid, rail, search, filter button, active chips, create tile, per this spec. Keep `planMeal` as the only + action; keep `onBoardIds`.
- New small pieces (names are the builder's call): `OccasionRail` (reusing the Browse rail's component or classes — do not fork the scroll behaviour), `LibraryCard`, `LibraryFilterSheet`, `GoodForChips` (MealSheet).
- `matchesQuery(meal, q)` as the single search predicate.
- Remove: the ON THE BOARD tile tag, the " · on the board" meta suffix, the library on-hand suffix, the `lib-filters` pill row, the Ask AI card, the terminal create row (folded into the create tile), the library's SwipeToRemove wrapper.
- `mealCategoryWord(m)` is no longer rendered in the library (the tone still derives from it via `mealTone`; do not remove the function — the board still uses the tone).
- **RUM:** add the new library controls to the prod click-text allow-list in `src/rum.js` (rail pills, Filter, Show N meals, Clear, + / ✓ aria-labels) the way v2's Plan controls were added. Meal names stay masked.

### What does not change

The board (cards, tiles, drag, states, no-shop cards), `meal_placements`, the list, Shop, Browse, the Helm, the meal sheet's ingredients / steps / Galley, and every RPC.

---

## Known and accepted

- **Sides, appetizers and desserts plan like meals.** If you plan Apple Crisp it takes a numbered board slot and counts in "{N} meals". Grouping a side with a main is future work (advisor list #9). Watch whether it bothers anyone.
- **Clay tile contrast** (3.97:1 for small text on `#A0724A`) now affects the occasion word *and* the 20 px name. The name clears AA-large at 20 px bold; the 11.5 px word does not. Same debt as v2, tracked in LATER against a stored per-meal colour. Do not change the palette in this build.
- **From can't name non-members** in v1, and credits whoever added a recipe rather than whose it is (see Filter sheet edge and Recipe attribution).

---

## Out of v1 (none require rework)

- **Prep/cook time on the card** — `prep_minutes` is Galley Phase B. When it exists it sits under the occasion word; never a placeholder.
- **Household photo behind the coloured top** — decision 4's seam; needs storage + a meals photo column, its own spec.
- **Galley emits occasion** — prompt contract + Edge Function redeploy on prod; ride Galley Phase B.
- **Favorites**, cuisine, prep-time and on-hand filters.
- **Browse gaining Ingredients | Meals** — the library remains a Plan subview; nav unchanged.
- Personalized ordering, suggestions from on-hand, kids' snack picker, side-with-main grouping.
- **Recipe attribution and sharing — its own design session (NEXT).** Three roles that v1 collapses into `created_by`:
  - **Recipe by** — whose recipe it is. Often not a user (Grandma Phillis; a licensed chef). A credited name on the meal, optionally linked to an account.
  - **Shared by** — who gave it to this household. Always a user; comes from the give/accept record in `SPEC_meal_sharing.md` (July, designed, unbuilt).
  - **Added by** — who put it into this household's library (`created_by`, today).
  The **From** section then lists authors and givers, including people outside the household. Licensed recipes from well-known chefs are a separate, commercial tier (contracts, payment, copy vs reference) parked at Harbour / OurChef scale per the 2026-07-29 copy-vs-reference split.

---

## Sequencing

1. **Not before the v2 go/no-go.** Walk `SPEC_meal_planning_v2_pick_commit_cook.md`'s twelve steps on dev with two accounts and promote (or explicitly hold) 055–057 + the board client first. Building this on top of an unwalked batch makes a failed step ambiguous.
2. Build on dev: migration first (VERIFY read back), then client, one tested commit per step.
3. Walk the verification below on dev.
4. Prod as **its own promotion**, fresh-eyes rule: 058 in the prod SQL editor with its VERIFY read back, then the client by the hand-authored pattern. Two small promotions (055–057 with the board, then 058 with the library), never one large one.

---

## Verification (deployed dev preview, two accounts, real auth)

1. **Entry / exit.** + Meals on the board opens *What sounds good?*; back returns to the board; PLAN stays lit in the Helm throughout.
2. **Day one.** On a household with no tagged meals: no rail, the prompt line shows, every meal shows with a blank occasion row and aligned names.
3. **Tagging.** Edit a meal → Good for → Dinner then Lunch → Save. The card shows DINNER; the rail appears with All · Dinner · Lunch; the prompt line is gone for good. Read back: `select occasion from meals where id = …` → `{dinner,lunch}` in that order.
4. **First-promotes.** Deselect Dinner on that meal → card shows LUNCH; Dinner leaves the rail if no other meal carries it (and the rail falls back to All if Dinner was selected).
5. **Rail filters by any.** A meal tagged {breakfast, dessert} appears under both Breakfast and Dessert.
6. **Search.** "curry" finds Chicken Curry; "dessert" finds every dessert-tagged meal; search AND rail AND filters combine.
7. **Plan.** + on a meal → ✓ immediately, toast *"{Meal} is on the board."* with BOARD; the user stays on the library; plan two more without leaving. Back → all three are on the board in queue order. Nothing lands on Shop.
8. **Already on board.** A meal already placed shows ✓, disabled; no ON THE BOARD tag anywhere; tapping ✓ does nothing.
9. **Filter sheet.** From lists only members with library meals (a member with no meals has no chip); selecting Andrew + Show → grid shows only his meals, the Filter dot is on, an "Andrew's ×" chip sits under search; × clears it. Made before and Ours behave as in v2. *Show N meals* matches the resulting grid count.
10. **Edit from the grid.** Tapping a card body (not the +) opens Edit Meal; Escape on a sheet with a changed Good-for selection does **not** close it (dirty guard).
11. **Create.** The create tile and the head-row + both open New meal; the Galley section works inside it; a new meal lands in the grid untagged (or tagged, if chips were set). Signed out: the gated create state shows, no + in the head row.
12. **Colour audit.** Zero teal anywhere on the library, the filter sheet and the Good-for chips. Tile tone for a given meal matches its tone on the board.
13. **430 px / 390 px.** Two columns, no overlap, long names wrap inside the coloured top; the rail scrolls with the next pill peeking.
14. Console clean; `CI=true` build and ESLint clean; RUM allow-list updated.

**Done when:** all fourteen pass on dev with two accounts, 058 is on dev with its VERIFY read back, and the prod promotion is written to ROADMAP as held for its own fresh-eyes day.
