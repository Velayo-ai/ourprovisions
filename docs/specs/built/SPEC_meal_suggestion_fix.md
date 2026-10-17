# SPEC — `meal-suggestion` fix: body-first, server-side draft guard, forced tool

**Date:** 2026-10-16 · **Scope:** OurProvisions · **Status:** design-final, build next
**Owner:** Claude Code builds and deploys to dev; Dan deploys to prod.
**Closes:** the live prod "x" Galley draft bug (ROADMAP NOW, carried since 2026-10-12).
**Touches:** `supabase/functions/meal-suggestion/index.ts` only. No `src/`, no migration, no client promotion, no model-literal change (`claude-opus-5` stays).

---

## Why

Prod runs `meal-suggestion` v1. That deploy is byte-identical to the repo's 2026-09-02 source. Three gaps in it, all diagnosed already:

1. **Body-first hang (latent).** `verifyCaller(req)` runs before `req.json()`. Supabase's relay never delivers a response sent while the request body is still unread. So a rejected token on a large body hangs about 150 s and then returns a 503. This was proven on `recipe-import` on 2026-10-09 and fixed there in `40ec0e5`. It is masked here only because Galley bodies are a few KB.
2. **The "x" draft (live).** No `tool_choice` is set, so it defaults to `auto`. The model can write prose plus a stub `emit_meal` call whose `instructions` is non-empty but useless (e.g. `"x"`), and that passes `validateAndNormalizeDraft`. The 2026-10-12 log read showed out=1298 tokens on the bad call against out=847 on the good retry, so text came back alongside the tool call. The client guard (`src/lib/galleyDraft.js`, on prod since `baf08e3`) already refuses this shape. The server has no guard.
3. **No Anthropic timeout.** The SDK default retries and waits long. `recipe-import` uses `timeout: 75_000, maxRetries: 0` with clean 504 / 502 mapping.

## Changes (one commit)

**C1 — Body first.** In the handler, after the OPTIONS / method checks, the order becomes:
1. `const raw = await req.arrayBuffer()`, before anything else.
2. Size check against a byte cap that comfortably exceeds 600 chars plus 400 catalog rows (suggest 64 KB) → 413.
3. `verifyCaller(req)` → 401.
4. Decode UTF-8 and `JSON.parse` → 400.

This mirrors `recipe-import`'s order exactly; copy its shape rather than reinventing it. Send `Content-Type: application/json; charset=utf-8`, as recipe-import does.

**C2 — Anthropic client timeout.** Construct the client with `new Anthropic({ apiKey, timeout: 75_000, maxRetries: 0 })`. Map errors as follows, ahead of the existing branches:
- `APIConnectionTimeoutError` → 504 "That took too long. Try again in a moment."
- `APIConnectionError` → 502

The existing 429 / 500 / 502 / 422 branches stay.

**C3 — Force the tool.** Add `tool_choice: { type: "tool", name: "emit_meal" }`. After the response arrives, if any content block has `type === "text"`, log `console.warn("emit_meal arrived with a text block", { textChars, outTokens })`. Log lengths and counts only, never the text, and continue. The existing "no tool_use → 502" check stays as the backstop.

**C4 — Server-side draft guard.** After `validateAndNormalizeDraft` succeeds, compute:
- `lines` = non-empty trimmed lines of `draft.instructions`
- `chars` = trimmed length of `draft.instructions`

If `lines.length < 2 && chars < 40`, return 502 "The suggestion service returned an unusable meal." and log `console.error("draft guard", { lines, chars, outTokens })` (counts only). This is the same threshold as `galleyDraft.js`: both conditions must hold, so a real two-line recipe or a long one-liner passes.

## ⚠️ Stop point — the one real risk

The Messages API rejects a forced `tool_choice` (`type: "tool"` or `"any"`) when extended thinking is on. This function sends `output_config: { effort: "low" }`. Whether that turns thinking on for `claude-opus-5` is unknown.

- **If the first dev deploy returns 400 on that combination: STOP. Do not drop `effort`, switch models, or fall back to `auto` on your own.** Report the exact error text to Dan and bring it back to the design chat.
- In that case, ship C1 + C2 + C4 without C3. C4 alone closes the user-visible bug, and C3 becomes its own follow-up.

## Build & verify — in order

1. **Pre-flight (read-only).** `git pull` on dev. Confirm the repo's `meal-suggestion/` matches prod v1. Record the prod function version through the CLI or MCP for rollback.
2. **Galley standalone suite on dev, BEFORE.** Use `test.sh` from 2026-09-02, or whatever is current. Record pass counts.
3. **Build C1–C4 as one commit.** Deploy to dev with `--project-ref zxwtxjjmssykhqrghouf` (not linked; the 2026-09-09 rule).
4. **Suite on dev, AFTER.** Same pass counts or better. Then three targeted probes:
   - (a) A garbage token with a ~1 MB body → 401 in under 2 s. This proves C1.
   - (b) A normal craving → 200 with ≥ 2 instruction lines. Check the logs for no `text block` warn, or record it if present.
   - (c) The guard as a unit: show the threshold logic rejecting `"x"` and accepting a two-line draft. A tiny `node --test` file outside the deploy graph is fine; `recipe-import`'s `steps_test.mjs` is the precedent.
5. **Gate:** Dan reads the after-results. Prod happens only on his go.
6. **Prod deploy (Dan):** `supabase functions deploy meal-suggestion --project-ref parpauldmbetptkmdwbd --no-verify-jwt`. Confirm `config.toml` still says `verify_jwt = false`.
7. **Suite on prod** with a real prod token. Same pass counts as dev.
8. **Short prod walk (Dan, phone):** three Create-a-meal crafts from the Galley card. Each lands a real multi-step draft, with no "x" and no new hint copy. Cancel leaves counts unchanged.

**Rollback:** redeploy the 2026-09-02 source, which is byte-identical to prod v1, from the pre-change commit with the same command. No client or DB dependency either way.

## Done when

- One commit is on dev and pushed, with the range quoted before the push.
- The suite passes on dev before and after, and on prod.
- Probe (a) answers in under 2 s.
- The guard is unit-proven.
- Prod is deployed and walked 3/3.
- ARCHITECTURE's `meal-suggestion` entry records the new order, the timeout, the forced tool (or why not) and the guard.
- ROADMAP NOW → DONE.

## Out of scope (do not touch)

- The model literal.
- `recipe-import`.
- Any client code. `galleyDraft.js` stays as a second line of defence.
- A per-user rate limit (still unbuilt, noted in the README).
