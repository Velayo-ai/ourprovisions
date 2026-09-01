# `meal-suggestion` — the project's first Edge Function

Proxies one Anthropic Claude API call so `ANTHROPIC_API_KEY` never reaches the browser.
Spec: [`docs/specs/active/SPEC_ai_meal_suggestion.md`](../../../docs/specs/active/SPEC_ai_meal_suggestion.md).

| | |
|---|---|
| **Contract** | `POST` → `{ requestText: string, catalog?: [{name, category?}] }` |
| **Returns** | `{ name, baseServings, instructions, ingredients: [{name, quantity, unit}] }` — **one object, never an array** |
| **Model** | `claude-opus-5`, effort `low`, one `strict` tool (`emit_meal`) |
| **State** | None. No service-role key, no database reads. |

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

## ⚠️ Never deploy with `--no-verify-jwt`

`verifyCaller()` in `index.ts` checks **claims only** — it does not verify the
signature. Supabase's platform `verify_jwt` gate does that, before this code runs.
Without it, every check in that function is a forgeable string comparison.

The claim checks are still required on top of the platform gate, because `verify_jwt`
accepts **any** token signed with the project secret — including **the anon key, which
ships inside the public client bundle**. The platform gate alone would let anyone who
views source spend Anthropic credit. Requiring `role != anon` and a non-empty `sub` is
what actually closes that. Test 3b exists specifically to keep this closed.

These are Clerk JWT-template tokens (`getToken({ template: "supabase" })`, see
[`src/lib/supabaseClient.js`](../../../src/lib/supabaseClient.js)). Clerk signs them
with the shared Supabase JWT secret, which is why the platform gate accepts them
natively and no Clerk JWKS fetch is needed.

## Deploy (dev first, always)

Requires the Supabase CLI (`npx supabase`) authenticated as someone with access to the
dev project.

```bash
npx supabase login                       # or export SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref zxwtxjjmssykhqrghouf

# The key is set ON THE PROJECT, not in this repo. Never commit it.
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

npx supabase functions deploy meal-suggestion   # verify_jwt stays on (config.toml)
```

Prod (`parpauldmbetptkmdwbd`) is a **separate deploy and a separate secret**, and is
gated behind dev verification exactly like a migration.

## Test standalone — before any client wiring

```bash
export SUPABASE_FN_URL="https://zxwtxjjmssykhqrghouf.supabase.co/functions/v1/meal-suggestion"
export SUPABASE_ANON_KEY="<dev anon key>"
export CLERK_JWT="<a real end-user token — see below>"
bash supabase/functions/meal-suggestion/test.sh
```

Six checks: a valid request returns 200, the draft's shape/units validate, a plural
request (*"give me three dinner ideas"*) still returns exactly one meal, and all three
rejection paths (no token / anon key / garbage) return 401.

### Verified on dev — 2026-09-01 (function version 1)

| Check | Result | Rejected by |
|---|---|---|
| 3a — no `Authorization` header | **PASS** 401 `UNAUTHORIZED_NO_AUTH_HEADER` | platform gate |
| 3b — **anon key as the bearer token** | **PASS** 401 `Unauthorized: Not an end-user token` | **this function** |
| 3c — garbage token | **PASS** 401 `UNAUTHORIZED_INVALID_JWT_FORMAT` | platform gate |
| `OPTIONS` preflight | **PASS** 200, no auth required | — |
| 1 — valid request returns one meal | **NOT RUN** | needs the secret + a real JWT |
| 2 — plural request still returns one meal | **NOT RUN** | needs the secret + a real JWT |

**Read row 3b carefully — it is the whole argument for the claim checks.** The platform
gate *accepted* the anon key (it is correctly signed), and this function's own check is
what rejected it. Note the error shapes differ: 3a/3c return the platform's
`{code, message}`, 3b returns this function's `{error}`. If 3b ever starts returning a
platform-shaped body, the claim checks stopped running and the hole is open again.

### Getting a test JWT

The token must be a real end-user one — it cannot be minted from this repo, and the
anon key deliberately will not work. On `dev.ourprovisions.velayo.ai`, signed in, in
the devtools console:

```js
await window.Clerk.session.getToken({ template: "supabase" })
```

Short-lived (~60s by default), so grab it immediately before running the script.

## Follow-ups this function does not solve

- **No rate limiting.** Nothing stops repeated calls; `MAX_REQUEST_CHARS` and
  `MAX_CATALOG_ITEMS` bound the size of each call, not the number of them. A
  per-household daily cap is the spec's open item.
- **`npm:@anthropic-ai/sdk@0.123.0` is pinned** — bump deliberately, and re-run
  `test.sh` after, since the tool-use response shape is what the parsing depends on.
