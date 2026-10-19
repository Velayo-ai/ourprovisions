# SPEC — Recipe view: decide, then make

**Date:** 2026-10-16 · **Scope:** OurProvisions · **Status:** design-final, build after the `meal-suggestion` fix and the status-bar fix
**Mockup of record:** `mockup_recipe_view.html`. Frames 1, 2, 4 and 5 are this build. Frame 3 (the source on library cards) is **deferred**, kept only as the design of record. Where the mockup and this spec differ, this spec wins.
**Builds on:** Meal Library v1 / v2 + Amendment A, `SheetPanel` / `useSheetDrag`, `parseSteps` (preamble rule), `meal_cooks` (058), `meals.attribution` (062), `boardCardState` / `afterglowIds`.
**Depends on, for parts of frame 2:** `SPEC_meal_photos_v1.md` + its amendment (photos, 3-star rating, notes) and `SPEC_whos_cooking.md` (the cook's name). Those parts are gated, not faked — see D10.
**Migration:** none.

---

## Why

Tapping a meal today opens Edit Meal: a form. The questions people bring to a meal are **"do we want this?"** and **"how do I make it?"** Neither is a form question. Beta demos showed people reading recipes, not editing them. A read-first page answers both and leaves editing one tap away.

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Tapping a meal opens the recipe view, from every door that shows one**: the Meals library card body (grid and list), the This Week card body, and Home's on-deck meal card body (today's `onView`). **Edit** sits top-right as a text link and opens the existing Edit Meal sheet unchanged. (Dan) | Reading is the common case; editing stays one tap away. |
| D2 | **A full-height `SheetPanel`**: Close (`SheetClose`) top-left, swipe-down, handle. No back arrow, no new route. | The Helm sets location; a sheet keeps that rule and inherits the cap, scroll guard and a11y work already done. |
| D3 | **Two halves, in this order. Decide:** hero, title, byline, Added by, meta line, proof line, plan action. **Make:** a "Make it" divider, Cook mode, Ingredients, Steps, Your cooks. (Dan) | People decide before they cook. |
| D4 | **Landing depends on the door.** From the Meals library → top. From This Week or Home's on-deck card → scrolled so the "Make it" divider sits at the top. | Same page, no new screens; it lands on the half you came for. |
| D5 | **Hero:** up to **3** of the household's live photos, newest first, swipeable, with dots (none for one photo). Under each photo, small meta: the cook's name (D10), the date, and stars if rated. **No photos → the occasion tint + mark**, as on the library card. No placeholder text, no camera icon, never stock or generated food photos. The meal name is always on cream below the hero, never on a photo. | Photos D8/D9 and the 10-16 "name below the photo" ruling. |
| D6 | **Byline** `from {attribution}`, Playfair italic, brown, directly under the title. Hidden when `attribution` is null or empty. Never a possessive ("Phyllis's …"); never falls back to `created_by`. Inert in v1 (not a link). | The source is a reason to choose a meal. Free text can't safely become a possessive. |
| D7 | **Added by** `Added by {first name}`, one quiet line, from `created_by`. Shown only in households with 2+ current members, and only if the adder is still a member. When giving ships, **Shared by** replaces it on gifted meals. (Dan: "added by Elly, source Phyllis") | Three roles, three fields. Solo households don't need to be told they added their own meals. |
| D8 | **Meta line** `{Occasion} · {n} ingredients · {n} steps`. Occasion omitted if untagged (no "+ Set type" here; Edit covers it). Steps count from `parseSteps`; omitted at 0. No times, difficulty or servings in v1. | Only what the data supports. Servings arrive with the quantities build. |
| D9 | **Plan action** full width under the decide half, following the meal's board state (`boardCardState`, the same derivation as Home and the board): not planned → sand **"+ Add to This Week"**; planned → **"✓ On This Week"** (un-plans while it is the latest step); to buy → the inert stage label **"To buy"**; **ready (everything is in), or planned with nothing to shop for → teal "Cooked it"**, calling the existing `cook_meal` path (`handleMarkCooked` / `markCooked`) with the open placement; just cooked (`afterglowIds`) → inert **"✓ Cooked"**. Same handlers, toasts and two-phone guarantee (one cook row) as the board. (Dan, 2026-10-16) | One verb set across the library, board, Home and this page; the page is never a dead end, and the cook can close the loop where the recipe is. |
| D9a | **Cooked it is not offered while ingredients are still to buy, and never for an unplanned meal.** The board's ⋯ keeps its existing exits for those edge cases. Cooking an unplanned meal (spontaneous dinner) needs a placement-less cook path and is out of scope. | `cook_meal` closes an open placement; Cooked it before the shop would usually be a mis-tap. |
| D10 | **Never guess a person.** Until `SPEC_whos_cooking` ships `cook_user_id`, cook rows and photo captions show **the date only**. `meal_cooks.cooked_by` is the tapper, not the cook, and is never shown as "who cooked". | The principle from 10-13. |
| D11 | **Proof line** under the meta: `Cooked {n} time(s)` (from `meal_cooks`), plus the most recent cook note in italics with the cook's name once both exist. **No average rating anywhere.** Hidden when never cooked. | Social proof helps decide; "no vote is not a rating". |
| D12 | **Cook mode, minimal.** A card at the top of the make half: *Cook mode* / *Bigger steps, screen stays on* · **Start**. Starting it, inside the same sheet: requests a screen Wake Lock; raises step text one Text-size step; collapses the decide half and Your cooks; each step is tap-to-mark-done (strike + dim, device-local, session-only, never written); a **Done** button exits and releases the lock. **If the meal is in the ready state (D9), Done becomes two buttons: "Cooked it" (teal, the same `cook_meal` call) and "Just close".** If not ready, Done only closes. If Wake Lock is unsupported or refused, Cook mode still works and the subline drops "screen stays on". | "How do I make it" is half the page's job. The full step-by-step flow (the cooking reference image) is its own later design. |
| D13 | **Ingredients** in the meal's order. Text today: quantity + catalog name as stored. When `SPEC_recipe_quantities` ships, `as_written` replaces it. Legacy "As written" blocks in `instructions` render as the steps preamble (existing rule). While the meal is on This Week, a right-aligned tag per row: **On your list** (`list_item_meals` provenance) or **On hand** (`on_hand`, text teal). No tags otherwise. No food icons. | Honest state only where it is true. |
| D14 | **Your cooks** below the steps, newest first, one row per cook: date, cook name (D10), stars and note (once rating ships), thumbnail (once photos ship). An unrated cook offers three empty stars to rate (once `rate_cook` exists). Shows the 5 most recent with "Show all {n}". Hidden when never cooked. | Feedback and photos belong to the cook. A second, quiet chance to rate. |
| D15 | **Filter sheet:** today's "From" section is renamed **Added by** (behaviour unchanged). A new **From** section filters by source. (Dan) | Who typed it in and whose recipe it is are different questions. |
| D16 | **Source grouping:** key = `attribution` lower-cased, trimmed, inner whitespace collapsed. One chip per key, labelled with the most recently updated meal's spelling, with a count. Different text stays separate ("Grandma" ≠ "Grandma Phyllis"). Only keys with ≥ 1 meal, after the other filters. Sorted by count, then A–Z. Past 8, a "More…" link expands in place. Single-select; sections AND together; included in the live "Show N meals" count and Clear. Helper: *"Where the recipe came from, as it was saved."* | Cheap, honest grouping with no new table. |
| D17 | **Search includes the source.** `matchesQuery` also substring-matches `attribution`, case-insensitive. | "Phyllis" finds all her recipes regardless of spelling variants. |
| D18 | **The From field suggests existing sources.** In Edit Meal (create and edit), typing ≥ 1 character shows up to 4 of this household's distinct sources whose words start with the typed text, each with its meal count; tapping fills the field. Free text always allowed. No merge tool. | Prevention beats cleanup. |
| D19 | **The source stays off library cards in v1, grid and list.** (Dan, 2026-10-16: "until people ask for it.") Frame 3 is the design of record if it returns. | Keep the library quiet; watch beta feedback. |
| D20 | **Photo cap: 3 live photos per (meal, household)**, amending the 10-13 photos amendment's 2. (Dan) | The library loads thumbnails only, so the third photo costs only when someone swipes to it. |

---

## What ships now vs. what waits

| Piece | Ships in this build | Waits for |
|---|---|---|
| Sheet, tap model, Edit link, landing (D1–D4) | ✓ | — |
| Hero tint + mark | ✓ | Photo strip → Photos v1 |
| Byline, Added by, meta line (D6–D8) | ✓ | Shared by → giving |
| Plan action (D9) | ✓ | — |
| Proof line "Cooked {n} times" | ✓ | Note + name → rating + who's cooking |
| Cook mode (D12) | ✓ | — |
| Ingredients + tags (D13) | ✓ | `as_written` → quantities |
| Steps (`parseSteps`) | ✓ | — |
| Your cooks: dates | ✓ | Names, stars, notes, thumbs → their specs |
| Filter rename + From + search + suggestions (D15–D18) | ✓ | — |
| Photo cap 3 (D20) | — (recorded) | Applied in the Photos v1 build |

Every gated element **renders nothing** until its data exists. No placeholders, no "coming soon".

---

## Build notes

- **Step 0, read-only, report before code:** the current card-body tap handlers (library grid, list, This Week) and what they open; how Edit Meal is opened today so Edit reuses it; whether `meal_cooks` is already loaded per household (the Made before path) or needs a read; whether `fetchMeals` returns `updated_at` for the D16 label spelling (if not, use the newest by `created_at` and say so); `navigator.wakeLock` availability in iOS standalone on Dan's phone (`'wakeLock' in navigator`, then a real request).
- **Slices, each its own tested commit:** (a) the sheet with decide + make content and the D1 taps; (b) landing by door (D4); (c) Cook mode; (d) Filter rename + From + `matchesQuery`; (e) the From suggestions.
- **Replay privacy (a prod gate):** the title, byline, Added by name, proof line, ingredient text, steps and source chips are household content, so they stay masked and never join `CHROME_ALLOW_LIST`. Fixed-copy controls may be added by name: Close, Edit, the plan pill, Cook mode Start / Done, "Show all", "More…". Every name-bearing accessible label uses `aria-labelledby` → a masked element, never `aria-label` (10-16 rule). Report the allow-list delta by name.
- **Text size:** every new text role uses `ts()` at the role table's k; harness at 320 / 375 / 390, Default and XXL.

---

## Verification (dev, two accounts where marked)

1. Library grid card body → recipe view at the top; list row → same; "+" still plans without opening anything.
2. This Week card body → recipe view landed at "Make it". Home's on-deck meal card body → the same. Held nights (Leftovers / Eating out / Something else) open nothing new — they keep today's behaviour.
3. Edit → the existing Edit Meal sheet; save → the recipe view reflects the change.
4. A meal with `attribution` shows the byline; clearing it in Edit removes the byline (no empty line).
5. Two-member household: "Added by Elly" shows. Solo household: no Added by line.
6. Never-cooked meal: no proof line, no Your cooks section. Cooked meal: "Cooked {n} times" and dated rows, **no names**.
7. Plan from the recipe view → "✓ On This Week" + the library toast; tap again → un-plans; after Add to Shop → the stage label, inert. A second device sees the change within a poll.
7a. Cooked it (DH + DT): plan a meal, Add to Shop, check every item off on Shop → the recipe view shows teal **Cooked it**; tap → **"✓ Cooked"**, `meal_cooks` gains exactly one row, the board shows the afterglow, the proof line reads one more cook. While items are still to buy → "To buy", no Cooked it. A planned no-shop meal → Cooked it. Both phones tapping at once → one cook row, no error toast. From Cook mode on a ready meal, Done offers Cooked it and Just close; Cooked it writes one row.
8. While planned, ingredient rows carry On your list / On hand correctly; un-plan → tags gone.
9. Cook mode on iPhone, standalone: the screen stays on ≥ 2 minutes idle; step taps strike and dim; Done restores the page and releases the lock. In a browser without Wake Lock, the subline reads "Bigger steps" only.
10. Filter: "Added by" works as "From" did; "From" lists sources with counts; "grandma phyllis" and "Grandma Phyllis " are one chip; Added by Elly AND From Grandma Phyllis gives the right "Show N meals".
11. Search "phyllis" finds every meal whose source contains it.
12. Edit Meal From: typing "Gr" suggests existing sources with counts; tapping fills; a new source becomes a new chip.
13. Replay: in a dev session, no meal name, source or ingredient appears in any copied attribute or click text; the allow-list delta matches the report.
14. Swipe-down and Close both close; focus returns to the card that opened it; VoiceOver reads Close first.

## Out of scope

The full step-by-step cooking flow and kitchen timer; servings and scaling; times and difficulty; sharing from this page; source chips on library cards (D19); a "Recipe by" entity and merge tool; favourites.

---

## Amendment A (2026-10-18)

*Appended 2026-10-18 from the design chat (Dan's slice (a) phone and desktop walk). Applies before slice (b).*

**Build status (2026-10-18, Claude Code):**
- **A1 — satisfied by `827306f`** (the role-table re-map: title 22.4 at k 0.5, section labels as the Edit Meal labels, meta 14, body 16 on 44 px rows, step circle 28, nothing under 12.5; before/after table in the commit).
- **A3 — answered (b), fixed by `7f623ad`.** The view read the board's exact `boardCardState` (Ground Beef Tacos: `toBuy` true, `planned` false, `canAdd` false); the pill mapping tested `!canAdd` before `toBuy`, and `canAdd` is false on every To-buy card. The mapping now lives in `src/lib/recipePlan.js` in D9's order, jest-proven. The tag read `list_item_meals` provenance ("On your list") and `on_hand` ("On hand") — the wording A2 replaces.
- **A4 — built** (its own commit, after this one): `src/lib/cookDate.js` (relative inside the last week, weekday + date beyond, year only when not this year; `cookHistoryLine` = "Last cooked {date}" + "· N times" at 2+), Your cooks only at 2+ cooks.
- **A2 — Step 0 answered, not built** (see the SESSION_LOG entry of 2026-10-18).

---

## A1 — Sizing: the view reads a size too large at Default

**Finding (Dan, phone at Default):** the whole recipe view reads one size too large. The meal title, section headings, ingredient rows and step text are all oversized next to the rest of the app.

**Cause (likely):** the view was built at the mockup's pixel sizes rather than the 2026-10-04 text-size role table.

**Rule:** every text element in the recipe view maps to an existing role and uses `ts(px, k)` like the rest of the app. The mockup sets the layout; the role table sets the sizes.

| Element | Role |
|---|---|
| Meal title | sheet-title (22.4 px, k 0.5) |
| "Ingredients" / "Steps" / "Your cooks" headings | section heading, matching Edit Meal's section labels |
| Byline, Added by, meta line, proof line, ingredient tags | meta (14, k 1) |
| Ingredient rows | body (16, k 1); row min-height 44 px, no taller |
| Step text | body (16, k 1), line-height about 1.5; number circles sized to it (about 28 px) |

Two constraints follow from this:

- **Cook mode (slice c) needs headroom.** Cook mode is defined as step text "one size larger." The view must sit at body size so that Cook mode has a size to step up to.
- **Nothing in the view renders below the 12.5 px floor.**

**Check:** open the recipe view, then Edit Meal for the same meal. At Default the two should read as siblings: the same title weight, the same body size, the same row rhythm.

---

## A2 — Ingredient tags answer "do we have it?"

**Finding:** today's tag reads "On your list" on some rows and nothing on others. That tells you where an item sits, not whether you can cook. Dan's walk also showed **Cooked it** on a meal whose rows all read "On your list" (see A3).

**Rule (Dan):** tags show **only while the meal is planned and not yet cooked**, between Plan and Cooked it. An unplanned meal shows no tags, and neither does a cooked one.

Truth table. The first matching row wins.

| # | What's true about the ingredient | Tag |
|---|---|---|
| 1 | Bought on a trip **after this meal was planned**, and the trip recorded who checked it off | **{First name} bought it**. If the buyer is the viewer: **You bought it**. In a solo household: **Bought** |
| 2 | On the shopping list, not yet bought | **On the shopping list** |
| 3 | Marked "I have this" (`meal_ingredients.on_hand`) | **Already have it** |
| 4 | Anything else | *(blank)* |

**Why row 1 exists:** it celebrates the shop. The tag only appears when the purchase happened in the window between planning the meal and cooking it, so it's tied to this cook rather than to some past trip.

**Never guess a person.** Row 1 names someone only when the trip recorded who checked that item off. If the purchase is known but the buyer isn't, show **Bought** with no name.

**Replay privacy:** the name renders inside masked text. It never goes in an allow-listed element and never in an attribute (same rule as Added by). The tag copy without a name is fixed copy.

**Summary line under "Ingredients":** this replaces the bare count.
- While any row is in state 2: **"{n} · {k} on the shopping list"**
- When no row is in state 2: **"{n} · All here"**. This must be the same moment the plan pill shows Cooked it (see A3), so the two always agree.

---

## A3 — Cooked it while items are still to buy (to diagnose)

**What Dan saw:** on dev desktop, Ground Beef Tacos showed **Cooked it** as its primary pill while nine of its thirteen rows read "On your list."

The spec says Cooked it appears only when the meal is ready or has nothing to buy, never while items are still to buy. So one of the two signals is wrong:

- **(a)** The rows were already bought, and "On your list" is stale wording. A2 fixes this.
- **(b)** The pill is reading the wrong state.

**Report which one before changing anything:** the meal's `boardCardState`, and what the current tag reads from.

Whatever the answer, after A2 ships the pill and the summary line must derive from **one** source. "All here" ⇔ Cooked it.

---

## A4 — Cook history speaks once (2026-10-18, Dan)

**Finding:** a meal cooked once says it three times. The pill reads "✓ Cooked", the meta line reads "Cooked 1 time", and a "Your cooks · 1" section lists a bare "Oct 18". With names, photos and stars gated off, a date on its own reads like a log entry.

**Rule:**
- **The meta line carries cook history.** "Cooked N time(s)" becomes **"Last cooked {date}"**, adding **"· {N} times"** when N is 2 or more.
  - Dates within the last week are relative: "Last cooked tonight", "Last cooked yesterday", "Last cooked Sunday".
  - Older dates use weekday + date: "Last cooked Sun, Sep 27".
  - A meal that has never been cooked shows no cook line.
- **The "Your cooks" section shows only at 2 or more cooks.** Its rows use the same date format, newest first.
- **When names, photos and ratings ship,** the rows grow into "Sun, Oct 18 · Dan cooked · ★★★" with the photo. The 2+ threshold is revisited then, because one cook carrying a photo may earn its own section.

**Verify:**
- **V-A4a:** Taco Night (cooked once, tonight) shows "Last cooked tonight" and no Your cooks section.
- **V-A4b:** a meal cooked 3 times shows "Last cooked {date} · 3 times" and a three-row section.
- **V-A4c:** a never-cooked meal shows no cook line.
- **V-A4d:** dates sit in masked text; the allow-list is unchanged.

---

## A5 — No pill that looks tappable and does nothing (2026-10-18, Dan)

**Finding (Dan, phone, after `7f623ad`):** in the To-buy state the view's pill reads "To buy" correctly. But it is drawn as an outlined pill, so it looks like a button you could tap, and tapping it does nothing. In the same state the board card offers **"See on list"**, which goes to Shop.

**Rule:**
- **To-buy state:** the pill becomes **"See on list"**, tappable. It does exactly what the board card's "See on list" does: close the view, then the same navigation and scroll/highlight the board uses. Reuse that handler; do not write a second one.
- **The pill is never drawn as a button unless it acts.** If any other state ends up inert, render it as plain meta text with no border.
- **Copy:** the button label is fixed copy, "See on list", with no name or count in it. If it needs a class, add it to the allow-list under its own name.

**Verify:**
- **V-A5a:** Ground Beef Tacos (To buy) shows "See on list". Tapping it lands on Shop exactly where the board's "See on list" lands.
- **V-A5b:** no state renders a bordered pill that does nothing.
- **V-A5c:** the allow-list delta is reported by name; at most one, the pill's class.

---

**Build status (2026-10-18, Claude Code):** A5 built — the To-buy pill is "See on list", the board's own handler (`goToDoor("list")`) after the view closes; ✓ Cooked renders as plain teal text, no border (the "never a bordered pill that does nothing" rule). No allow-list change: the pill keeps `.rv-plan`.

---

## Step 0 — reads before building A2 (read-only, report first)

1. **Who checked it off, and does it survive wrap-up?** Does a checked event record the user who checked it (`list_item_events` or another table)? Does that record survive wrap-up? `archive_trip_items` wipes `list_item_contributors`, so contributors can't be the source.
2. **When was the meal planned?** Find the meal's planned-at moment: a timestamp on the open `meal_placements` row, or the nearest equivalent. If none exists, say so; do not add a migration without coming back to the design chat.
3. **Which purchase belongs to this meal?** How is a bought item linked to *this* meal: the provenance link (list_items ↔ meal, the "For {meal}" sub-line) and whether it survives wrap-up.
4. **Is the household solo?** How does the view know: `householdMembers.length`, as the earned-Our wordmark uses.

If row 1 can't be built without new data, ship rows 2–4 and a nameless **Bought** for row 1, and bring the gap back here.

---

## Verification (adds to the spec's checks)

- **V-A1:** at Default, the recipe view and Edit Meal read as siblings. The harness reports computed sizes before and after, per element, at 320 / 375 / 390 × Default / XXL.
- **V-A2a:** Plan a meal → Add to Shop. Every row that was added reads "On shopping list". The summary reads "{k} on the shopping list". The pill is not Cooked it.
- **V-A2b:** a second member checks two of those items on a trip. Those two rows read "{Name} bought it"; for the member who checked them they read "You bought it".
- **V-A2c:** mark one ingredient "I have this". Its row reads "Already have it".
- **V-A2d:** once nothing is left in state 2, the summary reads "All here" and the pill is Cooked it, in the same render.
- **V-A2e:** an unplanned meal and a cooked meal show no tags.
- **V-A2f:** a solo household shows "Bought" for row 1, with no name.
- **Privacy:** no buyer name appears in any attribute or allow-listed element. The allow-list delta is reported by name; none is expected.
