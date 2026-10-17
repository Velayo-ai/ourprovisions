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
