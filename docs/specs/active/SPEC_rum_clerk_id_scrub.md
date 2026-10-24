# SPEC — RUM scrub: mask Clerk ids in Clerk API URLs

**Status:** Decided 2026-10-23 (design chat). Not built.
**Scope:** OurProvisions. Client-only (`src/rum.js`, `src/rum.test.js`). No migration, no DB change.
**Follows:** `SPEC_rum_span_url_scrub.md` (with its D3-widening addendum) and the Clerk-id mask promoted to prod in `5836534`.

---

## Why

The scrub cleans Supabase REST and Storage URLs and masks `clerk_id=eq.<id>` as `[clerk]`. It has never touched **Clerk's own API URLs**. Clerk's token refresh (about every 60 s) calls a URL like:

```
https://clerk.ourprovisions.velayo.ai/v1/client/sessions/sess_3L7j…/tokens?_clerk_js_version=…
```

Splunk records that URL on spans. The 2026-10-23 prod HAR found **10 spans carrying a `sess_…` id**.

A session id can't authenticate anyone on its own, but it is a stable identifier: it ties every span from one login together. That is exactly the linkage the `[clerk]` mask removes for user ids, so this closes the same gap for Clerk's own paths. The leak predates the 10-23 promotion, so it doesn't block anything shipped.

There is also a sharper risk on dev. Clerk *development* instances put a token (`__clerk_db_jwt`) in the query string. Prod uses cookies and doesn't, but dev also feeds Splunk.

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Mask any Clerk-style id in a Clerk API URL path,** not just `sess_`. Clerk ids are a lowercase prefix plus `_` plus a long random string (`sess_`, `user_`, `client_`, `sia_`, `sua_`, `org_`, …). | Sign-in and sign-up flows put other id types in paths. One pattern covers them, including id types Clerk adds later. |
| D2 | **Placeholder keeps the prefix and drops the random part:** `sess_3L7j…` becomes `sess_[id]`. | You can still tell what kind of thing it was without learning which one. Same idea as `clerk_id=eq.[clerk]`. |
| D3 | **Drop the entire query string on Clerk API hosts.** | It carries no debugging value (`_clerk_js_version`, `_method`). Dropping everything closes the dev `__clerk_db_jwt` leak without maintaining a parameter list. |
| D4 | **Match by host.** Prod: `clerk.ourprovisions.velayo.ai`. Dev: `*.clerk.accounts.dev`. Leave `img.clerk.com` to its existing handling. | Masking only on Clerk hosts means no Supabase or app URL that happens to contain `sess_` is ever altered. |
| — | **Keep the route shape** (`/v1/client/sessions/sess_[id]/tokens`). Don't cut to the host alone. | Route shape is how you'd spot slow token refresh or a failing sign-in step. Cutting to the host throws away the debugging value with no privacy gain. |

---

## Step 0 (Cody, read-only, before any edit)

Design against real data, not guessed routes.

1. **Inventory.** From `rum.js` as it stands, list where URLs get scrubbed: which span attributes (`http.url`, span `name`, anything else) and which code path each takes. Confirm whether Clerk API URLs currently reach `scrubUrl` at all, or bypass it.
2. **Real shapes.** From a fresh dev HAR, or the 10-23 prod decode notes if they're still in scratch, list every distinct Clerk API URL **shape** seen in spans: the host, the path with ids shown as `<id>`, and the query parameter *names*.
3. **Replay.** Confirm whether any Clerk API URL appears in the **replay** pipeline (bodies or envelopes). The 10-23 decode checked replay for `user_` and found 0, but didn't check for `sess_`.
4. **Dev query tokens.** Confirm whether dev spans currently carry `__clerk_db_jwt` (or any token) in Clerk query strings.
5. **Report** findings before writing code. If Step 0 shows Clerk ids in a place the plan doesn't cover (another attribute, another host), bring it to the design chat. Don't widen the scope on your own.

---

## Implementation guidance

- **Placement.** Extend the existing scrub so it runs in the same place as the other host-specific rules (beside the `img.clerk.com` and `/storage/v1/` handling). Every attribute found in Step 0 #1 must go through it.
- **Host test.** An exact match for `clerk.ourprovisions.velayo.ai`, or a suffix match for `.clerk.accounts.dev`. Parse the host properly; don't run a substring test on the whole URL.
- **Id pattern, applied to the path only.** A lowercase prefix of 2–8 letters, `_`, then **20 or more** `[A-Za-z0-9]`, matched per path segment. The 20-character minimum keeps Clerk's own route words (for example `sign_ins`) from matching. Replace with `$prefix_[id]`.
- **Query.** On a Clerk API host, drop everything from `?` onward. Drop any `#` fragment too.
- **Unchanged:** the allow-list (stays at 58), the Supabase rules, the `[clerk]` mask, the `img.clerk.com` handling, and the privacy block and Splunk inits.

---

## Tests (`rum.test.js`)

| Input | Expected |
|---|---|
| `https://clerk.ourprovisions.velayo.ai/v1/client/sessions/sess_<27 chars>/tokens?_clerk_js_version=5.x` | `https://clerk.ourprovisions.velayo.ai/v1/client/sessions/sess_[id]/tokens` |
| A path with two ids, e.g. `/v1/client/sessions/sess_<…>/…/user_<…>` | Both masked, prefixes kept |
| `/v1/client/sign_ins/sia_<…>/attempt_first_factor` | `sign_ins` untouched; `sia_[id]` |
| `https://<x>.clerk.accounts.dev/v1/client?__clerk_db_jwt=<jwt>&_clerk_js_version=…` | Query gone entirely; no `__clerk_db_jwt` in the output |
| `https://clerk.ourprovisions.velayo.ai/v1/environment` (no id, no query) | Unchanged |
| A Supabase REST URL containing the text `sess_` in a filter value | Clerk rule not applied (existing REST rules only) |
| An `img.clerk.com` URL | Existing behaviour, byte-for-byte |
| A non-Clerk host with a path like `/x/sess_<…>` | Unchanged by this rule |
| An `id_` prefix followed by fewer than 20 characters | Not masked |

All existing tests stay green (441 → 441 + new).

---

## Verification

**Dev (gate before promoting):**
1. Run `CI=true` build: 0 ESLint warnings. Jest is fully green.
2. Check the bundle for the new host test and the `_[id]` replacement. The allow-list count is still 58.
3. **Dev HAR.** Sign in fresh and wait at least 2 minutes so token refreshes fire. Open a recipe and go Home. Save the HAR to a **non-synced local folder**. Cody decodes both pipelines:
   - 0 matches for `(sess|user|client|sia|sua|org)_[A-Za-z0-9]{20,}` in spans and replay
   - 0 matches for `__clerk_db_jwt`, and 0 for any `?` on a Clerk API host
   - `/v1/client/sessions/sess_[id]/tokens` is present, so the route shape survives
   - Every 10-23 check still holds: `clerk_id=eq.[clerk]`, 0 `token=`, storage URLs cut at the bucket, photo surfaces excluded
   - HAR deleted afterward
4. Dan's dev walk: sign in, then sign out and back in, add an item, Cooked it. The app behaves normally and the console is clean.

**Prod (after promotion):** repeat step 3 on prod. Expect at least 1 `sess_[id]` span and 0 raw ids.

---

## Rollout

1. Build on dev. Run the Step 0 → code → tests → dev HAR → walk sequence.
2. Promote with the same method as 10-23: `rum.js` and `rum.test.js` go to main **whole from dev**, in one commit, Dan pushes. Then deploy proof: compare markers in the new bundle against the previous prod bundle, and confirm everything outside the scrub region is byte-identical.
3. Prod HAR as above.

**Rollback:** redeploy the previous prod deployment in Vercel. The change is client-only, so nothing in the database needs undoing.

---

## Open questions

- If Step 0 finds Clerk URLs in **replay**, does the fix belong in the replay pipeline's own scrubbing, or does the span scrub already cover it? This is decided in the design chat after Step 0. It is not assumed here.
