# SPEC — Plan: This Week · Meals title switch

**Date:** 2026-10-04 · **Scope:** OurProvisions · **Status:** Approved in design chat, ready to build
**Mockup of record:** `mockup_plan_week_meals_switch.html` (3 screens) → `docs/mockups/`
**Amends:** `SPEC_meal_library_v1_1_amendment.md` (head row, week line, card pill copy, + Create label) and the Helm section of `ARCHITECTURE.md` (Plan's control row, `doorAdd.plan`).
**DB changes:** None. UI and navigation only.

---

## Why

Field use (Dan, 2026-10-04): *"I keep forgetting how to get back to Plan."* The library's only route to This Week is the small grey line "{N} meals planned this week ›". It reads as a footnote, so the library feels like it **is** Plan and the week becomes something you have to remember is there.

This Week and Meals are two views of **one** activity: what we're eating, and what we could eat. The fix makes that relationship visible. Both views always show both names, at the size of a page title.

It also brings back the original two sub-tabs from `SPEC_meal_planning_v1` ("Meals | This Week"). This time they are the page heading rather than an extra row of controls.

---

## Decisions locked

| # | Decision | Rationale |
|---|---|---|
| D1 | **The page title is the switch.** Two serif links, "This Week" and "Meals", 18 px apart. Active: ink `#2A170C` plus a 3 px clay `#A0714A` underline the width of the word. Inactive: muted `#8C7660`. Both are always visible. | A segmented pill was mocked first and rejected: it cost about 60 px and repeated the title directly beneath it. The title-as-switch costs no extra rows and reads as information architecture rather than another control. |
| D2 | **Plan opens on This Week.** | "What are we eating?" is the more frequent question; the library is where you go to fill gaps. |
| D3 | **Subtitles stay, one per view.** This Week: unchanged, "{N} nights · {N} meals to add to Shop →". Meals: **"What sounds good? · {N} meals"**. | Each subtitle does its own job: what's left to do, versus an invitation plus the library size. "What sounds good?" stays in the product, now as the subtitle. |
| D4 | **Verbs stay distinct and get shorter.** This Week: **+ Add** (aria-label "Add a meal to this week"), keeping its sand `--op-add` style, which switches to Meals. Meals: **+ New** (aria-label "Create a new meal"), keeping today's + Create style, which opens the New Meal sheet unchanged. | Add puts a meal into the plan; New makes a meal for the library. The short labels are what make room for two 26 px titles on a 390 px screen; at full length the top row was crowded. |
| D5 | **+ Add goes straight to Meals.** No intermediate screen. Meals *is* the meal picker. | Reviewer feedback; matches v1.1's "no choice screen". |
| D6 | **Plan on a card does not leave Meals.** Plan → **✓ This week** in place (disabled, same sand fill), and the toast "{Meal} added to your week ✓" is kept. | Lets you add two or three meals in a row, then tap This Week when done. |
| D7 | **"✓ Planned" becomes "✓ This week".** | "Planned" is a state with no timeframe. "This week" names the other view and explains why the meal can't be added again. |
| D8 | **Remove the week line** ("{N} meals planned this week ›", `.lib-week`). | The switch replaces it as the route back. |
| D9 | **No back arrow, no breadcrumb, no "View library", and Meals is not a fifth door.** | Plan stays one of four doors; This Week and Meals are the two surfaces inside it. |
| D10 | **The title row is Plan's control row for the Helm.** `controlRowRef` goes on the switch row in both views. | This resolves the open ARCHITECTURE note ("move Plan's control-row ref onto the real lens row when the single-surface PLAN lands"). The pill compacts exactly when the switch and its button scroll out of reach. |
| D11 | **`doorAdd.plan` follows the view.** On This Week, the compact + switches to Meals (aria-label "Add a meal to this week"). On Meals, it opens New meal (aria-label "Create a new meal"), signed-in only as today. | One rule everywhere: the pill's + does what the header button above it did. |
| D12 | **Tapping the PLAN door while already on Plan returns to This Week, scrolled to the top.** Leaving Plan and coming back also lands on This Week. | Deep in Meals with the pill compact, the switch is off-screen; this is the way back. It matches the iOS convention, so it's already a habit in people's thumbs. |

---

## Layout and spacing (mockup screens 1–2)

- Dark household header → title row: **30 px** (was 16; the titles felt attached to the header).
- Title → subtitle: **8 px**.
- **This Week:** subtitle → first board card 18 px. The board, the drag hint / plan banners, and Hold a night are otherwise unchanged.
- **Meals:** subtitle → search field **about 20 px**. Search, filter, occasion rail and grid are unchanged.
- **+ Add / + New:** top-aligned with the title line, not centred across title and subtitle. Height 44 px.
- **Left edge:** titles, subtitle, cards, search and grid share one 16 px gutter. Keep it.

---

## Implementation notes

- **State:** reuse `planScreen`. Its board value means This Week and `"library"` means Meals; do not rename the internal values. The switch links and + Add set it; + New does not.
- **The switch renders once,** as a shared component in both branches (`view === "plan" && planScreen === …`), so the two views can't drift apart.
- **Accessibility:** real `<a>` or `<button>` elements inside a labelled `nav` ("Plan views"), with `aria-current="page"` on the active one. Tap target at least 44 px tall: pad the link vertically rather than shrinking the type.
- **`goToDoor("plan")`:** if `view === "plan"` already, set the board screen and scroll the Plan root to the top. Coming from another door, land on the board screen. Check how `goToDoor` handles a same-door tap today before adding this.
- **The library's head row** (back chevron / round + / old title) is replaced by the switch row. The `controlRowRef` sentinel moves with it.
- **RUM:** `.lib-week` goes. Any new fixed-copy classes ("This Week", "Meals", "+ Add", "+ New", "✓ This week") are fixed copy and can be allow-listed; meal names must stay out of them. Re-check `CHROME_ALLOW_LIST`.
- **Signed out:** unchanged. The library already gates + Create on sign-in; + New and the compact + keep that gate.

---

## Verification

1. Plan door from Home → This Week, with "This Week" underlined and "Meals" muted.
2. Tap "Meals" → library, with the underline moved and subtitle "What sounds good? · {N} meals".
3. Tap "This Week" → back to the board. Repeat both directions three times; no flash, no scroll jump.
4. **+ Add** on This Week → Meals, with nothing in between.
5. **Plan** on a card → it flips to "✓ This week", the toast shows, you **stay on Meals**. Plan a second card. Switch to This Week and both are on the board.
6. A previously planned meal shows "✓ This week" in the library; a cooked (afterglow) meal shows Plan again, as in v1.1.
7. Scroll Meals until the title row leaves → the Helm compacts. The compact + opens New meal. Scroll back → the pill returns to full and the + disappears.
8. Scroll This Week until the title row leaves → the Helm compacts. The compact + switches to Meals.
9. Deep in Meals, tap **PLAN** → This Week at the top.
10. Phone, at 390 px: the title row doesn't wrap; + Add / + New stay on the title line.
11. Signed out: no + New and no compact + on Plan.
12. VoiceOver: the switch is announced as navigation with the current page; both + buttons read their full labels.

---

## Docs (Claude Code at SESSION END)

- `ARCHITECTURE.md` → Helm: Plan's `controlRowRef` is now the title switch row (close the "move the ref" note), and `doorAdd.plan` is view-aware (D11). Add D12 under the Helm rules.
- `SPEC_meal_library_v1_1_amendment.md`: mark the head row, week line, "✓ Planned" and "+ Create" rows as **superseded by this spec**.
- DECISIONS LOG: D1, D7, D10–D12 are the ones a future session needs.
