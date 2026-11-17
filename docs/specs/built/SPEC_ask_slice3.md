# SPEC — Ask · Slice 3: Simple style + resume after backgrounding

**Status:** APPROVED (design chat, Dan, 2026-11-09 ~00:05 ET). Build on dev. Prod untouched.
**Reads with:** `SPEC_ask.md`, `SPEC_ask_amendment_2026-11-03.md` (the amendment wins where they disagree), `SPEC_ask_slice2.md`.
**Scope:** client only. **No migration** (`asks.screen_style` already allows `standard | simple` since 077). Next migration number stays 083.
**Done when:** Amendment Verification 3, 4, 5 and 12 walked on dev; `.op-name` on any new name surface; prod untouched.

Hold-to-Done (A17) and reduced motion shipped in Slice 2. This slice re-walks them (V4, V12) on Simple. It builds two things: **Simple** and **A26 resume**.

**Out of scope:** the wagon polish (the wagon sits below the sunrise scene and reads as a shopping cart). It gets its own design pass against Dan's three-screen reference **before Ask goes to prod**. It stays in NEXT.

---

## Rulings (2026-11-09)

| # | Ruling | Why |
|---|---|---|
| S3-1 | **Simple shows at most 4 tiles, 2×2, big.** The create sheet won't save a Simple ask with more than 4 shelf items: "Simple shows 4 at most." The pick target is still ≤ the shelf size (the existing check). The tiles fill the width in two columns; the photo or glyph scales with the tile. It never scrolls on a 375 px phone. | The base spec's "four big tiles". Big targets for a small hand, and nothing hides below the fold. |
| S3-2 | **On Simple, tile names are always off. There is no toggle.** Each tile's `aria-label` still carries the name. **Exception:** a *plain* tile (no photo and no glyph) keeps its name, because otherwise it would be blank. | The photos do the talking (base spec). A toggle needs an `asks` column, and so a migration; it isn't worth one. |
| S3-3 | **Words → icons on Simple, the child's buttons only.** **Let's pick** → a big round ▶; **That's it!** → ✓ (A16) (↶ removed on both styles, A16 amended 2026-11-09, 60e44cd). Each icon button keeps the words as its `aria-label`. **The grown-up's controls stay words on both styles:** the Done hold ("Done" / "Hold to finish") and **Back to the list**. Headlines and the "I've added these to our list." screen also stay words, with names, because the grown-up reads them aloud at the handover and checks them at the return. | A13 lets buttons go to icons. The parent's controls aren't the child's experience, so words there make nothing second-class. |
| S3-4 | **Everything else is identical on both styles** (A13): the same three screens, the same wagon, the same dots counter, the tile-tap and wagon-tap take-out (↶ removed on both styles, A16 amended 2026-11-09, 60e44cd), the full-wagon shake, the motion, the celebration on confirm, and the single `land_ask_picks` write. | "No second class cart experiences." |
| S3-5 | **The style is set at create, not after.** The *Ask someone…* sheet gets a two-way choice: **Standard** ("Words and up to {max} tiles") / **Simple** ("Big pictures, up to 4 tiles"). Standard is the default. `createAskArgs` passes the chosen style instead of the hard-coded `"standard"`. The copy never mentions age, ability or reading (A3, A4). Changing the style later is Slice 4's edit sheet, and it must enforce S3-1 too. **On screen the two read Explorer** ("Big pictures, up to 4") **and Shopper** ("Names and pictures, up to 48"), Explorer on the left, Shopper the default (2026-11-09, `6d7f4d7`, `897423f`); the stored values stay `simple` / `standard`. | The style belongs to the ask, not to the person. |
| S3-6 | **Amends A26: the resume key also holds the screen.** One `sessionStorage` key, `op_ask_held`, value `{ask_id, screen, catalog_item_ids[]}`, where `screen` is `"turn"` or `"shelf"`. It never holds the label, item names or the style. | "Resume on the screen it left" can't be derived from the picks: a child on the shelf with 0 picks would be sent back to the handover. A screen name identifies no one. |

---

## A26 resume: behaviour

**Two cases.** (1) The app is backgrounded and comes back with the page still alive: the in-memory state is already intact, so nothing changes. (2) iOS discards the page and reloads it in the same tab: the state comes back from `op_ask_held`.

- **Write** the key on every change of picks or screen while an ask is open, on both styles.
- **Clear** the key when:
  - `land_ask_picks` **succeeds** (screen 3 shows). A failed land keeps the wagon *and* the key, as today.
  - Done is held.
  - The household switches.
  - The user signs out (a shared phone).
  - A resume finds the ask gone.
- **On a reload,** only after bootstrap has settled the household and the asks are loaded:
  - If `ask_id` isn't a live ask of the current household, clear the key and open nothing.
  - Otherwise reopen AskRun on `screen` with the held picks, filtered to ids still on that ask's shelf, deduplicated, and capped at the pick target.
  - Don't record a handover (`recordAskHandover`) on a resume. It was recorded when the ask was first opened.
- Screen 3 isn't resumable. Its key is already cleared, so a reload there returns to the list. That's correct, because the picks have landed.
- Nothing goes in the URL, `document.title` or any span. No span on resume (A24 stands: one `ask_completed` per confirm).
- Pure helpers go in `src/lib/askRun.js` (`heldAskWrite`, `heldAskRead(raw, liveAsks)` → `{askId, screen, ids} | null`), with tests: ids-only shape, a bad JSON value, an unknown ask, an off-shelf id, a duplicate, over-target, and an unknown `screen` value (treat it as `"turn"`).

**Known limit, accepted:** a home-screen app that is swiped away loses `sessionStorage`. Swiping the app away counts as leaving, so the ask is gone. Don't design around it.

---

## Build notes for Claude Code

- `AskRun` takes `ask.screenStyle` (already read by `askCreate.js`) and switches only these: the tile grid class, the tile name visibility (S3-2), and the ▶ / ✓ icon buttons (S3-3). Don't fork AskRun into two components, because two components drift into two experiences.
- The create sheet: add the style choice, the Simple 4-tile cap message, and the style in `createAskArgs`. Update its test (it asserts `"standard"`).
- Remove the "Not here yet: Simple style and A26's resume" comment in `AskRun.js`.
- New name surfaces: none expected. If any appear, they carry `.op-name`. The run screens stay `.op-replay-block`.

---

## Walk on dev (Amendment Verification, Slice 3)

1. **V3:** Create Ask Everett: **Simple**, 4 tiles (one with no photo and no glyph), pick 1, no noun. Try a 5th tile → "Simple shows 4 at most." Run it: the same three screens and wagon; ▶ on "Your turn"; 2×2 big tiles with no names except the plain tile; ✓ in place of That's it!. One pick → ✓ → one item lands. "Great picks" lists it with its name.
2. **V4:** On Simple and on Standard: hold Done mid-ask → nothing lands, the key is gone. A short tap only says "Hold to finish". No back chevron.
3. **V5:**
   - (a) Hold 2 picks on Ask Easton (Standard, pick 3), switch to another app, then return → same shelf, same 2 picks.
   - (b) Hold 2 picks, then **reload the page** (desktop, or Safari's reload on iPhone) → AskRun reopens on the shelf with the same 2.
   - (c) DevTools → Session Storage: `op_ask_held` holds `ask_id`, `screen` and ids only.
   - (d) Reload while on "Your turn" with 0 picks → reopens on "Your turn".
   - (e) Confirm → the key is gone; reload → the list.
4. **V12:** With reduced motion on, on Simple: no flight, hop, shake-motion or roll; every state just appears.
5. **Regression:** run Standard Ask Easton end to end (V2) once. It should be unchanged.
