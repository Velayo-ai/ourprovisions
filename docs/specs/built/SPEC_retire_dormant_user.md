# SPEC — Retire a dormant user

**Status:** Built — describes a procedure already run 11 times; routed to `built/` 2026-08-17
**Scope:** OurProvisions
**Migration:** None — this is a data operation (UPDATE statements against `users` and, in one shape, cascading soft-deletes), not a schema change
**Date:** 2026-08-16 (written after the fact — the procedure it documents ran 2026-08-15 during the prod Clerk cutover)
**Verified against:** prod (`parpauldmbetptkmdwbd`) — 11 users retired 2026-08-15 using this procedure, informally, with no spec to check it against

---

## Summary

During the prod Clerk cutover, 11 users were found to be dormant — live rows in `public.users`
with no corresponding prod Clerk account, permanently gating the cutover flip. All 11 were
retired using a **mangle-by-prefix** pattern, but the procedure existed only as
in-session judgment calls. This spec captures what was actually done so the next retirement
(dormant user, account-deletion request, or any future prune) doesn't have to rediscover it.

This is a **process gap closure**, not a new decision — nothing below changes what was done
on 2026-08-15. It exists so the two retire shapes, the FK map, and the known orphan class are
written down once instead of living only in `SESSION_LOG.md`.

---

## Why retirement needs a spec at all

`public.users` enforces `email` and `clerk_id` as **plain unique** columns — no
`WHERE deleted_at IS NULL` partial clause (confirmed against `information_schema` during the
cutover; see ARCHITECTURE.md). A bare soft-delete (`deleted_at = now()`) does **not** free the
email or clerk_id for reuse — if that person, or anyone reusing that email, ever tries to
register again, they hit a unique-constraint collision with a "deleted" row they can't see and
can't work around. **The mangle prefix exists specifically to defeat this**, not as decoration.

---

## The two retire shapes

Retirement is not one procedure — it branches on **whose household the user's data lives in**.

### Shape A — Mangle only (data lives in someone else's household)

Used when the dormant user is a member of a household they don't own, or has no live household
membership at all. Their footprint is entirely inside rows owned by other people (contributor
attribution on shared list items, membership rows, etc.) — deleting any of it would edit another
household's real history to tidy up `public.users`.

**Steps:**
1. Confirm the user has no household where `households.created_by = this user` with the household
   still live (`deleted_at IS NULL`). If they do, this is Shape B, not A.
2. `UPDATE users SET email = 'retired-YYYY-MM-DD-' || email, clerk_id = 'retired-YYYY-MM-DD-' || clerk_id, deleted_at = now() WHERE id = <user_id>`.
3. Leave every other row referencing this user untouched. Their name/contributor attribution on
   shared data stays exactly as it was — this is deliberate, not an oversight.

10 of the 11 users retired 2026-08-15 (Michael and 9 test accounts) took this shape.

### Shape B — Full inner-to-outer chain (user owns their own solo household)

Used when the dormant user created their own household and it holds no one else — retiring the
user without retiring their household would leave an orphaned household a de-facto ghost.

**Steps, inner to outer (each must be soft-deleted before the one that references it):**
1. Soft-delete the user's `list_items` in their household.
2. Soft-delete their `household_invites` (any they issued).
3. Soft-delete their `household_members` row.
4. Soft-delete the `households` row itself.
5. Mangle `users.email` and `users.clerk_id` per Shape A step 2, and set `deleted_at`.

Only Jean (1 of 11) took this shape 2026-08-15: 8 `list_items` → 1 `household_invites` → 1
`household_members` → 1 `households` → mangle.

**Deciding which shape applies:** check `households.created_by` for any live household. If none,
Shape A. If one exists and has no other live members, Shape B. (A household with other live
members but created by the dormant user is a case this spec does not yet cover — surface it as a
new question rather than guessing; ownership transfer has no established procedure.)

---

## The FK teardown surface

Mapped from `information_schema` during the cutover, not from the column inventory CSV (which
was stale and would have under-counted this). **16 FK columns reference `public.users`, all
`NO ACTION`** — meaning Postgres will refuse any hard delete of a `users` row referenced
anywhere, which is one more reason this procedure is soft-delete-and-mangle, never a real
`DELETE`. Six of the sixteen were on tables neither the original spec nor the cutover census had
listed — re-run the discovery query below rather than trusting any prior list, including this
one, since new tables get added over time.

```sql
select
  tc.table_name, kcu.column_name
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name
where tc.constraint_type = 'FOREIGN KEY'
  and ccu.table_name = 'users'
order by tc.table_name;
```

Run this fresh before every retirement batch. Do not reuse a cached list.

---

## Known orphan class — accepted, not fixed

`user_hidden_items` is keyed on `clerk_id` as **text**, with **no FK to `users`**. Mangling a
user's `clerk_id` strands any `user_hidden_items` rows they created — they now point at a string
that resolves to nobody. This is harmless in practice (a hidden-item preference for an account
that no longer signs in has no observable effect on anyone), but it's a real orphan class the
current schema cannot express or clean up automatically. Not in scope to fix here; recorded so a
future data audit doesn't mistake it for a new defect.

---

## The mangle pattern itself

```sql
update users
set email    = 'retired-' || to_char(now(), 'YYYY-MM-DD') || '-' || email,
    clerk_id = 'retired-' || to_char(now(), 'YYYY-MM-DD') || '-' || clerk_id,
    deleted_at = now()
where id = <user_id>;
```

**Why prefix-mangle rather than null-out:** the row stays self-documenting. Anyone reading
`public.users` later can see exactly which row was retired and when, without cross-referencing a
separate audit log. Nulling `email`/`clerk_id` would satisfy the uniqueness problem too, but
destroys that legibility for no benefit.

**Why not just delete `deleted_at IS NULL` from the unique index instead of mangling on every
retirement:** that's the real long-term fix (a partial unique index,
`WHERE deleted_at IS NULL`), and it's explicitly out of scope here — it's a schema change
affecting every future soft-delete on `users`, fleet-wide, not a per-retirement operation. Filed
separately; see `ARCHITECTURE.md`'s note on the `users_email_key` finding. Until that lands,
every retirement must mangle.

---

## Verification

1. **Retired row no longer collides.** Attempt (or simulate) a fresh signup with the original
   email — should succeed, not throw a unique-constraint error.
2. **Shape A — no other row changed.** Diff a snapshot of every table the FK query above returns,
   before and after, for tables *other than* `users` — expect zero changes.
3. **Shape B — full chain soft-deleted, in order.** Confirm `list_items.deleted_at`,
   `household_invites.deleted_at`, `household_members.deleted_at`, and `households.deleted_at`
   are all set, and that no live row anywhere still references the now-dead household.
4. **`user_hidden_items` orphan count, if any, is expected and not treated as a defect** —
   confirm it exists, note the count, move on.

---

## Open question this spec does not resolve

A dormant user who **owns** a household that still has **other live members** — do we reassign
ownership, or is that household now permanently ownerless? Not encountered 2026-08-15 (all 11
retirements were Shape A or a clean Shape B), but it's a gap in this procedure. Surface it as a
design question if it comes up rather than improvising a third shape in the moment.
