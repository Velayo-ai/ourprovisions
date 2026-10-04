# SPEC — Global Text Size: one knob, every surface

**Scope:** OurProvisions
**Status:** Design approved 2026-10-04, ready for BUILD
**Mockup of record:** design canvas "Text Size — Plan" (two rows: meal library, meal sheet; each at Today-XXL / Default / Large / XXL). **The mockup is the tiebreaker over this prose.**
**Amends:** ARCHITECTURE.md § "User Preference: List text size — `--op-list-scale`" (2026-07-01)

---

## Why this exists

Two independent beta signals on two surfaces:
- 2026-09-15 — demo viewers squinted at the "Ask the Galley" sheet.
- 2026-10-04 — older friends squinted at meal planning, at a setting they could have raised.

Root cause: the **List text size** control reaches six list-row classes only. Everything in Plan (library cards, meal sheet, board, create/edit sheet, Galley sheet) ignores it. Secondary cause found during design: the muted caption colour `#A0724A` measures ~4.2:1 on white, under the 4.5:1 floor for small text. Part of the squinting is contrast, not size.

---

## Decisions locked

| # | Decision | Rationale |
|---|---|---|
| 1 | **One control for the whole app.** No separate Plan vs Browse/Shop setting. | The person who squints, squints everywhere. Two knobs makes the user configure the app's information architecture ("the app learns; it never asks the user to configure"). Discoverability: the users who need this least find a second setting. **Revisit only on evidence** — e.g. beta users set XL for the store and report Plan as broken/wasteful. |
| 2 | **Each text role responds to the knob at its own rate** (`k`, below). Small text grows fully; display names grow at half rate; chrome is fixed. | The context difference between Shop (glance, arm's length) and Plan (dense, seated) is absorbed by us, not by a second setting. Meal names at 20 px were never the problem and are what would break the two-column grid. |
| 3 | **Extend the existing variable; do not convert to `rem`.** | App.js sizes in inline `px` throughout; a `rem` conversion touches nearly every style. The `calc(<px> * var(--scale))` pattern already works and is proven on list rows. |
| 4 | **Raise the small-text floor at Default** (table below). Everyone gets it without touching the setting. | The users who need it most are least likely to find the setting. |
| 5 | **Darken small-text muted colour `#A0724A` → `#8A5F3A`** (~5.5:1 on white) for text under 18 px. | Fixes the contrast half of the problem; reads as the same warm brown. Larger/decorative uses of `#A0724A` (icons, borders, ≥18 px) may stay. |
| 6 | **Rename the setting** "List text size" → **"Text size"**, helper copy *"Bigger text across the app, on this device"*. Step labels unchanged (Compact / Default / Large / XL / XXL). | The label must describe what it now does. |
| 7 | **Keep the storage key `localStorage.op_list_text_size` and the step ladder `[0.9, 1.0, 1.2, 1.45, 1.75]`.** | Existing users keep their chosen step with no migration. The key name is internal; the stored value is still the step index. |
| 8 | **Device-local, never account-synced** — unchanged from 2026-07-01. | Text size is a property of the screen and the light, not the person. |
| 9 | **At XL/XXL, layouts wrap rather than shrink or clip:** library-card strips stack (count above Plan pill); meal-sheet "I have this" / ON HAND pill drops below the ingredient name; sheet footers stay pinned while content scrolls. Library stays two columns (single column only below ~340 px, per SPEC_meal_library_v1 decision 1). | Seen holding on the mockup at 390 px. |

---

## Type roles

`k` = how strongly the role follows the knob. Effective size = `default × (1 + (scale − 1) × k)`.

| Role | Examples | Today | New default | k |
|---|---|---|---|---|
| Chrome | Household name, Helm tabs, header | 11 px | 12 px | 0 (fixed) |
| Eyebrow | Occasion word, INGREDIENTS label, ON HAND pill | 11.5 px | 12.5 px | 1 |
| Meta | "7 ingredients", quantities, sub-copy, captions | 12.5 px | 14 px | 1 |
| Body | Ingredient names, search input, row text | 14 px | 15 px | 1 |
| Button | Plan pill, rail pills, "I have this", primary buttons | 13 px | 14 px | 0.8 |
| Card title | Meal name on library card | 20 px | 20 px | 0.5 |
| Sheet title | Meal name in sheet | 24 px | 24 px | 0.5 |
| Page title | "What sounds good?" | 22 px | 22 px | 0.4 |

Wordmark stays fixed at its current size.

---

## Build scope

1. **Rename the variable** `--op-list-scale` → `--op-text-scale` (`:root` default `1`, effect on `documentElement` unchanged). Update the six existing list-row classes in the same commit — Browse `.item-name` / `.price-display` / `.item-subtotal`, My List `.li-name` / `.li-qty` / `.li-subtotal`.
2. **Add one helper** for inline styles, so every scaled size is written the same way:
   ```js
   // ts(16)      → full response:  "calc(16px * var(--op-text-scale))"
   // ts(20, 0.5) → half response:  "calc(20px * (1 + (var(--op-text-scale) - 1) * 0.5))"
   const ts = (px, k = 1) =>
     k === 1
       ? `calc(${px}px * var(--op-text-scale))`
       : `calc(${px}px * (1 + (var(--op-text-scale) - 1) * ${k}))`;
   ```
   Why a helper: the gentler-response formula is easy to mistype across dozens of inline styles; one function makes the role table the single source of truth.
3. **Apply to Plan surfaces:** meal library (head row, search, rail, cards), meal sheet (incl. on-hand rows and footer), This Week board, New/Edit meal sheet, Ask the Galley sheet. Map each text element to a role in the table above.
4. **Apply the floor and colour change (decisions 4–5)** to content text app-wide. List-row classes already at or above the floor keep their current default.
5. **Wrap rules (decision 9):** `flex-wrap: wrap` on library-card strips and meal-sheet ingredient rows; confirm sheet footers are outside the scrolling region.
6. **Preferences copy (decision 6).**
7. **ARCHITECTURE.md:** replace the `--op-list-scale` section with `--op-text-scale`, the role table, and the "one knob" rationale.

No DB changes. No migrations.

---

## Verification (deployed preview, never localhost)

- [ ] Existing user with a stored step (e.g. XL) loads the new build and keeps XL — no reset.
- [ ] At **XXL, 390 px wide**: library grid stays two columns; card strips stack; no text clips or overflows horizontally.
- [ ] At **XXL, 320 px wide**: library drops to one column; nothing overflows.
- [ ] Meal sheet at XXL: controls drop below names; "Add to Shop" footer stays visible while the list scrolls.
- [ ] Galley sheet and New/Edit meal sheet respond to the knob (the 2026-09-15 complaint).
- [ ] Header, Helm tabs and wordmark do **not** change size between Compact and XXL.
- [ ] At Default, no content text renders below 12.5 px (spot-check with dev tools computed styles).
- [ ] Small muted text uses `#8A5F3A`; spot-check contrast ≥ 4.5:1.
- [ ] Browse and My List at each step look the same as before (regression check on the rename).

---

## Open / watch for

- **Watch beta feedback** for evidence that Shop and Plan want different sizes (decision 1's revisit condition).
- Mockup screens are representative of the live layout, not pixel copies; the build maps real elements to roles.
