# SPEC — Promote "Ask the Galley" (AI meal suggestion) to prod

**Scope:** OurProvisions
**Date:** 2026-09-09
**Status:** Ready for Claude Code

## Context

Ask the Galley (AI meal suggestion) has been dev-only since it was built. Prod
today (`main` `8ca6da2`) has **zero AI surface** — confirmed three ways in the
Phase 1 promotion, which deliberately excluded it. Prod also has:

- **Zero deployed Edge Functions** (`list_edge_functions` → `{}`)
- No `CLERK_ISSUER` secret (issuer allowlist defaults to the **dev** Clerk
  instance — every real prod token would be rejected as `Untrusted issuer`)
- No `ANTHROPIC_API_KEY` secret

Since then, dev has also picked up the recipe-card Phase A polish (Steps as a
read/edit surface, thinking state, non-backdrop-dismiss authoring, etc.) on
top of the base AI feature. Both ride together — there's no reason to promote
the base feature now and the card polish later; dev is the source of truth to
promote from.

## Decision — explicitly OUT of scope for this promotion

**The `insert_custom_catalog_item` unit-parameter fix is deliberately
excluded.** Discussed and decided 2026-09-09: the AI-suggested-unit-drop bug
is a symptom of a larger quantity/unit modeling gap (three incompatible types
across `catalog_items.unit`, `list_items.quantity`, and
`meal_ingredients.quantity_per_serving`), not something to patch narrowly.
This ships to prod with that known limitation and is the planned **first
post-prod fix**, pending its own design pass. Do not fold a narrow RPC patch
into this promotion.

## Order of operations — sequencing is load-bearing

**1. Edge Function + secrets first, client last.** Deploying the function and
setting secrets on prod is invisible to real users — there's no client button
yet that calls it. Promoting the client *before* secrets are set would put a
live, broken "Ask the Galley" button in front of real users (every request
would 401 with `Untrusted issuer` or fail on the missing Anthropic key). Do
not reverse this order.

```bash
npx supabase login                                   # or SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref parpauldmbetptkmdwbd  # prod

npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   --project-ref parpauldmbetptkmdwbd
npx supabase secrets set CLERK_ISSUER=<prod Clerk issuer> --project-ref parpauldmbetptkmdwbd

npx supabase functions deploy meal-suggestion --no-verify-jwt --project-ref parpauldmbetptkmdwbd
```

- `ANTHROPIC_API_KEY` should be a **prod-scoped key**, not a copy of dev's —
  confirm before setting.
- `CLERK_ISSUER` must be the **prod** Clerk instance's issuer URL (not dev's).
  Pull this from the prod Clerk dashboard, don't guess or reuse dev's value.
- `--no-verify-jwt` is intentional — the function does its own full RS256
  verification against the issuer's JWKS inside `verifyCaller`. Do not
  "simplify" this by relying on the platform gate instead.

**2. Test standalone before touching the client**, same as dev's original
verification (`README.md`, `meal-suggestion/test.sh`), pointed at prod:

```bash
export SUPABASE_FN_URL="https://parpauldmbetptkmdwbd.supabase.co/functions/v1/meal-suggestion"
export SUPABASE_ANON_KEY="<prod anon key>"
export CLERK_JWT="<a real prod end-user token>"
bash supabase/functions/meal-suggestion/test.sh
```

Expect the same 8/8 pass shape as dev's 2026-09-01 run: valid single-meal
request, plural-request-collapses-to-one guardrail, and all three
no-token/anon-token/garbage-token cases returning 401. Do not proceed to step
3 until this passes.

**3. Hand-author the client promotion — NOT a straight `dev→main` merge.**
`main` has diverged since the AI feature was built on dev. Known landmine
already on record:

> ⚠️ `fb4f6ee` and `cab4297` are **partial on `main`, full on `dev`**, and
> **will** conflict at merge. Resolve by taking **dev's side** in both — the
> partial patch on `main` was always the interim state, never a divergent
> design.

Follow the same discipline used for the Phase 1 on-hand promotion:
- Trace provenance with `git log -S`, don't judge a hunk by how it reads (a
  commit that looks like generic UI chrome may be AI-suggestion-only).
- If a commit mixes AI-surface code with unrelated code sharing one
  contiguous block, check whether it splits cleanly before assuming conflict.
- Prove the resulting bundle is what you think it is by artifact identity
  (bundle diff / SHA), not by reasoning about what "should" be in it.

The promotion should carry: the AI meal-suggestion surface itself
(`requestMealSuggestion`, the Ask the Galley button and gating), and the
recipe-card Phase A polish built on top of it (`c067742` + `d37504c` on dev).

## Verification checklist (live, post-deploy)

- [ ] Prod secrets confirmed set (`ANTHROPIC_API_KEY`, `CLERK_ISSUER`) —
      query, don't assume.
- [ ] `meal-suggestion` function live on prod, standalone test 8/8 pass.
- [ ] Client promoted; prod bundle contains the AI surface (inverse of the
      Phase 1 check — confirm it's *present* now, correctly).
- [ ] Live walkthrough as a real signed-in prod user: tap Ask the Galley,
      get a real suggestion, add it to the list, confirm it lands correctly.
- [ ] No regression to the on-hand feature already live on prod.
- [ ] Known limitation (unit-drop on newly-created catalog items from AI
      suggestions) is present but not blocking — expected, not a bug to chase
      this round.

## Non-goals

- Unit/quantity model rework (separate future STRATEGY/SPEC).
- `insert_custom_catalog_item` unit-param fix (first post-prod fix, separate).
- RUM unmask-body question (`d29adb0`) — on hold per standing decision,
  unrelated to this promotion.
