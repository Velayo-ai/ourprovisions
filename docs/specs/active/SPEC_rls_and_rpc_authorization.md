# SPEC — RLS and RPC authorization (membership integrity + unprotected tables)

**Status:** Active — spec only, nothing built
**Severity:** High — live production authorization gaps, no exploitation observed
**Scope:** OurProvisions
**Migration:** assign at build time (four separate migrations — see Ordering)
**Date:** 2026-07-30
**Verified against:** prod (`parpauldmbetptkmdwbd`) via read-only MCP.
**Part 4 confirmed in BOTH dev and prod.** Parts 1-3 are prod-only and unverified on dev — see Dev/prod parity.

---

## Summary

Four related authorization defects, found while investigating the Supabase advisory
that three tables have RLS disabled. The RLS gap turned out to be the *least*
severe of the four.

| # | Defect | Severity | Touches client? |
|---|---|---|---|
| 1 | `join_household` performs no invite validation | **Critical** | Yes — signature change |
| 2 | `bootstrap_new_user` trusts client-supplied `p_clerk_id` | **Critical** | Yes — signature change |
| 3 | `household_members_insert` policy is `WITH CHECK (true)` | Medium | No |
| 4 | RLS disabled on 3 tables | Medium (High once populated) | No |

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

## Ordering, and why it is not negotiable

**1 → 2 → 3 → 4.** The non-obvious part is why #3 cannot come first.

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

Parts 3 and 4 are SQL-only and Parts 1 and 2 change client-called signatures, so the
instinct is that 3 and 4 are the safe ones. **For #4 that instinct is wrong, and it is
the single most important scheduling fact in this spec.**

**#4 is the only part that touches the core loop.** Seven live call sites — active cycle
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

**Open question for build:** the pre-flight lookup reads `household_invites` as a user
who is not yet a member. That read path currently works, so a policy permits it — but
`household_invites` policies were **not** inspected this session. Confirm before assuming
step 3 passes, and check whether the client still needs UPDATE on `household_invites`
after the RPC takes over the burn (it should not).

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

**Three build-time traps in this one:**

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
4. **You will be editing a predicate that has a separate live bug in it — do not fix it
   here.** Step 3 of this function resolves the caller's household with
   `where user_id = v_user_id and deleted_at is null limit 1`, which checks
   `household_members.deleted_at` but *not* `households.deleted_at`, and has no
   `ORDER BY`. There is a prod user this currently misresolves. That is a distinct defect
   with its own blast radius — see **Follow-on → Soft-delete cascade gap**. Per the BUILD
   rules, separate logical changes are separate commits: carry `p_clerk_id` out in this
   commit, and fix the predicate in its own. Resist the temptation to bundle because your
   cursor is already in the function.

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

### Finding

All three have `relrowsecurity = false` and hold the full Supabase default grant —
SELECT, INSERT, UPDATE, DELETE (plus TRUNCATE, REFERENCES, TRIGGER, MAINTAIN) — to both
`anon` and `authenticated`. With RLS off, the table grant is the only gate.

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

That is precisely the corruption shape that 026 and 027 exist to fix: **items in closed
cycles, and two concurrent open cycles.** Rewriting `closed_at` produces the first;
rewriting `household_id` or clearing `closed_at` on a second row produces the second.

**State plainly: this is not evidence that anyone did it.** The cycle bugs we have
observed have client-side causes with reproductions, and those reproductions stand on
their own. No exploitation has been observed and none is suspected.

The point is narrower and worth carrying: **until Part 4 lands there is no structural
guarantee against that state arising outside the client path.** That bounds how much
confidence 027's verification can give us. A cycle-integrity detector that finds zero
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

## Commits and migrations

Parts 1 and 2 **change RPC signatures the client calls**. They are coordinated SQL +
`useProvisions.js` changes, not pure migrations — the migration and the client edit must
ship together or the app breaks between them. Parts 3 and 4 are SQL-only.

Per the BUILD rules, **each part is its own scoped commit** — four commits, four
migrations, one tested change before the next:

| Part | Commit | Migration | Client |
|---|---|---|---|
| 1 | `fix(NNN): join_household validates invite server-side` | assign at build | `useProvisions.js` acceptInvite |
| 2 | `fix(NNN): bootstrap_new_user derives clerk_id from JWT` | assign at build | `useProvisions.js` bootstrap call |
| 3 | `fix(NNN): drop permissive household_members_insert policy` | assign at build | none |
| 4 | `fix(NNN): enable RLS + household policies on cycle tables` | assign at build | none |

**Migration numbers are deliberately not assigned here** — assign at build time against
the then-current sequence.

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

  Deleting a household soft-deletes the household row without soft-deleting its
  `household_members` rows. The FK is `NO ACTION`, so nothing at the DB level closes this.

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
  1. **Predicate** — join `households` and filter `h.deleted_at is null`, plus a
     deterministic `ORDER BY` (joined_at, or role with owner first). Audit the other
     membership-resolution sites for the same omission; `is_member_of()` has it too
     (it checks `hm.deleted_at` only), which means **membership in a deleted household
     currently still satisfies every RLS policy in the schema** — including the new Part 4
     policies. Worth confirming that's intended before Part 4 ships.
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
