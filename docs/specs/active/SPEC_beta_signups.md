# SPEC — `beta_signups` (mission-control table #1)

**Scope:** OurProvisions / Velayo OS (Cross — product-adjacent, but the first
brick of the mission-control layer)
**Type:** New table · migration · public-write RLS · verification required
**Status:** Ready for BUILD (Claude Code) after mockup eye-test approval

---

## Why this exists

The public "Come aboard" questionnaire captures a beta applicant's shopping
profile. Completing it **is** coming aboard — the answers are both a
qualification filter ("willing to give to get") and GTM research that
pre-validates Phases 2–3 before we build them.

This is the **first table in the mission-control layer** — operational
telemetry about the beta, owned by Velayo, distinct from the product tables
(`list_items`, `households`, …) which are owned by households and read by their
members. Nobody but Dan (service role / dashboard) ever reads this table.

## The one non-obvious thing: insert-only, no-select

This is the first table in the system that accepts writes from users who are
**not authenticated** — a beta applicant has no Clerk session, because they're
applying for one. The insert therefore goes through Supabase's public `anon`
role, **not** the Clerk `auth.jwt()->>'sub'` pattern the product tables use.
This is a deliberate, first-of-its-kind departure and it's correct:
pre-signup data has no user to attach to.

The security shape that protects it:

| role | INSERT | SELECT | UPDATE / DELETE |
|------|--------|--------|-----------------|
| `anon` (public visitor) | ✅ allowed | ❌ **no policy** | ❌ **no policy** |
| service role (Dan) | ✅ | ✅ | ✅ |

**The absence of a SELECT policy for `anon` is the security.** With RLS on and
no permissive SELECT policy, the anon role can write a row and then cannot read
it back — not even its own, not anyone else's. Two founder-only columns
(`status`, `fit_note`) make this non-negotiable: if a visitor could SELECT, they
would see Dan's private assessment of them. Insert-only/no-select is what keeps
`fit_note` private.

**Deferred by KISS (recorded as a decision, not an oversight):** no captcha, no
rate limiting in v1. A public insert endpoint can be spammed, but at beta volume
a junk row costs one glance to ignore. Revisit when volume complains.

## Column design

Answers are stored as **stable codes, not display prose** (same principle as
"UUIDs are the key, names are display-only") so mission-control can
`GROUP BY store_count` etc. The page shows the pretty label; the row stores the
code.

`region` splits into two columns so the escape hatch stays clean: the chip is
always a countable code; the free-text ("Tortola, BVI") lands in
`region_other`, filled only when `region = 'elsewhere'`. Jamming free-text into
`region` itself would break every `GROUP BY`.

| column | type | set by | values / notes |
|--------|------|--------|----------------|
| `id` | `uuid` PK default `gen_random_uuid()` | system | |
| `created_at` | `timestamptz` default `now()` | system | |
| `name` | `text` | visitor | |
| `email` | `text` | visitor | |
| `region` | `text` | visitor | `caribbean` / `us_east` / `us_west` / `uk` / `europe` / `elsewhere` |
| `region_other` | `text` null | visitor | free-text, only when `region='elsewhere'` |
| `keeps_list` | `text` | visitor | `always` / `sometimes` / `wings_it` |
| `who_shops` | `text` | visitor | `mostly_me` / `split` / `someone_else` |
| `store_count` | `text` | visitor | `one` / `two_three` / `three_plus` |
| `crew` | `text` | visitor | `just_me` / `partner` / `family` / `roommates` |
| `multi_household` | `boolean` | visitor | |
| `list_method` | `text` | visitor | `meals` / `staples` / `mixed` |
| `wishes` | `text` null | visitor | free-text, optional — the "will they get it" signal |
| `status` | `text` default `'new'` | **Dan** | `new` / `contacted` / `onboarded` / `passed` — the triage funnel |
| `fit_note` | `text` null | **Dan** | Dan's read of `wishes`. Private. Never visitor-visible. |

No analytics fields (referrer, UTM, device) — premature; the table earns its
place answering "who wants in and how do they shop," nothing more.

---

## Migration SQL

> Paste only the SQL block below into the Supabase SQL editor (prod:
> `parpauldmbetptkmdwbd`). Do **not** paste this whole `.md`.

```sql
-- beta_signups: mission-control table #1
create table public.beta_signups (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,
  email           text not null,
  region          text,
  region_other    text,
  keeps_list      text,
  who_shops       text,
  store_count     text,
  crew            text,
  multi_household boolean,
  list_method     text,
  wishes          text,
  status          text not null default 'new',
  fit_note        text
);

alter table public.beta_signups enable row level security;

-- anon may INSERT only. No SELECT/UPDATE/DELETE policy for anon exists,
-- so RLS denies all reads/edits to the public. That denial is the security.
create policy "public can apply"
  on public.beta_signups
  for insert
  to anon
  with check (true);
```

The frontend insert uses the Supabase `anon` key (already public in the bundle),
**not** Clerk. This is the only Supabase call in the system that runs without a
Clerk identity — flag it as such in ARCHITECTURE.

---

## Verification checklist (do on prod, carefully)

1. **anon can insert** — from the deployed page (or a `anon`-key client), submit
   the form; confirm a row appears in the dashboard.
2. **anon CANNOT read** — with an `anon`-key client, run
   `select * from beta_signups;`. Expected: **zero rows** (RLS denies), even
   though rows exist. This is the critical test — it proves `fit_note` is safe.
3. **anon cannot update/delete** — attempt an update via `anon`; expect denial.
4. **service role reads all** — dashboard/service-role `select *` returns every
   row including `status` / `fit_note`.
5. **elsewhere path** — submit with `region='elsewhere'` + `region_other`; confirm
   both columns populate; submit a non-elsewhere region; confirm `region_other`
   is null.

Safe destructive testing (if needed): wrap experiments in
`begin; … rollback;` in the SQL editor.

---

## Downstream (not this build)

- Splice the questionnaire into the landing page (`ourprovisions.app`) as the
  "Come aboard" middle movement — separate Claude Code job, mockup approved first.
- Wire the real `anon` insert from the approved mockup's fields to these columns.
- Later: a simple mission-control view over this table (filter by `status`,
  read `wishes` + set `fit_note`) — deferred until there are signups to work.

## Deferred questions on record

- **Phase 5:** a targeted cooking/OurChef question, added to signups when OurChef
  enters real design (changes a decision *then*, premature *now*).
- **Spam hardening** (captcha / rate limit): when volume complains.
- **region → structured graduation:** if free-text `region_other` volume grows
  enough to want counting, formalize into codes.
