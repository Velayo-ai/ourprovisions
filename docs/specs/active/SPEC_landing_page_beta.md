# SPEC — `ourprovisions.app` landing page + `beta_signups` (migration 021)

**Scope:** Cross (OurProvisions front door + Velayo mission-control table #1)
**Type:** New origin · new Vercel project · new table · migration · public-write RLS · verification required
**Status:** Ready for BUILD — mockup approved 2026-07-16 (`mockup_landing.html`)
**Supersedes:** `SPEC_beta_signups.md` — never built; table confirmed **absent on prod** by query 2026-07-16. Retire it at merge.
**Tiebreaker:** where this spec and `mockup_landing.html` disagree, **the mockup wins**.

---

## Why this exists

`ourprovisions.app` is the app's **public home** — the story, the beta door, and
later the download/license page. The page is permanent; the beta door in it is
temporary. The load-bearing design consequence:

> **The story doesn't change when the door changes.** Two swap points, both
> commented in the mockup: the **status slot** (`Beta` → `Available now` →
> `New version`) and the **CTA** (`Come aboard` → `Download`). One line each.
> Today's beta page becomes tomorrow's license page for free.

`beta_signups` is the **first table in the mission-control layer** — operational
telemetry about the beta, owned by Velayo, distinct from the product tables
(`list_items`, `households`, …) owned by households. Nobody but Dan (service
role) ever reads it.

**Note the architecture choice:** a Velayo-scoped table is landing inside the
app-scoped Supabase project (`parpauldmbetptkmdwbd`). Deliberate, per KISS —
recorded so future-Dan knows it was a choice, not an accident.

---

## The model: TOLL, not gate

**Decided 2026-07-16.** The old shape was a gate: questionnaire → Dan reads it →
Dan reaches out → Dan sets you up. It made Dan the rate limiter and made a
promise his time can't keep at thirty testers.

The new shape is a **toll**: answer the questions and you're in.

Consequences the copy must honor:

- **No "invite only."** If answering grants access, invite-only is a fiction.
- **No "Dan will set you up."** The page speaks as a company. Human help is a
  **backstop**, not the gate.
- **No "almost."** The confirmation says *Welcome aboard*.
- **The toll is a courtesy, not a lock.** Nobody is turned away. Paying it buys
  a door already open with your name on it.
- **Say nothing about price.** "In beta and **free**" was caught and cut — it
  pre-commits monetization in a subordinate clause. The page now reads "There's
  one price of admission: tell us how your household shops." **Keep the page
  silent on money until monetization is decided.**

### Rejected: real gating
Checking the signup email against `beta_signups` at Clerk signup. It's a build
(RPC + Clerk hook), and its failure mode — user signs up with a different email
and is locked out of their own beta — is worse than the problem it solves. KISS:
*wait until people complain.*

### Vocabulary
**Come aboard** = invitation, an ask → every button.
**Welcome aboard** = arrival, a greeting → the confirmation, once.

---

## The arrival mechanic (the risky part)

**This is the seam that has failed 3-for-3 with external testers.** The toll
model sends every new user through it unattended. Highest-risk piece of the
build.

On submit, the page:
1. Fires the `beta_signups` insert (anon key), **fire-and-forget**.
2. Builds a pre-filled Clerk signup URL.
3. Shows the confirmation door.

```
https://ourprovisions.velayo.ai/sign-up
  ?email_address=<email>&first_name=<first>&last_name=<last>
```

### Rules — all load-bearing

- **The redirect must never be blocked by the insert.** If the insert fails, the
  user still gets through. *Never trap someone at the door because a telemetry
  table hiccuped.* The signup matters more than the row.
- **Nothing is parsed.** The form asks first and last as **separate fields** so
  no name is ever split on whitespace. ("Mary Jo Kelly" → Mary / Jo Kelly is
  wrong often enough to be rude.) We don't have to choose between a wrong last
  name and a missing one — we asked.
- **Pre-fill is a courtesy, not a lock.** Every field editable at signup, and
  the door says so. A field that arrives filled and can't be changed feels like
  surveillance; the same field, editable, feels like service.
- **OTP still fires.** Prior finding: Clerk `initialValues` / query-string
  pre-fill works, verification still happens. The door warns about the code, or
  its arrival reads as a wall.
- **Emails may diverge.** `beta_signups.email` and the eventual Clerk email can
  differ. Accept it. This is the concrete reason real gating would be fragile.

### What the door must say

The 3-for-3 failure was **not a bug — it was a gap in the welcome.** A tester
waited for an App Store download that was never coming. The fix is copy:

1. **There's no App Store download.** It installs from the web.
2. **Add to Home Screen** via the browser's share button.
3. **We've filled your details in** — change anything, confirm the code, you're in.

Then **one instruction, given visual weight** (its own class, rule above,
espresso not grey):

> **The list gets much better the moment someone else is on it. If you share a
> kitchen, invite them.**

Then, dim: *Stuck at any step? Reply to the welcome email and we'll help you get
set up.*

**Why exactly one instruction.** A full first-run checklist (create a second
household, invite, build a list, add custom items and categories, swipe to edit,
mark staples, filter) was proposed and **rejected**: (a) wrong surface — they're
about to cross to another origin and an OTP; anything taught here is forgotten
across that seam; (b) it turns the reward for paying the toll into homework;
(c) it contradicts the **★ invisible-affordances finding** (2026-07-11), whose
conclusion was *one reusable milestone-keyed coachmark primitive in the app*,
not per-feature written instructions. "Swipe left to edit" is taught in the app,
at the moment there's an item to edit. The invite is kept because it's the CI
activation metric (depth = ≥50% invite a second person).

**Why the conditional.** "Invite the people you live with" assumes there are
some. `just_me` is a crew chip and a real slice of households. "If you share a
kitchen" gives a solo tester a clean exit with no deficiency implied — the
condition simply doesn't apply. A solo tester is still a real beta tester; they
exercise catalog, staples, and shop flow. They just don't hit the depth metric,
which is *our* measurement problem, not theirs, and the page must not make it
theirs.

---

## Architecture: separate origin

| surface | domain | auth | build |
|---|---|---|---|
| landing page | `ourprovisions.app` | none — public, indexed | static |
| the app | `ourprovisions.velayo.ai` | Clerk | React PWA (unchanged) |

**Decision: separate Vercel project, not a route in the app.** Marketing at the
app's root means every request hits the React bundle before deciding what to
show, and fights Clerk's redirect logic forever. Separate origins keep the
landing page static, fast, indexable, and unable to fail an app build
(`CI=true` on Hobby treats ESLint warnings as hard errors — the landing page
must not participate). The only link between them is an anchor tag.

### Cloudflare DNS — the trap
Nameservers are at Cloudflare. Add the Vercel CNAME, set proxy status to
**DNS only (grey cloud)**, NOT proxied (orange). Cloudflare's proxy in front of
Vercel's edge causes redirect loops and certificate issues — Vercel terminates
TLS itself. **Start DNS early; it propagates while the rest is built.**

### CORS — new, and it fails silently
The landing page fetches Supabase from a **different origin** than the app.
`ourprovisions.app` must be allowed to reach the Data API. Verify explicitly in
the browser console — a CORS failure at midnight looks exactly like a code bug.

### First anon-role write in the system
The only Supabase call that runs **without a Clerk identity**. Every product
table uses `auth.jwt()->>'sub'`; this one uses the public `anon` role, because a
beta applicant has no Clerk session — they're applying for one. Pre-signup data
has no user to attach to. **Flag in ARCHITECTURE as a deliberate,
first-of-its-kind departure.**

---

## The one non-obvious security thing: insert-only, no-select

| role | INSERT | SELECT | UPDATE / DELETE |
|------|--------|--------|-----------------|
| `anon` (public visitor) | ✅ | ❌ **no policy** | ❌ **no policy** |
| service role (Dan) | ✅ | ✅ | ✅ |

**The absence of a SELECT policy for `anon` is the security.** With RLS on and no
permissive SELECT policy, anon can write a row and cannot read it back — not its
own, not anyone's. Two founder-only columns (`status`, `fit_note`) make this
non-negotiable: if a visitor could SELECT, they'd see Dan's private assessment
of them.

**Deferred by KISS (a decision, not an oversight):** no captcha, no rate
limiting in v1. A public insert endpoint can be spammed; at beta volume a junk
row costs one glance. Revisit when volume complains.

---

## The questions — "lucky seven"

Codes, not display prose (same principle as "UUIDs are the key, names are
display-only") so mission-control can `GROUP BY`. Page shows the label; row
stores the code.

**Selection principle: a question earns its place only if it changes a decision
we're actually going to make.** Nice-to-knows were cut.

| # | question | column | codes |
|---|---|---|---|
| 1 | Do you keep a running grocery list? | `keeps_list` | `always` / `sometimes` / `wings_it` |
| 2 | Who does the shopping in your home? | `who_shops` | `mostly_me` / `split` / `someone_else` |
| 3 | How does the shopping actually happen? | `shop_mode` | `in_store` / `delivered` / `mixed` |
| 4 | Who's on your crew? | `crew` | `just_me` / `partner` / `family` / `roommates` |
| 5 | More than one household? | `multi_household` | boolean |
| 6 | What would make your shopping better? *(optional)* | `wishes` | free text |
| 7 | Who's coming aboard? | `name`, `email` | first + last joined into `name` |

### Why each survived

- **`keeps_list`** — the habit the app replaces. "I wing it" is the hardest
  conversion; we want the count.
- **`who_shops`** — labor division. "Someone else — I plan" is the split-brain
  household: one maintains, another executes. Sharpest use case. *(Initially cut
  as redundant with `crew`; restored — crew is household shape, who_shops is
  labor division. Different facts.)*
- **`shop_mode`** — **NEW, and the biggest find of the session.** A
  service-shopper (Instacart / Fresh / pickup) is a household the roadmap
  doesn't serve as designed: Phase 2 smart list ordering is **aisle-based and
  there is no aisle**; Phase 3 cross-store pricing partly dissolves (the service
  picks the store, or the price is marked up); Phase 3 receipt scanning gets
  *easier* (digital receipt, not a photo). If this is a real slice of the beta,
  that's a roadmap fact we want **before** building aisle-ordering for people who
  never walk an aisle.
- **`crew`** — collaborative intelligence is the product. A house of roommates
  and a solo user are different products.
- **`multi_household`** — live research for the member-picker in NEXT. Weakest
  survivor; first to cut if an eighth ever needs room.
- **`wishes`** — every other question is a chip, and **chips can only confirm
  what we already suspect.** The only slot where a stranger tells us something
  we didn't think to ask. It is what `fit_note` exists to read — cut it and that
  column is dead on arrival. Optional, so it costs the reluctant one scroll.
- **`name` / `email`** — label is "Who's coming aboard?", matching the button
  beneath it. ("Where do we find you?" was cut: it's a *location* question in
  plain English, so it disagreed with the fields under it — and that mismatch
  reads as creepy.)

### Cut, and why

| cut | reason |
|---|---|
| **"How many stores in a typical month?"** (`store_count`) | Ambiguous: "two or three" could mean *a Costco run and a Publix run monthly* (Phase 3 gold) or *Publix, plus the bodega once* (one-store shopper with noise). Same chip, opposite meanings. Replaced by `shop_mode`, which forks the nearer phase. |
| **"Meals or staples?"** (`list_method`) | Forks toward OurChef — Phase 5. Ask when it's real; it changes a decision *then*, premature *now*. |
| **"Where are you shopping from?"** (`region`) | Brand curiosity in a research costume. Changes no decision today — no regional rollout planned. |

### Rejected: merging `shop_mode` with store-count

Proposed: "same store always / different stores / service". **Rejected — two
axes in one chip group.** "Same store" and "different stores" answer *where*;
"service" answers *how*. Independent, and every combination exists: a household
that Instacarts from Publix *and* runs to the bodega has two true answers and
must discard one. Single-select reports one and we'd never know which was
discarded — data that looks clean and isn't. **Worse than not asking.**

Corollary recorded: **don't shape questions to fit an unbuilt table.** The
temptation was to keep `store_count` populated. The table doesn't exist; the
questions are the thought, the schema is their shadow.

---

## Column design

`region` / `region_other` are **kept but unasked** — nullable, zero cost, and the
two-column escape hatch (chip is always a countable code; free text lands in
`region_other` only when `region='elsewhere'`) is a good design worth preserving
if region returns. Jamming free text into `region` would break every `GROUP BY`.

`store_count` and `list_method` are **dropped, not deferred** — `store_count` was
*replaced by a better question*, not postponed; it isn't coming back in that
form. An unused column is a question future-you will ask.

`name` stays **one column**. The form asks first/last separately; the insert
joins them (`first || ' ' || last`). The **URL params** carry the split. The
table wants a human-readable name for Dan to read; Clerk wants the parts.
Nothing is ever guessed.

| column | type | set by | notes |
|--------|------|--------|-------|
| `id` | `uuid` PK default `gen_random_uuid()` | system | |
| `created_at` | `timestamptz` default `now()` | system | |
| `name` | `text` not null | visitor | first + last, joined |
| `email` | `text` not null | visitor | may diverge from Clerk email |
| `keeps_list` | `text` | visitor | `always` / `sometimes` / `wings_it` |
| `who_shops` | `text` | visitor | `mostly_me` / `split` / `someone_else` |
| `shop_mode` | `text` | visitor | `in_store` / `delivered` / `mixed` |
| `crew` | `text` | visitor | `just_me` / `partner` / `family` / `roommates` |
| `multi_household` | `boolean` | visitor | |
| `wishes` | `text` null | visitor | optional — the "will they get it" signal |
| `region` | `text` null | visitor | **unasked in v1** |
| `region_other` | `text` null | visitor | **unasked in v1** |
| `status` | `text` default `'new'` | **Dan** | `new` / `contacted` / `onboarded` / `passed` |
| `fit_note` | `text` null | **Dan** | Dan's read of `wishes`. Private. Never visitor-visible. |

No analytics fields (referrer, UTM, device) — premature. The table earns its
place answering "who wants in and how do they shop," nothing more.

---

## Migration SQL — 021

> Paste only the SQL block. **Verify the environment by URL, never by the
> Supabase badge.** Dev (`zxwtxjjmssykhqrghouf`) first, then prod
> (`parpauldmbetptkmdwbd`). Next migration number is **021**; high-water mark on
> disk was 020.

```sql
-- 021: beta_signups — mission-control table #1
-- First table in the system that accepts writes from unauthenticated users.
-- anon may INSERT only; the ABSENCE of a SELECT policy is the security.
create table public.beta_signups (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  name            text not null,
  email           text not null,
  keeps_list      text,
  who_shops       text,
  shop_mode       text,
  crew            text,
  multi_household boolean,
  wishes          text,
  region          text,
  region_other    text,
  status          text not null default 'new',
  fit_note        text
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
```

---

## Build notes

- **Static page** — no React, no Supabase client library. A single `fetch` POST
  to the Data API with the anon key. One file if it stays readable.
- **Anon key is public by design** (already in the app bundle). Env vars on the
  landing page's own Vercel project.
- **Strip the mockup scaffolding**: the `.mockbar`, and the nav's `top:36px`
  offset which exists only to clear it (nav returns to `top:0`).
- **De-base64 the images.** The mockup is ~634KB inline. Real build: the
  Sacandaga photo and the three screenshots become files Vercel serves and
  compresses. **This is a front door — weight matters.**
- **Hero photo values are load-bearing**: `background-size:100% auto;
  background-position:center 42%` against the **full uncropped** photo. Tuned by
  eye (see below); do not "improve" them.

---

## Verification checklist

Dev first. Then prod, carefully. Wrap experiments in `begin; … rollback;`.

1. **anon can insert** — submit from the deployed page; confirm a row appears.
2. **anon CANNOT read** — with an anon-key client: `select * from beta_signups;`
   Expected: **zero rows** despite rows existing. **This is the critical test** —
   it proves `fit_note` is safe.
3. **anon cannot update/delete** — attempt via anon; expect denial.
4. **service role reads all** — `select *` returns every row incl. `status` /
   `fit_note`.
5. **CORS** — insert succeeds from `ourprovisions.app`, a different origin than
   the app. Check the browser console, not just the row count.
6. **Pre-fill round-trip** — submit; confirm the door's URL carries
   `email_address`, `first_name`, `last_name`; open it; confirm Clerk's form is
   pre-filled and **still editable**.
7. **Insert-failure resilience** — break the insert deliberately (bad key) and
   confirm **the user still reaches the door**.
8. **DNS** — resolves, TLS valid, no redirect loop (grey cloud, not orange).

---

## Findings for OTHER work (do not lose these)

### ★ The reposition control is proven necessary — Beat 1 inherits this

The July 11 session asserted the photo header "can't just accept a photo — it
needs a framing step." **Tonight proved it empirically, the hard way.** Claude
had the photo, pixel-level access, and colour-sampling, and still picked the
wrong slice **three times** — the flag kept landing outside the band or under
the scrim's dark cap. Dan fixed it in five seconds with a slider.

Two things Beat 1 must carry:

1. **The control is `background-size` + `background-position`, not a crop.**
   Non-destructive: store two numbers per household, never touch the original.
   A working prototype exists — `crop_tuner.html` (keep as reference).
2. **The scrim must survive off-centre subjects.** The approved top-and-bottom
   gradient assumed content lives in the middle; the flag at the **left edge**
   was crushed by the dark caps no matter where the crop moved. A **radial**
   scrim centred on the wordmark (protecting type where type actually is, ~30%
   at the edges) is what let it read. **A user's household photo will often have
   the meaningful thing off-centre** — pairing a reposition control with a scrim
   that destroys what the user just positioned is a trap.
3. **Scrim colour is black, not espresso.** Confirmed against the live app.

**The scrim is a shared primitive** — the landing hero and the app header are the
same problem at different scales.

### The photo-header mockup never reached `docs/mockups/`

`household_photo_header.html` (Jul 11) won an eye-test and was scheduled for
Beat 1, but was never listed in a DROPPED_FILES manifest — it lives only in that
chat, while ROADMAP holds its decisions as prose. **Process gap:** a mockup that
wins an eye-test and gets scheduled should ride the manifest to `mockups/`.

### EXIF orientation 6 on the raw Sacandaga photo

The rotation bug "fixed" on Jul 11 was fixed *in a derived copy*. The original
still carries orientation 6 and renders sideways without
`ImageOps.exif_transpose`. Any future import path must normalize EXIF —
**a real user's phone photo will land the same way.** Relevant to Beat 1.

---

## Deferred, on record

- **Blog home** — `blog_july_beta.md` is written; where it lives is undecided.
  A `/blog` route on `ourprovisions.app` is the obvious answer, but it's a
  build, not a paste.
- **Mailchimp** — now clearly an **outbound** layer, not capture. Signups land in
  `beta_signups`; Mailchimp sends the welcome (and puts the arrival instructions
  in an inbox where they can be found at the store). Separate job.
- **Spam hardening** (captcha / rate limit) — when volume complains.
- **Mission-control view** over the table (filter by `status`, read `wishes`,
  set `fit_note`) — deferred until there are signups to work.
- **`store_count` / `list_method`** — deliberately absent. If Phase 3 pricing or
  Phase 5 OurChef need validation, ask real users then; don't re-add speculative
  columns now.
- **Hero video** ("the boat movie of moving water") — the image layer swaps to
  `<video autoplay muted loop playsinline>` with the identical scrim. Design cost
  near zero; real cost is megabytes on the front door. **Ship the photo, add the
  video once the page is proven.**
- **Future-state hero** — when Beat 1 ships, the hero device can show the real
  household photo header. Designed for it already; one asset swap, not a
  redesign.
