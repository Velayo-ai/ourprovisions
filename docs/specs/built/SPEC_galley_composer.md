# SPEC_galley_composer.md — One Galley card: New Meal by hand, or with the Galley

**Status:** ACTIVE — design chat 2026-10-12, ready for Claude Code
**Scope:** OurProvisions · client only · dev first, then **one** prod promotion together with recipe import
**Supersedes:** `SPEC_recipe_import.md` D1 (the separate "Bring a recipe" row under a second OR). Everything else in that spec and its 10-09 amendment stands: the function, the landing, From, Check this, As written, the save path and the error copy.
**Mockup of record:** the "New Meal — merged Galley" canvas (design chat 2026-10-12). Frames 1–4 are this build; frame 5 (Adapt) is chunk 3 and is **not** built here. The frames are described below, so this spec stands on its own.

---

## Why

Dan walked chunk 2 on dev on 10-11, and on 10-12 he came back to it fresh. The feature is right, but the way it's delivered is wrong. Three stacked choices (type it / Ask AI / Bring a recipe) make people pick a pipeline before they've said what they want. Both AI doors do the same job: **give the Galley context and let it build the meal.** Only the kind of context differs.

**The principle:** there are two ways to build a meal. **By hand** (the form, like Browse) or **with the Galley** (one conversation-style card). There is no third door.

The Galley can then infer how to work from what it is given:

| You give it | The Galley | Contract | Button |
|---|---|---|---|
| Words only | **Invents** | Creative (`meal-suggestion`) | **Create a meal** |
| Photos | **Reads** | Faithful: copy, don't improve (`recipe-import`) | **Read these** |
| Pasted recipe-shaped text | **Reads** | Faithful (`recipe-import`) | **Read this recipe** |
| Recipe + words *(chunk 3, not now)* | **Adapts** | Faithful read, then a declared change | **Adapt this recipe** |

No mode picker. The inputs are the instruction, and the button label confirms the mode before anyone taps.

## Decisions

| # | Decision | Why |
|---|---|---|
| G1 | **One card, "Ask the Galley", under ONE OR** below the hand-built form. The "Ask AI to build it" block and the "Bring a recipe" row are both removed. | Two ways, not three. One OR instead of two declutters the sheet. |
| G2 | **The heading is "Ask the Galley". The word "AI" leaves the UI.** Name the helper, not the technology. | Warmer, and it fits the boat. Fluency comes from doing, not from the label. |
| G3 | **The button label is verb + outcome and follows the mode:** Create a meal / Read these / Read this recipe. Never "Submit", and never the same words as the heading. | The button tells you what's about to happen. That is how the Galley teaches. |
| G4 | **A one-line echo above the button** says what will happen. Invent: "The Galley will create a new meal for you." Photos: "Read as written — nothing changed. Up to 4, in any order." Paste: "Looks like a recipe — it'll be copied as written." | It keeps the two contracts visible. People can see the Galley understood before it acts. |
| G5 | **Photo lives inside the composer**, next to the mic. Staged photos show inside the card as the numbered thumbnails we have today (×, + tile, cap 4, "Up to 4 at a time."). There is **no Paste button**: people paste into the text box. | One composer. Paste is something people already know how to do. |
| G6 | **Paste detection, client side.** Text in the box is treated as a recipe when it has **≥ 3 non-empty lines OR ≥ 280 characters**; otherwise it's a craving. A **"Want ideas instead?"** link under the echo flips that text to Invent, and once flipped it stays Invent until the text is cleared. | Short text defaults to the Galley and long or structured text to Read. The one-tap override covers the misses. Thresholds are tunable constants in one module with jest cases; report them if walk evidence argues otherwise. |
| G7 | **While photos are staged, the text box is hidden** in chunk 2, and photo + words is not a mode yet. Clear restores it. | A note we ignore would be dishonest. Chunk 3 brings the box back as Adapt's instruction. |
| G8 | **Starter chips appear only on the empty card:** "Something cozy with chicken" and "Quick weeknight dinner" fill the box; "Read a recipe card" opens the photo picker. They hide as soon as the box has text or a photo is staged. | They teach the range of asks without a tutorial. "Use what's on hand" is held back until the Galley gets pantry context. |
| G9 | **One honest touchpoint:** a quiet "About the Galley" text link on the card opens a short sheet or inline line: *"The Galley is OurProvisions' AI cook. It drafts, you decide."* There is no other "AI" wording. | Hide the jargon, never the fact. *(Dan to confirm at the walk; cut the link if it feels like clutter, but keep the disclosure somewhere findable.)* |
| G10 | **The rest is unchanged:** the thinking card + Never mind, the one shared landing, the banner and Start over, the "N things to check" count, the error copy table (`importErrors.js`), the doors-leave-together rule (now one door: the card hides when an ingredient is added by hand and returns when it's removed), and the fine print "You'll get one meal, filled into the fields above to check before you save." | The work walked on 10-11 carries over. |

## Frames (canvas, 2026-10-12)

1. **Whole sheet, empty:** New Meal → Meal name → Good for → Ingredients search → Steps empty chip ("No steps yet — write them, or ask the Galley.") → OR → the Ask the Galley card (heading, sub-line "Tell it what you're in the mood for, or bring a recipe you already have.", text box with placeholder "Something cozy with chicken… or paste a recipe", Photo pill + dark mic inside the box, "Try one:" starter chips, disabled **Create a meal**, fine print) → Cancel / Save Meal.
2. **Words typed:** chips gone; echo "The Galley will create a new meal for you."; **Create a meal** enabled.
3. **Photos staged:** thumbnails inside the box; Clear; echo "Read as written — nothing changed. Up to 4, in any order."; **Read these**. *(The mockup shows an optional note field; G7 overrides it: hide the box in chunk 2.)*
4. **Recipe pasted:** long text in the box; echo "Looks like a recipe — it'll be copied as written." + **Want ideas instead?**; **Read this recipe**.
5. *(Chunk 3, not built)* Photo + "Make it gluten-free so everyone can have it" → **Adapt this recipe**, "Saved as a new meal — the original stays untouched."

## Build notes for Cody

- **Report before changing anything:**
  - The current New Meal markup for the Ask AI block and the Bring row.
  - Where the door predicate (`galleyAvailable`) lives.
  - **Every user-facing string in `src/` containing "AI"**, with what each becomes.
- **Pure modules with jest:**
  - `galleyMode(text, photoCount, override)` returns `invent | readPhotos | readPaste` (and later `adapt`).
  - The recipe-shape test in G6, with cases for short cravings, long cravings, a 3-line ingredient list, an IG caption, 280 characters exactly and an empty box.
- **Routing:** `invent` → `requestMealSuggestion`; `readPhotos` / `readPaste` → `requestRecipeImport`. There's no change to either function or its request shape.
- **Allow-list:** report the delta by name. Expect the six `.op-bring-*` and `.op-start-over` entries to be renamed or retired and the new controls added (photo, starter chips, mode switch link, primary button, About). Fixed copy only: the textarea contents, recipe text, From and ingredient names are never allow-listed.
- **RUM:** if the primary button's event carries a mode, it is the fixed enum value (`invent` / `read_photos` / `read_paste`), never text. This is the "Galley vs by hand, and mode mix" measure for the investor story.
- **Commits:** one per logical slice (composer layout; mode + detection; starter chips; About; AI-string sweep), each with harness 320/375/390 at Default and XXL, ESLint `--max-warnings=0`, `CI=true` build, LF endings, range quoted before push, and bundle markers absent before / present after.

## Verification (walk on dev, phone + desktop)

1. **Layout:** one OR, one card; no "Ask AI" and no "Bring a recipe" anywhere; nothing above the OR moved.
2. **One door:** add an ingredient by hand → the card hides; remove it → it returns. Typing only a name → the card stays.
3. **Invent:** type a craving → echo + **Create a meal** → a draft lands as "From the galley", the same as today.
4. **Read photos:** stage 2–4 out of order → the text box hides, the echo shows, **Read these** → lands as "From your photos"; Clear restores the box and the chips.
5. **Read paste:** paste the shrimp & grits recipe → **Read this recipe** → lands as "From what you pasted", with From filled.
6. **Override:** paste a recipe → **Want ideas instead?** → the button becomes **Create a meal** and it goes to the Galley.
7. **Short paste:** paste "chicken tacos with lime" → treated as Invent.
8. **Starter chips:** each fills or opens as designed; all hide once there's input.
9. **Never mind, offline copy, the banner count, Cancel / Start over writing nothing (SQL counts unchanged):** all still pass. Spot-check one of each.
10. **About the Galley:** opens, reads honestly, closes; it's the only place the word "AI" appears.
11. **XXL at 320:** the card, the chips, four thumbnails and the button fit with no overflow and nothing breaking mid-word.

## Then

One prod promotion, in this order: `CLERK_ISSUER` on prod → 062 with VERIFY → `recipe-import` deployed → client by tree identity (recipe import + this composer + the four PRE-EXISTING fixes), preceded by the two preamble probes on prod.
