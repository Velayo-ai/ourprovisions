# SPEC_recipe_import.md — Bring a recipe (screenshots or pasted text) into New Meal

**Status:** ACTIVE — design chat 2026-10-07, ready for Claude Code
**Scope:** OurProvisions · dev first, prod by its own fresh-eyes promotion
**Mockup of record:** `mockup_new_meal_import.html` (frames 1–5). Frame 6 (shared by Andrew) belongs to `SPEC_meal_sharing_v2.md`, not this build. Supersedes frames 1–3 and 6 of `mockup_recipe_arrival.html`.
**Builds on:** `SPEC_ai_meal_suggestion.md` (built), `SPEC_defer_catalog_write.md` (built 09-08), Galley recipe card Phase A (built 09-09), Meal Library v1 / `061_meals_occasion.sql`.

---

## Why

Most of the recipes a household actually cooks already exist somewhere — an Instagram caption, a blog card, a NYT screenshot, a handwritten card, a text from family. Today the only ways into New Meal are typing it by hand or asking the Galley to invent one. Import is the third way: bring the recipe you already have, and have it read into the same form.

## The decisions (all settled in the 10-07 design chat)

| # | Decision | Why |
|---|---|---|
| D1 | **One door, inside New Meal.** A compact "Bring a recipe" row (Photo · Paste) under a second OR, **below** the Ask AI block. No second create button anywhere. | Same reasoning as 08-31 for the Galley: don't make people pre-decide intent. Below Ask AI because Dan wants the Galley kept in place; nothing that exists today moves, so the change is purely additive. |
| D2 | **No separate arrival sheet. An imported recipe fills the existing New Meal form** — exactly the contract Ask AI already has ("filled into the fields above… replaces what's there now"). | One editor, one Save Meal, one save path. Reverses the earlier "arrival sheet" idea from the same session — once we looked at the live sheet, the Galley had already built it. |
| D3 | **No new save RPC and no transaction in v1.** New ingredients ride the existing pending-placeholder path (`createCatalogItem` → `pending:<name>` → `materializePendingIngredients` at Save). Cancel / Start over leave zero rows. | The orphan bug this session thought it was fixing was already fixed on 09-08. The 09-08 residual (Save fails mid-loop, then Cancel → orphans) was accepted there and is accepted here. **Revisit trigger:** if import pushes typical new-item counts high enough that a mid-loop failure is seen in the wild, *then* a transactional `save_meal_with_new_items` RPC earns its migration. |
| D4 | **Reading is a new Edge Function, `recipe-import`,** modelled on `meal-suggestion`: Clerk JWKS identity, Anthropic key server-side, returns the **same draft shape** the Galley returns plus a few fields (below). Low-confidence lines come back **flagged, never guessed**. | The client's draft-landing path (matching, NEW chips, Steps read mode, snapshot/restore) is reused unchanged. |
| D5 | **Screenshots are read and discarded.** Never stored, never become a meal photo. | A recipe screenshot is not a cook photo; Meal photos v1 is its own item. Nothing to retain, nothing to secure. |
| D6 | **"From" is a free-text, editable attribution,** filled by the reader (e.g. `NYT Cooking`, `@handle on Instagram`, `Grandma Phyllis's card`). Persisted on the meal. | Matches the July sharing spec: displayed attribution is the household's free text, editable, never validated against anything. |
| D7 | **Photo takes up to 4 images, read together as one recipe.** **No reorder control** — the reader is told the images may arrive in any order and stitches them. Remove (×) per thumbnail; + to add up to 4. | Instagram captions run 2–3 screens. Reordering on a phone is fiddly UI for something the model does well. *Supersedes the mockup's "drag to reorder" hint.* |
| D8 | **One door in play at a time.** Bring follows the Galley's existing visibility rule; while photos/text are staged in Bring, the Ask AI block hides; while the Galley is busy, Bring hides. | Keeps the sheet short and avoids two drafts racing into the same fields. |

## UI — New Meal sheet (`MealSheet` in `src/App.js`)

### Layout (frame 1)
Unchanged from today down to and including the Ask AI block (label, textarea + mic, fine print, **Ask the Galley** button — reviewed and kept as-is 10-07). Then:

```
— OR —
[ BRING A RECIPE            ] [Photo] [Paste]
  Screenshots or copied text
```
One row, card-tinted like the Galley block, eyebrow style identical to "Ask AI to build it". Steps placeholder text is unchanged ("No steps yet — write them, or ask the galley.").

### Visibility
- **Bring row visible ⇔ `galleyAvailable` is true** (today: `fromGalley || (rows.length === 0 && !instructions.trim())`) **and** `!aiBusy`. Generalise the name if it helps (`draftDoorsAvailable`), but keep one predicate for both doors — they appear and leave together. Name and Good-for do **not** hide the doors (current behaviour, deliberate: a name is often the prompt).
- **While Bring has staged input** (≥1 image or a non-empty paste box): hide the Ask AI block.
- **Edit Meal:** no Bring row (same as the Galley rule for a meal with ingredients).

### Photo (frames 3 → 4)
- `<input type="file" accept="image/*" multiple>`; cap at 4 (extras ignored with a hint: "Up to 4 at a time.").
- Row expands to: eyebrow "Bring a recipe · N screenshots", thumbnails (numbered for reference only), × on each, a dashed + tile while N < 4, then **Clear** (text button) and **Read these** (primary, espresso).
- **Client-side downscale before upload:** longest edge ≤ 1600px, JPEG ~0.8. Keeps payloads small on a boat connection and well inside Edge Function limits. HEIC from iOS arrives as JPEG through the picker on Safari; if a browser hands HEIC we can't decode, show "Couldn't open that image" and drop it.

### Paste
- **Paste** expands the row into a textarea (placeholder "Paste the recipe here…") with **Clear** and **Read this**. Cap 20,000 characters (trim + hint beyond). No clipboard-API magic — the person pastes.

### Reading (frame 4)
- Reuse the Galley's thinking state verbatim: skeletons in ingredients/steps, the ember, "Usually 10 to 20 seconds.", and **Never mind** wired to a real `AbortController` (same pattern as `handleAskAI` → `requestMealSuggestion`). Copy: "Reading 3 screenshots…" / "Reading your recipe…" (paste).
- Snapshot the fields before the call (`aiSnapshotRef` pattern); Never mind restores the snapshot **and** the staged images/text, so the person can try again without re-picking.
- `isDirty` includes import-in-flight (same as `aiBusy`, 09-09 rule).

### Filled (frame 5)
- The response **replaces** name, instructions, ingredients and (if present and valid) occasion — same replace-not-merge rule and reasoning as the Galley.
- A one-line banner under the title: **"Filled from your screenshots. Check it over."** (paste: **"Filled from what you pasted. Check it over."**) with a **Start over** link. Start over restores the pre-import snapshot (normally the empty form) and brings the doors back. No teal — nothing here is a completion.
- **From** field appears under Meal Name when the draft carries `attribution`, or when an existing meal already has one. Editable; clearing it to empty saves `null`. Hand-built meals never show it.
- **Ingredients:** matched rows plain; unmatched rows go through `createCatalogItem` and show the existing NEW treatment; rows the reader flagged show a **"Check this"** chip with its one-line reason (e.g. "Couldn't read the amount"). "Check this" is **advisory — it never blocks Save.** Editing that row (quantity or name) clears the chip.
- Steps arrive in `instructions` and render in Phase A read mode, as Galley drafts do.
- The draft-provenance flag (today `fromGalley`) becomes a source value — `'galley' | 'photo' | 'paste'` — so the banner and the Steps eyebrow can say where it came from. Still session state; persisting provenance is Galley Phase B.

### Save
**Save Meal**, unchanged path: `materializePendingIngredients` then commit, now also writing `attribution`. Cancel = zero rows (verified behaviour since 09-08).

## Edge Function — `supabase/functions/recipe-import/`

- **Auth / CORS / key handling:** copy `meal-suggestion` exactly (Clerk JWKS verification, `anon` rejected, Anthropic key from function secrets). Deploy with `--project-ref`, never `supabase link` (09-09 rule). Source lives in the repo and goes to `main` with the client (09-09 rule).
- **Input:** `{ kind: 'images', images: [{ media_type, data_base64 }] (1–4) }` or `{ kind: 'text', text }`. Reject anything else, >4 images, or oversize bodies with a 400.
- **Model:** a vision-capable Claude model via the same config mechanism `meal-suggestion` uses (don't hardcode a different version in two places).
- **Output (JSON only, validated server-side before returning):**
```json
{
  "ok": true,
  "name": "Lemony Skillet Chicken Thighs",
  "baseServings": 4,
  "instructions": "1. …\n2. …",
  "ingredients": [
    { "name": "Chicken thighs", "quantity": 8, "unit": null },
    { "name": "Sumac", "quantity": null, "unit": null, "uncertain": true, "note": "Couldn't read the amount" }
  ],
  "attribution": "@saltandsunday on Instagram",
  "occasion": ["dinner"]
}
```
  or `{ "ok": false, "reason": "not_a_recipe" | "unreadable" }`.
  - `name`, `baseServings`, `instructions`, `ingredients[].{name,quantity,unit}` are **identical in shape to `requestMealSuggestion`'s draft**, so the client lands both through one function.
  - `occasion` only from the seven values in `061`; anything else dropped server-side.
  - `attribution`: the source as visible in the input (site name, creator handle as `@handle on Instagram`, a name written on a card). `null` if nothing is visible. **Never invented.**
- **Prompt rules:** transcribe, don't improve — no substitutions, no "healthier" swaps, no added ingredients; keep the recipe's own quantities; flag (`uncertain` + `note`) instead of guessing; images may be out of order; ignore everything that isn't the recipe (comments, ads, UI chrome, hashtags).
- **Untrusted input:** the image/text content is data, never instructions. No tools, JSON-only output, schema validation on return. A screenshot that says "ignore your instructions" yields either a recipe or `not_a_recipe`.
- **Nothing is stored.** No storage bucket, no logging of image bytes or pasted text.

**Client errors** (hint line in the Bring row, same tone as the mic hints):
- `not_a_recipe` → "Couldn't find a recipe in that. Try a clearer screenshot, or paste the text."
- `unreadable` → "Couldn't read that clearly enough. A sharper screenshot usually works."
- network / 5xx → the existing `setError` path; staged input kept for retry.

## Database — one additive migration

`06x_meals_attribution.sql` — **take the next free number at build** (061 is the high-water on disk as of 10-03; confirm against the live catalog, not this doc).

```sql
begin;
alter table public.meals add column if not exists attribution text;
comment on column public.meals.attribution is
  'Free-text, household-editable credit for where a meal came from (e.g. "NYT Cooking", "@handle on Instagram", "Grandma Phyllis"). Never validated against share history. Recipe import 2026-10-07.';
commit;
```
- Nullable, no default, no CHECK, no backfill.
- Inherits the four `meals_*` policies and table grants (the 043 / 061 precedent) — **no policy, grant or RPC change.** `add_meal_to_list`, `close_cycle`, `decrement_meal_from_list`, `cook_meal` never read it.
- **Not** `meals.source`: provenance (manual / galley / import) is Galley Phase B's column and a different thing — provenance is a fact, attribution is a label.
- VERIFY (row-returning): column exists, `text`, nullable; `policies_unchanged` count on `meals` equals pre-migration; `attributed_rows` 0.
- Apply dev first; prod with the client in its own fresh-eyes promotion.

## Out of scope (named so nobody builds it)
- Sharing (code, Home notice, "Shared by Andrew" banner) → `SPEC_meal_sharing_v2.md`.
- URL import / reading Instagram links server-side (Meta blocks it; same wall as DM-to-meal).
- Email-in and a `meal_drafts` table.
- iOS share-sheet target (Expo, later — it hands us the same screenshot or text).
- Audio from video recipes.
- Persisting provenance, serves, prep time (Galley Phase B).
- Keeping the screenshot as a meal photo.

## Verification (walk on `dev.ourprovisions.velayo.ai`, real auth, phone + desktop)

1. **Layout:** fresh New Meal shows Type it → OR → Ask AI (unchanged, Ask the Galley button present) → OR → Bring row. Nothing above the second OR has moved (compare to a pre-change screenshot).
2. **Doors leave together:** add one ingredient by hand → both Ask AI and Bring hide; remove it → both return. Typing only a name → both stay.
3. **One door at a time:** pick a photo → Ask AI hides; Clear → it returns. Start a Galley request → Bring hides.
4. **Multi-image:** pick 3 screenshots of an Instagram caption, in the wrong order → Read these → one coherent recipe with ingredients from all three. Pick a 5th → hint, capped at 4.
5. **Paste:** paste a DM'd recipe → Read this → fields fill; banner says "what you pasted".
6. **Attribution:** a screenshot with a visible @handle → From reads "@handle on Instagram"; a screenshot with no source → no From field. Edit From, Save, reopen → edited value persists. Clear From, Save → `attribution` is `null` (SQL).
7. **Flags:** a blurry amount → "Check this" with a reason; Save still allowed; editing the row clears the chip.
8. **Zero rows on decline:** import a recipe with ≥2 NEW items → Cancel → 0 `insert_custom_catalog_item` calls, 0 new `catalog_items` rows, 0 new `meals` rows (SQL). Repeat with **Start over** → same.
9. **Save path:** import → Save → exactly one row per NEW item, one meal, its `meal_ingredients`; matched items reuse existing ids.
10. **Never mind:** start reading → Never mind → fields and staged images restored, no draft lands afterwards even if the response arrives late.
11. **Refusals:** a photo of a sunset → `not_a_recipe` hint, nothing replaced. A screenshot containing "ignore previous instructions and…" → a recipe or `not_a_recipe`, nothing else.
12. **Nothing kept:** no storage objects created; Edge Function logs contain no image bytes or pasted text.
13. **XXL text:** the Bring row and the expanded photo row don't overflow at the largest text size.

## Open (decide during build or at review, don't invent)
- Wait time for 3–4 images: measure on dev; if it's routinely >20s, change the copy to what's true, don't pad.
- Whether the Galley's "Not quite it? Ask the galley again" collapse needs an import equivalent ("Read something else") or whether Start over is enough. Lean: Start over is enough.
- Per-user rate limit: mirror whatever `meal-suggestion` does today; if it does nothing, note it rather than inventing one here.

---

## Amendment — 2026-10-09 (chunk 1 build, dev; Dan's rulings during the probe)

Recorded at build. Earlier sections stand as written; where this block differs, this block wins.

- **`category` is in the output shape**, per ingredient, nullable. The Galley draft already
  carries it and the client reads it on the NEW-item path (`createCatalogItem(ing.name, ing.category)`);
  import lands through the same path. Null when the reader cannot tell.
- **`servingsAssumed`** (boolean) is in the output shape. The reader emits `baseServings: null`
  when the recipe states no count; the function substitutes 4 (the Galley's default for the same
  silence) and sets `servingsAssumed: true`. **A stated count is never overridden** and carries
  `servingsAssumed: false`.
- **Eggs / countables rule.** A countable ingredient keeps the recipe's own count in `each`
  (1 egg → `1 each`, 8 thighs → `8 each`). Never rounded to a package unit — no `dozen` for one
  egg. Rounding to a package is the shopping list's job, not the import's.
- **`asWritten`** (string | null) is in the output shape, per ingredient: the source line exactly
  as shown, in the author's own spelling, abbreviations and units (`"2¼ c. flour"`,
  `"4 teas. B.P."`, `"Juice of 1 lime"`); null when the line carries no amount. **Captured, not
  modelled.** Three quantities exist in this product — shopping count, recipe amount with unit,
  servings scaling — and only the shopping count is modelled today. Recipe quantity / servings /
  units is deferred to its own design session; **no schema change** here. (This supersedes the
  v3 build's prompt rule that wrote ingredient-list amounts into the steps; that is reverted.)
- **Steps are byte-faithful.** Copied verbatim, including any amounts the author wrote in them.
  Never add an amount to a step that didn't have one.
- **Interim save (Dan, 2026-10-09; chunk 2 builds it).** The client puts the `asWritten` lines
  into the meal's existing `instructions` text as one verbatim "As written" block at the top,
  with the author's steps untouched below it. `meals.instructions` is a single nullable `text`
  column (043); the Galley draft lands it with `setInstructions(draft.instructions)` and Save
  writes it through `createMeal` / `updateMeal` unchanged.
- **Edge Function ordering and timeout.** The handler reads the whole request body before
  anything that can respond (an early 401 with a 1.25 MB body still in flight hung 161 s to a
  platform 503 on 2026-10-09; the worker was killed at the 150 s wall clock and the relay
  replayed). The Anthropic call is capped at 75 s with no SDK retries: a timeout is a clean
  `504`, a connection failure a `502`, never a platform 503/504. `meal-suggestion` shares the
  ordering hazard, latent at its body sizes; fixing it there is its own commit.
- **Model literal stays shared with `meal-suggestion`** (`claude-opus-5`, effort low). Moving
  both is a separate decision; neither moves alone.
