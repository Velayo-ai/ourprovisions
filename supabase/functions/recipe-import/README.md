# `recipe-import` — read a recipe out of screenshots or pasted text

The project's second Edge Function, a near-copy of [`meal-suggestion`](../meal-suggestion/README.md).
Spec: [`docs/specs/active/SPEC_recipe_import.md`](../../../docs/specs/active/SPEC_recipe_import.md).

| | |
|---|---|
| **Contract** | `POST` → `{ kind: "images", images: [{ media_type, data_base64 }] }` (1–4) **or** `{ kind: "text", text }` (≤ 20,000 chars) |
| **Returns** | `{ ok: true, name, baseServings, servingsAssumed, instructions, ingredients: [{ name, asWritten, quantity, unit, category?, uncertain?, note? }], attribution, occasion }` — the Galley's draft shape plus three fields — **or** `{ ok: false, reason: "not_a_recipe" \| "unreadable" }` |
| **Model** | `claude-opus-5`, effort `low` — **the same literal as `meal-suggestion`**; change both or neither |
| **Tools** | Two `strict` tools: `emit_recipe`, `decline`. `disable_parallel_tool_use`, so exactly one call. |
| **Steps** | **The function numbers them** (`steps.ts`, pure; `node --test steps_test.mjs`). The model emits one step per line, unnumbered; any marker it writes anyway is stripped, a lowercase-led line joins the step above, and the result is `1. … 2. …` with no gaps. Guarantee behind the client's preamble rule. |
| **State** | None. No service-role key, no database reads, **no storage**. Screenshots are read and discarded (spec D5). |
| **Auth** | `verifyCaller` copied verbatim from `meal-suggestion` — Clerk RS256 verified in-function against Clerk's JWKS. `verify_jwt = false` in `config.toml` for the same reason. |
| **Rate limit** | **None**, mirroring `meal-suggestion` (which has none). Size caps only: 4 images, ~5 MB each, 20k chars of text, 6000 output tokens. |
| **Timeout** | Anthropic call capped at 75 s, no SDK retries → clean `504` (`APIConnectionTimeoutError`). The platform wall clock is 150 s (free) and the gateway idle timeout 150 s; a function still waiting there dies as a bare 503/504. |

## Read the body before you answer (2026-10-09)

Version 1 verified the JWT before reading the body and returned 401 in 165 ms — the client
got a **503 after 160 s**. A response sent while a large request body (1.25 MB here) is
still in flight never leaves the relay; the worker sat until the 150 s wall clock killed
it, the relay replayed the request to a fresh worker, same result, and the client saw a
platform 503. Reproduced with a garbage token: 200-byte body → 401 in 0.5 s; same request
with a 1.25 MB body → hang. The handler now drains `req.arrayBuffer()` first, then
verifies, then parses. `meal-suggestion` has the same ordering and the same latent hang;
its bodies are a few KB so it has never shown.

## What is logged, and what is not

Only: the caller's `sub`, `kind`, image count and base64 size (or text length), ingredient
count, flagged count, whether attribution was found, token usage and wall-clock. **Never
image bytes, never pasted text, never the draft itself** — the draft transcribes the input.
A validation failure logs its reason only.

## Shape decisions

**Flag, never guess** (spec D4). A row whose amount could not be read comes back with
`quantity: null`, `uncertain: true` and a one-line `note`. The validator *forces* the flag
on any null-quantity row the model forgot to flag, and defaults a missing `note`. A clean
row carries neither key — the client's "Check this" chip keys off `uncertain`.

**`baseServings` null → 4, with `servingsAssumed: true`.** The model emits `null` when the
recipe states no serving count (it is told not to estimate). The form needs a number; 4 is
the Galley's default for the same silence, and the flag lets the client say "assumed"
rather than present it as the recipe's own. A stated count carries `servingsAssumed: false`.

**`asWritten` — captured, not modelled** (ruling 2026-10-09, supersedes v3's step
injection). Three quantities exist in this product: the shopping count, the recipe amount
with its unit, and servings scaling. Only the shopping count is modelled today; recipe
quantity / servings / units is its own future design session, and nothing here changes the
schema. So each row carries the source line verbatim — `"2¼ c. flour"`, `"4 teas. B.P."`,
`"Juice of 1 lime"` — or `null` when the line has no amount. Steps are copied byte-faithful
and **never** gain an amount the author did not write. Chunk 2's interim save puts the
`asWritten` lines into `meals.instructions` as one "As written" block above the untouched
steps.

**Fidelity in `asWritten` (v5).** Glyphs stay glyphs (`¾`, never `3/4`), abbreviations stay ("til cmy", "1 c. firm b. sugar"), and a hedged line is copied whole ("sumac (I think it was like 1 tbsp?? …)") — the hedge is the author's information, and the row is still flagged.

**Countables keep the recipe's count, in `each`.** 1 egg is `1 each`, never `1 dozen`;
8 thighs is `8 each`. Rounding to a package is the shopping list's job, not the import's.

**`unit` may be `null`**, unlike the Galley, where a matched catalog item's unit wins and an
unmatched one gets `each`. There is no catalog in this request; the client does the
matching and the same `createCatalogItem` default applies. `category` is included for the
NEW-item path (the client already reads it from Galley drafts) and omitted when unknown.

**`attribution` is only ever what is visible in the input.** `null` otherwise. The prompt is
explicit that a recipe *in the style of* a known site gets `null`.

**`occasion`** is filtered server-side to the seven `061` values and de-duplicated.

**Safety refusal → `{ ok: false, reason: "not_a_recipe" }`.** A `stop_reason: "refusal"` is
indistinguishable from "no recipe here" to the person, and that is the right hint for it.

## Deploy (dev only — never `supabase link`)

```bash
npx supabase functions deploy recipe-import --project-ref zxwtxjjmssykhqrghouf --no-verify-jwt
```

Secrets are the project's existing `ANTHROPIC_API_KEY`; nothing new. Prod
(`parpauldmbetptkmdwbd`) also needs `CLERK_ISSUER` — see `meal-suggestion`'s README — and
ships with the client in its own fresh-eyes promotion.

## Test standalone — `scripts/recipe_import_probe.ps1` (gitignored)

The probe takes a live dev JWT at the prompt (tolerates a pasted `Bearer `), posts each
fixture in `scripts/recipe-fixtures/` (also gitignored — real screenshots), and prints the
JSON and wall-clock for each. Clerk tokens live about a minute; the probe re-prompts for a
fresh one when a `Token expired` 401 comes back. Results are also written to
`scripts/recipe-fixtures/out/`.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/recipe_import_probe.ps1          # all cases
powershell -ExecutionPolicy Bypass -File scripts/recipe_import_probe.ps1 -Case ig4 # one case
```

Getting a JWT: on `dev.ourprovisions.velayo.ai`, signed in, in the devtools console:

```js
await window.Clerk.session.getToken({ template: "supabase" })
```

## Follow-ups this function does not solve

- **No rate limiting** — inherited from `meal-suggestion`, spec says mirror, not invent.
- **Unit tests:** `node --test supabase/functions/recipe-import/steps_test.mjs` (Node 24, no Deno needed). The CLI deploys `index.ts`'s import graph only, so the test file never ships.
- **Pins:** `npm:@anthropic-ai/sdk@0.123.0`, `npm:jose@6.2.10` — the same as `meal-suggestion`.
