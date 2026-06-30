# SPEC — Consolidate duplicate helper functions (migration #2)

**Scope:** OurProvisions
**Type:** DB migration (idempotent)
**Filing number:** `015` (folder convention only — no prod migration tracker; numbers not load-bearing). Apply AFTER `014` (no hard dependency, but keep ordering).
**Apply path:** Manual SQL-editor paste. Dev first → verify → prod.

---

## Why

Two pairs of near-identical helper functions. In each pair, the survivor pins `search_path` (a real security property on SECURITY DEFINER functions); the drop-candidate has `proconfig = NULL` (no pinned search_path → search-path-injection smell).

**Verified on prod this session (`pg_proc.proconfig`):**

| function | search_path config | verdict |
|---|---|---|
| `get_current_household_id` | `public, extensions` | **keep** |
| `get_current_user_id` | `public, extensions` | **keep** |
| `get_household_id_for_current_user` | `NULL` | **drop** |
| `get_user_id_from_clerk` | `NULL` | **drop** |

The survivors are also superior on behavior: `get_current_household_id` has `order by joined_at desc limit 1` (deterministic most-recent-household), the variant has no ordering.

**Caller check (Q2b-i functions, Q2b-ii policies) — BOTH returned 0 rows on prod.** Nothing references either drop-candidate. Clean drop, no repointing.

> ⚠️ Re-run the caller check on dev immediately before applying there — dev may differ. If anything references a drop-candidate on dev, repoint it to the survivor first.

---

## SQL

```sql
-- ============================================================
-- 015 — Drop duplicate helper functions.
-- Survivors (search_path-pinned, deterministic) retained:
--   get_current_household_id(), get_current_user_id().
-- Drop-candidates have proconfig=NULL and ZERO callers (verified).
-- ============================================================

drop function if exists public.get_household_id_for_current_user();
drop function if exists public.get_user_id_from_clerk();
```

## Verify after apply (dev, then prod)

```sql
-- Expect exactly 2 rows: the survivors only.
select p.proname, array_to_string(p.proconfig, ', ') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_current_household_id','get_current_user_id',
                    'get_household_id_for_current_user','get_user_id_from_clerk')
order by p.proname;
```
