# SPEC — Duplicate same-named household: controlled repro + root-cause fork

**Status:** Diagnosis-only. NO fix in this spec. Goal is a clean repro + a decided
root-cause direction. Do not write a fix until the truth table below points at one.

**Surfaced:** 2026-07-09, during multi-user churn (create/invite/accept/remove/delete).
A create appeared to yield two households with the same name in the switcher.
Unknown: true duplicate creation (two ids) vs duplicate membership (one id, two
member rows) vs client render-dedup (one id, one row, doubled in UI).

---

## Why this is decidable with two queries

The switcher read path is `get_my_households()` (migration 001): it joins
`household_members hm → households h` and returns **one row per membership**
(`where hm.user_id = me and hm.deleted_at is null and h.deleted_at is null`).

The create path is `create_household()` (migration 006): a single
`insert into households ... returning id`, then a single owner `household_members`
insert. No retry loop, no upsert — so a server-side double-create requires the RPC
to have executed twice.

Because the read returns one row per membership, "two identical rows in the UI"
almost certainly means duplication in the **data**, not in React. The two queries
below tell us *which table*.

---

## Root-cause fork (truth table)

Run BOTH queries (Q1, Q2) below after a repro, as the affected user, against PROD.

| Q1: households named X | Q2: my memberships for that name | Diagnosis | Direction |
|---|---|---|---|
| 2 distinct ids | 2 rows (one per id) | **True duplicate creation** — RPC ran twice | Creation-race / double-invoke |
| 1 id | 2 rows (same household_id) | **Duplicate membership** — one household, two member rows | Membership-insert dup |
| 1 id | 1 row | **Client render-dedup** — data clean, UI doubles it | Front-end (unlikely per above) |

The first two are the live hypotheses. The third is the near-ruled-out case,
included so a clean single row doesn't get misread as "no bug."

---

## Controlled repro (isolate — do NOT repro mid-churn)

Last session correctly refused to chase this during heavy churn — you can't
attribute a race you can't cleanly trigger. Isolate each candidate trigger and
run it alone. Two devices / two Clerk identities (DH primary, DT secondary).

**Candidate A — double-tap / double-submit on create (single user):**
1. DH, single active household. Open the create-household surface.
2. Tap "Create" on a named household ("Repro-A") and, if the button isn't
   disabled on first press, tap again fast (simulate the double-invoke).
3. Observe switcher. Run Q1/Q2 for name = 'Repro-A'.
   - *Hypothesis:* if create's button has no in-flight disable, two RPC calls →
     two ids → true duplicate creation.

**Candidate B — create-then-invite-accept collision (two users):**
1. DH creates "Repro-B", invites DT.
2. DT accepts the invite.
3. Watch whether the accept path adds a *second* membership for a user who is
   already a member, or whether an invite-accept ever calls create.
4. Run Q1/Q2 as each user for name = 'Repro-B'.

**Candidate C — slow-network create (retry-on-timeout):**
1. Throttle to Slow 3G. DH creates "Repro-C".
2. If the client shows a spinner long enough that a user (or a retry hook) would
   re-fire, note whether a second RPC goes out.
3. Run Q1/Q2 for name = 'Repro-C'.
   - *Hypothesis:* client-side retry firing a second `create_household` before the
     first response lands = two ids. This is the most likely real-world trigger
     given the app's cold-start/retry posture.

Stop at the FIRST candidate that reproduces. Note which one — the trigger names
the fix later (disable-on-submit vs idempotent create vs dedup membership insert).

---

## Diagnostic queries (PROD SQL editor — read-only)

Replace `:name` with the repro household name (e.g. 'Repro-C') and `:clerk_id`
with the affected user's Clerk subject. Truth: query the correct environment,
confirm project id `parpauldmbetptkmdwbd` in the URL first.

**Q0 — resolve internal user id (sanity):**
```sql
select id, clerk_id, full_name
from users
where clerk_id = ':clerk_id';
```

**Q1 — how many household rows carry this name (distinct ids?):**
```sql
select id, name, created_by, created_at, deleted_at
from households
where name = ':name'
order by created_at asc;
```
- 2+ rows with distinct `id` → **true duplicate creation**. Compare `created_at`
  deltas: sub-second gap = race/double-invoke; larger = two deliberate creates.

**Q2 — how many memberships does this user hold for that name:**
```sql
select hm.household_id,
       hm.user_id,
       hm.role,
       hm.joined_at,
       hm.deleted_at,
       h.name
from household_members hm
join households h on h.id = hm.household_id
where hm.user_id = (select id from users where clerk_id = ':clerk_id')
  and h.name = ':name'
order by hm.joined_at asc;
```
- Multiple rows, **same** `household_id` → **duplicate membership** (one household).
- Multiple rows, **different** `household_id` → confirms Q1's duplicate creation.
- One row → data is clean; if UI still doubles, it's render-side.

**Q3 — (only if Q1 shows duplicate ids) confirm each id has its own owner row:**
```sql
select household_id, count(*) as member_count,
       array_agg(role) as roles
from household_members
where household_id in (
  select id from households where name = ':name'
)
group by household_id;
```
- Confirms whether both ids are "real" (each with an owner) or one is an orphan
  household with no membership (which `get_my_households` would NOT show — a useful
  negative).

---

## Done when

- One candidate (A/B/C) reproduces reliably.
- Q1/Q2 run against prod for that repro, landing the result in one row of the
  truth table.
- We have a named direction: **creation-race** (idempotency / disable-on-submit),
  **membership-dup** (guard the second membership insert), or **render-dedup**
  (dedup by household_id client-side).

NO fix commit until this spec's truth table is filled in.

---

## Notes for the fix session (do not act on yet)

- If **creation-race**: two sub-strategies — client (disable create button while
  in-flight; the same posture already used for the auth-gate cold-load) and server
  (make `create_household` idempotent, e.g. dedup on (created_by, name) within a
  short window — but names are intentionally non-unique, so a window/guard, not a
  unique constraint). Prefer the client fix first if the trigger is double-tap;
  prefer server idempotency if the trigger is retry-on-timeout, since a retry hook
  will defeat a disabled button.
- If **membership-dup**: the invite-accept path is inserting a membership for a
  user who already has one. A `on conflict do nothing` on
  `household_members (household_id, user_id)` — verify the unique constraint exists
  first (cf. the known dev↔prod constraint-name split on `list_items`).
- Related open item: "Disambiguate duplicate-named households in UI" assumes two
  *real* same-named households. This spec asks whether the second one is real at
  all — resolve THIS first, or that UI work may be disambiguating a ghost.
