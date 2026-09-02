# `meal-suggestion` — the project's first Edge Function

Proxies one Anthropic Claude API call so `ANTHROPIC_API_KEY` never reaches the browser.
Spec: [`docs/specs/active/SPEC_ai_meal_suggestion.md`](../../../docs/specs/active/SPEC_ai_meal_suggestion.md).

| | |
|---|---|
| **Contract** | `POST` → `{ requestText: string, catalog?: [{name, category?}] }` |
| **Returns** | `{ name, baseServings, instructions, ingredients: [{name, quantity, unit}] }` — **one object, never an array** |
| **Model** | `claude-opus-5`, effort `low`, one `strict` tool (`emit_meal`) |
| **State** | None. No service-role key, no database reads. |
| **Auth** | Clerk RS256 verified **in this function** against Clerk's JWKS. `verify_jwt = false`. |

## Shape decisions worth not re-litigating

**Stateless, catalog passed in by the client** (decided 2026-09-01). The alternative —
the function fetching the catalog itself with a service-role key from the caller's
`household_id` — would have given this function read access to every household's data
and made a forged `household_id` worth attempting. Passing the context in means the
function can only ever see what the caller already had.

**Auth is cost control, not data protection.** There is no household data here to
protect. The gate exists so anonymous traffic cannot spend Anthropic credit.

**Two independent guarantees for the one-meal rule**, because either alone is weak:
the prompt instructs it (a schema cannot express "pick the best one"), and
`strict: true` on an object-typed schema makes a list structurally impossible (a prompt
is a request, not a guarantee). If both somehow fail, `index.ts` returns 502 rather than
taking the first element — the spec is explicit that a mismatch must surface, not be
repaired.

## ⚠️ `verify_jwt = false` is correct here. Do not flip it back.

**This was wrong in the first version and the correction is the important part.** The
function was initially written assuming the app's tokens were HS256, signed with the
shared Supabase JWT secret (the old Clerk "supabase" JWT-template integration), so that
Supabase's platform gate would validate them and this code need only check claims.

A real token from `getToken({ template: "supabase" })` on dev is **RS256, signed by
Clerk** (`iss: https://<instance>.clerk.accounts.dev`, with a `kid`). Postgres accepts
it — Supabase third-party auth validates it against Clerk's JWKS — but **the Edge
Functions gateway does not.** It rejected a live token with `UNAUTHORIZED_ASYMMETRIC_JWT`
**while 9 seconds of validity remained**, so this is not an expiry artifact. With
`verify_jwt = true` this function is unreachable by every real user.

So the function verifies the token itself: full RS256 signature check against the
issuer's JWKS, algorithm pinned, issuer allowlisted. **That is strictly more
verification than the platform gate was doing, not less.**

**Every check in `verifyCaller` is therefore load-bearing** — there is no gate in front
of it. Do not "simplify" it to a decode-and-check-claims; that would accept any token
anyone typed. The `algorithms: ["RS256"]` pin is also what makes an HS256 anon key
unusable here.

### `CLERK_ISSUER` — prod will not work without it

The issuer allowlist defaults to the **dev** Clerk instance. The token's own `iss` is
read only to *select* a trusted JWKS, never to trust one — a forged `iss` matches
nothing. Prod runs a different Clerk instance, so a prod deploy **must** set
`CLERK_ISSUER` or it will reject every real token with `Untrusted issuer`.

## Deploy (dev first, always)

```bash
npx supabase login                       # or export SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref zxwtxjjmssykhqrghouf

# Secrets are set ON THE PROJECT, never committed.
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

npx supabase functions deploy meal-suggestion --no-verify-jwt
```

Prod (`parpauldmbetptkmdwbd`) is a separate deploy with **two** secrets —
`ANTHROPIC_API_KEY` *and* `CLERK_ISSUER` — and is gated behind dev verification exactly
like a migration.

## Test standalone — before any client wiring

```bash
export SUPABASE_FN_URL="https://zxwtxjjmssykhqrghouf.supabase.co/functions/v1/meal-suggestion"
export SUPABASE_ANON_KEY="<dev anon key>"
export CLERK_JWT="<a real end-user token — see below>"
bash supabase/functions/meal-suggestion/test.sh
```

### Verified on dev — 2026-09-01, function version 6. **8/8 pass.**

| Check | Result |
|---|---|
| 1 — valid request returns 200 | **PASS** |
| 1 — draft shape, units, servings all valid | **PASS** — *Creamy Garlic Chicken And Rice*, 4 servings, 11 ingredients, 1033-char instructions |
| 2 — plural request returns 200 | **PASS** |
| 2 — **guardrail: exactly one meal** | **PASS** — *"give me three dinner ideas"* → one meal, *Creamy Garlic Chicken Thighs With Rice* |
| 2 — guardrail draft shape valid | **PASS** — 9 ingredients, all units in the allowed set |
| 3a — no `Authorization` header | **PASS** 401 |
| 3b — anon key as the token | **PASS** 401 |
| 3c — garbage token | **PASS** 401 |

**Catalog reuse works.** Test 1 was given a 5-item catalog and emitted `Chicken Thighs`,
`Yellow Onion`, `Garlic`, `Heavy Cream`, `Basmati Rice` **verbatim** — exactly what
`createCatalogItem`'s exact-normalized matcher needs to avoid creating duplicates. Items
not in the catalog (`Chicken Broth`) came back plain and generic, as instructed.

Also verified earlier, on version 5, and still worth keeping — these prove the RS256
signature check is genuinely running rather than stubbed:

| Check | Result |
|---|---|
| Genuine Clerk token, **expired** | **PASS** 401 `Token expired` |
| **Same token, one char flipped in the signature** | **PASS** 401 `Bad signature` |
| Anon key (HS256) | **PASS** 401 `Untrusted issuer` |
| `OPTIONS` preflight | **PASS** 200, no auth required |

The same token one character apart produces two *different* failures, and the expired
one got past the issuer allowlist and signature check to fail only on age — the whole
chain, exercised.

### Known gap in the guardrail evidence

Both test requests returned a similar chicken-and-rice dish, because the fixture catalog
is small and chicken-centric and test 1 explicitly asks for chicken. The guardrail claim
— *one* meal, not three — is sound either way, since the count is what is being checked.
But a plural request over a broader catalog, with no cuisine hint shared with test 1,
would be a stronger probe. Worth adding when there is a richer seeded household.

### Getting a test JWT

The token must be a real end-user one — it cannot be minted from this repo, and the anon
key deliberately will not work. On `dev.ourprovisions.velayo.ai`, signed in, in the
devtools console:

```js
await window.Clerk.session.getToken({ template: "supabase" })
```

**These live ~60 seconds.** Set the `ANTHROPIC_API_KEY` secret *first*, then grab the
token and run `test.sh` immediately — a round trip through a chat window will outlive it.

## Follow-ups this function does not solve

- **No rate limiting.** `MAX_REQUEST_CHARS` and `MAX_CATALOG_ITEMS` bound the size of
  each call, not the number of them. A per-household daily cap is the spec's open item.
- **Pins:** `npm:@anthropic-ai/sdk@0.123.0`, `npm:jose@6.2.10`. Bump deliberately and
  re-run `test.sh` — the tool-use response shape is what the parsing depends on.
- **`verify_jwt = false` means the endpoint is publicly reachable**; the `apikey` header
  is no longer required by the gateway. All rejection now happens in `verifyCaller`,
  which is why the table above tests it directly rather than trusting the platform.
