# SPEC — Meal Library Visual v2: quieter cards, grid/list, occasion icons

**Scope:** OurProvisions
**Status:** Designed 2026-10-16 in the design chat. Ready for BUILD once the three Open items below are confirmed or defaulted.
**Mockup of record:** design canvas **"Meals Library Redesign"** (private to Dan). Artboards: *Before — current*, *After — grid (row-matched)*, *After — list / large text*, *Occasion icons*. **The mockup is the tiebreaker over this prose** for layout, spacing and copy. Its colours are representative; the build uses the app's existing tokens (see D10).
**Amends:**
- `SPEC_meal_photos_v1.md` **D5** (photo band height and text-on-photo) and **D8** (what an empty band shows). Photos v1 is not built yet, so this changes a plan, not shipped code.
- `SPEC_global_text_size.md` **D9** (library stays two columns at XL/XXL) and the **Card title** row of its role table.
- `SPEC_meal_library_v1.md`: card anatomy only. Rail, filtering, Plan behaviour and occasion data are unchanged.

---

## Why this exists

On 2026-10-15 Dan demoed the app to Lee, a graphic designer. Lee liked everything until the Meals library, where he winced and said the typography was getting in the way. The view was at Large text.

Diagnosis from the screenshot:
- Every card was a **solid dark-brown slab with a 3–4 line display serif title**. Six of those on one screen means nothing can stand out.
- **The page heading and every card title competed at the same volume**, all in display serif.
- **Repeated chrome.** An occasion eyebrow, an outlined "Plan" pill and an "N ingredients" line, times nine.
- **Inconsistencies a designer sees first.** Title casing varied ("Shrimp **And**" vs "Bean **and**"), and one card had no occasion word.
- **At Large text, two columns of tall cards** showed only four meals per screen.

---

## Decisions locked

| # | Decision | Rationale |
|---|---|---|
| D1 | **Light cards.** The card is cream (`#FFFDF9`) with a 1px warm border and dark text. Dark brown is no longer a card fill. | Removes most of the visual weight in one move. Dark brown stays for active states (the selected rail pill, the selected view toggle). |
| D2 | **The meal name moves out of the band and into the card body**, for every card, with or without a photo. Lusitana 700, **17px at Default**, line-height 1.2, **clamped to 3 lines in the grid and 2 in the list**, with an ellipsis. | One serif moment per screen: the page title. The grid gets 3 lines because a half-width card clamped at 2 cut "Lemon Garlic Shrimp and…" and lost the dish (found rendering the handoff mockup, 2026-10-16). Clamping stops long imported titles from setting card height. With the name off the band, the photo needs no scrim, so Photos v1's scrim-contrast gate goes away. *(Amends Photos D5.)* |
| D3 | **The band is the "slot".** Without a photo: a short **56px** tinted band with the occasion icon centred. With a photo: **132px**, `object-fit: cover`. | An icon needs little room; a photo deserves more. *(Amends Photos D5 "same height".)* |
| D4 | **Rows are matched, not masonry.** In the grid, if either card in a row has a photo, both cards get the tall slot. The photo-less card's icon sits centred in the taller tint. | It reads organized, and grid order stays left-to-right, so sorting is never visually shuffled. **Rejected: masonry** (CSS columns), which reads top-to-bottom per column. |
| D5 | **Occasion icon + tint per occasion**, from `occasion[1]` (the same element that already drives the card's occasion word). Line icons, 1.5 stroke, about 32px in the grid and 30px in list thumbnails. See the table below. **Untagged meals** (`occasion = '{}'`) get a neutral cream tint with no icon. | Gives each card a quiet identity without text. These are occasion marks, not photo placeholders, so there is **no camera glyph and no "add a photo" on library cards.** Photos D8's intent stands; only its wording is narrowed. *(Amends Photos D8.)* |
| D6 | **Meta line:** `{Occasion} · {n} items`, 13px (Meta role), muted. Untagged: `{n} items`. The separate eyebrow line is gone. | Merges two lines of chrome into one. "items" fits the half-width card where "ingredients" doesn't. |
| D7 | **Plan becomes a round "+" button**, 44×44 touch target, soft fill (`#F1E6D6`), dark plus glyph, `aria-label="Plan {meal name}"`. Behaviour is unchanged from Meal Library v1. | The outlined pill repeated nine times was a large share of the noise. |
| D8 | **Grid/list toggle: one button.** A single 44×44 icon button, styled like the filter button, sits to its right in the search row. **It shows the view you'd switch *to***: a list icon in grid, a grid icon in list (the Photos/Files convention). `aria-label` names the action, "Show as list" / "Show as grid". **Rejected: a two-segment control**, which doubled the chrome in an already busy row (Dan, 2026-10-16). **List view:** full-width rows with a 60×60 rounded thumbnail (photo, or tint + icon), a 2-line title (19px at Large), the meta line, and a 48px "+". | Grid is for browsing by picture ("what looks good?"); list is for scanning by name ("where's the salmon one?"). Different jobs. |
| D9 | **Default view follows text size; the toggle overrides it.** Stored step **index ≥ 2 (Large, XL, XXL) → list**; below that → grid. Once the person taps the toggle, their choice is stored and wins. **Device-local**: `localStorage.op_meal_library_view` = `'grid'` \| `'list'`, absent = derived. | Large text is where two columns fail. Device-local matches the text-size precedent (Text Size D8): it's a property of the screen. *(Amends Text Size D9: at Large and above, the library is a list by default instead of two stacked-strip columns. The ~340px single-column rule still applies to grid.)* |
| D10 | **Use existing tokens, not the mockup's hexes,** for text: muted small text is `#8A5F3A` (Text Size D5). Card title follows the Card title role at **17px default, k 0.5** (was 20px). | The Text Size role table remains the single source of truth; this changes one row of it. |
| D11 | **Title casing is normalized for display, never rewritten in the database.** A pure helper `displayTitle(name)` lower-cases a fixed small-word list (`and, or, with, of, the, a, an, in, on, to, for, alla, al, con, de`) **when not the first word**. It never upper-cases anything and never touches all-caps tokens (e.g. "BLT"). Also add the same rule to the recipe-import prompt so new imports arrive clean. | Fixes every existing row with no prod data migration on user content. The narrow rule can't mangle a name someone typed on purpose. |
| D12 | **"This Week" (inactive page-title switch) drops to regular weight;** "Meals" (active) stays bold with its underline. | The active state reads by weight, not only by colour. |

### Occasion marks

| Occasion | Icon | Tint | Ink |
|---|---|---|---|
| breakfast | coffee cup | `#F6EBC8` butter | `#8F7030` |
| lunch | sandwich | `#E3E8D6` sage | `#5F7048` |
| dinner | cloche | `#EFE3D2` clay | `#8A6B4C` |
| snack | apple | `#DCE8E4` seafoam | `#47766B` |
| dessert | cupcake | `#F3E0DA` blush | `#9A5D52` |
| side | **Open, O1** | — | — |
| appetizer | **Open, O1** | — | — |
| *(untagged)* | none | `#F4EADC` cream | — |

SVG paths are in the mockup's *Occasion icons* artboard. Copy them as-is into one `OccasionIcon` component keyed by occasion. The icon is decorative (`aria-hidden`); the meta line already names the occasion for screen readers.

---

## Open, confirm before build

| # | Question | Default if not confirmed |
|---|---|---|
| O1 | Icons for **side** and **appetizer** (the 7-value CHECK in 061 includes both). | side → small salad bowl on a pale-green tint; appetizer → skewer on a pale-terracotta tint. Claude Code drafts them in the same 24-unit, 1.5-stroke style and they get a look in the design chat before merge. |
| O2 | Does the search row (field + filter + toggle) still fit at **XXL on 320px**? The single-button toggle (D8) makes it likely. | The search field shrinks first (`min-width: 0`). If it falls below ~140px, the toggle moves to the right end of the rail row. Verify on the preview. |
| O3 | Photos v1 is still unbuilt. Should v2 ship first, with the 132px slot path dormant until photos land? | Yes. Ship v2 now; the tall-slot code path exists and is exercised only once `meal_photos` reads return a photo. |

---

## Build scope

1. **Card component.** Restructure as slot → body (title, meta row with "+"). Card is a flex column. Remove the dark fill, the eyebrow and the Plan pill.
2. **Row matching, pure CSS (D4).** Do not compute rows in JS. The grid's default `align-items: stretch` already makes cards in a row equal height. Give the **icon slot `flex: 1 1 auto; min-height: 56px`** and the **photo slot a fixed `height: 132px`**. The icon slot then grows whenever its neighbour is taller, at any column count (tablet 3-column included). *(The mockup used row math only because of mockup tooling. Don't copy it.)*
3. **`OccasionIcon` + tint map (D5)**, keyed on `occasion[1]`, with an untagged fallback.
4. **Grid/list toggle + view resolver (D8–D9).** A small hook, `useLibraryView()`, returns `'grid' | 'list'` from the stored override, else from the text-size step. Writes the override on tap.
5. **List row component (D8).**
6. **`displayTitle()` helper (D11)**, unit-tested (cases below). Use it on the library card, list row and meal sheet title. Add the casing rule to the recipe-import prompt.
7. **Type:** card title 17px, k 0.5, via `ts()`; update the role table in ARCHITECTURE.md (D10).
8. **Page title weight (D12).**

No DB changes. No migrations. No new RPCs.

### `displayTitle` cases (unit test)

- "Lemon Garlic Shrimp And Spinach Pasta" → "Lemon Garlic Shrimp and Spinach Pasta"
- "Chicken Penne Alla Vodka With Vegetables" → "Chicken Penne alla Vodka with Vegetables"
- "And Then There Was Pie" → unchanged (first word)
- "BLT With Avocado" → "BLT with Avocado" (all-caps token untouched)
- "grandma's chili" → unchanged (never up-cases)

---

## Verification (deployed preview, never localhost)

- [ ] At **Default, 390px**: grid, two columns, at least 6 cards visible above the nav; no card has a dark fill; one display-serif size on screen besides the page title.
- [ ] **Titles clamp at 3 lines (grid) / 2 lines (list)** with an ellipsis; at Default, the six current meal names show in full in the grid; a long imported title never grows a card.
- [ ] **Casing:** the five `displayTitle` cases pass; existing library rows display normalized; the database row is unchanged (read it back).
- [ ] **Untagged meal** shows a neutral tint, no icon, and meta "N items".
- [ ] **Row matching:** with one meal given a photo (dev only, or a forced flag until Photos v1), both cards in its row are tall and aligned; other rows stay 56px. Repeat at a 3-column tablet width.
- [ ] **View default:** fresh device at Default → grid; switch text size to Large → list; tap grid → grid persists across reload and across further text-size changes.
- [ ] **XXL at 320px:** list view, nothing clips, toggle reachable (O2).
- [ ] **"+" plans the meal** exactly as the old Plan pill did (Meal Library v1 behaviour, including un-plan).
- [ ] **Accessibility:** "+" announces "Plan {meal name}"; the toggle announces its action ("Show as list" / "Show as grid") and its icon flips after a tap; icons are `aria-hidden`; small muted text ≥ 4.5:1.
- [ ] **RUM:** no new class on meal-name elements joins `CHROME_ALLOW_LIST`; report any allow-list delta by name (expected: the toggle button, if it carries a class).

**Done when:** all of the above pass on the dev preview, O1–O3 are confirmed or defaulted, ARCHITECTURE.md's role table and the Photos v1 / Text Size amendments are recorded, and Lee has seen the build.

---

## Amendment A — 2026-10-16: icon refresh + "Set meal type" for untagged meals

**Why:** On-device review. The lunch icon (flat triangle) read as a cake slice or hat, and the side icon's half-dome read as nothing in particular. Dan wants untagged meals to *encourage* the user to set a type, not just look acceptable. Directions came from a ChatGPT icon sheet Dan shared; adopted with the changes below.

| # | Decision | Rationale |
|---|---|---|
| A1 | **Lunch → isometric sandwich** (two slices, wavy lettuce edge). **Side → bowl with leafy greens.** Breakfast, dinner and dessert unchanged. Redraw as SVG at 24 units with a **1.5 stroke**, matching the set. The reference sheet is a raster image with ~2px strokes; don't trace it. | Recognizable at 28–32px. |
| A2 | **Appetizer is NOT an empty plate.** Use a cocktail pick / skewer through two small bites (the O1 draft direction), on the terracotta tint. | An empty plate is the least food-like mark and collides with the untagged plate-and-utensils fallback. Two plate icons would blur "appetizer" and "no type." |
| A3 | **Tints are grouping hints; the icon is the identifier.** Render all 8 tiles (7 occasions + untagged) in one row. No two tints may be near-identical (CIE ΔE2000 ≥ 6 between any pair). If side and snack collide (both seafoam), snack moves to a soft apricot. | Fixes the side/lunch near-match seen on device without inventing a rainbow. |
| A4 | **Untagged meals show a "Set meal type" invitation** in place of the occasion word in the meta line: **list** "+ Set meal type · 5 items"; **grid** "+ Set type · 5 items". Accent colour `#8A5F3A`, no underline, Meta role. It is a real `<button>` with a ≥44px hit area that stops propagation, so it never opens the meal. | Dan: encourage completing the meal. It retires by behaviour: it disappears the moment a type is set (the coaching principle, no ✕, no nag). |
| A5 | **The picker is a small bottom sheet**, not Edit Meal: the 7 occasions as icon chips, **multi-select**, the first tapped becomes `occasion[1]` (the card word, per 061), plus a **Save** button. Writes through the **same path Edit Meal already uses** for `occasion`; no new RPC, no schema change. Optimistic update; on failure, revert and use the existing quiet toast. | One tap to fix the data, at the moment of noticing. Multi-select respects 061's list semantics (pizza is lunch *and* dinner). |
| A6 | **The untagged icon stays the plate-and-utensils mark** on the neutral cream tint. | It already reads as "a meal." The invitation lives in text, where it can be acted on. |

**Later (not this build):** the Galley pre-suggests a type ("Breakfast?") for one-tap confirm, and suggests one at import/create, so fewer meals arrive untagged.

**Verification add:**
- [ ] 8-tile swatch row rendered; pairwise ΔE ≥ 6 reported.
- [ ] Tap "Set type" on Tidewater → sheet opens; the card does **not** open behind it.
- [ ] Choose Dinner → card shows the cloche, "Dinner · 5 items", and the invitation is gone, with no reload. Choose Lunch + Dinner → card word is the first tapped.
- [ ] The second device in the household sees the type within a poll (RLS / realtime unchanged).
- [ ] Non-member write is refused (existing meals RLS); nothing new granted.
- [ ] VoiceOver: "Set meal type for Tidewater Shrimp & Grits, button."
