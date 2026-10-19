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
| 2 | Checked on the open trip, not yet wrapped up — a check puts it in the cart; wrap-up is the purchase (*"cart vs bought" correction, 2026-10-18*) | **In {First name}'s cart**. If the checker is the viewer: **In your cart**. In a solo household: **In cart**. Same teal, same window and buyer resolution as row 1 |
| 3 | On the shopping list, not yet bought | **On the shopping list** |
| 4 | Marked "I have this" (`meal_ingredients.on_hand`) | **Already have it** |
| 5 | Anything else | *(blank)* |

**Why row 1 exists:** it celebrates the shop. The tag only appears when the purchase happened in the window between planning the meal and cooking it, so it's tied to this cook rather than to some past trip.

**Never guess a person.** Rows 1 and 2 name someone only when the trip recorded who checked that item off. If the purchase is known but the buyer isn't, show **Bought** (row 1) or **In cart** (row 2) with no name.

**Cart vs bought (2026-10-18):** "… bought it" / "Bought" only once the item is archived as bought at wrap-up (`status = 'bought'`, `deleted_at` set). A live bought row — checked on the open trip — is in the cart, not bought.

**Replay privacy:** the name renders inside masked text. It never goes in an allow-listed element and never in an attribute (same rule as Added by). The tag copy without a name is fixed copy.

**Summary line under "Ingredients":** this replaces the bare count.
- While any row is in state 3: **"{n} · {k} on the shopping list"**
- When no row is in state 3: **"{n} · All here"**. This must be the same moment the plan pill shows Cooked it (see A3), so the two always agree.

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

### A5 revision (2026-10-18 evening, Dan): pills act, text informs

This supersedes the copy above. It became a principle after Dan's walk: "To buy" / "See on list" alone doesn't say what's outstanding, and an inert "✓ Cooked" is a dead end.

**Principle (app-wide, logged in the decisions log):** a pill, meaning any rounded bordered or filled button, always acts. Information lives in text (the meta line, row tags) or in small uppercase chips like the board's TO BUY badge. A toggle that shows its own state is allowed, because tapping it changes that state.

The view's pill in each state:

| State | Pill |
|---|---|
| Not planned | **+ Add to This Week** (acts) |
| Planned, nothing added | **✓ On This Week**, a toggle; a tap un-plans (acts) |
| To buy | **"{n} left to buy · See list"**. n is the same toBuy count as the board's "{n} to buy" line, from one source. The tap runs the board's `goToDoor("list")`. |
| Ready | **Cooked it** (acts) |
| Cooked | **+ Plan again**: plans the meal onto This Week through the same handler as "+ Add to This Week". "Last cooked …" in the meta line (A4) already says it's cooked. |

- When n reaches 0, the pill follows D9 to Cooked it, in the same render as A2's "All here."
- The count in the click text is acceptable, the same precedent as `.lib-week`'s "{N} meals planned". No name ever appears in it.

**Verify (replaces V-A5a/b):**
- **V-A5a′:** Ground Beef Tacos with 2 items left shows "2 left to buy · See list". Tapping it lands where the board's "See on list" lands.
- **V-A5b′:** Taco Night (cooked) shows "+ Plan again". Tapping it puts it on This Week; the pill becomes "✓ On This Week".
- **V-A5c′:** no state renders a bordered pill that does nothing.

**Build status (2026-10-18 evening, Claude Code):** A5 revision built — To buy reads "{n} left to buy · See list" (n = the board's live rows minus those in the cart, one source; the tap is the board's `goToDoor("list")`); Cooked reads "+ Plan again" through the same `handlePlanMeal` as "+ Add to This Week"; at n = 0 the pill follows D9 to Cooked it (`planActionFor`, jest). No allow-list change.


---

## A2-R — Ruling on Step 0 (2026-10-18, design chat)

Step 0 findings (Cody): `meal_placements` has no planned-at timestamp. Checked events record the checker and survive wrap-up, but they are best-effort writes. The `list_item_meals` link survives wrap-up in the database, but the client's provenance read drops soft-deleted items.

**1. Anchor row 1 on the Add-to-Shop moment, not on Plan.** Row 1's window is **`list_item_meals.created_at` through the placement's `cooked_at`**, or through now if the meal isn't cooked yet.
- **Why this anchor is better, not a fallback:** buying something *for this meal* can only begin once it was added to Shop for this meal. Anything bought earlier was never on the list for it, so it can't be "bought for this meal." The Add-to-Shop moment is therefore a more precise match for Dan's rule ("bought between planned and cooked") than a planned-at stamp would be.
- **No migration.** A `planned_at` column is not needed for A2. Log it LATER only if another feature needs it.

**2. The tag must survive wrap-up.** The moment that matters is home from the store, about to cook, and that comes after wrap-up. The view's provenance read must therefore include items that were soft-deleted as bought (`deleted_at` set, `status = 'bought'`), linked to meals on open placements. This is a client read change only.
- **Step 0b, read-only:** confirm RLS lets the client select those soft-deleted rows. If it doesn't, **stop and report.** Do not widen a policy without coming back here.

**3. Naming the buyer.** Use the latest `checked` event for that list item inside the window, provided no later `unchecked` event exists. Map its user id to a first name through the household members already loaded.
- No qualifying event (the event write is best-effort) → **"Bought"**, with no name.
- Viewer is the checker → **"You bought it"**.
- Solo household (members loaded, fewer than 2) → **"Bought"**.

**4. Accepted edge.** If the same catalog item is re-added before this meal is cooked, the resurrect trigger deletes the old meal link. Row 1 then falls through to rows 3 and 4. This is rare and the result is harmless, so it is documented, not designed around.

> **Re-plan edge (2026-10-18, Dan; built the same day):** row 1's window starts at **max(the link's `created_at`, the meal's most recent `meal_cooks` cook)**. A meal re-planned without being re-added keeps its old link and its archived bought row; a purchase made before the last cook never counts for this one — the row falls through to rows 3 and 4. A link made after the last cook counts (any purchase on it is later); a `checked` event at or after the window's start counts and names the buyer. `rowWindowStart` / `boughtForThisMeal` in `src/lib/ingredientTags.js`, jest-proven with the re-planned Taco Night case.

> **2026-10-18 correction (Dan's dev walk — shop → wrap up → Cooked it → clear → re-plan, not added: the view read "13 · All here" and "You bought it" on five rows): window anchored on `meal_cooks`; bought tags require an Add-to-Shop link for this plan; All here requires the same.** As built: (1) the window's start is the meal's most recent `meal_cooks` cook, never the placement's `cooked_at` (which `planMeal` clears on re-plan); no tags render until the household's cook reduce has loaded (`cooksLoaded`), so "no entry" can never be mistaken for "never cooked". (2) Row 1 ("… bought it" / "Bought") appears only once THIS plan has been added to Shop — at least one `list_item_meals` link for the meal created at or after that cook (`wasAddedThisPlan`); a meal not on the list this time round had nothing bought for it. (3) "{n} · All here" requires that same link and k = 0; "{n} · {k} on the shopping list" requires it too; a planned meal never added shows just "{n}" (a spec defect in A2: its summary rule assumed the meal was on the list). (4) A meal with no ingredients shows no count (the section does not render). The pill already agrees: `boardCardState`'s "nothing to shop for → Cooked it" fires only for a planned meal with zero ingredients (`canAdd` = planned AND has ingredients), on the board and in the view alike — the one case where the pill reads Cooked it beside no summary; flagged, the board untouched. Jest: the exact walk sequence, re-planned and re-added with new purchases, a removed-uncooked meal re-planned, a planned meal never added.

> **2026-10-18 correction to A2-R (Dan, "fix it properly"): `planned_at` is the anchor; `meal_cooks` is the backstop; the Add-to-Shop-as-anchor ruling was wrong because a re-plan without a cook kept the old links.** Migration **063** adds `meal_placements.planned_at timestamptz` (nullable, no default; open placements backfilled from `updated_at`; closed rows stay null; RLS, grants and RPC signatures unchanged). The client's plan path — `appendPlacement`, the one upsert that nulls `cooked_at` / `skipped_at` on a plan or re-plan — stamps `planned_at = now()` there, once; reorder, Ready, cook and skip never touch it. The view: row 1's window starts at the open placement's `planned_at`; when it is null (rows older than 063) the meal's most recent `meal_cooks` cook stands in (`planAnchor`). The "added for this plan" link check uses the same start; "{n} · All here" and "{n} · {k} on the shopping list" require a link created at or after it (and, for All here, k = 0). Order of shipping: 063 on dev, VERIFY read back, then the client (it reads and writes the column); on prod the migration is applied and verified by direct query BEFORE the client push in Promotion 2. Jest: the re-walk with and without a cook on record (clear → re-plan, not added → "13", no tags, ✓ On This Week); re-plan + re-add + check two (two "You bought it", "13 · 11 on the shopping list"); plan → add → check all ("All here" and Cooked it from the same inputs).

> **2026-10-18 "cart vs bought" correction (Dan's dev re-walk): a check puts an item in the cart; wrap-up is the purchase.** Items checked on the open trip but not yet wrapped up read "You bought it" — not bought yet. A2's table gains a row between the old rows 1 and 2: checked on the open trip, not wrapped up → "In your cart" / "In {First name}'s cart" / solo "In cart" — the same teal, the same window and buyer resolution as row 1. "… bought it" / "Bought" only once the row is archived as bought at wrap-up (`status = 'bought'`, `deleted_at` set by `archive_trip_items`). The old rows 2–4 renumber to 3–5; the summary line and V-A2b / V-A2d follow. As built: `ingredientTag` returns kind `cart` for a live bought row, `bought` for an archived one; `.rv-tag.cart` shares the teal; no allow-list change. Jest: both states on the same link, flipping only `deleted_at`; the cart row shares the window (falls through before this plan, and when the plan was never added).

**5. Summary line:** unchanged. It counts state-2 rows only.

---

**Build status (2026-10-18 evening, Claude Code):** A2 built per A2-R — the per-meal link read includes soft-deleted bought rows (Step 0b: `list_items_select` is membership only, no `deleted_at` predicate); row 1's window is the link's `created_at` through now while the meal is on This Week; the buyer is the latest `checked` event in the window with no later `unchecked`, named through the loaded members; "You bought it" for the viewer, "Bought" for a solo household or no event; the summary line counts state-2 rows from the board's own count so "All here" and Cooked it land in one render.

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
- **V-A2b:** a second member checks two of those items on a trip. Those two rows read "In {Name}'s cart"; for the member who checked them they read "In your cart". After wrap-up they read "{Name} bought it" / "You bought it".
- **V-A2c:** mark one ingredient "I have this". Its row reads "Already have it".
- **V-A2d:** once nothing is left in state 3, the summary reads "All here" and the pill is Cooked it, in the same render.
- **V-A2e:** an unplanned meal and a cooked meal show no tags.
- **V-A2f:** a solo household shows "Bought" for row 1, with no name.
- **Privacy:** no buyer name appears in any attribute or allow-listed element. The allow-list delta is reported by name; none is expected.

---

## Amendment B (2026-10-19) — the action block

*Design chat, 2026-10-19. Append to `docs/specs/active/SPEC_recipe_view.md` under a dated heading; do not edit the body. Save the mockup as `docs/mockups/mockup_recipe_view_actions.html`; it's the tiebreaker over this prose.*
*Dev only. Prod comes in a later promotion.*

**Precondition:** Promotion 2 is closed. Dan has confirmed the prod walk passed and `main` is pushed and verified. Don't branch this work until then.

---

## Why

On prod, the recipe view shows **"✓ On This Week" as a full-width pill**. That's a status drawn as a button, so nobody can tell what tapping it does. With the space the recipe view has, the screen should say what the meal's state is **and** offer the one next step, in the board's own words.

## Decisions

**B1 — Three parts, by state.**
- A **status line** that can't be tapped.
- **One main action**, chosen by where the meal is.
- A **quiet "Remove from This Week" link**.

There are never two equal buttons.

| State | Status line | Main action | Quiet link |
|---|---|---|---|
| A · Planned, not on the list | ✓ ON THIS WEEK | **Add to Shop** (gold fill) | Remove from This Week |
| B · On the list, items left | ✓ ON THIS WEEK | **{n} left to buy · See list →** (outline) | Remove from This Week |
| C · Everything bought | ✓ ON THIS WEEK · Everything's in | **Cooked it** (teal) | Remove from This Week |
| D · Not planned | none | **+ Plan again** / slice (a)'s existing plan control, unchanged | none |

**B2 — One source of truth for the state.** The recipe view has to agree with the board card for the same placement ("Not on the list yet" / "{n} left" / "Everything's in — go cook"). **Reuse the board's existing status logic.** Don't write a second version. If the board can't currently share it, move it into `src/lib` once and have both import it.

**B3 — One path for every door (10-17 rule).** Each action calls **exactly** what the board calls:
- **Add to Shop:** the board's Add to Shop flow, including the on-hand "I have this" step and `add_meal_to_list` with `p_include_on_hand_ids`.
- **Cooked it:** the board's Cooked it handler, with the same writes, the same afterglow and the same "last cooked" stamp.
- **Remove from This Week:** the board's ⋯ → Remove handler, with the same confirmation or undo the board uses. The meal stays in the Library.

No new RPCs and no new writes.

**B4 — The sheet stays open and follows the state.** After an action, the recipe view moves to its next state in place:
- Add to Shop → B (or C if everything was marked on hand).
- Cooked it → D, with "Last cooked {today}".
- Remove → D. That makes "+ Plan again" the one-tap undo.

If the board's Add to Shop opens a sheet of its own, stacking it over the recipe view is fine. When that sheet closes, the recipe view should show the new state. Report how it behaves.

**B5 — Share: reserved spot, top bar.**
- Share is about the recipe, not the plan. It sits beside **Edit** and looks the same in every state.
- **Glyph:** a box with an up arrow, our own SVG (see the mockup) in the nav icons' line weight. 22px icon, 44px tap target, fixed accessible name "Share".
- **Ships only if sharing a meal actually works today.** Step 0 checks. If there's a working meal-share flow in the client, wire the icon to it. If not, **don't render it.** No dead button and no placeholder code; the spot is just reserved in the design.

**B6 — Replay privacy (A4 / A5 rules).**
- No meal name, item or count of household content in any copied attribute.
- Buttons take their names from visible text (which is masked) or from fixed copy. **No `aria-label` carrying "{n} left".**
- Allow-list changes: fixed-copy controls only, named in the report. The B button contains a count: follow the `.wrapbar` precedent (a count in click text is acceptable) only if Dan approves it in the report. Otherwise leave it masked.

**B7 — Words.** Use "Add to Shop" and "This Week" everywhere. Don't use "Shopping list" or "Plan".

## Steps

**Step 0 — Read-only report, then stop.**
1. Where does the board's status logic live, and can the recipe view import it as it is?
2. The board's rule for **Cooked it**: does the card show it only for Up Next (01), or on any "Everything's in" card? If it's Up Next only, **stop and report.** State C's rule has to match the board's, and Dan decides which.
3. The handlers for Add to Shop, Cooked it and ⋯ → Remove, by file and line. Does Remove confirm, or offer undo?
4. Is there a working meal-share flow in the client (B5)? Quote it, or say there isn't one.
5. What happens to the existing `.rv-plan` pill (allow-listed in slice (a))? Map which old classes go away and which new ones arrive.

**Step 1 — Build (one commit).**
- The action block for A–D as in the mockup, plus Share if Step 0 found a working flow.
- **Tests:**
  - state derivation, with all four states agreeing with the board for the same placement;
  - each action calls the board's own handler (mock the module);
  - B4 transitions;
  - `ReplayLabels.test.js` extended: no copied attribute carries a name or count.
- ESLint 0, `CI=true` clean, LF line endings. Harness each state at 320 / 375 / 390, Default and XXL.
- Push. Grep the dev bundle: the old pill's markup is gone; allow-list before → after, by name.

**Step 2 — Dan's dev walk.**
- Open one meal in each state, from every door.
- Add to Shop → B (the board agrees). Buy everything → C. Cooked it → D with today's date (the board agrees). Remove → D, then "+ Plan again" → A.
- VoiceOver on each button. Share if it shipped.

## Done when

- [ ] All four states match the mockup, from the board's own status logic and the board's own handlers.
- [ ] Recipe view and board agree for every placement, after every action.
- [ ] No status is drawn as a button. Share is either working or not rendered.
- [ ] Replay: no names or counts in attributes; allow-list changes named and approved.
- [ ] Dan's dev walk passes. Prod waits for the next promotion.

### Step 0 rulings (2026-10-19)

*Design chat, 2026-10-19. Append to `SPEC_recipe_view.md` under Amendment B as "### Step 0 rulings (2026-10-19)". Step 1 is GO with these.*

---

**R1 — Everything in the cart, not wrapped up: keep A5, option (ii).**

The recipe view keeps showing **Cooked it** when every item is in the cart. This is the **one stated exception to B2.**

- **Why:** the recipe view is the cooking surface. When all the items are in the cart, the food is in the house, and people cook before they remember to wrap up. A5 was a deliberate decision on 10-18 and is already live on prod. Taking Cooked it away would be a regression.
- **Status line for this case:** `✓ ON THIS WEEK · All in your cart`. The main action is Cooked it (teal), and the quiet link follows R3.
- **Check, don't change:** confirm from 052 / `close_cycle` that Cooked it before wrap-up leaves the list consistent: the items stay on Shop, wrap-up handles a cooked placement cleanly, and nothing is double-counted. This has already been possible on prod, so it's a check. Report it; if something's wrong, stop.
- **Logged for later (not this build):** should the **board** also offer Cooked it at "N of N in cart"? That would bring the two surfaces back into line from the board's side. It's a design question for another session.

**R2 — Nothing-to-shop meals are state C: confirmed.**
Status line `✓ ON THIS WEEK · Nothing to shop for`, main action Cooked it. This matches Home's deck card.

**R3 — Remove wording follows the board, word for word (B7).**
- State B (To-buy): **"Remove (and take its items off Shop)"**. It does more than unplan, so it has to say so.
- States A and C (and R1's case): **"Remove from This Week"**.
- **The handler switches to `handleSkipMeal(id, state.toBuy)`.** This fixes a live inconsistency: today, removing a To-buy meal from the recipe view leaves its items on Shop. Record it as a finding.
- No toast, to match the board. The visible feedback is the view moving to state D with "+ Plan again", which is the undo (B4).

**R4 — No count in click text: B gets its own class, `.rv-see`, kept off the allow-list.**
- The `.wrapbar` count exception exists because it feeds a funnel metric. A count of items left on one meal feeds nothing, and the click event still records *which* button by its class.
- This also closes the existing prod finding: "{n} left to buy" currently goes out unmasked under `.rv-plan`. It closes for real with the next promotion.
- Correct the outdated `rum.js` comment on `.rv-plan`.
- Expected allow-list change: `.rv-remove` in. `.rv-plan.on` and the count-bearing `see` variant leave `.rv-plan`'s unmasked text. Report the before → after list by name.

**R5 — Approved as proposed:**
- `boardCardState` plus the four no-shop helpers move to `src/lib/boardState.js`, with no logic change, as their **own commit before Step 1**. That way the refactor diff and the behaviour diff stay separate and each can be reviewed alone.
- The recipe view is gated on `!onHandPrompt`, the same pattern as `!mealSheet`, so the "I have this" prompt is never hidden under the view.
- Share is not rendered. When `SPEC_meal_sharing_v2.md` ships, it adds the top-bar icon from this amendment's mockup.

**Updated state table (replaces B1's):**

| State | Status line | Main action | Quiet link |
|---|---|---|---|
| A · Planned, not on the list | ✓ ON THIS WEEK | Add to Shop | Remove from This Week |
| B · On the list, items left | ✓ ON THIS WEEK | {n} left to buy · See list → (`.rv-see`) | Remove (and take its items off Shop) |
| R1 · All in the cart, not wrapped up | ✓ ON THIS WEEK · All in your cart | Cooked it | Remove (and take its items off Shop) if the board treats it as To-buy, otherwise Remove from This Week. Follow `state.toBuy`. |
| C · Ready (wrapped up) | ✓ ON THIS WEEK · Everything's in | Cooked it | Remove from This Week |
| C · Nothing to shop for | ✓ ON THIS WEEK · Nothing to shop for | Cooked it | Remove from This Week |
| D · Not planned | none | + Plan again / + Add to This Week (unchanged) | none |

---

## Amendment C (2026-10-19) — no Cooked it before wrap-up

*Design chat, 2026-10-19. Append to `docs/specs/active/SPEC_recipe_view.md` under a dated heading; do not edit the body. **Supersedes Amendment B ruling R1 and slice (a)'s A5 revision.** Client only. Ships as Promotion 4.*

---

## Why

Wrap-up is the habit OurProvisions is building. It's when the app learns from a trip:
- the **receipt**;
- **how long** the shop took;
- **which store**;
- **the order** items went into the cart, which feeds smart list ordering.

A Cooked it that appears before wrap-up is a shortcut around that habit, so the trip's learning gets lost. Dan's rule (2026-10-19):

> **A meal is ready to cook only after wrap-up,** once each of its items is either in the cart or taken off the list.

This is how the board already works, so the recipe view's R1 exception goes. **B2 now holds with no exceptions:** the recipe view always agrees with the board.

## Principle (record in ARCHITECTURE)

**Wrap-up is the learning moment. No surface offers a shortcut around it.** When a trip's items are all in the cart, every surface points toward wrap-up, never past it.

## C1 — R1 becomes a nudge to wrap up

| Everything in the cart, not wrapped up | |
|---|---|
| Status | ✓ ON THIS WEEK · All in your cart (unchanged) |
| Main action | **Wrap up →**. It **takes you to Shop**, where the wrap-up ritual lives (the "All done · Wrap up trip" screen and the Wrap Up bar). |
| Quiet link | Remove (and take its items off Shop), following `state.toBuy` as now |

- **One path for every door:** the recipe view never runs wrap-up itself. It sends you to the Shop wrap-up flow, so the receipt, store and timing are captured exactly as they are today.
- The button's name is fixed copy ("Wrap up"), so it's replay-safe. Report its class, and whether it joins the allow-list (fixed copy, so it's eligible).

## C2 — Cooked it, everywhere

Cooked it is offered only when:
- the placement is **Ready** (`ready_at` set by wrap-up), or
- the meal has **nothing to shop for** (there's no trip to wrap up).

Nothing else gets it.

**Step 0 check, read-only:** list every surface that can offer Cooked it (board card, board ⋯ menu, Home deck card, recipe view, anything else) and its condition. Home's deck shows Cooked it on `st.ready || !st.canAdd`, so confirm `!canAdd` can't be true for a To-buy meal with everything in the cart. Any surface that breaks C2 gets fixed in this same change. Report before building.

## C3 — Unchanged

States A, B, C and D, the link release on Remove and Cooked it, and everything else in Amendment B stay as they are. Cooked it after wrap-up still releases links as built in `5c8afc4`.

## Done when

- [ ] Step 0 has listed every Cooked-it surface; any that breaks C2 is fixed.
- [ ] The R1 state shows "Wrap up →" and opens Shop; no Cooked it appears before wrap-up on any surface.
- [ ] Tests: the R1 action, the C2 condition per surface, and the board and recipe view agreeing in every state (the A5 exception test is removed). `ReplayLabels` is extended to cover the new button.
- [ ] Dev walk: plan → Add to Shop → check everything → recipe view shows "Wrap up →" → Shop → wrap up (receipt and store flow as normal) → recipe view and board both show Cooked it.
- [ ] Promotion 4 (client only), with bundle proofs, then Dan's prod walk.

### C2 clarification and Step 0 rulings (2026-10-19)

- **C2 now reads:** Cooked it is offered when the placement is **Ready** (after wrap-up), when there's **nothing to shop for**, or when the meal was **never added to Shop**. The last case is the freezer-pizza exit, and it lives on the **board ⋯ menu only**. Step 0 found the board ⋯ offers Cooked it on any Planned card, including one with ingredients; Dan ruled it stays, since there's no trip to wrap up.
- **The nudge's class:** `rv-plan wrap`, a variant of the already allow-listed `.rv-plan`. The allow-list stays at 47.
- **Style:** gold fill, the same as Add to Shop. Teal stays reserved for Cooked it.
- **The board card at 0 left:** "See on list" becomes **"Wrap up →"**. Same door (`goToDoor("list")`), wording only, so the board and the recipe view use the same nudge.
- **Logged as LATER:** `cook_meal` has no server-side readiness check. C2 is enforced in the client only.
