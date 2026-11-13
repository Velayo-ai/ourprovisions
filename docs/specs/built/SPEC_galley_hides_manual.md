# SPEC — Asking the Galley hides the hand-build fields

**Status:** design-final, not built. Build on dev AFTER the Drink promotion (2026-10-25).
**Scope:** client only — `src/App.js` (New Meal sheet). No migration, no Edge Function, no RUM allow-list change expected.
**Origin:** design chat 2026-10-25. Dan's repeated friction: the Galley's action button sits below the text box, under the sheet's sticky Cancel / Save Meal footer, so with the keyboard up he has to scroll to find it.

---

## The rule

The New Meal sheet already has one half of this. Since 2026-10-03 (`1fe4280`), **the Galley block hides once anything is hand-built, and returns if the draft empties.** This spec adds the mirror:

> **Once the Galley has input, the hand-build fields hide. They return when the Galley empties.**

Two ways to build a meal (10-12): by hand, or with the Galley. Whichever one you start, the other steps aside. Neither is lost; emptying what you started brings the other back.

It also frees roughly 300 pt of sheet above the Galley card. On a phone that puts the card directly under the title and the action button above the footer for an ordinary request.

## Decisions

| # | Decision | Why |
|---|---|---|
| G1 | **Trigger = the Galley has input:** trimmed text in the box, OR any staged photo. Not focus. | Symmetric with the 10-03 rule, which triggers on content. Focus would hide the fields when someone taps in only to look. |
| G2 | **Hidden while triggered:** Meal name, Good for (chips + caption), Ingredients (search + hint), Steps, and the OR divider. **Kept:** the "New Meal" title, the ✕ close, the Galley card, the Cancel / Save Meal footer. | The Galley only shows while the form is empty, so hiding these hides nothing the person typed. The footer stays; Save Meal stays disabled as today. |
| G3 | **Return = the Galley empties:** text cleared (the box's ✕, or deleting it all) AND no photos staged. | Mirror of "returns if the draft empties". No "build it by hand" link — the 10-03 side has none either, and the ✕ is the way back. |
| G4 | **A landed draft brings the fields back filled.** When Create a meal / Read this recipe / Read these lands, the fields render with the draft, and the existing 10-03 rule then hides the Galley (form has content). | Nothing new in landing; the two rules hand off to each other. |
| G5 | **Never mind / a failed ask** restores the state before the ask: the Galley keeps its input (so the fields stay hidden), as the composer already keeps staged input for retry. | Today's retry contract is unchanged. |
| G6 | **New Meal only.** Edit Meal is unchanged in this step. | In Edit the form already has content, so the Galley sits behind "Ask the Galley again" and its ask replaces the meal ("This replaces what's there now"). Hiding a filled meal while asking needs its own look; not in this step. |
| G7 | **No animation beyond what the 10-03 hide does.** If 10-03 is an instant hide, so is this. | One behaviour, both directions. |
| G8 | **The action button stays where it is (below the box) in this step.** | Step 2 — moving it into the box's tool row as a quiet text action (`mockup_galley_action_in_box.html`, option A) — is held. Dan uses step 1 for a while first; if the friction persists, step 2 follows. |

## Watch on the walk

The fields disappear on the **first character**, while the keyboard is open. iOS may shift the sheet. The box and caret must stay in view and the caret must not jump. If it is jarring, report it — the fallback is to scroll the sheet to the Galley card's top in the same frame (instant under reduced motion), not to switch the trigger to focus.

## Step 0 (read-only, report before code)

1. Quote the 10-03 hide condition (`1fe4280`) — the exact predicate that hides the Galley — so G1 / G3 mirror its shape.
2. Name the state that holds the Galley's text and staged photos, and confirm dictation (mic) writes to the same state.
3. Confirm how `galleyMode` / `draftDoorsAvailable` / `showAskAI` interact, so hiding the fields cannot also hide the Galley (no loop: fields hidden ⇒ form empty ⇒ Galley shown).
4. Confirm Edit Meal takes a different path, so G6 holds without a flag.
5. Report any element of G2 that is shared with Edit Meal or other sheets.

## Verification (dev, Dan on the phone)

1. New Meal, empty: all fields and the Galley show (unchanged).
2. Type one letter in the Galley → name, Good for, Ingredients, Steps and OR hide; title, ✕, Galley card and footer remain. The Galley's action button is visible above the footer with the keyboard up (short request).
3. Delete back to empty → the fields return, empty.
4. Type, then tap the box's ✕ → the fields return.
5. Stage one photo (no text) → fields hide. Remove it → they return.
6. Dictate with the mic → fields hide on the first transcribed word.
7. Create a meal → thinking card → the draft lands: the fields return filled, the Galley hides (10-03).
8. Never mind during thinking → back to the typed request, fields still hidden.
9. Hand-build first (type a meal name) → the Galley hides as today (10-03, regression check).
10. Edit Meal on an existing meal → unchanged; "Ask the Galley again" behaves as today.
11. 320 / 375 / 390 at Default and XXL in the harness: nothing clips; at XXL a long pasted recipe pushes the button below the footer — expected, recorded as the case step 2 exists for.
12. Bundle: `CHROME_ALLOW_LIST` unchanged by name.

## Out of scope

Moving the action button into the box (step 2, held). Edit Meal. Any copy change.

---

## Amendment 2026-10-25 (Step 0) — findings and rulings (wins over the body above)

Step 0 (Claude Code, read-only, dev `d0f8385`) against the live code; Dan ruled all five as recommended.

**Findings**
- **The live predicates** (the 10-03 rule has widened since `1fe4280`; `fromGalley` became `draftSource`):
  `galleyAvailable = draftSource !== null || (rows.length === 0 && !instructions.trim())` (App.js:3760);
  `showGalley = galleyAvailable && !busy && !galleyCollapsed` (App.js:3766). The Galley hides on
  **ingredients and steps only** — never on the meal name or Good for.
- **G1's mirror already exists:** `galleyHasInput = photosStaged || aiText.trim().length > 0` (App.js:3797) —
  content, not focus. The text is `aiText` (App.js:3163), the staged photos `photos`; dictation's
  `rec.onresult` appends into the same `aiText` (App.js:3386), so the mic triggers exactly like typing.
- `draftDoorsAvailable` and `showAskAI` no longer exist. `galleyMode()` classifies the input; it never
  decides visibility. Hiding the fields is render-only (`rows`, `instructions`, `name` stay in state), so
  it cannot flip `galleyAvailable` — no loop.
- **Edit Meal is the same `MealSheet`** (`mode="edit"`, `isEdit`, App.js:3099), not a different path; a
  meal with no ingredients and no steps shows the words-only Galley there. G6 needs an explicit `!isEdit`.
- "Not quite it? Ask the Galley again" after a landed draft re-shows the Galley with `aiText` still
  holding the old request and the fields filled — a bare `galleyHasInput` trigger would hide a filled
  draft. Guarded by `draftSource === null`.
- `GoodForChips` (App.js:3065) and `.op-or` have this sheet as their only caller; nothing in G2 is shared
  with another sheet. The **From** field (`fromVisible`) was not listed in G2.

**Rulings**
- **(a) Trigger:** `!isEdit && draftSource === null && galleyHasInput`.
- **(b)** A name, Good for or From typed before the Galley gets input **hide anyway**; they stay in state
  and return when the Galley empties (a landed draft replaces the name regardless — "This replaces what's
  there now").
- **(c) From** hides with the other fields.
- **(d) Verification 9** becomes: "add an ingredient by hand → the Galley hides (10-03)". A typed name
  hiding the Galley is out of scope.
- **(e) While thinking** the fields stay hidden (no skeletons); the thinking card sits under the title.

---

## Amendment 2026-10-25b (walk) — hide on focus (amends G1 / G3; wins over the body and the Step 0 amendment)

**Walk finding.** `main.f69b7b23.js` (`d5f571d`, top-anchoring + a first-character `scrollIntoView`) failed on
Dan's iPhone: tap the box, type "t", the fields hide and the text box goes above the top of the screen.
iOS scrolls for the keyboard once, on focus, measured against the layout with the fields showing;
anything after the first keystroke runs after that scroll and iOS does not redo it.

**Ruling (Dan)**
- `fieldsHidden = !isEdit && draftSource === null && (galleyFocused || galleyHasInput)`.
- Hide on the Galley textarea's **focus**, synchronously in its focus handler, so the layout settles
  before iOS scrolls for the keyboard.
- Return only when the box **blurs AND is empty** (no text, no staged photos). Blurring with text keeps
  the fields hidden.
- Focus moving to the Galley's own controls (camera, mic, ✕, starter chips) is not a blur.
- Keep `d5f571d`'s top-anchoring; drop its first-character `scrollIntoView` unless the phone shows it is
  still needed. Edit Meal unchanged.

**Build notes (Claude Code, before code).** The textarea had no focus handler; nothing focuses it
programmatically (no `autoFocus`, no `.focus()` in `MealSheet`; `SheetClose` focuses its own ✕; the
starter chips only set text), so opening New Meal never hides the fields. iOS Safari does not focus a
`<button>` on tap, so a tap on the camera / mic / ✕ / a chip blurs the textarea with
`relatedTarget === null`: "inside the Galley" is a `relatedTarget` inside the card OR a pointerdown
inside the card just before the blur. ✕ empties the box and deliberately does not refocus it (that
would reopen the keyboard), so ✕ ends the focus state — the fields return at once (walk step 6). A
tap outside the card while it is engaged ends it too (walk step 4); a submitted ask ends it (the input
then holds the fields hidden through thinking, as before).
