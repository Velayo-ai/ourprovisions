# SPEC — Provision the production Clerk instance

**Scope:** OurProvisions
**Status:** Active — build session, DNS-gated
**Created:** 2026-07-24
**Blast radius:** HIGH — prod auth + prod data. Every authenticated query depends on this.

---

## The finding

The live app `ourprovisions.velayo.ai` reads and writes the **prod** Supabase
project (`parpauldmbetptkmdwbd`) while authenticating against a **development**
Clerk instance. Prod data behind dev auth.

**Evidence (gathered 2026-07-24, in-browser, not from docs):**

| Check | Result | Means |
|---|---|---|
| `performance` → `supabase.co` resource | `parpauldmbetptkmdwbd.supabase.co/rest…` | prod data |
| `performance` → `clerk` resource | `many-puma-34.clerk.accounts.dev` | dev Clerk instance |
| Clerk dashboard | instance switcher = **Development**; **"Go to prod"** button present; banner: *"create your production instance"* | no prod instance exists |
| `src/index.js` | `publishableKey="pk_test_bWFueS1wdW1hLTM0…"` hardcoded | dev key baked into source |

The console warning that surfaced it: *"Clerk has been loaded with development
keys… should not be used when deploying your application to production."*

## Why this gates beta expansion (and jumps the queue)

Clerk's own banner draws the line: a dev instance is *"for internal and test
users."* A closed beta of known people (Christopher, Heddi, Michael, Aidan,
Helen, Elly — all currently Test users in the dev instance) sits inside that
line. **Expanding the audience** — strangers through the cold-start invite path
— crosses it. Dev instances have strict usage limits; more users, especially
unknown ones, is exactly the load a dev instance is not built to hold. Auth
failing under load is a user-visible failure — the class we alert on.

This is the real gate. RLS and EXIF verification (the two items this session
opened with) are about whether the *photo feature* is sound; this is about
whether *auth holds real users at all*. It comes before audience expansion,
therefore before Trip Complete and Receipt Capture.

## Why the RLS test was blocked on this

The storage RLS model trusts `auth.jwt()->>'sub'`. That claim is signed by the
Clerk instance. Testing denial with **dev-minted tokens** and then swapping the
issuer means the test is invalidated by the swap. The token issuer was the
confounding variable the whole session. **RLS + EXIF re-verify only after the
cutover, on prod-minted tokens.**

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | Create a Clerk **production instance** now | No prod instance exists; audience expansion requires it |
| D2 | **Migrate** beta users dev→prod via Clerk (not re-register) | Six known users; migration preserves their continuity. Prod user pool starts empty |
| D3 | Move the Clerk publishable key **out of source into `process.env`** as part of the fix | It is currently hardcoded `pk_test_…` in `index.js`; env-driving it is how dev/prod builds pick the right key and stop shipping test keys in the bundle |
| D4 | Prod Clerk custom domain: `clerk.ourprovisions.velayo.ai` (confirm at build) | Prod Clerk requires a verified custom domain; keep it under the app's own domain |

---

## Build sequence

Ordered. Steps 1–3 are this session (up to the DNS wall). Steps 4–8 resume once
Clerk verifies the domain — **could be minutes or hours; this is the process,
not a stall.**

### 1. Provision the prod instance (Dan, Clerk dashboard)
- Click **"Go to prod."** Clerk creates the production instance and issues
  `pk_live_…` / `sk_live_…`.
- Record both keys somewhere safe. `sk_live_` is a secret — never commits, never
  reaches the client bundle.

### 2. Custom domain + DNS (Dan, Clerk + Cloudflare) — ⏳ THE WALL
- Clerk prompts for a domain (`clerk.ourprovisions.velayo.ai`) and hands back
  CNAME records.
- Add the CNAMEs in **Cloudflare**. Per the landing-page lesson: watch the
  proxy setting — Clerk's verification and TLS want the records reachable; a
  wrong orange/grey-cloud choice can loop or fail verification. Follow Clerk's
  stated requirement for each record.
- **Wait for Clerk to verify the domain.** Nothing downstream works until it
  goes green. This is the DNS-propagation gate.

### 3. Env-drive the Clerk key (Cody, code — can proceed in parallel during the wait)
- In `src/index.js`, replace the hardcoded literal:
  ```js
  <ClerkProvider publishableKey="pk_test_bWFueS1wdW1hLTM0…">
  ```
  with:
  ```js
  <ClerkProvider publishableKey={process.env.REACT_APP_CLERK_PUBLISHABLE_KEY}>
  ```
- Add `REACT_APP_CLERK_PUBLISHABLE_KEY` to Vercel env vars:
  - **Production** deployment → `pk_live_…` (from step 1)
  - **Preview/dev** → the existing `pk_test_…` (so dev builds keep working)
- Add a guard so a missing key fails loud, not silent (blank white screen is
  worse than a thrown error).
- **Do not deploy to prod yet** — the `pk_live_` key is inert until the domain
  verifies (step 2) and Supabase is re-pointed (step 4).

### 4. Re-point Supabase Third-Party Auth (Dan, Supabase dashboard) — HIGHEST RISK
- Prod Clerk has a **different JWKS endpoint and issuer** than dev.
- In the **prod** Supabase project's Third-Party Auth / Clerk integration, update
  the issuer / JWKS URL to the prod instance's values (Clerk dashboard → API
  keys / JWT surfaces the issuer domain, now `clerk.ourprovisions.velayo.ai`).
- **Miss this and every authenticated query denies every user** — the `sub`
  claim won't validate. This is the single most dangerous step; do it
  deliberately, confirm the issuer string character-for-character.

### 5. Migrate beta users dev→prod (Dan, Clerk Backend API) — D2
- Clerk migration between instances is **export from dev + import to prod via
  the Backend API**, not a dashboard button.
- **OAuth caveat:** the six testers' Gmail addresses suggest Google OAuth sign-in.
  OAuth identities migrate cleanly (identity lives with Google, not a
  Clerk-stored password). *If* any used email/password, those credentials do
  **not** port transparently and that user re-authenticates. Verify each user's
  sign-in method before assuming clean migration; worst case for six known
  people is a re-invite — survivable, but communicate it (Helen and Elly are
  active prod-data users — don't let them hit a locked door unwarned).
- **`sub` continuity check:** RLS keys on the Clerk user id (`sub`). Confirm
  migrated users keep the **same** user id across instances, or their existing
  `household_members` rows (which store the dev `sub`) won't match. **If the id
  changes on migration, prod household membership must be re-keyed** — flag this
  as a verification, not an assumption. This is the sharpest hidden risk in the
  whole cutover.

### 6. Deploy prod (Cody → Vercel)
- With domain verified (2), key env-driven (3), Supabase re-pointed (4), users
  migrated (5): promote to prod.
- Hard-refresh before judging — stale JS gives false negatives (standing rule).

### 7. Cutover verification (Dan, on `ourprovisions.velayo.ai`, prod by URL)
- [ ] `performance` clerk resource now shows `clerk.ourprovisions.velayo.ai`,
      **not** `.accounts.dev`
- [ ] No "development keys" console warning
- [ ] A migrated user (start with your own account) signs in and sees **their**
      household + list — proves `sub` continuity + Supabase re-point
- [ ] A migrated user's `household_members` row resolves (no empty list = a
      re-keyed `sub`; if so, back to step 5's re-key note)
- [ ] Bundle no longer contains `pk_test_` (grep the built JS)

### 8. Resume the carried verifications — on prod-minted tokens
Only now do the two items this session opened with run, because the issuer is
finally correct:
- [ ] **Storage RLS** — anon denied + authenticated non-member denied for another
      household's `header.jpg`, from the app / raw fetch (not the SQL editor),
      with a member **control** case proving a valid request still succeeds
- [ ] **EXIF upright** — a genuinely rotated iPhone photo (orientation 6/3, not a
      screenshot) renders upright on a second device reading the stored artifact

---

## Watch-outs

- **DNS is the long pole.** Steps 1–3 are fast; step 2 gates everything after and
  is outside our control. Expect a wait between this session and the cutover.
- **Step 4 is the auth kill-switch.** Wrong issuer = total authenticated denial.
  It's reversible (re-point back), but every user is locked out until fixed.
- **`sub` continuity (step 5) is the quiet trap.** Membership rows store the
  Clerk id. If migration mints new ids, prod memberships silently orphan and
  users sign in to empty households. Verify before declaring success.
- **Don't stamp RLS/EXIF DONE until step 8 runs on prod tokens.** A dev-token
  pass is a false pass — the exact failure mode the verification discipline
  exists to catch.

## Rollback

If cutover breaks auth: re-point Supabase Third-Party Auth back to the dev
issuer (step 4 reversed) and redeploy the `pk_test_` build. Dev instance is
untouched by any of this, so the pre-cutover state is fully recoverable. Prod
data is never mutated by this spec — it is an auth-plane change only.
