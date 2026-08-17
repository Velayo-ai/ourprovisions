# SPEC — RLS and RPC authorization (membership integrity + unprotected tables)

**Status:** Active — **Parts 0 and 4a SHIPPED to dev and prod 2026-07-30. Parts 1, 2, 3, 4b, 5 outstanding.**
**Severity:** High — live production authorization gaps, no exploitation observed
**Scope:** OurProvisions
**Migration:** assign at build time — see Ordering. `028` and `029` are spent.
**Date:** 2026-07-30 (**revised 2026-07-31** — ordering inverted by measurement; Part 2's overload reasoning corrected; Parts 0 and 5 added)
**Verified against:** prod (`parpauldmbetptkmdwbd`) and dev (`zxwtxjjmssykhqrghouf`) via read-only MCP.
**Part 4 confirmed in BOTH dev and prod.** Parts 1-3 are prod-only and unverified on dev — see Dev/prod parity.

---

## Summary

Related authorization defects, found while investigating the Supabase advisory
that three tables have RLS disabled. The RLS gap turned out to be the *least*
severe on paper and the **most urgent in practice** — see Ordering.

| # | Defect | Severity | Touches client? | Status |
|---|---|---|---|---|
| **0** | `is_member_of` / `bootstrap_new_user` ignore `households.deleted_at` and `users.deleted_at` | **High** | No | ✅ **DONE — `029`, dev + prod 2026-07-30** |
| 1 | `join_household` performs no invite validation | **Critical** | Yes — signature change | ✅ **BUILT — `030`, dev only 2026-07-31; NOT on prod** |
| 2 | `bootstrap_new_user` trusts client-supplied `p_clerk_id` | **Critical** | Yes — signature change | Open |
| 3 | `household_members_insert` policy is `WITH CHECK (true)` | Medium | No | Open |
| **4a** | Full DML granted to `anon` on 3 RLS-off tables — **no account required** | **High** | No | ✅ **DONE — `028`, dev + prod 2026-07-30** |
| **4b** | RLS still disabled on those 3 tables; `authenticated` holds full unfiltered DML | Medium (High once populated) | No | Open |
| **5** | Five SECURITY DEFINER functions with no pinned `search_path` (originally six; `bootstrap_new_user` pinned by `029`, confirmed by observed read 2026-08-02) | Medium | No | Open |

### What shipped, and how it was verified

**Part 4a — migration `028`, applied dev + prod 2026-07-30.**
```sql
revoke all on public.known_stores      from anon;
revoke all on public.provision_cycles  from anon;
revoke all on public.shopping_sessions from anon;
```
Verified with `has_table_privilege` (which resolves PUBLIC grants and role inheritance — a
direct `relacl` read does not) **and independently from outside the database** with an
anon-key REST request. Prod `provision_cycles` went from `HTTP 206 / Content-Range: 0-0/56`
to `HTTP 401 / 42501 permission denied for table provision_cycles`.

**Part 0 — migration `029`, applied dev + prod 2026-07-30.** `is_member_of(uuid)` now joins
`users` and `households`, filtering `u.deleted_at is null` and `h.deleted_at is null`.
`bootstrap_new_user` 4-arg gained household-liveness on the invite branch (fall-through, not
raise), household-liveness plus `order by hm.joined_at desc` on the cold-start branch, and a
pinned `search_path`. Verified by calling the real function with an injected JWT subject
(`set_config('request.jwt.claims', …)`, which is what `auth.jwt()` reads):
`dead_test_house_200` `true → false`, three live households unchanged. Both replaced in place —
OIDs unchanged (dev 18480 / prod 43112), which matters because the `household-photos` storage
policies are keyed to the `uuid` overload.

> **⚠️ 4a is not 4b.** `authenticated` **still holds full unfiltered SELECT/INSERT/UPDATE/DELETE
> on all three tables**, and RLS is still disabled on all three. Any signed-in user can still
> read and modify every household's cycles, stores and sessions. 4a removed only the
> no-credential path. **4b remains required** — and now has a correct `is_member_of` to build on.

### The common root

**The server trusts client-supplied values instead of reading identity from the JWT.**

- `join_household` takes a bare `p_household_id` and joins you to it.
- `bootstrap_new_user` takes `p_clerk_id` and acts as whoever you name.

Both are `SECURITY DEFINER`. Both are granted to `anon` and `authenticated`.

The sharpest detail: **sound, server-side invite validation already exists** — inside
`bootstrap_new_user`, which checks code, `deleted_at`, `accepted_at`, and `expires_at`
in SQL. It is simply *unreachable from the path the client actually uses to accept an
invite*. This is not a missing security model. It is a correct security model that one
code path routes around. The fix is largely consolidation, not invention.

---

## Ordering — REVISED 2026-07-31 by measurement

> **⚠️ THIS SECTION PREVIOUSLY ARGUED `1 → 2 → 3 → 4` AND WAS WRONG.**
> It was reasoned **before exposure was measured**. Measuring it inverted the order.

**Ordering is by credential requirement first, regression risk second.**

Parts 1, 2 and 3 all require an **authenticated identity** — the attacker must sign up
through Clerk and hold a valid JWT before any of those defects does anything for them.
Part 4's tables required **nothing at all**: the anon key ships in the client bundle, RLS
was off, and full DML was granted. Counted directly rather than estimated, that was **56
live production `provision_cycles` rows readable and writable with no account**.

A defect reachable without a credential outranks one that needs an account, regardless of
how much client surface the fix touches. **Regression risk is a reason to be careful, not
a reason to be slow.** The original ordering put Part 4 last precisely because it touches
seven call sites in the core loop — a real concern, and the wrong tiebreaker against a
zero-barrier path.

**Actual shipped order: 4a → 0.** Both SQL-only, both applied to dev and prod on
2026-07-30, neither touching the client. 4a was one statement with near-zero regression
surface and closed the entire no-credential path; Part 0 unblocked correct membership
semantics that 4b now depends on.

**Remaining order: 1 → 2 → 3 → 4b, with 5 available any time** (five is six one-line
`ALTER FUNCTION` statements with no behaviour change; it can ride along with any of them).

### Why Part 4 split into 4a and 4b

The split is what made the re-ordering possible, and it rests on one structural fact:
**every function in both databases is `SECURITY DEFINER`, and `relforcerowsecurity` is
`false` on every table.** The RPCs therefore execute as the function owner and never
consult the `anon`/`authenticated` table grants at all — those grants govern **only**
direct PostgREST table access.

That makes revoking `anon` (4a) fully separable from enabling RLS and writing policies
(4b): one statement, no policy design, no RPC impact, no client impact. It closed the
zero-barrier path in isolation. 4b is the part that carries the seven-call-site regression
risk described below, and it is still outstanding.

### Why #3 still cannot come first

`household_members_insert` having `WITH CHECK (true)` looks like the headline finding —
an RLS policy on the membership table that permits any authenticated user to insert any
row. It is a real defect. **But tightening it alone would have closed nothing.**

`join_household` is `SECURITY DEFINER`, owned by `postgres`, which owns
`household_members`. `relforcerowsecurity` is `false` on that table (verified). **RLS
does not apply to the table owner**, so the function's INSERT never consults
`household_members_insert` at all. Rewriting that policy to the strictest predicate
imaginable leaves the RPC hole exactly as wide as it was.

A future session looking at these four items will find #3 the most visually alarming and
be tempted to lead with it. Don't. It is the *cleanup* that becomes correct once #1 and
#2 own joining; on its own it is security theatre.

### #4 is not downstream of #1 — different attack populations
*(This section was correct and is what drove the re-ordering. Retained.)*

Do not reason that fixing #1 diminishes #4. They are independent, and the barrier to
entry is what separates them:

- **#1 requires an authenticated account.** The attacker must sign up through Clerk and
  hold a valid JWT before `join_household` will do anything for them.
- **#4 requires nothing at all.** The anon key ships in the client bundle. No session, no
  account, no sign-up.

Fix #1 alone and an unauthenticated caller can still rewrite `closed_at` across all 50
live prod cycles. **#4 closes a zero-barrier path that #1 never touches.**

(There is a narrower true statement in the neighbourhood — once RLS is on, an attacker
who *does* hold an account and abuses #1 gains `is_member_of()` and reads through the new
policies. That is an argument for fixing #1, not an argument that #4 is redundant.)

### The regression risk is inverted from what it looks like
*(Still true — but it applies to **4b only**. 4a carried none of this risk, which is
exactly why the split let the urgent half ship first.)*

Parts 3 and 4 are SQL-only and Parts 1 and 2 change client-called signatures, so the
instinct is that 3 and 4 are the safe ones. **For #4b that instinct is wrong, and it is
the single most important scheduling fact remaining in this spec.**

**#4b is the only part that touches the core loop.** Seven live call sites — active cycle
resolution on every load, opening a cycle, starting and closing shopping sessions. A
policy that is subtly too narrow does not fail loudly at a security boundary; it fails as
the app quietly not finding the active cycle for everyone, on every session.

#1 and #2 touch **edge paths**: invite accept and cold start. Real, and they must be
tested with genuinely new accounts — but they are traversed rarely and by few users at a
time, and a failure there is loud and localized.

So: **"no client changes" reads as safer and here it is not.** Budget the most dev-preview
regression time for #4, not the least, and exercise all seven call sites (tabled in Part
4) before promoting it.

---

## Part 1 — `join_household` performs no invite validation

### Finding

```sql
CREATE OR REPLACE FUNCTION public.join_household(p_household_id uuid)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
```

It resolves the caller's identity correctly from `auth.jwt()->>'sub'` — that part is
right — and then inserts a `household_members` row for whatever `p_household_id` it was
handed. There is no invite parameter, no membership check, no authorization of any kind.

All invite validation for this path lives in JavaScript, `useProvisions.js:1114-1116`
(not found / already used / expired). The client checks, then calls an RPC that doesn't.

`EXECUTE` is granted to both `anon` and `authenticated` (verified).

### Exploit path (one line)

```js
await supabase.rpc('join_household', { p_household_id: '<any-household-uuid>' })
```

— from the browser console of any signed-in account, no invite, landing as `member` with
full `is_member_of()` read/write on that household's `list_items`.

Household UUIDs are not enumerable through RLS, but they travel in invite URLs and sit in
client state. Treat them as guessable-by-leak, not secret.

### Fix

> **⚠️ CARRY FORWARD FROM `029` (Part 0) — the replacement MUST include
> `households.deleted_at is null`.**
>
> `029` closed the dead-household hole on `bootstrap_new_user`'s invite branch by making
> household liveness part of invite *resolution*, so an invite pointing at a soft-deleted
> household simply does not resolve. **`join_household` is an unguarded second door into
> exactly that state** — it takes a bare household id today, and even once it validates an
> invite code, omitting the liveness check reopens the hole `029` just closed.
>
> Note the shape `029` chose and match it: **fall through, do not raise.** A raise rolls back
> the whole transaction; on the bootstrap path that killed the user upsert and wedged signup
> permanently (`useProvisions.js:319` throws before `:323` clears `sessionStorage`, so the
> stale code re-fires on every reload). Verify whether the same wedge applies on the
> `join_household` path before choosing to raise there.

Replace the `uuid` signature with a `text` invite-code signature and move the validation
server-side, reusing the predicate already proven in `bootstrap_new_user`:

```sql
drop function if exists public.join_household(uuid);

create or replace function public.join_household(p_invite_code text)
returns json language plpgsql security definer set search_path to 'public'
as $$
declare
  v_clerk_id      text;
  v_user_id       uuid;
  v_invite_id     uuid;
  v_household_id  uuid;
  v_existing_id   uuid;
  v_was_revived   boolean := false;
begin
  v_clerk_id := auth.jwt()->>'sub';
  if v_clerk_id is null then
    raise exception 'join_household: no clerk subject on JWT';
  end if;

  select id into v_user_id from users where clerk_id = v_clerk_id;
  if v_user_id is null then
    raise exception 'join_household: no user for clerk_id %', v_clerk_id;
  end if;

  -- Server-side invite validation. Same predicate as bootstrap_new_user.
  select id, household_id into v_invite_id, v_household_id
  from household_invites
  where code = upper(p_invite_code)
    and deleted_at is null
    and accepted_at is null
    and expires_at > now();

  if v_invite_id is null then
    raise exception 'join_household: invite not valid';
  end if;

  select id into v_existing_id
  from household_members
  where household_id = v_household_id and user_id = v_user_id;
  v_was_revived := v_existing_id is not null;

  -- Atomic upsert: revive a soft-deleted row or insert fresh (migration 011 behaviour).
  insert into household_members (household_id, user_id, role, deleted_at)
  values (v_household_id, v_user_id, 'member', null)
  on conflict (household_id, user_id)
  do update set deleted_at = null, role = 'member';

  update household_invites
  set accepted_by = v_user_id, accepted_at = now()
  where id = v_invite_id;

  return json_build_object('joined', true, 'revived', v_was_revived,
                           'user_id', v_user_id, 'household_id', v_household_id);
end;
$$;

revoke execute on function public.join_household(text) from anon;
```

**Client change — `useProvisions.js` `acceptInvite` (~1102):**

- Pass `code`, not `invite.household_id`, to the RPC.
- **Delete** the now-redundant `household_invites` update at ~1129-1132 — the RPC burns
  the invite inside the same transaction, which also closes the current window where the
  join succeeds and the invite-burn fails independently.
- **Keep** the pre-flight lookup at ~1107-1116. It stays for *error message quality*
  ("This invite has expired") — but it is no longer the gate, and the code should say so
  in a comment. This is the same principle as SPEC_anon_catalog_exposure: the client
  states its intent, the server enforces it.

### Verify

1. **Exploit is closed.** Signed in as a member of household A, browser console:
   ```js
   await supabase.rpc('join_household', { p_household_id: '<household-B-uuid>' })
   ```
   Expect a *function-does-not-exist* error (signature gone), not a success.
2. **Stale-parameter attempt fails.** `rpc('join_household', { p_invite_code: '<expired
   or already-accepted code>' })` → raises `invite not valid`. Confirm no
   `household_members` row was written.
3. **Happy path intact on dev preview.** Generate an invite from household A, accept it
   from a second account, confirm join + banner + list visible.
4. **Rejoin path intact.** Leave the household (soft-delete), accept a fresh invite,
   confirm the row is *revived* (`revived: true`) rather than tripping
   `UNIQUE(household_id, user_id)` — this is the migration-011 regression to watch.

   This path is heavily exercised in prod: 56 total memberships against 21 users, and 52
   accepted invites against 74 issued. That churn means the revive branch is well-trodden
   rather than theoretical — mildly reassuring going in, and a reason to treat a
   regression here as high-impact rather than an edge case.
5. **Grants:**
   ```sql
   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
          pg_get_userbyid(a.grantee) as grantee
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
   where n.nspname='public' and p.proname='join_household';
   ```
   Expect exactly one signature (`p_invite_code text`), `anon` absent.

**~~Open question for build~~ — ANSWERED 2026-07-31.** The pre-flight lookup worked
because **`invites_select` was `qual = true`** — it permitted *every* authenticated user
to read *every* invite row. That is not a policy that happened to allow the read; it is
the leak that made the exploit trivial. The client does **not** need UPDATE after the RPC
takes over the burn, and no longer has it.

---

## Part 1 — BUILT (dev). Migration `030`, `db5ec66`. Applied dev 2026-07-31; **NOT on prod.**

*Merged from `SPEC_PATCH_rls_authorization_part1.md`, 2026-07-31 — §C–§G, with the
as-built corrections noted inline. The patch's §A and §B were already folded into the
Ordering section and the summary table above.*

### The defect was worse than this spec originally described

No out-of-band code is required. It is a two-call chain available to any account that can
sign up:

1. Sign up. Any account.
2. `select household_id from household_invites` — `qual = true` returned **every invite
   row in the system**, all households, all states.
3. `rpc('join_household', { p_household_id: '<any leaked uuid>' })` — checked nothing.

**Blast radius, confirmed on prod (no longer TBD): 74 invite rows leak 15 distinct
`household_id` values, of which 9 are still-live households — 9 of 23 live prod
households, 39%.** The other 6 are soft-deleted and are not blast radius post-`029`.

**Why `live_redeemable = 0` was not protection:** step 3 never consulted the invite.
Expiry, acceptance and soft-deletion were all irrelevant — a dead invite still leaked a
permanently valid household UUID, and the UUID was the only input the RPC took.

**Two halves, one commit.** `join_household` alone leaves UUIDs readable but worthless;
`invites_select` alone stops the leak while every already-harvested UUID works forever.
The spec's original framing of the policy fix as follow-on hygiene was wrong.

### §C Prerequisites — both resolved

- **C1 `code` uniqueness — the patch's premise was WRONG.** It called for a partial unique
  index on live rows, asserting no unique constraint existed. **`household_invites_code_key`
  already exists in both environments and is GLOBAL**, i.e. strictly stronger than the
  proposed partial index. Duplicate census 2026-07-31, dev and prod: **zero**, all-rows and
  live-only. **The `CREATE UNIQUE INDEX` was dropped from §D4 and the existing index left
  untouched.** It was invisible in the column inventory because
  `information_schema.columns` does not report constraints — resolve via `pg_indexes`.
- **C2 case normalization — built.** The RPC normalizes with `upper(trim(p_invite_code))`.
  Client and `createInvite` previously agreed on case only by accident.

### §D The RPC contract — as built

`join_household(p_invite_code text) returns json` → `{household_id, household_name, revived}`.
The `uuid` overload is **dropped, not replaced** — its existence was the exploit.

Check order, pinned: resolve caller from JWT → normalize → resolve invite **state-blind** →
live-membership short-circuit → invite exists and not soft-deleted → household liveness →
accepted → expired → upsert → **stamp `accepted_at` in the same transaction** → return.

- **Deviation from §D1, as built:** the patch ordered the membership check *before* invite
  resolution, but the target household is unknowable until the invite resolves. The invite
  is resolved **state-blind** first, then membership short-circuits. Preserves the intent
  without inverting causality.
- **State-blind ignores `deleted_at` too — a recorded decision, not predicate placement.**
  It decides one case: an existing live member tapping a soft-deleted link succeeds as a
  no-op. Leaks nothing (they can already read the household), grants nothing (the
  short-circuit requires live membership). Revoking an invite governs who may **enter**;
  eviction is `remove_member`'s job.
- **The no-op does not consume the invite** — verified on dev: `accepted_at`/`accepted_by`
  still NULL after a member re-taps.
- **Step 8 (server-side stamp) is not optional.** Leaving the stamp client-side meant a
  direct RPC caller who skipped the UPDATE held a **permanently reusable invite**.
- **Dead household folds into `Invite not found.`** — matches `029`'s precedent: dead is
  absent, not a special error state.

### §E Client — as built (`useProvisions.js`)

Pre-flight lookup, the three JS validations and the client-direct `accepted_at` UPDATE all
deleted; RPC call switched to `p_invite_code`; the households fetch and success toast read
`household_id` / `household_name` from the RPC return. The lookup could not merely be
simplified — with `invites_select` members-only, a not-yet-member cannot resolve a code at
all. The local `internalUserId` const became unused and was removed.

### §F Verification — PARTIAL. See Unfinished.

**Passed on the deployed dev preview, two real accounts:** F1 (fresh accept), F3 (member
re-taps a consumed link — succeeds, proving the short-circuit precedes the accepted-check),
F4 (member taps an **expired** link — succeeds).

**Not run: F2, F5, F6** — `revived` flag, lowercase normalization, the three error strings.
All low-risk literals in the function body.

**F7/F8 verified structurally, not from a running app.** `supabase` is module-scoped rather
than on `window`, and there is no Supabase token in `localStorage` because auth is
Clerk-brokered (tokens minted per request). F7 rests on `join_household_uuid = 0` plus
`overloads = 1`; F8 on the policy `qual`. Both honest, neither from a console query.
**A second account that is a member of nothing would settle F8 properly.**

### §G Deliberately out of scope

- **Multi-use invites** — single-use preserved exactly as-is here; lifting it is a schema +
  product change and does not belong inside an exploit fix that may need a clean revert.
  Design now settled (Option A) — see ROADMAP NEXT.
- **`created_by` is not pinned to the caller** — a member can mint an invite in their own
  household attributed to another member. Same root family, much smaller blast radius;
  **folded into Part 2.**

---

## Part 2 — `bootstrap_new_user` trusts a client-supplied identity

### Finding

The live 4-arg overload takes `p_clerk_id text` as a **parameter** rather than reading
`auth.jwt()->>'sub'` the way `join_household` does. It is `SECURITY DEFINER` and `anon`
holds `EXECUTE`. For an app whose entire auth model is Clerk, a server function that
accepts the user's identity as an argument is the more structural of the two defects.

Two further problems in the same function:

- **The live overload is the only one missing `SET search_path`.** The other three pin it
  to `'public'`. On a `SECURITY DEFINER` function that is a real hardening gap; Supabase's
  own advisors flag it as `function_search_path_mutable`.
- **Four overloads exist, all granted to `anon` + `authenticated`:**

  | Signature | Status |
  |---|---|
  | `(text, text)` | dead |
  | `(text, text, boolean)` | dead |
  | `(text, text, text)` | dead |
  | `(text, text, text, text)` | **live** — what the client calls |

  Three are dead code carrying live `SECURITY DEFINER` + live grants.

### Exploit path (one line)

```js
await supabase.rpc('bootstrap_new_user', { p_clerk_id: '<victim clerk id>', p_email: 'attacker@x.com', p_invite_code: '<any valid code>' })
```

— overwrites the victim's `email`/`full_name` via the upsert and, with any valid invite,
joins a household *as them*. Callable with the anon key, unauthenticated.

### Fix

Derive identity from the JWT; drop the parameter and the dead overloads; restore
`search_path`.

```sql
drop function if exists public.bootstrap_new_user(text, text);
drop function if exists public.bootstrap_new_user(text, text, boolean);
drop function if exists public.bootstrap_new_user(text, text, text);
drop function if exists public.bootstrap_new_user(text, text, text, text);

create or replace function public.bootstrap_new_user(
  p_email text, p_invite_code text default null, p_full_name text default null)
returns json language plpgsql security definer set search_path to 'public'
as $$
declare
  v_clerk_id text;
  ...
begin
  v_clerk_id := auth.jwt()->>'sub';
  if v_clerk_id is null then
    raise exception 'bootstrap_new_user: no clerk subject on JWT';
  end if;
  -- body otherwise unchanged from the live 4-arg version, substituting
  -- v_clerk_id for p_clerk_id throughout.
  ...
end;
$$;

revoke execute on function public.bootstrap_new_user(text, text, text) from anon;
```

> **⚠️ CORRECTED 2026-07-31 — the overload-drop reasoning below was wrong.**
>
> This spec previously argued that a future 2-key call would **silently land on the legacy
> 2-arg body**, and that the drops therefore convert a silent-wrong-function failure into a
> **loud 404**. Both statements are false once parameter defaults are visible.
>
> **The live 4-arg overload carries two defaults** — `p_invite_code text DEFAULT NULL::text`,
> `p_full_name text DEFAULT NULL::text` (`pronargdefaults = 2`, identical dev and prod). All
> four prod overloads are therefore satisfiable by a 2-argument call:
>
> | overload | callable with 2 args? |
> |---|---|
> | `(text, text)` | yes — exact arity |
> | `(text, text, boolean DEFAULT false)` | yes — via default |
> | `(text, text, text DEFAULT NULL)` | yes — via default |
> | `(text, text, text DEFAULT NULL, text DEFAULT NULL)` | yes — via two defaults |
>
> So a 2-key call is **ambiguous**, raising `function … is not unique` — not a quiet landing
> on legacy code. And **after the drops it does not 404**: the surviving function is callable
> with 2, 3 or 4 arguments via its own defaults, so such a call resolves cleanly onto the
> modern body.
>
> **Net: the drops are safer than described, but they are a real behavioural change, not a
> no-op.** Calls that are ambiguous today will execute current logic afterwards. The drops
> remain inert *for the current client only*, which always posts four keys including
> `p_full_name` — the one parameter unique to the surviving overload.
>
> **Why this was missed:** every signature in this spec was read with
> `pg_get_function_identity_arguments()`, which **strips parameter defaults by design** — it
> returns the identity signature for `DROP`/`ALTER`, not the declaration. It is not a safe
> basis for authoring `CREATE OR REPLACE`. **Use `pg_get_function_arguments()`.** This cost a
> failed migration run: `ERROR 42P13: cannot remove parameter defaults from existing function`,
> whose `HINT` suggests `DROP FUNCTION` — **do not take that hint**, dropping changes the OID.

**Four build-time traps in this one:**

1. **`CREATE OR REPLACE` will not work here.** The new signature `(text, text, text)` is
   *identical in type* to the old `(p_clerk_id, p_email, p_invite_code)` overload, and
   Postgres refuses to rename input parameters on replace (`cannot change name of input
   parameter`). The `DROP`s must land first, in the same migration.
2. **Restore `returning id into v_user_id` on the upsert.** The live 4-arg version dropped
   it; `v_user_id` is always null after the insert and only gets populated by the
   `if v_user_id is null` fallback `select`. It works by accident. Make it deliberate.
3. **`users.email` is UNIQUE.** `p_email` remains client-supplied. A caller submitting
   another user's email now hits a constraint violation rather than silently taking it
   over — acceptable, but the error surfaces to the user. Consider sourcing email from the
   JWT claim too if Clerk populates it; otherwise leave and note.
4. **✅ RESOLVED — the separate live bug in this function is already fixed.** Step 3 used to
   resolve the caller's household with `where user_id = v_user_id and deleted_at is null
   limit 1`, checking `household_members.deleted_at` but *not* `households.deleted_at`, with
   no `ORDER BY`. **Migration `029` (Part 0) fixed it** on dev and prod: it now joins
   `households`, filters `h.deleted_at is null`, and orders by `hm.joined_at desc`. It was
   correctly kept as its own commit rather than bundled here.
   **What this means for Part 2:** you are now rewriting a function whose body has *already
   changed*. **Do not author the new version from this spec's code block or from memory —
   read the live `prosrc` first.** The current body also carries a
   `DO NOT "FIX" THIS BACK TO A RAISE` comment on the invite branch and a pinned
   `search_path`; both must survive the rewrite.

**Client change — `useProvisions.js:311-317`:** drop `p_clerk_id` from the `.rpc()` call.
`clerkId` is still needed locally for `clerkIdRef.current` (:326) — do not delete the
variable, `CI=true` on Vercel treats the unused-var warning as a build error.

### Verify

1. **Impersonation closed.** With the anon key and no session, call the RPC with a
   `p_clerk_id` — expect *function does not exist* (parameter gone).
2. **Anon cannot call it at all:** same query shape as Part 1 step 5, `anon` absent.
3. **Exactly one overload remains.**
4. **`search_path` pinned:** `select proname, proconfig from pg_proc where proname =
   'bootstrap_new_user';` → expect `{search_path=public}`.
5. **Cold-start regression (the risky one).** A genuinely new account must still
   bootstrap. Confirm on the dev preview that the Clerk token is present *before* the
   bootstrap call — `createSupabaseClient(getTokenRef.current)` at :299 suggests it is,
   but if the JWT is absent at first call the new function raises where the old one
   silently proceeded. **Test brand-new sign-up, not just an existing account.** Test
   both sign-up-with-invite and sign-up-without.

---

## Part 3 — `household_members_insert` is `WITH CHECK (true)`

### Finding

| Policy | Cmd | Roles | USING | WITH CHECK |
|---|---|---|---|---|
| `household_members_select` | SELECT | authenticated | `is_member_of(household_id)` | — |
| `household_members_insert` | INSERT | authenticated | — | **`true`** |

No UPDATE or DELETE policy exists, so those are denied to the client entirely — member
removal already flows through `SECURITY DEFINER` soft-delete, which is the right shape.

### Exploit path (one line)

```js
await supabase.from('household_members').insert({ household_id: '<any>', user_id: '<own>', role: 'owner' })
```

— note `role: 'owner'`, which the RPC path never grants; the check constraint permits it.

### Fix

Once Parts 1 and 2 own joining, no client-side INSERT is needed at all — the RPCs bypass
RLS as the table owner. Drop the policy:

```sql
drop policy household_members_insert on public.household_members;
```

Prefer dropping over scoping. A scoped-but-present policy invites someone to widen it
later; absence states that membership is RPC-only.

### Verify

1. Direct client insert now fails with an RLS violation.
2. Invite accept still works (covered by Part 1 verification) — proving the RPC path is
   genuinely owner-privileged and unaffected.
3. `select polname, polcmd from pg_policy where polrelid =
   'public.household_members'::regclass;` → SELECT only.

---

## Part 4 — RLS disabled on `known_stores`, `provision_cycles`, `shopping_sessions`

> **SPLIT 2026-07-31 into 4a (DONE) and 4b (OPEN).**
>
> **✅ 4a — revoke `anon` DML. Migration `028`, dev + prod 2026-07-30.** Closed the entire
> no-credential path in one statement, with near-zero regression surface: the RPCs are all
> `SECURITY DEFINER` and never consult these grants, and no signed-out client path touches
> these tables (the only anon-key reads in the client are `catalog_items` and
> `category_avg_prices`, `useProvisions.js:246,266`). Verified from outside the database —
> prod `provision_cycles` went `206 / Content-Range: 0-0/56` → `401 / 42501`.
>
> **⬜ 4b — enable RLS, write membership policies, revoke `authenticated`. STILL OPEN.**
> **`authenticated` retains full unfiltered SELECT/INSERT/UPDATE/DELETE on all three tables,
> and `relrowsecurity` is still `false` on all three.** Any signed-in user can read and
> modify every household's cycles, stores and sessions. Everything below about policy design
> and the seven-call-site regression risk applies to **4b**.
>
> One thing 4a changed for the better: 4b now builds on a **correct `is_member_of`** (Part 0 /
> `029`), which checks household and account liveness. Policies written against it inherit
> that.
>
> **Blocked on: NOTHING. Part 4 has no open blocker as of 2026-07-31.** The one dependency
> ever recorded against it — that `is_member_of()` ignored `households.deleted_at`, so
> membership in a soft-deleted household would satisfy the new policies — was closed by
> **`029_household_liveness.sql`** (shipped dev + prod). The live predicate carries
> `h.deleted_at is null`, confirmed by `pg_get_functiondef` on both projects. See the
> corrected Follow-on bullet at the end of this spec; any older text asserting the gap is
> still open is stale.

### Finding

All three have `relrowsecurity = false`. As found, they held the full Supabase default
grant — SELECT, INSERT, UPDATE, DELETE (plus TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) — to
both `anon` and `authenticated`. With RLS off, the table grant is the only gate.
**`anon` was revoked by `028`; `authenticated` still holds all of it.**

All three carry `household_id uuid NOT NULL` FK → `households.id`. **No join path needed;
`is_member_of(household_id)` applies directly, exactly as on `list_items`.**

### Exploit path (one line)

```js
await supabase.from('provision_cycles').update({ closed_at: null }).neq('id', '<impossible>')
```

— anon key, no session, reopens every closed cycle across all 23 live households.

### UPDATE is the sharp end, not DELETE

I initially framed this as a delete/truncate risk. That was the wrong emphasis.

**Every FK in this schema is `NO ACTION`** (verified — the `catalog_items` convention in
CLAUDE.md holds schema-wide). Postgres therefore blocks deleting any `provision_cycles`
row referenced by `list_items.cycle_id`, and blocks TRUNCATE on a referenced table
outright. The 50 live prod cycles are not trivially destroyable.

**UPDATE is entirely unconstrained, and FKs do nothing to blunt it.** An attacker — or a
buggy client, or a stray script — can rewrite `household_id`, `closed_at`, or
`cycle_type` on any row.

That is precisely the corruption shape that 026 and 031 exist to fix: **items in closed
cycles, and two concurrent open cycles.** Rewriting `closed_at` produces the first;
rewriting `household_id` or clearing `closed_at` on a second row produces the second.

**State plainly: this is not evidence that anyone did it.** The cycle bugs we have
observed have client-side causes with reproductions, and those reproductions stand on
their own. No exploitation has been observed and none is suspected.

The point is narrower and worth carrying: **until Part 4 lands there is no structural
guarantee against that state arising outside the client path.** That bounds how much
confidence 031's verification can give us. A cycle-integrity detector that finds zero
violations proves the client paths are correct; it cannot prove the invariant *holds*,
because nothing at the database level enforces it. After Part 4, a clean detector run
means something stronger.

### Also: these are the most location-sensitive tables in the schema

`known_stores.lat/lng` are NOT NULL; `shopping_sessions` carries `gps_lat`/`gps_lng` plus
`total_spent`. Once populated, an open SELECT to `anon` yields precise coordinates of
where a household shops, when, and how much they spend. Both tables are empty *today* —
which is exactly why this should land before the store/session features start writing.
`provision_cycles` (50 live rows across 23 live households) is comparatively dull data but
is the one currently live and currently exposed.

### Fix

> **⚠️ CORRECTED 2026-08-16 — the fix block below rests on a FALSE PREMISE and was NOT
> built as written. See `032_rls_cycle_tables.sql` for what actually shipped.**
>
> This section assumed all three tables were policy-free. **They are not.** Confirmed
> identical in dev and prod via `pg_policy`:
>
> | table | existing policies | state |
> |---|---|---|
> | `known_stores` | `known_stores_{select,insert,update}_household` | dormant (RLS off) |
> | `shopping_sessions` | `sessions_select_household`, `sessions_insert_own`, `sessions_update_own` | dormant (RLS off) |
> | `provision_cycles` | **none** | the only genuinely missing set |
>
> Those six are **not fossils.** They were deliberately authored in
> `archive/005_provision_cycles_sessions_stores.sql` with stated rationale and
> **repaired once already** by `014_fix_authuid_rls.sql`, which fixed the
> `auth.uid()`-Clerk-string-vs-`uuid` debt and explicitly left them as "definitions
> only" because RLS was off. They encode a design this section does not:
> **`shopping_sessions` writes are per-user** ("a user can only create a session for
> themselves — can't start a session on behalf of Helen"), and **both SELECT policies
> carry `deleted_at is null`.**
>
> **Creating the uniform block below alongside them would have been actively harmful.**
> Permissive policies on the same command are **OR'd**, so the widest wins:
> - SELECT → `(is_member_of AND deleted_at IS NULL) OR is_member_of` = `is_member_of`,
>   **defeating the soft-delete filter**;
> - `shopping_sessions` UPDATE → `(user_id = me) OR is_member_of(...)`, **silently
>   widening a deliberate per-user rule to household-wide**.
>
> **As built (Dan's call, 2026-08-16):** keep the existing six as the design of record;
> create only the three missing `provision_cycles` policies; and repair two real gaps —
> `sessions_update_own` and `known_stores_update_household` both had `USING` with **no
> `WITH CHECK`**, leaving the UPDATE post-image unconstrained (a row could be moved to
> another `household_id`), and `sessions_update_own` never checked membership at all.
> Nine policies total, no DELETE policy anywhere, RLS enabled on all three.
>
> **The lesson generalizes: this spec's `pg_policy` reads covered `household_members`
> and `list_items` but never the three tables Part 4 is about.** Grep the live catalog
> before authoring policy SQL, exactly as the BUILD rules say to grep before editing code.

*Superseded block, retained for the record:*

```sql
alter table public.known_stores      enable row level security;
alter table public.provision_cycles  enable row level security;
alter table public.shopping_sessions enable row level security;
```

Then, for **each** of the three tables (`<t>`), SELECT / INSERT / UPDATE only:

```sql
create policy <t>_select on public.<t> for select to authenticated
  using (is_member_of(household_id));
create policy <t>_insert on public.<t> for insert to authenticated
  with check (is_member_of(household_id));
create policy <t>_update on public.<t> for update to authenticated
  using (is_member_of(household_id)) with check (is_member_of(household_id));
```

**No DELETE policy** — deliberately. This mirrors `list_items` on the three commands the
client actually uses and stops there. With RLS on and no DELETE policy, deletes are
denied to the client outright, which is the correct end state: all three tables carry
`deleted_at` and soft-delete is the convention, so a hard delete from the client is
something no code does and nothing should start doing casually.

Same reasoning as dropping `household_members_insert` rather than scoping it (Part 3): a
policy permitting an operation no code performs is future surface, and a present-but-
scoped policy invites widening later. If a genuine delete need appears, it should arrive
as a deliberate `SECURITY DEFINER` RPC — which bypasses RLS anyway and so needs no policy
here. This also matches `household_members`, which has no UPDATE or DELETE policy for
exactly this reason.

**Enable and policies must be in the same migration.** Enabling RLS with no policies
denies all access and takes the cycle features down.

**Client paths that will start hitting these policies** (all direct `.from()` calls with
the anon-key client — *not* routed through RPCs, so RLS applies):

| Site | Table | Commands needed |
|---|---|---|
| `useProvisions.js:224` `loadActiveCycle` | provision_cycles | SELECT |
| `useProvisions.js:690`, `834`, `906` | provision_cycles | INSERT (+ `.select()` → SELECT) |
| `useProvisions.js:963` | provision_cycles | SELECT |
| `useProvisions.js:878` | shopping_sessions | INSERT (+ `.select()` → SELECT) |
| `useProvisions.js:923` | shopping_sessions | UPDATE |

Note the `.insert().select().single()` chains — those need **both** INSERT and SELECT
policies or they fail on the returning clause. The three-policy set above covers it.

No client path performs a DELETE on any of the three — confirmed by the grep behind this
table — which is why no DELETE policy is created.

`known_stores` has **zero** references in `src/` — schema is ahead of code there, so its
policies are pre-emptive and cannot regress anything.

### `shopping_sessions` scoping — decided, with a flag

> **⚠️ CORRECTED 2026-08-16 — this decision was made in ignorance of an existing one.**
> The reasoning below concluded "household-scoped" without knowing that
> `sessions_insert_own` / `sessions_update_own` **already scoped writes per-user**, and
> had done since `archive/005`, with the rationale *"a user can only create a session for
> themselves (can't start a session on behalf of Helen)."*
>
> **As built: SELECT is household-scoped, writes are per-user.** That is a better answer
> than either section alone reached — the coordination UI can show the household its
> sessions, while nobody can open or wrap up a trip in someone else's name. The
> generalize-to-events flag below still stands, and applies to the **SELECT** policy,
> which is the one that exposes GPS and spend.

*Original reasoning, retained:*

**Decision: household-scoped**, matching `list_items` and the other two tables.

`shopping_sessions` is the one table with a genuine choice — it carries both
`household_id` and a NOT NULL `user_id`, so it could scope per-user instead. Household
scope means every member sees every other member's sessions, GPS coordinates, and spend.

For Madbury — a real household of people who live together and already share a list —
that is correct and consistent with "the shared list is sacred."

**Flag for revisit when "context" generalizes to events.** A loose-membership standalone
event (a trip, a party, a one-off crew) is a different proposition: GPS coordinates plus
per-session spend visible to every participant is a reasonable default among housemates
and an unreasonable one among near-strangers who joined a shared event. When the context
model generalizes beyond households, this policy is the first thing to revisit — it will
not generalize with it. Cross-reference `velayo_crews` / `velayo_crew_members`, which are
already in the schema and empty.

### Verify

1. **Anon is shut out.** With the prod/dev anon key and no session, via PostgREST:
   ```powershell
   $anon = "<anon key>"; $h = @{ apikey = $anon; Authorization = "Bearer $anon" }
   Invoke-RestMethod -Uri "https://<ref>.supabase.co/rest/v1/provision_cycles?select=id" -Headers $h
   ```
   Expect `[]` (was: all 50 live rows, every household). Repeat for the other two tables.
2. **Anon UPDATE is refused.** PATCH `provision_cycles?id=eq.<known id>` with
   `{"closed_at": null}` → 401/403 or 0 rows affected. Confirm the row is unchanged.
3. **Cross-household read is refused.** Signed in as household A, `select` on
   `provision_cycles` returns only A's rows.
4. **Regression sweep on the dev preview**, exercising every site in the table above:
   open a planned cycle, start a shopping session, close the session, close the cycle
   with roll-forward, reload and confirm the active cycle resolves.
5. **Do not verify with the SQL editor alone** — it runs as `postgres` and bypasses RLS.
   It will happily return all rows after a correct fix. Only an anon-key request through
   PostgREST exercises a policy. (Same trap as SPEC_anon_catalog_exposure.)
6. **Advisor clean:** re-run `get_advisors` → the `rls_disabled` advisory should be gone.

---

## Part 5 — five SECURITY DEFINER functions with no pinned `search_path`
*(NEW 2026-07-31 — found while fixing Part 0. **Corrected six → five 2026-08-02:** the sixth,
`bootstrap_new_user`, was pinned by `029`; an observed read-only `proconfig is null` query on
**both** prod `parpauldmbetptkmdwbd` and dev `zxwtxjjmssykhqrghouf` returns the identical
five-row set below — dev and prod agree, no drift.)*

### Finding

`proconfig` is `NULL` in **both** environments on **five** `SECURITY DEFINER` functions
(observed 2026-08-02, read-only; prod and dev return the identical set):

| function | status |
|---|---|
| `archive_trip_items(uuid, uuid[])` | open |
| `close_cycle(uuid, uuid[])` | open |
| `get_active_cycle(uuid)` | open |
| `get_household_user_ids(uuid)` | open |
| `match_known_store(uuid, float8, float8)` | open |
| `bootstrap_new_user(text,text,text,text)` | ✅ fixed by `029` — confirmed absent from the `proconfig is null` set on prod + dev, 2026-08-02 |

A `SECURITY DEFINER` function executes with the owner's privileges. With a mutable
`search_path`, a caller who can create objects in a schema earlier on that path can shadow
a table or function the body references and have it run as the owner. That is the standard
privilege-escalation shape, and it is why Supabase's own advisor flags it.

**Note the inversion `029` corrected:** the three legacy `bootstrap_new_user` overloads
queued for removal in Part 2 all pin `search_path=public`, while the *surviving* overload
did not. The hardened ones were the ones being dropped.

### Fix

One line each, **no behaviour change** — this does not require `CREATE OR REPLACE` and so
cannot disturb bodies, defaults, or OIDs:

```sql
alter function public.archive_trip_items(uuid, uuid[])            set search_path = public, extensions;
alter function public.close_cycle(uuid, uuid[])                   set search_path = public, extensions;
alter function public.get_active_cycle(uuid)                      set search_path = public, extensions;
alter function public.get_household_user_ids(uuid)                set search_path = public, extensions;
alter function public.match_known_store(uuid, float8, float8)     set search_path = public, extensions;
```

### Verify

```sql
select proname, pg_get_function_arguments(oid) as args, proconfig
from pg_proc
where pronamespace = 'public'::regnamespace and prosecdef and proconfig is null;
```
→ expect **zero rows**. Re-run `get_advisors` and confirm the mutable-`search_path`
warnings clear.

**Scheduling:** independent of every other part, no client surface, no policy design. It
can ride along with any other commit or ship alone.

---

## Commits and migrations

Parts 1 and 2 **change RPC signatures the client calls**. They are coordinated SQL +
`useProvisions.js` changes, not pure migrations — the migration and the client edit must
ship together or the app breaks between them. Parts 3, 4b and 5 are SQL-only.

Per the BUILD rules, **each part is its own scoped commit** — one tested change before the
next:

| Part | Commit | Migration | Client | Status |
|---|---|---|---|---|
| 4a | `security(db): revoke anon DML on known_stores, provision_cycles, shopping_sessions` | **`028`** | none | ✅ `559bfca`, dev + prod |
| 0 | `security(db): household + account liveness in is_member_of and bootstrap_new_user` | **`029`** | none | ✅ `8944f63`, dev + prod |
| 1 | `fix(030): join_household validates the invite server-side; lock invites_select to members` | **`030`** | `useProvisions.js` acceptInvite | ✅ `db5ec66`, **dev only** |
| 2 | `fix(NNN): bootstrap_new_user derives clerk_id from JWT` | assign at build | `useProvisions.js` bootstrap call | Open |
| 3 | `fix(NNN): drop permissive household_members_insert policy` | assign at build | none | Open |
| 4b | `fix(NNN): enable RLS + household policies on cycle tables` | assign at build | none | Open |
| 5 | `fix(NNN): pin search_path on remaining SECURITY DEFINER functions` | assign at build | none | Open |

**Migration numbers are deliberately not assigned here** — assign at build time against
the then-current sequence. **`028`, `029` and `030` are spent. `027` is RETIRED — never written to disk, and the work is now `031`**
(cycle-integrity; referenced from ROADMAP and from inside the bodies of `025` and `026`,
see `SPEC_cycle_integrity_031.md`) — **do not create a 027 stub; the 026→028 gap is honest drift**. Check the `migrations/` directory rather
than trusting any number written in a spec.

Deploy dev → verify on `dev.ourprovisions.velayo.ai` (not localhost) → then prod. Parts 1
and 2 carry live client-facing regression risk (invite accept, cold start); do not batch
their dev verification.

---

## Dev/prod parity

**Part 4 — confirmed in BOTH environments.** A `list_tables` run against dev earlier on
2026-07-30 (before the prod read-only MCP server existed) showed `provision_cycles`,
`known_stores`, and `shopping_sessions` all with RLS disabled in dev, matching prod. The
Part 4 gap is environment-wide and the Part 4 migration is expected to apply to both.

**Parts 1-3 — prod-only, UNVERIFIED on dev.** The RPC definitions, grants, and
`household_members` policies behind Parts 1, 2, and 3 were read from prod only. Nothing
about dev's state on those three has been checked.

Run this against dev **before building Parts 1-3**, and compare to the prod values
recorded above:

```sql
-- Parts 1 & 2: function signatures, security, search_path
select proname, pg_get_function_identity_arguments(oid) as args, prosecdef, proconfig
from pg_proc where proname in ('join_household','bootstrap_new_user');

-- Part 3: membership policies
select polname, polcmd, pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy where polrelid='public.household_members'::regclass;

-- Part 4: re-confirm at build time (expected: all false in both environments)
select relname, relrowsecurity, relforcerowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and relname in ('known_stores','provision_cycles','shopping_sessions','household_members');
```

Divergence is plausible on Parts 1-3: the four `bootstrap_new_user` overloads are the
fossil record of repeated iteration, and dev may carry a different subset. **If dev and
prod differ, the migrations are not blindly portable** — reconcile before applying, and
note the divergence in the session log.

---

## Follow-on (not in this fix)

- **Soft-delete cascade gap — `household_members` survives its `households` row.**
  Found while counting prod for the disclosure question (2026-07-30); unrelated to the
  four parts above, but it lands in code Part 2 touches.

  Prod has **24** distinct households with live memberships but only **23** live
  households. One soft-deleted household still carries an undeleted membership:

  | household | deleted_at | live memberships | of which owner |
  |---|---|---|---|
  | `a2a1948d-ab10-4cc9-afe2-344943037093` "Test House 200" | 2026-07-10 | 1 | 1 |

  > **⚠️ CORRECTED 2026-07-31 — the stated cause is wrong.** This spec claimed "deleting a
  > household soft-deletes the household row without soft-deleting its `household_members`
  > rows." **`delete_household` does soft-delete `household_members`** — verified by reading
  > `prosrc` on both dev and prod; it cascades through ten tables
  > (`list_item_contributors`, `waste_events`, `shopping_sessions`, `list_items`,
  > `provision_cycles`, `catalog_items`, `known_stores`, `household_invites`,
  > `household_members`, then `households`) and hard-deletes `user_hidden_items`.
  >
  > So the current RPC does **not** produce this state. Test House 200's orphaned membership
  > either predates the current cascade or was created by a path that bypassed the RPC —
  > **which one is still unknown, and worth establishing before trusting that the cascade is
  > complete.** Supporting evidence that it generally works: dev has **52** soft-deleted
  > households and **zero** orphaned live memberships.
  >
  > The FK being `NO ACTION` remains true, so nothing at the *database* level enforces this —
  > it rests entirely on the RPC being the only deletion path.

  **✅ The consequence below is FIXED** — migration `029` (Part 0) made
  `bootstrap_new_user` join `households`, filter `h.deleted_at is null`, and order by
  `hm.joined_at desc`. Verified on prod by injected-JWT probe: `Test House 200`
  `true → false`. The orphaned row still exists; it is simply no longer resolvable. Retained
  below because **it is the only row in either environment that exercises this defect** —
  see the retention-policy note in ROADMAP LATER before deleting test data.

  **Why it matters beyond one stale test row.** `bootstrap_new_user` resolves the caller's
  household with:

  ```sql
  select household_id into v_household_id
  from household_members
  where user_id = v_user_id and deleted_at is null
  limit 1;
  ```

  It filters `household_members.deleted_at` but **not `households.deleted_at`**, and has
  no `ORDER BY` — so `limit 1` picks an arbitrary row. User
  `0e45361e-44ae-48ea-83bc-dcff99ec440b` holds **4 live memberships, 3 to live households
  and 1 to the deleted one**. On cold start that user can be resolved into a soft-deleted
  household nondeterministically, with the app then loading its cycle and list state.

  This is a real reproduction target, not a hypothetical: one named prod user, reachable
  by signing in as them and cold-starting until the `limit 1` lands on the deleted row.

  Fix has two halves, and they are independent commits:
  1. **✅ Predicate — RESOLVED by `029_household_liveness.sql`.** This bullet previously
     read that `is_member_of()` carried the same omission (checking `hm.deleted_at` only),
     and therefore that *membership in a deleted household still satisfies every RLS policy
     in the schema* — a claim that named Part 4 as the thing to confirm before shipping.
     **That is stale and was already false when written.** `029` rewrote `is_member_of` to
     join both `users` and `households` and filter `u.deleted_at is null` **and
     `h.deleted_at is null`**; it shipped to dev and prod alongside the
     `bootstrap_new_user` fix (see Part 0). Re-verified by reading `pg_get_functiondef` on
     both `zxwtxjjmssykhqrghouf` (dev) and `parpauldmbetptkmdwbd` (prod) — the predicate is
     present and the two environments are byte-identical.
     **Part 4 therefore has no open blocker as of 2026-07-31.** Policies written against
     `is_member_of` inherit household- and account-liveness for free. The remaining live
     work in this bullet is the `bootstrap_new_user` `ORDER BY`/join half — also done by
     `029` — leaving only the audit of *other* membership-resolution sites.
  2. **Backfill + cascade** — soft-delete the orphaned membership rows, and make household
     deletion cascade to `household_members` in whatever RPC owns it.

  Deliberately **not** folded into Part 2 despite touching the same function — see Part 2
  build trap 4.

- **`list_items_select` drift.** It targets role `public` and inlines the membership
  subquery rather than calling `is_member_of()`, unlike its three siblings. Functionally
  equivalent — the inlined predicate matches the helper body exactly, and an anon request
  has no JWT `sub` so it fails closed. Not a hole; normalize it for consistency.
- **Sweep for the same root cause.** Any `SECURITY DEFINER` function taking an identity or
  a scope key as a parameter rather than deriving it: `select proname,
  pg_get_function_identity_arguments(oid) from pg_proc where prosecdef;` — read every
  argument list and ask "could the client lie about this?"
- **Audit `SECURITY DEFINER` functions missing `SET search_path`** — same query, check
  `proconfig is null`. Part 2 fixes one instance; there may be others.
- **`household_invites` policies were never inspected.** Blocking for Part 1 step 3
  (see open question there); worth a full read regardless.
- **Disclosure: OPEN — do not treat as settled.** An earlier draft of this spec closed
  this question on the basis that prod was "2 households / 3 members." **That figure was
  wrong.** It came from `list_tables`, which reports `reltuples` planner estimates, not
  counts — those are stale until `ANALYZE` and were off by an order of magnitude.

  Actual prod, counted directly (2026-07-30):

  | Metric | Live | Total incl. soft-deleted |
  |---|---|---|
  | Users | 21 | 21 |
  | Households | 23 | 33 |
  | Household memberships | 31 | 56 |
  | Distinct users with a live membership | 19 | — |
  | Provision cycles | 50 | — |
  | Invites (accepted) | 52 | 74 |

  This is consistent with the 12 users migrated to prod Clerk and the ten named beta
  testers; the estimate was not.

  **This changes the calculus.** "3 people in 2 households, all F&F" is a rounding error
  and disclosure is obviously moot. **19 people across 23 households is a real beta
  population**, and the honest position is that the question is open, not answered. It is
  Dan's call, and it should be made against the real numbers.

  Points that bear on it, stated neutrally:
  - **Nothing here is a confirmed disclosure of user text.** Unlike
    SPEC_anon_catalog_exposure — where free-text item names containing third-party
    personal information were provably served to anon — these are *unexploited capability*
    gaps. `provision_cycles` holds cycle metadata (type, label, timestamps), not authored
    prose. The GPS and spend tables are empty.
  - **No exploitation has been observed**, and there is no logging that would prove
    absence either way. Do not state "no data was accessed" as fact.
  - The exposure window is unknown and long — these tables have never had RLS.

  If the decision is no disclosure, record *that reasoning* here rather than a headcount,
  so it survives the next review.
