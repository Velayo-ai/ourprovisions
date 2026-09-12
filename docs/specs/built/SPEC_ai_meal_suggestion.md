# SPEC — AI Meal Suggestion (voice-first, one modal)

**Scope:** OurProvisions
**Status:** Ready for BUILD
**Session origin:** 2026-08-31 design chat
**Depends on:** `meals.instructions` (migration `043`, live on dev + prod),
existing `createMeal`/`updateMeal` (`useProvisions.js`), existing
`createCatalogItem` (fuzzy-match-or-insert against household catalog).

---

## Why this exists

The AI meal-suggestion feature has been designed-but-unbuilt since 2026-08-19
(system prompt drafted, no code). This spec resolves the open UI question —
one button or two? — and locks a direction: **there is no second button.**
The existing "New Meal" modal (`mockup_create_meal.html` / built per
`SPEC_create_meal_ui.md`) becomes the single entry point for both manual and
AI-assisted meal creation, with voice as the primary path in.

**Founding principle for this build (Dan, 2026-08-31): "AI with minimal
human touch is always most desirable."** Voice is the default, hero
interaction — not a secondary affordance next to a text field. Text remains
visible everywhere in the flow, but as the **review surface**, not the
primary input: it's how a mishear or a bad ingredient match gets caught
before it reaches the shared list, not a fallback for when voice fails.

**Not in this spec, on purpose:**
- **Multiple meals from one request** ("give me three dinner ideas," "plan my week") — explicitly out of scope. **The system prompt must guardrail against this**: even a plural-sounding request gets exactly one best-fit meal back, never a list. This is a deliberate sequencing decision (Dan, 2026-08-31): prove the voice→draft→save loop works end to end for one meal before building anything that reviews or batch-saves several. True multi-meal planning belongs with the Home-tab/PLAN concierge ambitions already on the roadmap, not smuggled into this build as a UI variant. **Revisit trigger:** once this ships and the single-meal loop is solid, multi-meal becomes an evaluate-next item — worth a design session of its own, not a retrofit onto this modal.
- **Ingredient fuzzy-matching against the AI's suggested ingredient list** —
  this spec reuses `createCatalogItem`'s existing exact-normalized-match
  resolver as-is. A smarter matcher (typo tolerance, singular/plural,
  synonym handling e.g. "scallion" → "green onion") is future work if the
  exact-match resolver proves too strict in practice. Ship the reuse first;
  tune only if real suggestions miss real catalog items.
- **Multi-turn refinement** ("make it vegetarian," "swap the rice for
  quinoa" as a follow-up after the first draft) — v1 is single-shot: one
  request in, one draft out, edit-in-place from there like any other meal.
- **Voice on native (Expo/iOS)** — out of scope; Phase 5 per roadmap. This
  spec is web/browser Speech API only.

---

## Decisions locked

| Decision | Choice | Rationale |
|---|---|---|
| Entry point | **One modal, not two buttons.** The existing "New Meal" sheet gains a mic-first affordance; there is no separate "Ask for a meal" button beside "Create meal." | Two buttons would force the person to pre-decide their intent before starting. One modal that adapts to how they start it is simpler and matches "minimal human touch." |
| Layout | **The full manual form (Meal Name, Ingredients) stays exactly where it is, top of modal, always visible. The mic + request-text box sits as a new section below Ingredients, not as a separate entry screen.** (Dan, 2026-08-31) | Keeps the existing, proven `SPEC_create_meal_ui.md` layout untouched — no mode-switch, no toggle, no reflow of fields the person already knows. AI becomes an assist attached to the bottom of the familiar form, not a fork in the flow. **Noted tradeoff:** this means the mic isn't the first thing seen on open — a person must scroll past the manual fields to reach it. Accepted as the simpler build and the more familiar surface; revisit if usage data shows people aren't finding the AI entry point. |
| Primary input | **Mic button + visible request-text field**, positioned below Ingredients per Layout above. Tapping mic starts Web Speech API transcription into that field. | Voice-first per Dan's stated vision, within the layout constraint above. Typing remains fully available in the same field — someone can type a request there instead of speaking, same downstream path. |
| What voice produces | Transcribed speech lands as **plain text in a visible field** (not sent silently to the API). Person can review/edit the transcript before submitting, or just let it fly. | This is the review-before-commit principle applied one step earlier than usual — catching a mishear before it becomes an API call, not just before it becomes a saved meal. Cheap insurance: an API round-trip is slower and costs money to redo if the transcript was garbage. |
| Draft delivery | **AI-drafted output populates the exact same fields the manual path uses:** Meal Name, an Instructions block (new — `meals.instructions` is live), and the staged-ingredients list with the same quantity steppers and remove controls as today. **Same "Save Meal" button, same `createMeal` call.** | Zero new review UI. The existing modal's Screens 2/2b/2c/3 (`SPEC_create_meal_ui.md`) already are the review-before-commit surface; AI just pre-fills them instead of the person typing/searching by hand. |
| Ingredient matching | Reuse `createCatalogItem` exactly as it's called from the manual no-results panel today: normalized-name match against the household catalog; no match → creates a new custom item via `insert_custom_catalog_item`. Every AI-suggested ingredient runs through this, matched or not. | Reuse, not a parallel matching system. Keeps "a meal ingredient is a catalog item" true regardless of how the ingredient got proposed. |
| Speech-to-text engine | Browser-native Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`), no third-party service, no backend transcription call. | Free, no new infra, no added latency before the Claude API call. Tradeoff accepted below. |
| Multiple-meals requests | **Guardrailed to always return exactly one meal**, regardless of how the request is phrased. A request like "give me three dinner ideas" still gets one best-fit draft back. | Sequencing decision, not a capability limit stated as permanent. Ship and prove the single-meal voice→draft→save loop first; multi-meal review/batch-save is real added complexity (new nav or card-stack UI, per-draft ingredient matching) that deserves its own design pass once there's confidence in the core loop — see "Not in this spec" above. |
| Claude API call origin | **Supabase Edge Function proxy — not client-direct.** (Dan, 2026-08-31, confirmed per design-chat recommendation.) | An Anthropic API key embedded in browser JS is readable by anyone who opens devtools — a real credential-exposure risk, not a style preference. The Edge Function holds the key server-side; the client sends only the request text and household context, and receives back the structured draft. This is new infra this spec now formally scopes in, not a placeholder. |
| Fallback when voice is unsupported | Mic button hidden or disabled (feature-detect `window.SpeechRecognition`); Meal Name field remains the way in, typed text goes to the AI as the request — **same downstream flow**, just no live transcription. | Safari/iOS Web Speech support is genuinely uneven. Rather than a broken mic that silently fails, detect and degrade to a fully-functional typed flow. This is not "text mode" as a separate feature — it's the same modal, same fields, same API call; only the transcription step is skipped. |
| Which field triggers the AI call | **Explicit trigger, not inference.** A single primary action — "Ask AI" / sparkle-styled equivalent to the mic — sends whatever text is currently in the request field (voice-transcribed or typed) to the Claude API. The existing "Save Meal" button is untouched and still means "save exactly what's in these fields right now." | Keeps the proven manual path completely unchanged (per your "keep proven paths untouched" principle) — literal text in Meal Name + hand-picked ingredients + Save Meal still works exactly as it does today, with zero new behavior injected into that path. |

---

## Flow (build from existing modal — one new section, no new screen)

### The modal, top to bottom
1. **Meal Name** field — unchanged, exactly as today.
2. **Ingredients** — search box + staged-ingredients list — unchanged,
   exactly as today (Screens 2/2b/2c/3 of `SPEC_create_meal_ui.md`).
3. **New section, below Ingredients:** mic button + a visible request-text
   field (placeholder: "Or tell me what you're in the mood for…"). Tapping
   the mic starts live transcription into that field; tapping again stops
   it. Typing directly into the field works identically — same downstream
   path, voice is optional, not required. A small **"Ask AI"** button sits
   with this section, enabled once there's text in the field.

### Ask AI → loading
Tapping **Ask AI** sends the request-field text (plus household/catalog
context) to the Supabase Edge Function proxy, which calls the Claude API
with the drafted system prompt. The section shows a loading state while
waiting — reuse whatever spinner/skeleton pattern exists elsewhere in the
app; don't invent a new one. **The Meal Name and Ingredients fields above
are untouched during this wait** — someone could in principle still be
typing into them, though in practice this will read as "wait for it."

### Draft return — same fields, now filled in
The Edge Function's response populates the fields already on screen, not a
new screen:
- **Meal Name** — filled in, still editable, same field as always.
- **Instructions** — new field, multi-line text, editable, appears once
  populated. Manual-create path still has no Instructions requirement —
  don't force an empty one into every meal; this field only renders when
  there's content (from AI, or later if someone types instructions by hand
  on a manual meal).
- **Ingredients** — each suggested ingredient run through
  `createCatalogItem`'s existing resolution: matched items appear staged
  exactly like a manual catalog search result; unmatched items are created
  via `insert_custom_catalog_item` and staged the same way. Person can
  remove, adjust quantity, or add more via the existing catalog search —
  **all existing Screen 2/2b/2c behavior, untouched.** These land in the
  *same* Ingredients section from step 2 above — there is no separate
  AI-ingredients list.

### Save
Same **"Save Meal"** button, same `createMeal({name, baseServings,
instructions, ingredients})` call, regardless of whether the fields were
filled by hand or by AI.

---

## Backend changes

### `useProvisions.js` — extend `createMeal`, no new function

`createMeal` currently writes `meals` + `meal_ingredients`. Add
`instructions` as an optional field in the write:

```js
const createMeal = useCallback(async ({ name, baseServings = 1, instructions = null, ingredients = [] }) => {
  // ...existing validation...
  const { data: meal, error: mErr } = await db
    .from("meals")
    .insert({ name: trimmed, base_servings: baseServings, instructions, household_id: hh.id, created_by: internalUserIdRef.current })
    .select()
    .single();
  // ...rest unchanged...
}, [...]);
```

`updateMeal` gets the same treatment (edit mode should also be able to
carry/edit instructions, even outside the AI flow — a manually-created meal
can still get instructions typed in later).

### New: Supabase Edge Function — `meal-suggestion` (name TBD by Cody)

Holds the Anthropic API key server-side. Accepts the person's request text
plus household/catalog context (or fetches catalog context itself via
service-role access — Cody's call on which is cleaner), calls the Claude
API with the already-drafted system prompt (recover from prior session
notes / airlock if not already in the repo — flagged as Open Question below),
and returns structured JSON: `{name, baseServings, instructions,
ingredients: [{name, quantity, unit}]}` — **a single object, never an array.**
The system prompt must explicitly instruct the model to return exactly one
meal even when the request implies several (see Decisions table,
"Multiple-meals requests"). This is a prompt-level guardrail, not something
enforced by the response schema alone — a model that returns an array
despite the instruction should fail loudly (parse error surfaced via
`setError`), not silently take the first element and hide the mismatch.

This is new infra — the project's first Edge Function, as far as these
docs show. Worth a deliberate build step (dev-deployed, tested standalone
with `curl`/Postman before the client wires up to it), not folded silently
into the client-side commit.

### New: `useProvisions.js` — `requestMealSuggestion(promptText)`

Thin client wrapper that calls the Edge Function (via `supabase.functions.invoke`
or a plain `fetch` to its URL — Cody's call), returns the parsed draft or
surfaces an error via the existing `setError` pattern used elsewhere in the
hook.

**Still open, needs a call before build:**
- Rate limiting / cost control — nothing today stops a person from spamming
  "Ask AI." Even a simple client-side debounce/disable-while-loading is
  necessary; a per-household daily cap may be worth considering given this
  is billed API usage. Decide before or shortly after first ship — not
  blocking, but shouldn't be forgotten.

### `insert_custom_catalog_item` — no changes
Reused as-is via the existing `createCatalogItem` client function. No new
RPC, no schema change beyond `instructions` (already shipped).

---

## Open questions — must resolve before build starts

1. **Where's the drafted system prompt?** Referenced in ROADMAP/session
   notes as already written — confirm it's actually in the repo or airlock,
   not just described in a past chat, before Cody goes looking for it.
2. **Exact visual treatment of the new bottom section** — spacing/divider
   between Ingredients and the mic/request box, mic button styling, whether
   "Ask AI" is a pill matching existing button conventions or something new.
   Worth a quick mockup pass (same discipline as `mockup_create_meal.html`)
   before Cody builds, per your standing "mockup before code" principle —
   this spec locks the mechanism and placement, not the pixels.
3. **Edge Function auth/context-fetch shape** — does the client pass
   household catalog context in the request payload, or does the Edge
   Function fetch it itself via service-role Supabase access using the
   caller's household_id? Affects payload size and how much household data
   crosses the client→function boundary. Cody's call, flagging so it's a
   conscious choice, not an accident.

---

## Verification (deployed dev preview, not localhost)

1. **Voice path:** on a Speech-API-supporting browser, tap mic, speak a
   request, confirm transcript appears editable, tap Ask AI, confirm a
   structured draft populates all three new-content areas (name,
   instructions, ingredients).
2. **Typed path (same modal, no voice):** type a request instead of
   speaking, confirm identical downstream behavior.
3. **Manual path, unchanged:** confirm typing a literal meal name and
   hand-picking ingredients via catalog search, with **no AI trigger
   tapped**, still saves exactly as `SPEC_create_meal_ui.md` describes —
   zero regression.
4. **Ingredient matching:** request a meal naming an ingredient that exists
   in the household catalog (confirm it's staged as a match, not a
   duplicate) and one that doesn't (confirm a new custom item is created via
   `insert_custom_catalog_item`, not silently dropped).
5. **Unsupported-voice fallback:** on a browser/device without Web Speech
   support (or with it force-disabled via devtools), confirm the mic is
   hidden/disabled and the typed path still works end-to-end.
6. **Multi-meal guardrail:** request something explicitly plural — "give me
   three dinner ideas for this week" — and confirm the response is still
   exactly one meal, not a list, not the first of several silently dropped.
   If this fails, it's a prompt problem, not a UI problem — fix the system
   prompt before touching any client code.
7. **Console clean** — no errors from the new API call path, the
   `instructions` field write, or the mic integration.

**Done when:** all seven pass on the deployed dev preview, under real Clerk
auth, against real data — not the fixture.
