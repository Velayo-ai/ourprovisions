# SPEC — Anon catalog exposure (custom items readable by public)

**Status:** Built
**Severity:** High — live production data exposure, user PII
**Scope:** OurProvisions
**Migration:** 022
**Date:** 2026-07-17

---

## Summary

The signed-out landing page exposed **every row** of `catalog_items` — all 183 rows
in prod, including 133 household-custom items — to any anonymous visitor. No
authentication, no key theft. The publishable anon key plus a browser DevTools
Network tab was sufficient.

Custom catalog rows contain **free-text, user-authored names**. Observed in the live
anon response:

- `"Dad two days of meds left"` (category `20260724 - friday`)
- `"Mom out of meds"` (category `20260701 saturday`)
- `"CHRIS BRINGS MY DAD TO MARIO H…"` (category `20260812 wed`)

Beta users treat item names as a scratchpad. This is not catalog data; it is
personal information about identifiable third parties.

---

## Root cause

Two independent defects. Either alone would have been survivable; together they
produced the exposure.

### Defect 1 — RLS policy (the cause)

Live policy on `public.catalog_items`, role `{anon}`, cmd `r`:

| polname | using_expr |
|---|---|
| `Anyone can read global catalog items` | `(deleted_at IS NULL)` |

The policy **name** says "global." The **predicate does not mention `is_global`.**
Every undeleted row passes. The name documented an intent the SQL never
implemented.

For contrast, the sibling policy for `{authenticated}` is correct:

| polname | using_expr |
|---|---|
| `catalog_items_select` | `((is_global = true) OR is_member_of(household_id))` |

The authenticated path was written properly. The anon policy reads like a
quick unblock that was never revisited.

### Defect 2 — client query (the mask that wasn't)

`src/hooks/useProvisions.js` ~line 216, the signed-out branch of Effect 1:

```
/rest/v1/catalog_items?deleted_at=is.null&select=id,name,category,unit,price_hint
```

The only filter is `deleted_at`. The query requests every row and relies entirely
on RLS to decide what comes back. The inline comment says "fetch global catalog"
— the same intent/implementation gap as the policy.

Every **authenticated** catalog query in the codebase filters `is_global`
explicitly (`useProvisions.js` 474, 488, 1068, 1075, 1262, 1273). The anon path is
the sole exception.

### Why it went unnoticed

RLS was doing the filtering everywhere else and doing it correctly, so the missing
client filter never manifested. The anon policy was the only place both layers
failed, and the signed-out surface is the least-exercised path in beta.

---

## Principle established

**A query asks for what it wants; RLS is the backstop, not the filter.**

Relying on RLS as the primary filter means every policy is load-bearing for
correctness, not just for security. When the two layers disagree, the failure is
silent and the blast radius is the whole table. Both layers must independently
express the intent.

Corollary: **`catalog_items` holds user-authored free text and must be treated as
PII-bearing.** It is not reference data. Any future anon or cross-household read
of this table needs the same scrutiny as `list_items`.

---

## Fix

### Layer 1 — Migration 022 (the real fix)

`ALTER POLICY` rather than DROP/CREATE: no window in which the table has no anon
policy, and no risk of the recreate failing and leaving the table open.

```sql
alter policy "Anyone can read global catalog items"
  on public.catalog_items
  to anon
  using (is_global = true and deleted_at is null);
```

`is_global` is `boolean default false` — new custom rows are false by default, so
the predicate fails closed. A row must be *explicitly* marked global to be
publicly readable.

### Layer 2 — Client filter (defense in depth)

`src/hooks/useProvisions.js`, signed-out fetch. Add `is_global=eq.true`:

```
/rest/v1/catalog_items?is_global=eq.true&deleted_at=is.null&select=id,name,category,unit,price_hint
```

This changes nothing about what comes back once 022 is applied — it makes the
query state its intent, so the next person reading it doesn't have to infer the
security model from a policy in another system. Also correct the misleading
comment above the fetch.

---

## Decision — keep anon browse, tightly scoped

**Considered:** drop the anon policy entirely and gate all browse behind auth.

**Chosen:** keep anon read, restricted to `is_global = true`.

Rationale: the signed-out browse of the 50 seed items is a real part of the
landing experience — it shows a visitor what the product is before asking for a
signup. The seed rows are Velayo's own content with no household attached and no
user authorship. That's a legitimate shop-window.

The risk was never anon *browse*; it was anon browse of a table that also holds
user text. Scoping to `is_global` separates those cleanly. If the landing page
ever needs richer data, it should read from a purpose-built view or seed table
rather than widening this policy again.

---

## Verification

**Reproduce (before fix)** — incognito → `ourprovisions.velayo.ai` → DevTools →
Network → filter `catalog_items` → Response. Count rows.

PowerShell equivalent:

```powershell
$anon = "<prod anon key>"
$h = @{ apikey = $anon; Authorization = "Bearer $anon" }
$r = Invoke-RestMethod -Uri "https://parpauldmbetptkmdwbd.supabase.co/rest/v1/catalog_items?deleted_at=is.null&select=name,is_global,household_id" -Headers $h
"$($r.Count) rows; $(($r | Where-Object { -not $_.is_global }).Count) custom"
```

| | Before | After |
|---|---|---|
| Anon rows returned | 183 | 50 |
| Custom rows returned | 133 | **0** |

**Confirm policy after apply:**

```sql
select polname, pg_get_expr(polqual, polrelid) as using_expr, polroles::regrole[]
from pg_policy
where polrelid = 'public.catalog_items'::regclass
  and polroles::regrole[]::text[] @> array['anon'];
```

Expect `using_expr` = `((is_global = true) AND (deleted_at IS NULL))`.

**Do not verify with the SQL editor alone.** The editor runs as role `postgres`,
which bypasses RLS — it will happily return all 183 rows after a correct fix. Only
an anon-key request through PostgREST exercises the policy.

**Authenticated regression check:** signed in, Browse tab still shows seed items
*and* the household's own custom items. Migration 022 touches only the `{anon}`
policy; `catalog_items_select` for `{authenticated}` is untouched and already
correct.

---

## Deploy

Dev first, verify by anon request against dev, then prod. Prod carries the live
exposure — do not let dev verification stall the prod apply longer than it takes
to confirm the shape of the change.

---

## Follow-on (not in this fix)

- **Disclosure:** beta users' custom item text was publicly readable for an
  unknown window. Decide whether F&F testers get a heads-up. Small group, real
  content, Dan's call.
- **Audit the remaining anon surface.** `category_avg_prices` is fetched on the
  same signed-out path (`useProvisions.js` ~236) — confirm it's an aggregate view
  with no per-household rows and no anon policy of the same shape.
- **Sweep for the same pattern:** any policy whose name asserts a filter its
  predicate doesn't contain. `pg_policy` across all tables, read the name against
  the expr.
