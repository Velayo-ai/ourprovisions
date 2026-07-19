-- 021_beta_signups.sql
-- Applied: 2026-07-17 — dev (zxwtxjjmssykhqrghouf) + prod (parpauldmbetptkmdwbd)
-- Spec: docs/specs/active/SPEC_landing_page_beta.md
--
-- beta_signups — mission-control table #1.
--
-- Operational telemetry about the beta, owned by Velayo. Distinct from the
-- product tables (list_items, households, …) which are owned by households and
-- read by their members. Nobody but Dan (service role) ever reads this table.
--
-- NOTE: a Velayo-scoped table living inside the app-scoped Supabase project is
-- a deliberate KISS choice, not an accident. Recorded so it reads as a decision.
--
-- ── The one non-obvious thing: FIRST UNAUTHENTICATED WRITE IN THE SYSTEM ──
--
-- Every product table authorizes on auth.jwt()->>'sub' (Clerk). This one does
-- not, and cannot: a beta applicant has no Clerk session, because they are
-- applying for one. Pre-signup data has no user to attach to. The insert
-- therefore runs as the public `anon` role.
--
-- ── THE ABSENCE OF A SELECT POLICY IS THE SECURITY ──
--
--   role                    INSERT   SELECT              UPDATE / DELETE
--   anon (public visitor)   allowed  NO POLICY = denied  NO POLICY = denied
--   service role (Dan)      yes      yes                 yes
--
-- With RLS enabled and no permissive SELECT policy, anon can write a row and
-- then cannot read it back — not its own, not anyone else's. Two founder-only
-- columns (status, fit_note) make this non-negotiable: if a visitor could
-- SELECT, they would see Dan's private assessment of them.
--
-- Do NOT "fix" the missing SELECT policy later. It is load-bearing.
--
-- ── Deferred by KISS (decisions, not oversights) ──
-- * No captcha, no rate limiting in v1. A public insert endpoint can be spammed;
--   at beta volume a junk row costs one glance. Revisit when volume complains.
-- * region / region_other are present but UNASKED in v1 — nullable, zero cost,
--   and the two-column escape hatch (chip is always a countable code; free text
--   lands in region_other only when region='elsewhere') is worth preserving if
--   region ever returns. Jamming free text into region itself would break every
--   GROUP BY.
-- * store_count and list_method were DROPPED, not deferred — store_count was
--   replaced by a better question (shop_mode), not postponed. An unused column
--   is a question future-you will ask.
--
-- Answers store as stable CODES, not display prose (same principle as "UUIDs are
-- the key, names are display-only") so mission-control can GROUP BY. The page
-- shows the label; the row stores the code.
--
-- `name` is one column. The form asks first/last separately so nothing is ever
-- parsed on whitespace; the insert joins them. The Clerk pre-fill URL params
-- carry the split. Nothing is guessed in either direction.

create table public.beta_signups (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,                 -- first + last, joined
  email           text not null,                 -- may diverge from Clerk email
  keeps_list      text,                          -- always | sometimes | wings_it
  who_shops       text,                          -- mostly_me | split | someone_else
  shop_mode       text,                          -- in_store | delivered | mixed
  crew            text,                          -- just_me | partner | family | roommates
  multi_household boolean,
  wishes          text,                          -- free text, optional
  region          text,                          -- UNASKED in v1
  region_other    text,                          -- UNASKED in v1
  status          text not null default 'new',   -- DAN ONLY: new | contacted | onboarded | passed
  fit_note        text                           -- DAN ONLY: private. Never visitor-visible.
);

alter table public.beta_signups enable row level security;

-- anon may INSERT only. No SELECT/UPDATE/DELETE policy for anon exists,
-- so RLS denies all reads/edits to the public. That denial is the security:
-- it is what keeps status + fit_note private.
create policy "public can apply"
  on public.beta_signups
  for insert
  to anon
  with check (true);

-- ── Verification (run after applying) ────────────────────────────────────────
--
-- 1. Columns — expect 14, in this order:
--    select column_name, data_type, is_nullable
--    from information_schema.columns
--    where table_name = 'beta_signups'
--    order by ordinal_position;
--
-- 2. RLS armed — expect true. Without this the policy is decorative and the
--    table is wide open:
--    select relrowsecurity from pg_class where relname = 'beta_signups';
--
-- 3. Exactly one policy — expect: public can apply | a | {anon}
--    select polname, polcmd, polroles::regrole[]
--    from pg_policy where polrelid = 'public.beta_signups'::regclass;
--
-- 4. THE CRITICAL TEST (needs an anon-key client, so it waits on the deployed
--    page): with the anon key, `select * from beta_signups;` must return ZERO
--    ROWS while rows exist. That is what proves fit_note is private. Structure
--    checks above cannot prove this.
--
-- Verified on dev + prod 2026-07-17: 14 columns, relrowsecurity=true,
-- one policy (public can apply / a / {anon}).
