# SESSION LOG
*One entry per session. Most recent at top.*

---

## FORMAT

```
### [YYYY-MM-DD] — [SCOPE] — [GOAL]
**Goal:** [one sentence]
**Completed:**
- [past-tense, action-verb led, max 7 items]
**Unfinished:**
- [honest list, or "None"]
**Next session:**
SESSION START
Goal: [logical next goal]
State: [what's working, what's live, what's broken]
Done when: [clear success condition]
**Files updated:** [list or "None"]
**DB changes:** [list or "None"]
```

---

## LOG

### [2026-07-18] — [OurProvisions] — Designed the household-management redesign; merged it with OurBanner into one Phase I build; scoped Events for Phase II
**Goal:** Redesign the household management sheet into an entity/membership model, fold it together with OurBanner into a single Phase I build, and lock the spec.
**Completed:**
- **Established the load-bearing model — collection → selected → scoped detail.** Households (CRUD) live above the line, this-household membership (roster + Invite) below; one selection drives both zones and the membership zone recomputes on switch (same class as the filter-reset rule). Deliberately the exact structure Phase II Events will reuse.
- **Landed the active-row affordance as a bare pencil (FINAL3)** after building and rejecting the pill variant (FINAL2); removed the redundant "ACTIVE" word. Bare wins because the "Edit" label already carries the action — keeps row-actions uniform (trash + Edit both containerless, right edge).
- **Relocated Delete into the Edit-household sheet** (own danger zone, creator-only), refining OurBanner's D2 — under the entity model, Delete is an operation on the household and belongs with its other edit-actions. "Created by you" resolves to the *creator-only visibility of Delete* (D4), not a header label.
- **Replaced the in-app invite banner with `navigator.share()` hand-off** — deletes the persistent-banner defect by construction (no in-app surface to linger); removed "Copy link instead" (the share sheet already offers Copy).
- **Unified both zones on one clay eyebrow rhythm** (`YOUR HOUSEHOLDS` / `{HOUSEHOLD} · MEMBERS`); household rows are name-only (dropped the monogram/anchor placeholder).
- **Locked `SPEC_household_management_phase1.md`** (D1–D8, build sequence, verification) with `mockup_household_manage_FINAL3.html` as the tiebreaker mockup of record; scoped Events out of Phase I as design-first (photo-as-context-identity noted to generalize OurBanner).
- **(Claude Code) Merged the handoff + routed payload:** filed the spec → `docs/specs/active/`, the mockup → `docs/mockups/`, and **folded a one-char correctness fix into the authored-not-applied `migrations/024_household_photo.sql`** — its verify block was `and X like … or Y like …` (missing parens → `AND` binds tighter than `OR`); now `and (…)`. No manifest accompanied the payload; DRAFT_privacy left parked per ROADMAP.
**Unfinished:**
- **Phase I NOT built** — this was design only. Next session builds the two-zone sheet + OurBanner (migration 024 apply → Edit sheet → management sheet → `navigator.share()`), one tested commit per step, dev→main held until Phase I fully validated.
- **Migration 024 still authored, NOT applied** — assign the number at point-of-build against the `migrations/` high-water mark (023 remains the intentional referral gap).
- Carried from prior session: anon-surface audit (`category_avg_prices`), disclosure decision (Dan's call), client-side `is_global` filter on the anon catalog fetch (defense-in-depth; 022 is the real fix).
**Next session:**
SESSION START
Goal: Build Phase I — household-management redesign + OurBanner — dev-verify, then prod.
State: Phase I design fully approved + spec'd (`docs/specs/active/SPEC_household_management_phase1.md`, FINAL3 bare-pencil, entity/membership model); OurBanner spec (`SPEC_household_photo_header.md`, D1–D8) stands, refined by the management spec's D2/D4. Migration 024 authored + paren-fixed, not applied. Landing page live; anon catalog leak closed (022, prod-verified).
Done when: two-zone sheet + OurBanner pass all Phase I verification items on dev, then prod — bare pencil on the active row only, Delete creator-only inside Edit, Invite fires the OS share sheet with nothing rendered/lingering in-app, membership zone recomputes on switch, and all OurBanner items (EXIF, framing, wordmark states, RLS) pass.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`; routed `docs/specs/active/SPEC_household_management_phase1.md`, `docs/mockups/mockup_household_manage_FINAL3.html`; corrected `migrations/024_household_photo.sql` (verify-block parens).
**DB changes:** None applied. Migration 024 authored + corrected (verify-block parenthesization), still not applied.

### [2026-07-18] — [OurProvisions] — Closed a live prod data exposure; designed Beat 1 (household photo header / "OurBanner")
**Goal:** Fix the anon catalog leak found before session start, then design the household photo header.
**Completed:**
- **Diagnosed + closed a LIVE PROD data exposure.** The `{anon}` SELECT policy on `catalog_items` — named `"Anyone can read global catalog items"` — had predicate `(deleted_at IS NULL)` with **no `is_global` check**. All 183 rows, incl. 133 household-custom rows of free-text PII (a beta user's parent's medication schedule + dated caregiving notes), were readable by any anonymous visitor with the publishable key. **Migration 022 applied dev + prod, browser-verified 183 → 50** (0 custom).
- **Established "a query asks for what it wants; RLS is the backstop, not the filter."** The client's anon fetch also lacked an `is_global` filter — two layers failed, each alone masking the other. Relying on RLS as the *primary* filter makes every policy load-bearing for correctness, and when both fail the blast radius is the whole table.
- **Designed OurBanner** — per-household photo header with household-owned framing (drag + zoom) and a three-state wordmark control (`large`/`small`/`hidden`). Mockup approved (`docs/mockups/mockup_ourbanner.html`).
- **Decided "the group sets the look"** — photo, framing, banner state, and name are household state, any member; reversed an in-session lean toward a per-user preference (a private reskin of shared chrome is the one place the app would quietly stop being *ours*).
- **Proved zoom is mandatory, not polish** — a 2.6:1 band can't be filled by an arbitrary photo with `background-position` alone (`IMG_7897` frames only ~165%); Beat 1's three fixed slices couldn't express it. Framing = position **and** scale, both persisted.
- **Superseded the scrim primitive → one principle, two treatments** — radial for the landing hero (we control the photo), **band** for the app header (arbitrary photos, off-centre subjects; darken only the two strips that are always type). Black, not espresso; text-shadows now load-bearing.
- **Confirmed EXIF normalization is a hard requirement** — 2 of 2 supplied photos carried non-identity orientation (6, then 3); normalize on the **stored** artifact (`<canvas> drawImage` ignores the tag).
**Unfinished:**
- **Migration 024 authored, NOT applied** — Beat 1 build (storage bucket + Edit-household sheet + client) is next session.
- Client-side `is_global=eq.true` filter on the anon catalog fetch (`useProvisions.js` ~216) — instruction given, not built. Defense-in-depth only; **022 is the real fix.**
- **Disclosure decision OPEN** — custom item text was publicly readable for an unknown window; small F&F group (Helen, Elly, Aidan), no evidence of access. **Dan's call.**
- **Anon-surface audit** — `category_avg_prices` rides the same signed-out fetch path; confirm it's an aggregate with no per-household rows and no same-shaped policy.
- Safe-area / Dynamic Island check on the band scrim (needs hardware); optical-centre value (5%) provisional until tab icons render.
- The competing parallel-session trio (bare `SPEC_household_photo_header.md` + `023_household_photo.sql` + `mockup_household_photo_modal.html`) the handoff flagged for deletion was already absent — nothing to remove.
**Next session:**
SESSION START
Goal: Build Beat 1 — OurBanner (migration 024, `household-photos` bucket, Edit-household sheet).
State: Anon catalog exposure closed, dev + prod verified. OurBanner designed + mocked (`docs/mockups/mockup_ourbanner.html` approved). Spec `docs/specs/active/SPEC_household_photo_header.md`; migration 024 authored, not applied. Landing page live.
Done when: a household can add a photo, frame it by drag + zoom, and set the banner to large/small/hidden; a second member sees the same photo, framing, and banner state; a photo-less household renders today's espresso header unchanged with no banner control; a deliberately-rotated photo uploads upright.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`; routed `docs/specs/built/SPEC_anon_catalog_exposure.md`, `docs/specs/active/SPEC_household_photo_header.md`, `docs/mockups/mockup_ourbanner.html`; `migrations/022_anon_catalog_global_only.sql` (applied), `migrations/024_household_photo.sql` (authored).
**DB changes:** Migration 022 **APPLIED dev + prod 2026-07-18** — `alter policy "Anyone can read global catalog items"` → `using (is_global = true and deleted_at is null)`. Anon visibility prod **183 → 50** (0 custom), dev 38 → 38 (0 custom). Migration 024 authored, **not applied**.

### [2026-07-17] — [Cross] — Built + shipped the `ourprovisions.app` landing page; applied migration 021
**Goal:** Build the landing page from the approved mockup, apply migration 021, and get the front door standing.
**Completed:**
- **Applied migration 021 (`beta_signups`) to dev + prod** — verified 14 columns, `relrowsecurity=true`, exactly one policy (`public can apply` / INSERT / `{anon}`). Committed the `.sql` record (`migrations/021_beta_signups.sql`), with the "absence of a SELECT policy IS the security" reasoning inline. Closes the prior entry's "migration 021 not run."
- **Built `ourprovisions-landing` as a standalone static repo** (no React / Supabase-client / Clerk — a single fire-and-forget POST is the whole backend). Chrome/content split (`chrome.css` reusable vs `page.css`+`index.html` story); de-base64'd the four inline images (~634KB inline → cacheable files); hero `100% auto`/`center 42%` preserved. **Arrival mechanic verified in a real browser:** nothing parsed (first/last kept separate), `name` joined for the row, `multi_household` coerced to boolean, insert fires with `apikey`+`Bearer`+`Prefer`, and the door opens **even when the insert fails**. Committed + pushed to GitHub `Velayo-ai/ourprovisions-landing`.
- **Rewrote the three screenshot captions** (design chat) so heading and body do different jobs: Shop → *"Get in, get out, get it right"* (finally sells *speed*, the most obvious thing a shopper wants); Browse → *"The stuff you buy every week"* (plain heading; "staples" earns its place in the body). Synced verbatim to `index.html`.
- **Restructured the footer** into three grid columns (`1fr auto 1fr`) — wordmark left, tagline + `Velayo · Privacy · Terms` centred, copyright right; absolute `velayo.ai` legal URLs (one canonical copy for the fleet). Synced + browser-verified desktop and mobile (collapses to a centred stack at 720px). Closes the "collects emails with no privacy link" gap.
- **Drafted revised privacy-policy sections** against the live policy (§02/§03/§04/§06), schema-accurate to what `beta_signups` actually holds; **§07 (`fit_note` + access rights) left blank for counsel.** For legal review, not publication — scoped to `velayo-web`, not this repo.
- **Overwrote `docs/mockups/mockup_landing.html`** as the current tiebreaker (captions + footer + `color-scheme`); added `color-scheme:light` (meta + `:root`) to the page.
**Unfinished:**
- **Not live yet:** Vercel project env + deploy, live **anon-cannot-read** + **CORS** verification on the deployed URL, and Cloudflare **grey-cloud DNS** for `ourprovisions.app`. No `vercel`/`gh` CLI in this environment — Dan owns the deploy + DNS.
- Privacy policy still stale on `velayo.ai`; draft written, §07 deliberately blank — a lawyer's call.
- `handoff/DRAFT_privacy_beta_signups.md` is **stuck in the airlock** — its home is `velayo-web`, which is not present locally; cannot route it here.
- **Struck (false alarm):** the earlier "dark mode was never tested" finding — it was Claude's in-app browser theming a downloaded mockup file; `ourprovisions.app` in Safari renders correctly and always did.
**Next session:**
SESSION START
Goal: Take the front door live — Vercel deploy + env vars, verify anon-cannot-read/CORS on the deployed URL, then Cloudflare grey-cloud DNS for `ourprovisions.app`.
State: Landing repo built/verified/pushed (`Velayo-ai/ourprovisions-landing`); migration 021 live dev+prod (14 cols, RLS armed); captions + footer synced. Not deployed, not DNS'd. ⚠️ The design handoff named a "catalog leak" as the P0 for next session — **not reflected anywhere in this ROADMAP; reconcile with Dan** (the grounded open loop is the deploy/verify/DNS above).
Done when: `ourprovisions.app` resolves over TLS, a stranger's submission lands a prod `beta_signups` row, an anon-key `select *` returns **zero rows**, and the door hands a pre-filled Clerk signup.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/mockups/mockup_landing.html`; `migrations/021_beta_signups.sql` (new). Separate repo: `Velayo-ai/ourprovisions-landing` (built + pushed).
**DB changes:** Migration 021 `beta_signups` **applied dev + prod 2026-07-17** — 14 cols, RLS on, one anon INSERT-only policy.

### [2026-07-16] — [Cross] — Designed the `ourprovisions.app` landing page; set the beta access model
**Goal:** Design the public landing page for the OurProvisions beta and decide how strangers get in.
**Completed:**
- **Chose the TOLL model over the gate** — answer the questions and you're in. Kills "Dan will set you up" (a promise his time can't keep at thirty testers), kills "invite only" (a fiction if answering grants access), kills "almost" on the confirmation. Human help becomes a backstop, not the bottleneck. Rejected real gating (RPC + Clerk hook) — its failure mode (user signs up with a different email, locked out of their own beta) is worse than the problem.
- **Set the two-surface architecture**: `ourprovisions.app` (static, public, indexed) as the front door; `ourprovisions.velayo.ai` (Clerk, React PWA) unchanged. Separate Vercel project, not a route — marketing at the app's root fights Clerk's redirect logic forever and lets a marketing typo fail an app build.
- **Cut the questionnaire from nine to a "lucky seven"** on one principle: *a question earns its place only if it changes a decision we're actually going to make.* Added `shop_mode` (in-store / delivered / mixed) — the session's biggest find: a service-shopper is a household Phase 2's aisle-based ordering doesn't serve. Dropped `store_count` (ambiguous) and `list_method` (Phase 5). `region` kept in schema, unasked.
- **Designed the arrival mechanic** for the seam that has failed 3-for-3: Clerk pre-fill via query string (first/last asked separately so nothing is ever parsed), insert is fire-and-forget so a telemetry hiccup can never trap someone at the door, and the door carries the five words of copy the July blog said would have saved Aidan the wait — *there's no App Store download*.
- **Rewrote the thesis section** off Dan's frame: the shop is the pain, the list is the instrument. Cut "did it save?" (an engineer's anxiety no shopper has ever had) and "the shared list is sacred" (an engineering vow). Landed Dan's line — *you don't need a budget to control what you spend on food; you need a list* — which buys the spending stakes without becoming a budgeting app.
- **Caught and cut a pricing commitment**: "OurProvisions is in beta and **free**." Pre-commits monetization in a subordinate clause. Page is now silent on money.
- **Approved the mockup** (`docs/mockups/mockup_landing.html`) with the real Sacandaga photo header, three real app screenshots, and the questionnaire.
**Unfinished:**
- Nothing built. Migration 021 not run; `beta_signups` confirmed **absent on prod**. No Vercel project, no DNS, no CORS verification.
- Blog home still undecided — `docs/content/blog_july_beta.md` is written but has nowhere to live. A `/blog` route on `ourprovisions.app` is the obvious answer; it's a build, not a paste.
- Mailchimp untouched. Reframed as **outbound** (welcome email), not capture.
- Hero video ("boat movie") deferred — ship the photo first.
**Next session:**
SESSION START
Goal: Build and ship the landing page — migration 021, Vercel project, DNS, and the anon insert.
State: Mockup approved. `beta_signups` does not exist on prod (queried). Prod recovered from the 15 Jul outage; F0/F1b live; contributor A-fix now prod-verified. Referral primitive (also migration 021 in its own spec) specced-not-built — the two 021s must be reconciled at build.
Done when: `ourprovisions.app` resolves over TLS, a stranger's submission lands a row in prod `beta_signups`, an anon-key `select *` returns **zero rows**, and the door hands them a pre-filled Clerk signup.
**Files updated:** None (design chat — mockup + spec routed to `docs/specs/active/` + `docs/mockups/` + `docs/content/`).
**DB changes:** None yet — migration 021 (`beta_signups`) authored, not applied.

### [2026-07-16] — [Cross] — Took the prod backup floor; closed the contributor A-fix; specced the referral primitive
**Goal:** Verify the contributor A-fix on dev and merge to main; take a prod `pg_dump` backup floor.
**Completed:**
- Took the **first prod backup since March** — `pg_dump 17.10` → custom-format dump (396 KB, `--no-owner --no-privileges`), TOC-verified (`pg_restore --list` shows TABLE DATA for all three core tables, all RLS policies, FK constraints incl. F0's `list_items_household_catalog_unique`, realtime publications, and `get_list_items_for_household`), then copied off-instance to Drive. `*.dump` added to `.gitignore`.
- **Closed the contributor A-fix** (`3182afc`): dev-verified two-account against all three assertions, merged dev→main (`d972c88` → `abc5f15`), prod-verified. Shop name-line derives from the contributor ledger; own items show no name line; a remove→revive attributes to the real contributor. **Done-when met.**
- Corrected the A-fix test script mid-session: `remove_list_item` is not a button — it fires from `updateQty` when quantity hits **0**, and only the *other* user's window can read the result (`isOwnItem` suppresses the name line on your own).
- **Confirmed the contributor ledger write-half is genuinely unbuilt** by hitting the gate head-on: Dan's badge-arithmetic scenario needs a per-actor quantity *delta*, but `updateQty` sends end states, not deltas — the DB cannot distinguish "I withdraw my 5" from "I think we need 5 total." **That ambiguity IS the build-gate**; tonight's fix is display-only.
- **Overturned the Heddi RCS rich-card diagnosis** (2026-07-14): Chris received a carded link on Android and it worked, so card+tap is not the cause. Leading unproven hypothesis: Dan's link was **schemeless** (`ourprovisions.velayo.ai`) where the in-app invite carries `https://`. n=1, unreproduced.
- **Re-framed "invite-arrival friction is systemic" as three distinct failures in three layers**: Aidan = expectation (expected a download); Heddi = delivery (schemeless/intent); Chris = app (join never activated — **still unqueried against prod**). One fix cannot close all three. Named the real gap: **there is no front door** — `beta_signups` is a table with no sign-up page, questionnaire, or welcome email in front of it (the skipped 2026-07-10 goal). The only working front door is the household invite, which grants membership.
- **Designed the referral primitive** end-to-end (copy, placement, schema, metric) → `SPEC_referral_primitive.md` (routed to `docs/specs/active/`).
**Unfinished:**
- **Chris's failed join — still unverified against prod** (carried since 2026-07-14). Stale client view vs. missing `household_members` row vs. already-fixed banner race. The only arrival failure where the app might actually be broken. Starts with a query, not a design.
- **Heddi's failure unexplained/unreproduced.** Cheap open test (5 min): text an Android phone `ourprovisions.velayo.ai` vs `https://ourprovisions.velayo.ai`, tap both.
- **Referral button label unsettled** — "Share OurProvisions" is a placeholder; resolve at build or in the nav/affordances session.
- **Migration record has honest gaps** — 009–012 and 017 absent from disk (`archive/` holds a *pre-baseline* 002–006, not the missing files); duplicate `007`. Deliberately NOT reconstructed.
- **Prod has a floor, not a strategy** — tonight's dump ages from this moment; decide cadence deliberately (cron / plan upgrade / accepted risk), not by drift.
- RUM detector threshold (1) still untuned; prod Postgres patch (17.6.1.084 → .141) deliberately not taken before the backup existed.
**Next session:**
SESSION START
Goal: Write the front door — the sign-up page + the seven-question "come aboard" questionnaire copy.
State: Prod healthy, backed up off-instance. Contributor A-fix live and prod-verified. F0/F1b/F2/F3 shipped; migrations 018/019/020 live dev+prod. Referral primitive specced, not built. `beta_signups` table exists with no form in front of it and no email behind it. Three beta-arrival failures diagnosed to three layers; Chris's is the only possible app defect and is unqueried.
Done when: The sign-up page + questionnaire copy exist and eye-test passes; a referral link has somewhere to land that explains what OurProvisions is and that it is a web app, not a download.
**Files updated:** None from the design/ops chat. Repo changes made directly: `.gitignore` (`*.dump`), dev→main merge `d972c88` → `abc5f15`.
**DB changes:** None. Prod `pg_dump` taken (read-only) — `ourprovisions_prod_20260715.dump`, verified, off-instance in Drive.

### [2026-07-15] — [Cross] — Diagnosed prod Supabase outage; stood up user-visible alerting (RUM + Synthetics)
**Goal:** Restore prod (hung on "Loading your provisions…") and close the gap that let an outage run undetected.
**Completed:**
- Diagnosed the outage to a wedged PostgREST at the **Supabase platform layer** — not app code, data, or load — via a hypothesis-killing sequence: `pg_stat_activity` showed 6 idle infra connections + zero app queries (DB *unreached*, not overwhelmed); the error was a Cloudflare→origin **522**, uniform across every Data API endpoint; the IOPS chart read **3 of 3,000**.
- Killed the Disk IO hypothesis with evidence — 3 IOPS vs 3,000 max, 78 KB/s vs 125 MB/s, ~30% peak burst-budget; Supabase's warning email + "53% Disk IO" tile were burst-budget *accounting*, not load. Dev healthy on identical code eliminated every repo-level cause.
- Restored prod by **restarting the project**; confirmed settled.
- Built a Splunk **RUM detector** (`rum.client_error.count` · Sum · `sf_environment:production` · above 1 · immediately · Major) — Splunk's estimator backtested it to exactly **1 alert in the prior week** (the real outage). A first config (threshold 3 / 80%-of-5m) estimated 0 — it would have missed the event.
- Built a Splunk **Synthetics API test** (`GET /rest/v1/catalog_items?select=id&limit=1` w/ anon key · AWS N. Virginia · 5 min · assert 200) + uptime detector (<90%, 2 consecutive, Critical) — verified live at HTTP/2 200 in 122ms before activation. It exercises **PostgREST**, not the Vercel HTML shell (which stayed green through the whole outage).
- Added a detector to the pre-existing `Velayo Inc.` Splunk browser test, which had been running with zero alerting.
- Reversed the earlier "upgrade Supabase compute" recommendation — prod runs at ~0.1% of disk IO capacity; Free/nano is adequate at current scale.
**Unfinished:**
- RUM detector threshold (1) untuned against real noise — raise to 2 if a tester's flaky connection pages overnight.
- 11 Jul Disk IO burst step-up (0% → ~30%, ~coincident with migrations 018/019/020 shipping) unexplained — parked deliberately (harmless at 30% of a budget never approached; 15 Jul returned to ~0%).
- Splunk OTel Collector on AWS Lightsail — designed, not built; deferred to Phase 3–4 ("a fun afternoon, not a fire drill").
- Contributor A-fix (`3182afc`) still on dev, unverified — this same outage is what blocked its verify/merge; verify → dev→main now that prod is recovered.
- Prod still Free tier / nano / **no backups** — take a `pg_dump` off-instance floor.
**Next session:**
SESSION START
Goal: Verify the contributor A-fix on dev and merge to main; take a prod `pg_dump` backup floor.
State: Prod restored and healthy. User-visible alerting now live — RUM JS-error detector + Synthetics Data-API uptime detector + browser-test detector — covering both "users hitting errors" and "prod down with nobody watching." F0/F1b shipped + prod-verified; migrations 018/019/020 live. Contributor display-fix on dev, unverified.
Done when: A-fix verified on dev (name renders from ledger; own items show no name line) and merged to main; a prod `pg_dump` exists off-instance; RUM threshold confirmed against a week of real traffic.
**Files updated:** None (all work in Splunk Observability Cloud + Supabase dashboards).
**DB changes:** None.

### [2026-07-15] — [OurProvisions] — Closed the shared-list integrity arc (F0 + F1b); shipped contributor-attribution display fix
**Goal:** Ship F0 (`uq_live_list_item`) and F1b (hide→re-add no-stomp) to close the shared-list data-integrity arc; fix the contributor attribution surfaced during prod verification.
**Completed:**
- Applied migration 020 (`uq_live_list_item` partial-unique on `list_items`) by hand to dev + prod after a zero-row dup census cleared the pre-req gate; committed the `.sql` record (`0554587`). Clean CREATE both envs is itself the proof.
- Built F1b (client): `unhideItem` un-hide-only primitive, `updateQty` resolver hardening (hidden ≠ new), and a search reveal card — a hidden-but-live item now un-hides instead of stomping the shared quantity 10→1 (`85f4a69`).
- Verified F1b two-account on dev AND prod; merged dev→main (`28539af`) — F0 + F1b + Add-pill all live.
- Cleared Add-pill affordance drift at point of discovery: search no-results row now uses the `.add-btn` pill, not the old `+` circle (`c180b73`).
- Diagnosed the contributor bug (DH saw "Dan Test User" on his own item) across four DB censuses: `list_items.added_by` (immutable, INSERT-only) and `list_item_contributors` are two independent records of one fact — `remove_list_item` (009) clears the ledger on remove while the revive path restores the row without it; the `≤1 contributor` UI branch fell back to stale `added_by`.
- Shipped the display-half fix — Shop name-line derives from the contributor ledger, `isOwnItem` keys off the sole contributor's `clerkId` (`3182afc`).
- Designed the contributor badge model from first principles ("a badge is the last thing you said"); rewrote `SPEC_contributor_ledger_desync.md` (build-gated → `active/`).
**Unfinished:**
- Contributor A-fix (`3182afc`) is on dev, **unverified** — prod Supabase went Unhealthy (Supabase platform incident, not our code) before test/merge. Verify on dev, then dev→main.
- `SPEC_contributor_ledger_desync.md` build-gated on one open question: rule (a) needs a per-actor quantity *delta*, but the stepper reports end states — unproven the client can attribute a change to an actor under polling/optimistic updates.
- The spec's claim that migration 009 "solved the wrong problem" is asserted from a code comment — verify before acting.
- Remove-confirm dialog + `addedByMap` still read `added_by` — repoint, then demote `added_by` to audit-only.
- **Prod has no backups** (Free tier, nano, real beta users' data). Pro-plan decision deliberately deferred to a green dashboard (both projects share the Velayo org, so Pro pulls dev onto paid too, ~$45/mo).
**Next session:**
SESSION START
Goal: Verify the contributor A-fix on dev and merge to main; then take a prod `pg_dump` as a zero-cost backup floor.
State: F0 (020) live dev + prod. F1b built, verified both envs, merged. Add-pill merged. Contributor display-fix on dev, unverified. Prod Supabase was Unhealthy at session end — confirm recovery FIRST.
Done when: A-fix verified on dev (name renders from ledger; own items show no name line), merged to main, a two-user item reads the real contributor on prod, and a prod dump exists off-instance.
**Files updated:** `src/App.js` (F1b Layer 1 + reveal card + Add pill + contributor display fix), `src/hooks/useProvisions.js` (`unhideItem`, `updateQty` resolver hardening), `migrations/020_uq_live_list_item.sql` (record of applied migration); spec moves (F0 / F1b / shared_list_integrity → `built/`, contributor → `active/`).
**DB changes:** `uq_live_list_item` partial unique index on `list_items (household_id, catalog_item_id) where deleted_at is null` — applied by hand to dev (`zxwtxjjmssykhqrghouf`) + prod (`parpauldmbetptkmdwbd`), clean CREATE both. Reversible: `drop index uq_live_list_item;`

### [2026-07-14] — [OurProvisions] — Beta feedback capture: Chris & Heddi live testing session
*(Retroactive capture — session occurred 2026-07-14, handed off 2026-07-15 after two later build sessions were already logged; slotted by date per the handoff's merge note.)*
**Goal:** Capture and structure beta feedback from watching Chris and Heddi use OurProvisions live — without acting on it.
**Completed:**
- Diagnosed Heddi's Android launch failure as an RCS rich-card intent-resolution problem, not a PWA-install problem — the card intercepts the tap and fires an unresolvable intent; typing the URL bypasses it. Fix lives in invite *delivery* (plain link + expectation copy), not the app.
- Established invite-arrival friction as **systemic**: 3/3 external testers failed at the link→app seam (Aidan expected a native download; Heddi hit the card intent; Chris's first accept didn't activate the household) — gating the CI activation metric.
- Separated **referral** (advocacy — no token, no grant) from **household-invite** (authorization — token + membership + write access) as two distinct primitives; capture referrer attribution at the link layer now, defer rewards to Phase 4.
- Reframed Chris's "I want my own list" as a personal *lens* on the shared list, not a fork — consistent with the `activeHouseholdId` lens pattern; shared list stays sacred.
- Identified **priority/intent signaling** as the missing dimension behind Chris's and Heddi's asks (must-have vs skippable; who owns the miss) — a field on `list_items`, three-state max, mechanism deferred.
- Confirmed swipe-discoverability failure with a third data point (Chris, Aidan, Helen all reached for long-press); prioritized **hidden-items findability** as the one correctness defect of the night (generates bad state, not merely suboptimal).
**Unfinished:**
- Prod DB verification of Chris's first failed join (stale client view vs missing `household_members` row) — never queried; unknown whether distinct from the banner-timing race.
- Splunk RUM replays for Heddi + Chris not pulled (would settle the false-red-banner / missing-green-banner timing question).
- Search/filter label decision + per-item action surface (long-press vs visible affordance) + event-vs-household modeling fork — all deferred to their own sessions.
**Next session:** *(SUPERSEDED — see drift note below)*
SESSION START
Goal: Build the hidden-items findability fix — search surfaces hidden matches with per-item inline unhide.
State: Beta live with real users (Helen, Elly, Aidan, Chris, Heddi). Core loop works once past invite-arrival friction.
Done when: Searching a hidden item surfaces it with inline per-item unhide; re-searching a hidden item no longer walks the user into creating a duplicate.
**⚠ DRIFT / SUPERSESSION (resolved at merge 2026-07-15):** This 2026-07-14 Next-session goal — hidden-items findability — was substantially DELIVERED by **F1b on 2026-07-15** (reveal card for a hidden-but-live exact match + `unhideItem` un-hide-only + `updateQty` resolver hardening so re-adding no longer forks/stomps). The current live direction is the 2026-07-15 entry's Next block (verify contributor A-fix → merge; prod backups). Residual from this handoff's fuller vision: hidden matches shown as a *distinct group* in search results (F1b surfaces a single exact match, not a grouped list) — tracked in NEXT. Dan to confirm.
**Files updated:** None
**DB changes:** None

### [2026-07-13] — [OurProvisions] — Shared-list data-integrity: fixed Bugs 1, 2, 3 (catalog fork + check path) — shipped to prod
**Goal:** Root-cause and fix the three shared-list bugs (duplicate catalog item on re-add; check-one-checks-both; toggle bounce) and ship to prod.
**Completed:**
- Diagnosed all three from code + a prod query (not guessed): Bug 2 = un-scoped toggle write; Bug 3 = poll clobbering optimistic check (no guard, unlike quantities); Bug 1 = catalog-**layer** fork — a prod query overturned the initial list-layer hypothesis (3 list rows → 3 distinct `catalog_item_id`s).
- Shipped migration 018 (idempotent `insert_custom_catalog_item`: sql→plpgsql, normalized-name reuse, prefer global then oldest custom, store original casing) to dev + prod; committed the `.sql` record (`dcdf2bc`).
- Ran reversible prod cleanup (soft-delete/merge) resolving all **12 fork sets** the census found — 10 global double-seed dups (Mar-20 + Mar-30, prod-only; dev never affected) + 2 custom (English Muffins, Sandwich Bread); verified 0 remaining.
- Shipped migration 019 (F1c: partial unique indexes `uq_global_catalog_norm` + `uq_custom_catalog_norm`) to dev + prod; committed the `.sql` record (`7173f6a`). Clean CREATE is itself proof the dedup was complete.
- Built + shipped F2 (row-scoped toggle `.eq("id", listItemId)`, `listItemId` threaded end-to-end) + F3 (`pendingCheckRef` optimistic guard mirroring `pendingQtyRef`) — commit `b85dcbf`; promoted dev→main (`851b5ae`); prod-verified via tap tests incl. Slow-3G stress.
- Produced July beta content in the design chat (blog_july_beta.md + email_july_beta_update.md — authored there, not in this repo).
**Unfinished:**
- F0 (`uq_live_list_item` partial-unique on `list_items`) — the list-layer structural twin of 019; not yet built.
- F1b (client resolver eviction fix — `hiddenIdsRef` blinding `updateQty`'s lookup so re-add un-hides/reuses instead of forking) — not yet built.
- Double-seed root confirmation (evidence says manual/prod-only; ~5-min March-notes check to close).
- Spec kept in `docs/specs/active/` (NOT `built/`) — F0/F1b still to build from it; it graduates to `built/` on their ship.
- Stale migration numbering: 018/019 are now consumed (applied to prod), so ROADMAP's *planned* 017 (receipts) / 018 (beta_signups) need fresh numbers ≥ 020 — tracked in NEXT.
**Next session:**
SESSION START
Goal: Build F0 (`uq_live_list_item` partial-unique on `list_items`) to close Bug 2's root at the list layer, then F1b (resolver eviction).
State: All three shared-list bugs fixed + verified on dev AND prod. 018+019 live both envs, catalog fork-free both envs, F2+F3 in prod. Check path solid.
Done when: query (b) reads zero live-row dups on prod; `uq_live_list_item` created dev then prod (clean CREATE proves no violations); F1b re-add-un-hides behavior verified on the dev preview.
**Files updated:** migrations/018_dedupe_custom_catalog.sql + migrations/019_catalog_norm_unique_indexes.sql (committed this session), src/hooks/useProvisions.js (F2+F3, `b85dcbf`), src/App.js (`listItemId` threaded to `toggleChecked`), handoff→`docs/specs/active/` spec move. (Design-chat only: blog_july_beta.md, email_july_beta_update.md.)
**DB changes:** 018 (RPC) + 019 (2 indexes) applied dev+prod; 12 prod fork sets cleaned (reversible via `deleted_at`).

### [2026-07-11] — [Velayo OS] — Executed docs/ reorg: spec lifecycle folders (active/built/retired) + sorted the flat docs/ root
**Goal:** Turn the flat 40+-item `ourprovisions/docs/` into a scope→lifecycle structure and physically create the spec lifecycle folders — design handed off from a chat session; Claude Code confirmed each bucket against `git log` and executed the moves. *(Velayo OS repo-hygiene work; logged here per the single-company-log rule until app #2 forces the split.)*
**Completed:**
- Executed the reorg manifest (`SPEC_docs_reorg.md`) as ONE OS-scoped commit (`0303397`): created `docs/specs/{active,built,retired}/` and moved ~43 files by scope→lifecycle.
- Sorted specs: 31 → `built/` (shipped, forensic), 10 → `active/` (open/in-flight), 1 → `retired/` (spent `DECLUTTER_BUILD_HANDOFF`). `docs/` root now holds only the 3 canonicals + `DEV_SETUP` + `EVIDENCE` + `mockups/` + `specs/`.
- Resolved 3 specs the manifest never bucketed, via `git log`: `fix_authuid_rls` (migration 014 live) + `full_name_sync` (shipped 07-01) → `built/`; `beta_signups` (design-only, no ship commit) → `active/` (Dan's call).
- Moved the misfiled `007_dev_restore_role_grants.sql` from `docs/` → `migrations/`; flagged it now duplicates migration number 007 (`007_finish_authorize_sweep.sql`) — renumber TBD.
- Confirmed no-ops against ground truth: `qa/` moves already done (harness + `prod_test_plan` already there, no stale docs copies); `docs/mockups/` already populated (no loose mockups at root).
- Filed the manifest itself (`SPEC_docs_reorg.md`) to `built/`; consumed + deleted `design_handoff.md`.
**Unfinished:**
- **velayo-os leg not performed:** `velayo_os_flight_checklist.html` not present anywhere in the repo; `DESIGN_CHAT_handoff_prompt.md` is a protected airlock baseline (CLAUDE.md forbids moving it) — conflict flagged, not acted on.
- **Airlock wiring deferred** (Dan's choice: "move existing specs, wire airlock later") — CLAUDE.md + `DESIGN_CHAT_handoff_prompt.md` still land new specs at `docs/` root, not `docs/specs/active/`.
- **Stale spec-path references** across ROADMAP/ARCHITECTURE still point at old `docs/SPEC_*.md` paths; queued as a targeted NEXT sweep (not blanket-rewritten — many are woven into prose that discusses the paths).
- **Duplicate migration 007** number stands — renumber `007_dev_restore_role_grants.sql`.
**Next session:**
SESSION START
Goal: Return to the Tier-1 shared-list data-integrity bugs (duplicate catalog item on re-add; check-one-checks-both; toggle bounce) — diagnosis first.
State: Production live (Helen, Elly, Aidan). Declutter cycle prod-verified. docs/ reorg executed (`0303397`); lifecycle folders live. Three shared-list bugs still open, diagnosis-pending.
Done when: Root cause confirmed via prod DB query + `useProvisions.js` read; check-one-checks-one verified two-account; duplicate-on-readd prevented.
**Files updated:** Reorg (`0303397`): ~43 specs moved into `docs/specs/{active,built,retired}/` + `migrations/007_dev_restore_role_grants.sql`. Docs: SESSION_LOG, ROADMAP, ARCHITECTURE.
**DB changes:** None.

### [2026-07-11] — [OurProvisions] — Beta field-testing capture (Helen + Aidan) — 11 findings, photo-header design, invisible-affordances pattern
**Goal:** Capture usability + bug findings from watching two real first-time users on production, prioritize them by threat-to-beta-success, and schedule the household photo-header feature. *(Design/capture session — no code touched; merged from `design_handoff.md`.)*
**Completed:**
- Ran a live field-test debrief from watching Helen and Aidan use production; captured 11 findings + 1 validated win + 1 cross-cutting insight.
- Diagnosed three shared-list bugs — (1) duplicate catalog item on re-add; (2) check-one-checks-both; (3) toggle bounce — and framed 2+3 as a likely single root cause (toggle not bound to a unique `list_item` id). Flagged diagnosis-pending (need prod DB query + code read); no fix written.
- Designed + mocked the **household photo header** (Beat 1): eye-tested scrim treatments over the real Sacandaga photo, corrected an EXIF-orientation issue, landed on top-and-bottom gradient scrim + Slice B framing (cottage/flag/water). A direct expression of the ExD-as-art pillar.
- Named the ★ **"invisible affordances"** cross-cutting pattern: four usability reports share one root (hidden gestures / camouflaged chrome that only work once a human reveals them). Shaped a two-part solution philosophy: (a) visible affordances as durable floor, (b) a reusable milestone-keyed coachmark primitive as the welcoming layer.
- Logged the **invite flow validated in the field**: Aidan invited a second person first-try, unprompted — the CI/activation (depth) thesis firing live.
- Prioritized the board by **threat-to-beta-success** (breadth + depth), not by bug-vs-UX type.
**Unfinished:**
- Bugs 1/2/3 not fixed — diagnosis-pending. Need: (a) prod DB query on the English Muffins rows (2 catalog rows vs. 1 catalog + 2 list rows?); (b) read of the check/uncheck toggle handler + realtime subscription in `useProvisions.js` (keying vs. echo-collision). This is the next build session.
- ★ invisible-affordances philosophy is a **candidate** ARCHITECTURE principle, not yet ratified — needs a design session to adopt the two tenets + the coachmark-primitive approach.
- Households-in-Preferences (#7): unresolved whether Aidan meant "manage my households" vs. "switch active household." Clarify with Aidan before speccing.
- Nav cluster (tabs visibility / browse→list / bottom-reach / swipe-discoverability): bottom tab bar vs. sticky-top is an open design question; may resolve 3 of 4 in one structural move.
**Next session:**
SESSION START
Goal: Fix the shared-list data-integrity bugs (1 duplicate catalog item, 2 check-one-checks-both, 3 toggle bounce) — diagnosis first, then fix. Build session (Claude Code).
State: Production live with real users (Helen, Elly, Aidan). Invite flow validated in the field. Household photo header scheduled for Beat 1. Three shared-list bugs open, diagnosis-pending.
Done when: Root cause confirmed via DB query + code read; check-one-checks-one verified with a two-account realtime test; duplicate-on-readd prevented; toggle sticks first try. Combined spec if 2+3 prove one root cause.
**Files updated:** None (design/capture session).
**DB changes:** None (a read-only diagnostic query is proposed for next session, not yet run).

### [2026-07-11] — [Cross] — Shared declutter cycle built + promoted to prod (Browse + Shop), incl. two-account realtime verification
**Goal:** Build the shared declutter cycle (`SPEC_declutter_cycle.md`) in staged, individually dev-verified commits, then promote dev→main — a beta-worthy view-declutter primitive across both tabs.
**Completed:**
- Shipped the cycle in **3 staged, individually dev-verified commits**, then promoted dev→main (`3d256aa`): Shop hide-checked + flat A–Z (`80f1a03`); Browse hide-pills + flat A–Z (`419a5b9`); unify onto one shared `CycleIcon` + `FlatHeader` (`7b18db4`). Local guards clean each commit (Babel parse + ESLint `react-app`/`CI=true`, no unused-var fallout).
- Built one 46×46 icon cycling 0→1→2→0 (default grouped → tidied/noise-hidden grouped → flat A–Z). Encodes both axes in one control: bg light→dark = filters/checked shown→hidden (via an `.on` class, single CSS rule); lines tapering→equal = grouped→flat (two shapes, drawn once with `stroke="currentColor"`). Shop top row `[N of M checked] · [icon] · [Wrap up]` (Wrap up restyled distinct — espresso, normal case); Browse icon on the search line right of the field (heights matched at 46px), no item count. Quiet italic descriptor states the consequence when decluttered ("N checked items hidden" / "N filters active · filters hidden"), blank in phase 0.
- Confirmed the icon = approved mockup (`cycle_dual_readout.html`, variant A: 3 tapering "funnel" bars → 3 equal bars; the narrowing taper IS the implied Velayo V — chosen over a literal chevron, which risks reading as an accordion caret). Built to the mockup's CSS-bg + `currentColor` approach (46px), not the spec-prose's rect-in-SVG 48px sketch.
- Resolved an internal spec contradiction (state table said both "grouped/flat pref persists" and "phase resets to 0" — impossible, flat exists only at phase 2): followed the stateless approved mockup and **removed the persistent flat pref (`op_showCategories`)**. Reset-to-grouped is the better default anyway (grouping is the everyday shop-by-aisle view; flat A–Z is the hunt-for-one-item escape hatch).
- Verified on dev each step: core cycle both tabs, filter×flat interaction (flat renders the FILTERED set, header count matches), selections survive the cycle, phase resets to 0 on tab/household switch.
- **Two-account realtime verification passed** (DH/DT, same household, Shop; from the design-chat handoff): an incoming check under phase 1 → item hides, descriptor count updates, phase holds; Wrap up under a decluttered view rolls only unbought items, no phase-confused mis-write of the shared list. Closed the one surface a single-driver dev test can't exercise.
- **Closed the Browse filter-reset gap** (`dbb57f2`, on dev): the intended "commit 0" was dropped from the batch — `selectedCategories`/`stapleFilter` did not reset on household switch, a live household-scoped-state leak once phase 1 hides the pills (stale filter silently shrinks the new household's list). Added both resets to the existing `[view, activeHouseholdId]` effect (also clears on tab switch — intended; Browse filters are session state, not sticky). Babel + ESLint `react-app`/`CI=true` clean, no new deps. Pending dev-verify (2-household account) then dev→main.
**Unfinished:**
- **Dev-verify + promote the filter-reset fix** — `dbb57f2` is on dev, not yet verified or promoted. Test: switch households while in phase 1 (pills hidden) → land in phase 0, pills visible, no filters, full new-household catalog; and phase-0 filters clear on switch. Then dev→main.
- **Prod-verify pending** — cycle promotion done (`3d256aa`); still need hard-refresh + smoke test on both tabs + a quick two-account check on real prod data (fold in the filter-reset check once promoted).
- Icon legibility at 46px accepted on dev; if it ever reads mushy on a device, fallback is chunkier bars (heavier stroke / wider taper), NOT more bars.
**Next session:**
SESSION START
Goal: Dev-verify + promote the filter-reset fix (`dbb57f2`), then prod-verify the full declutter cycle on `ourprovisions.velayo.ai`.
State: Declutter cycle live on main (`3d256aa`); filter-reset fix on dev only (`dbb57f2`), unverified. Browse + Shop share one 46×46 cycle icon via `CycleIcon`.
Done when: Filter-reset dev-verified in a 2-household account (phase-1 switch lands in phase 0 with pills visible + no filters + full catalog; phase-0 filters clear on switch) → dev→main; AND the cycle is prod-verified on both tabs incl. a two-account check on real data.
**Files updated:** `src/App.js` (Shop cycle `80f1a03`; Browse cycle `419a5b9`; unify `7b18db4`; filter-reset `dbb57f2`); removed `op_showCategories` persistence; docs (SESSION_LOG/ROADMAP/ARCHITECTURE); routed `DECLUTTER_BUILD_HANDOFF.md` handoff→`docs/`.
**DB changes:** None.

### [2026-07-10] — [Cross] — Browse stepper ExD polish (Add⇄stepper) + iOS sticky-hover fix + spec-folder reorg design
**Goal:** Raise the Browse quantity controls to the ExD bar before beta — unify the +/− stepper into one pill and replace the ambiguous zero-state with an explicit "Add" affordance — and design Velayo OS spec-folder hygiene.
**Completed:**
- Unified the +/− quantity control from three floating circles into one pill (`ae7708c`); mockup-before-code, 3 variants eye-tested against the real palette.
- Shipped **Add → Stepper** (`a13530a`, built from `SPEC_add_to_stepper.md`): un-added Browse rows render a single "Add" ghost pill; tapping adds (qty 1) and reveals the −/N/+ stepper; − at qty 1 snaps the row back to "Add". Zero is never rendered — the ambiguous zero-state is gone.
- Fixed an intermittent iOS/WebKit sticky-hover on the Add button (`dea88a1`): guarded the `:hover` fill behind `@media (hover: hover)` + `.blur()` on tap so a re-render under the touch point can't latch the clay fill. Promoted with the stepper work dev→main (`27d881b`); prod-verified clean on `ourprovisions.velayo.ai`.
- Matched the stepper to the Add ghost treatment (`1cd0c6e`, own atomic commit): transparent-on-cream fill, clay-lo `#C9A97A` outline + dividers, no white fill, no shadow — the un-added "Add" pill and the added "− N +" stepper now read as one control family. Promoted dev→main (`85de8e0`); dev-preview confirmed before promote.
- Confirmed production domain = `ourprovisions.velayo.ai` (an earlier `ourprovisions.app` reference was a misstatement; CLAUDE.md already correct — no doc change).
- Designed a 3-folder spec reorg (`docs/specs/{active,built,retired}/`) with a proposed categorization of all 36 specs — DESIGN ONLY, not executed (Velayo OS hygiene).
**Unfinished:**
- **Declutter cycle build** — `SPEC_declutter_cycle.md` build-ready (3 staged commits: hide-checked on Shop, flat render on Browse, unify). Not started.
- **Spec-folder reorg** — categorization proposed but NOT executed; Claude Code must confirm each spec's bucket against `git log` before moving (design-chat inference is a proposal, not authority). Own commit; requires CLAUDE.md + DESIGN_CHAT_handoff_prompt.md edits (airlock specs would land in `docs/specs/active/`). Velayo OS scope — likely belongs in the velayo-os log once that repo's docs exist.
- Old stepper color-softening one-liner (`#fff → #FBF7F0`) — SUPERSEDED by the match-to-Add decision; do not apply.
**Next session:**
SESSION START
Goal: Build the shared declutter cycle (`SPEC_declutter_cycle.md`) in 3 staged, individually dev-verified commits.
State: Prod clean — Add→Stepper + hover fix + stepper-match all live on `ourprovisions.velayo.ai`. dev == main (all merged, prod-green), so declutter starts from an even base.
Done when: Browse + Shop share one 48×48 declutter icon; 3-phase cycle (default → tidied → flat A–Z) works on both tabs; Wrap-up + checked-state unaffected on Shop; Browse filters confirmed to reset on household switch; phase resets to 0 on tab/household switch. Each of the 3 commits verified on dev preview before the next.
**Files updated:** `src/App.js` (stepper pill `ae7708c`, Add⇄stepper `a13530a`, iOS hover fix `dea88a1`, stepper-match `1cd0c6e`); `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`; routed `SPEC_add_to_stepper.md` handoff→`docs/`.
**DB changes:** None.

### [2026-07-10] — [OurProvisions] — Beat 0 gates closed to prod + Beta 1 invite pivot: Web Share, duplicate-create fix, dead-code cleanup
**Goal:** Sync + merge the stacked dev commits to prod-verified main, then clear the tech debt gating the Beta 1 invite/CI pivot — the duplicate-household bug, dead scaffolding, and the invite flow itself.
**Completed:**
- Merged the stacked Beat-0 batch dev→main (`68d38c5`, `--no-ff`) and **prod-verified the false-removal-banner P0** (the deliberate-loss guard) — no observed defects. This was the last gate on the signup-email flip + the Beta 1 invite pivot; both now unblocked. ESLint `react-app` clean on all changed files (the CI=true warnings-as-errors gate).
- Shipped the streamlined invite flow (`8c62315`, **real-phone verified**): Send via `navigator.share` (feature-detected, Copy fallback) + single-source brand-voice `INVITE_MESSAGE` (preview === what's sent). Lazy-generate (Option B) — `prepareInvite()` on a ~500ms idle-after-open timer OR explicit tap, so a fast open/close writes no `household_invites` row; idempotent, in-flight-guarded. Trigger renamed "Invite someone aboard" + teal. Eye-tested against a mockup before code.
- Fixed duplicate-household creation (`565b133`, verified): root-caused via prod queries to a creation-race — Create's async onClick was never disabled during the ~2s await, so a 259ms double-tap fired two `create_household` RPCs → two distinct ids, each with its own owner membership. Fix = `creatingInFlight` guard (disable + dim + "Creating…", early-return, clears in `finally`). Diagnosis decidable from the read path (`get_my_households` returns one row per membership → a UI dupe is a data dupe). Server idempotency kept as a WATCH ITEM.
- **Ran the one-time prod cleanup (Part 2):** soft-deleted the later id of the existing "Test House 200" dup pair (2a preview → 2b soft-delete → 2c verify) — one live household per name, reversible (`deleted_at`, not hard delete).
- Removed dead `selfDepartureRef`/`markSelfDeparture` (`5da1c37`, verified): superseded by `deliberateLossRef`, grep-confirmed consumed nowhere in `src`. Dropped the ref, the callback, and its context-value entry; synced ARCHITECTURE's 3 stale mentions.
- Confirmed the Web Share email-subject gap is at the platform ceiling (`title` passed correctly; iOS Mail drops it; the full invite + link ride in `text` across every target) — documented as a known limitation, not code-fixable.
- Routed 3 specs handoff→docs + tracked the invite mockup.
**Unfinished:**
- **Splunk-on-local-dev** — unsolved. A dynamic-`import()` attempt was tried + reverted (webpack didn't dead-code-eliminate the branch on an unset token, so it didn't exclude Splunk). The reliable fix is a prod-telemetry change with tradeoffs that need a decision. ESLint remains a sound CI proxy; deployed builds unaffected.
- Local `npm run build` on the primary machine still can't run (broken partial `@splunk/otel-web-session-recorder` install + npm TLS `UNABLE_TO_VERIFY_LEAF_SIGNATURE`) — local-env only, unrelated to code.
- **WATCH ITEM — server-side idempotent `create_household`**: build only if prod shows a non-human duplicate `created_at` signature (sub-10ms or retry-spaced). The 259ms trigger was a human double-tap; button-disable covers it.
- Beta 1 launch assets still unwritten (the invite-button rename is only the in-app half of the "bring your first mate" match).
**Next session:**
SESSION START
Goal: Write the Beta 1 launch destination — the sign-up page + the reframed seven-question "come aboard" questionnaire copy — now that the invite/CI-pivot tech-debt pass is done and prod-verified.
State: All Beat-0 P0s prod-verified. Duplicate-household bug fixed + prod data cleaned. Dead scaffolding removed. Invite share-flow live + real-phone verified. Signup-email flip and invite pivot both unblocked. dev == main (all merged + prod-green).
Done when: sign-up page + questionnaire copy exist and eye-test passes; the inside-out build order for the remaining launch assets (welcome email → Mailchimp segments → blog → user email + social) is ready to execute.
**Files updated:** `src/App.js` (create-in-flight guard `565b133`; invite share flow `8c62315`), `src/contexts/ActiveHouseholdContext.js` (scaffolding removal `5da1c37`), `docs/ARCHITECTURE.md`.
**DB changes:** Prod one-time cleanup — soft-deleted the later id of the "Test House 200" dup pair (`deleted_at` set). No schema change.

### [2026-07-09] — [Cross] — Designed the Beta 1 "Come Aboard" launch funnel + defined the two-number success metric
**Goal:** Design the end-to-end customer experience for the first public beta — the call-to-action, the funnel from blog to app, the marketing asset set, and what "a successful beta" means as a number.
**Completed:**
- Settled the funnel shape: velayo.ai blog post is the primary ad vehicle; **ranked, not forked** CTAs — primary "Come Aboard" (→ ourprovisions.app questionnaire), secondary catch-net "Follow the journey" (→ Mailchimp) for the not-ready-today reader.
- Reframed the seven-question `beta_signups` questionnaire from an *application* to *onboarding intelligence* ("set your galley up right") — beta is open, so the questions collect setup signal, not admission judgment. Founder-only `status`/`fit_note` columns still populated by watching, not gatekeeping.
- Resolved the post-signup seam to "fewest clicks": questionnaire submit → straight into the app; Clerk account creation is the only step. Welcome email is a *parallel keepsake* (context + link back), never a gate.
- Verified (web) that Clerk supports pre-filling sign-up email via `initialValues` prop OR query string — carrying the questionnaire email into Clerk sign-up is real and cheap. CAVEAT: pre-fill ≠ verified; Clerk still runs its own OTP, so copy must expect a "confirm it's you" beat.
- Defined the **activation ladder** with the second-person **invite as the pivot**: R1 in-the-door (solo-safe: create/join → first item → browse); R2 the pivot (invite a second person); R3 the aha (see a shared edit sync live — only via R2); R4 it's-mine (qty/price, budget, waste); R5 come-back (PWA install + Message the bridge).
- Locked the **two-number beta success metric**: breadth = 10 users touch the key features; depth = ≥50% (5 of 10) invite a second person to exercise the CI thesis. Growth ladder in 10s: 10 → 100 → 1,000 → 10,000.
- Surfaced hidden gaps in the six-item deliverables list (see Unfinished) and set the inside-out build order.
**Unfinished:**
- All launch assets DESIGNED but UNWRITTEN. Set: (1) July "Come Aboard" blog post, (2) existing-user email → blog, (3) social announcement → blog, (4) sign-up page, (5) post-signup welcome email, (6) Mailchimp nurture series. Gaps added: (7) seven-question questionnaire copy (highest-leverage, own task), (8) velayo.ai "Follow the journey" catch-net form, (9) Mailchimp SEGMENTATION — beta users (in-app) vs journey-followers must be separate segments or feature-nudge emails misfire.
- Nurture series split nurture-now (live today) vs nurture-later (Beat 1/2 features become "we heard you" emails on ship). Receipt scanning drops off the beta-10 list entirely (Phase 3, no beta user touches it).
- Welcome email (#5) reshaped generic "welcome aboard" → pointed "bring your first mate" — now the single most important asset (invite-email success IS the 50% depth metric). Not yet written.
- Clerk pre-fill query-string PARAM NAME unconfirmed against the installed Clerk version — verify at build (don't assert from the 2023 changelog).
- The "data is yours" editable-profile surface — BANKED as a future beat (see ARCHITECTURE), not built.
**Next session:**
SESSION START
Goal: Produce the launch destination first — the sign-up page + the reframed seven-question questionnaire copy — since the activation ladder makes it the surface everything upstream links to. (Blocked-behind: the tech-debt pass to make the invite/CI pivot solid.)
State: Full beta launch STRATEGY locked (funnel shape, questionnaire reframe, Clerk pre-fill seam verified, activation ladder, invite-as-pivot, two-number success metric). Zero assets written yet. Beat 0 P0 fixes on dev; dev→main merge still gated. `beta_signups` table exists (insert-only, no-select RLS, founder-only status/fit_note).
Done when: sign-up page + questionnaire copy exist and eye-test passes; build order for the remaining assets (welcome email → Mailchimp segments → blog → user email + social) is ready to execute inside-out.
**Files updated:** None (design/decision session — read-only orientation + strategy).
**DB changes:** None.

---

### [2026-07-09] — [OurProvisions] — Closed the false-removal-banner P0; fixed blank-catalog + RUM masking; session replay working
**Goal:** Diagnose and fix the false "No longer a member" banner (the Beat 0 launch-email blocker), using session replay as the instrument.
**Completed:**
- Closed the false-removal-banner P0 across a four-commit arc (diagnostic `c9e330f` → v1 `a43a1ba` → v2 `081c641`; diagnostic reverted by v1). Root cause: a deliberate delete/leave and the 30s `checkPresence` watchdog both react to one membership loss; the poll fires the loud notice during the reconciliation gap. v2 raises `deliberateLossRef` at the START of the handler (before the destructive RPC), cleared in `finally`, so the poll defers across the whole action. Verified on dev — heavy create/delete churn on Slow 3G, no false banner.
- Fixed banner name-correctness (folded into `a43a1ba`): banner showed a stale sticky name instead of the actually-lost household; now threads the lost name from the pre-update `myHouseholdsRef` through an optional `lostName` param.
- Verified the genuine-external-removal regression (DH removed DT from Test 101): the notice still fires and names the household right — the guard does not over-suppress real removals.
- Fixed blank-catalog-on-category-delete (`4d17c58`, verified): deleting a filtered category left its `rawName` in `selectedCategories`, collapsing the filter predicate to empty. Fix = evict on delete + self-healing predicate (narrow only by categories that still exist).
- Fixed RUM session-replay masking (`f9ae19e`): `sensitivityRules` used key `type:` where the Splunk recorder expects `rule:` → all rules silently ignored → recorder fell back to mask-everything. One-word fix ×5.
- Got Splunk session replay rendering + unmasked; chased a blank-replay red herring to ground (capture/ingest/versions/console all healthy — blank frames were render latency, not a bug). Replay now usable as a diagnostic instrument (it surfaced the blank-catalog bug).
- Routed 5 built specs handoff→docs and reverted the temporary DIAG instrumentation (poll back to 30000, all `// DIAG` removed).
**Unfinished:**
- dev→main merge of the P0 fix — pending Dan's gate (deliberate: sleeping on a launch-critical change before promoting).
- NEW known-issue — duplicate same-named households surfaced during churn (create/invite/accept/remove/delete). Unclear: true duplicate creation (two ids) vs a display/dedup bug (one id rendered twice). Needs a clean controlled repro; not chased mid-churn to avoid debugging without attribution.
- Regression #3 re-confirm on v2 — passed on v1; v2 only widened the deliberate-action window so the path is logically sound, but a fresh two-device recheck before main is cheap insurance.
- Dead-scaffolding cleanup — `selfDepartureRef`/`markSelfDeparture` now doubly superseded by `deliberateLossRef`; defined + exported but never consumed. Queued (touches exported context API — kept out of the launch commit).
**Next session:**
SESSION START
Goal: Verify the P0 fix holds, promote dev→main, then get a clean controlled repro of the duplicate-same-named-household bug (determine two ids vs one id rendered twice).
State: False-removal-banner P0 fixed + verified on dev (`081c641`), not yet on main. Blank-catalog and RUM-unmask fixes on dev. Session replay working + unmasked. Beat 0 launch email still on the personal variant, still gated on the P0 reaching prod.
Done when: P0 fix verified on prod after merge; duplicate-household bug has a reliable repro and a root-cause direction (creation-race vs render-dedup).
**Files updated:** `src/rum.js` (RUM masking key `f9ae19e`); `src/App.js` (blank-catalog filter predicate + `deleteCategory` `4d17c58`; deliberate-loss guard in delete/leave handlers `081c641`); `src/contexts/ActiveHouseholdContext.js` (banner race fix + name fix + DIAG add/revert across `c9e330f`/`a43a1ba`/`081c641`).
**DB changes:** None.

---

### [2026-07-07] — [OurProvisions] — Beat 0 launch floor: ship + prod-verify the P0 fixes and run the cold-start gate
**Goal:** Close out the Beat 0 launch-floor fixes end-to-end (dev → prod-verified) and run the new-user cold-start walk to decide whether to flip the signup email to self-serve.
**Completed:**
- Shipped + PROD-verified the join-activation REOPEN (ADDENDUM): the dev-green `pendingJoinId` fix failed on prod under membership-propagation latency; replaced with durable/retriable flag consumption (`c1ceab2`) — invite → auto-switch → banner → survives hard-reload, verified on prod with an existing user starting in a prior household.
- Shipped + PROD-verified the sign-in/sign-up cold-load fix (`2249d0b`): disabled-placeholder gated on Clerk `isLoaded` (no layout shift) — no more dead-clicks on a cold load; verified disable-then-trigger on Slow 4G.
- Diagnosis-first split the staples/filter cluster into TWO independent bugs (A: staples symptoms 1+2; B: cold-start empty Browse symptom 3); ratified the staple model (join table for ALL staples) and two-separate-commits sequencing.
- Shipped + PROD-verified `household_staples` (Bug A, `949a8e9`): migration 016 (table + RLS on `is_member_of` + backfill + `get_list_items_for_household` repoint) applied to dev + prod; rewrote `toggleStaple`/catalog reads → global staples now persist per-household.
- Shipped + PROD-verified the cold-start empty-Browse race (Bug B, `7d1e3c2`): bounded retry on an empty/errored first global-catalog fetch so a cold start self-recovers instead of stranding `catalogMap={}` behind `loading=false`.
- Ran the new-user cold-start walk with real data: Bugs A + B both fixed; BUT the false "No longer a member" banner leaked once on prod during staple add/delete churn (non-reproducible) — now the blocker for the self-serve email flip.
- Captured three field-test feedback items from a real Sacandaga/Hannaford shop (orientation drift, shop-timer idea, rotation-lock coach-mark).
**Unfinished:**
- False-removal-banner leak ("No longer a member of that household") fired on prod during add/delete staple churn; non-deterministic, could not reproduce. Diagnosis-only next; blocks the signup-email flip.
- Signup email NOT flipped to self-serve — held on the personal variant (cold-start gate = PARTIAL GREEN) pending the banner-leak fix.
- Auth-gate residual: on pathological 3G, `isLoaded` enables the button before Clerk's modal chunks finish → brief tap-no-op window. Deferred (wait-until-complain).
- Migration-number collision: `016` is now `household_staples` (live on dev+prod); the queued `receipts` (was "016") and `beta_signups` (was "017") must renumber. Reconciled in ARCHITECTURE/ROADMAP this session.
- `catalog_items.is_staple` left dormant (no read path); drop in a later cleanup migration. `ON DELETE CASCADE` carve-out now documented in ARCHITECTURE.
- Local prod build broken on this machine: `@splunk/otel-web` in package.json but not installed locally; npm "Exit handler never called" glitch. Vercel builds fine — clean reinstall when convenient.
**Next session:**
SESSION START
Goal: Fix the false "No longer a member" banner leak that fires on a fresh/cold-start prod session during staple churn (stale membership/removal flag in storage surfacing while the user is still a member), so the cold-start gate can go fully green and the signup email can flip to self-serve.
State: Beat 0 launch floor otherwise clear — join-activation, auth-gate, staples (`household_staples`), and cold-start-empty-Browse all shipped and prod-verified. Migration 016 live on dev + prod. Invite path fully working on prod.
Done when: A fresh cold-start identity (and an add/delete staple churn session) on prod never shows the false removal banner while the user is still a member; verified on deployed dev then prod. Then flip the signup email to the self-serve "come aboard" variant.
**Files updated:** `src/App.js` (join-activation reopen `c1ceab2`; auth-gate `isLoaded` `2249d0b`), `src/hooks/useProvisions.js` (staples client `949a8e9`; cold-start retry `7d1e3c2`), `migrations/016_household_staples.sql` (new).
**DB changes:** `migrations/016_household_staples.sql` applied to dev (`zxwtxjjmssykhqrghouf`) AND prod (`parpauldmbetptkmdwbd`) — `household_staples` table + RLS + backfill (dev 1=1, prod 5=5) + `get_list_items_for_household` repoint (verified via `prosrc`).

---

### [2026-07-06] — [OurProvisions] — Plan the 45-day rolling-thunder beta launch
**Goal:** Design the structure, front door, and Beat 0 scope for a high-velocity beta that ramps engagement with a wider circle of friends and social connections.
**Completed:**
- Reframed the launch from "one polished release" to a 45-day high-velocity "rolling thunder" beta: ~6 weekly beats, cadence-as-product, "we're doing this together, you're aboard" narrative.
- Structured the beats: Beat 0 = launch floor + two-way channel (this week); Beat 1 = Shop/Filter (first visible ExD); Beat 2 = receipts (first AI); Beats 3–6 deliberately held open for real feedback.
- Settled the front-door architecture: velayo.ai (brand/journey) + ourprovisions.app (product) both feed ONE Mailchimp list; dropped the landing-page questionnaire (Mailchimp capture replaces it).
- Designed Beat 0 two-way channel: "Message the bridge" in-app feedback (store + notify, auto-context) and "Dispatches" in-app what's-new surface (one message → Mailchimp + in-app banner + social).
- Designed iOS install coach-mark in full: iOS Safari only, first-open show, two-step dismissal ladder, localStorage counter, "visit" = fresh app open; Android deferred to Chrome's native prompt.
- Confirmed self-serve cold-start is viable (household creation on first run already exists); gated the signup-email flip on a timed cold-start walk verifying clean zero-state onboard.
- Held join-activation fix as P0 launch-blocker — the invite path is the launch.
- [Session housekeeping] Completed July 5 SESSION END carry-over: appended 7 decisions, updated ARCHITECTURE.md with `beta_signups` schema/patterns, filed `EVIDENCE_grocery_savings.md` to `docs/`, committed `8956c07`.
**Unfinished:**
- Dispatch dismissal behavior undecided (lean: always-show-latest + ship's-log panel).
- Signup email flip to self-serve — gates on cold-start walk verdict; not decidable in design chat alone.
- All four Beat 0 specs authored; none yet built or applied to prod.
**Next session:**
SESSION START
Goal: Execute Beat 0 — ship the join-activation fix (P0) as the first clean win, then run the timed new-user cold-start walk.
State: Phase 1 live (core list, household sharing, categories, budget, waste tracker); Realtime on list_items + household_members; Splunk RUM + session replay live on prod; velayo.ai form posts to Mailchimp; cold-start household creation exists but not yet walked as a true zero-state user.
Done when: A fresh test identity accepts an invite via link and lands in the correct household on first render, verified on deployed dev then promoted to prod (DT + a Gmail plus-alias, two devices).
**Files updated:** `docs/SPEC_pwa_install_coachmark.md` (new), `docs/SPEC_feedback_bridge.md` (new), `docs/SPEC_dispatches.md` (new), `docs/SPEC_new_user_coldstart.md` (new).
**DB changes:** None applied. Pending (Beat 0 build): `feedback` table, `dispatches` table.

---

### [2026-07-05] — [OurProvisions] — Design "Come aboard" beta landing page + signup, grounded in sourced savings argument
**Goal:** Turn the "Come aboard" CTA into a real front door — a beta signup questionnaire backed by Supabase — and reframe the landing page around a bold, sourced business case that pivots from money to life.
**Completed:**
- Reframed "Come aboard" from a plain CTA into a short questionnaire — completing it *is* coming aboard; friction qualifies applicants ("willing to give to get") and pre-validates roadmap phases with GTM research.
- Locked questionnaire: 7 behavioral questions (keeps_list, who_shops, store_count, crew, multi_household, list_method, region) + optional free-text (wishes) + name/email. Cut income, age, "do you cook?" against the "does the answer change a 6-month decision?" test.
- Designed sine-wave landing flow: Boardroom (rational peak) → Trough (out-of-control feeling) → Ah-ha (biggest problem, smallest fix = a list) → Vision overshoot → Front Door (questionnaire). Questionnaire at the END because problem-led opening peaks intent there.
- Settled the fundamental ache framing: groceries are the largest *controllable* household expense and it feels out of control; the humble fix is a list; a list is the gateway to a better life. Lead with the wallet, land on the life.
- Researched and sourced the savings claim. Killed bare "10–20%" and phantom "NYT 10%" stat (neither defensible). Anchored on Davydenko & Peetz (2020), *Journal of Consumer Behaviour* — randomized studies, list-makers spend ~$10–13 less per trip (~10% on a $108 trip).
- Flagged gap in investor Vision Roadmap: no external savings citation — only illustrative in-app figures. Closes with the JCB source.
- Produced `SPEC_beta_signups.md`, `mockup_come_aboard.html`, `EVIDENCE_grocery_savings.md` (all filed or surfaced per below).
**Unfinished:**
- Boardroom→trough→ah-ha hero copy not yet drafted to final — next drafting pass uses `EVIDENCE_grocery_savings.md`.
- Movement II placement pattern unresolved: full questionnaire inline vs. short invitation with questions-on-tap (reveal). Leaning invitation-on-tap.
- Questionnaire mockup not yet eye-tested by Dan for warmth (warm handshake vs. survey).
- `beta_signups` migration NOT yet run; anon insert NOT yet wired; questionnaire NOT yet spliced into the page.
**Next session:**
SESSION START
Goal: Draft boardroom→trough→ah-ha hero copy to final using `EVIDENCE_grocery_savings.md`; resolve Movement II inline-vs-reveal fork; eye-test mockup; then Claude Code BUILD: run migration → wire anon insert → splice questionnaire into page.
State: Questionnaire question set locked. `beta_signups` schema + insert-only RLS spec written (not yet applied). Sine-wave flow + money-ache reframe settled. Savings evidence sourced. Mockup awaiting approval. Nothing applied to prod yet.
Done when: Hero copy final and sourced; Movement II pattern chosen; mockup approved or revised; clean BUILD handoff exists.
**Files updated:** `docs/specs/SPEC_beta_signups.md` (new), `docs/mockups/mockup_come_aboard.html` (new). `EVIDENCE_grocery_savings.md` in airlock — destination TBD (surfaced to Dan).
**DB changes:** None applied. Pending (in SPEC_beta_signups.md): create `public.beta_signups` on prod, enable RLS, insert-only anon policy.

---

### [2026-07-03] — [Cross] — Receipt import design + use-case validation + fleet/vision brand work; wrap-up modal fix + git reconcile + prod migration verification
**Goal:** Design the receipt import feature end-to-end and validate against the full downstream vision; reconcile the Harbour fleet and build the investor narrative. Parallel build: ship the wrap-up modal fix and verify prod migration state before promoting.
**Completed:**
- Designed the receipt import pipeline as a source-agnostic core (capture → normalize → reconcile → review → commit); photo is the first swappable adapter, email/API later.
- Settled four load-bearing receipt decisions: confidence-gated review, rolling-average `price_hint` from last-N `receipt_items` (no counter column), alias learning deferred with `match_source` as training hook, and NO `list_items` write in v1.
- Specced vision extraction (photo→strict JSON, two-confidence separation, structured-refusal rule, defensive parsing) and Tier 1/Tier 2 reconcile (deterministic free / AI paid — gets smarter and cheaper as catalog fills).
- Documented and validated 17 receipt use cases against live prod schema; surfaced four cheap schema additions (shopped_by, store_key, line_type, numeric quantity) to catch now vs. a painful Phase-4 backfill.
- Reconciled Harbour fleet to 8 apps; built investor vision narrative (paper→intelligence→the Harbour) with BVI harbour photo graded to brand tokens; exported standalone photo assets to SharePoint.
- [Parallel] Fixed invisible Cancel button on wrap-up modal — phantom `className="modal-box"` (never defined) → `.modal` (real card class, ~line 1046); inline `maxWidth: 360px` preserved. Commit `91b531a`, verified dev, promoted to prod.
- [Parallel] Untangled two-machine git divergence (local `main`/`dev` ~30 commits behind `origin/dev`) via merge abort → hard-reset to `origin/main` → merge `dev` → push; no work lost. Confirmed migrations 014 + 015 live on prod by direct query.
**Unfinished:**
- Vision extraction UNPROVEN on real thermal-paper receipts — must be first build step (one API call on a real crumpled receipt before any DB work).
- Four receipt-table columns not yet migrated: `shopped_by`, `store_key` (receipts); `line_type` (receipt_items); migration 016 written in the build session.
- `OurKeep` and `OurGames` have no user-facing definition — named in the 8-app fleet but not specced.
- Investor narrative fleet (8 apps) diverges from `Velayo_Harbor_Investor_Narrative.docx` (6 apps); doc needs updating.
**Next session:**
SESSION START
Goal: Take the receipt vision-extraction spec to Claude Code and prove photo → JSON on a real receipt, in isolation, before any schema work.
State: Wrap-up modal fix live on prod. Migrations 014 + 015 confirmed live on prod. Full receipt import feature designed across 5 airlock artifacts now in `docs/specs/` and `docs/mockups/`. Nothing of the receipt feature built yet — pure design.
Done when: A real photographed receipt returns valid JSON matching the extraction contract, with honest confidence (a deliberately ambiguous line scores low, not high) and non-item lines flagged.
**Files updated:** `docs/specs/SPEC_receipt_import.md`, `docs/specs/SPEC_receipt_vision_extraction.md`, `docs/specs/SPEC_receipt_reconcile.md`, `docs/specs/SPEC_receipt_use_cases.md`, `docs/mockups/mockup_receipt_review.html` (all new, filed from handoff). `src/App.js` (wrap-up modal fix, commit `91b531a` — already on prod).
**DB changes:** None this session. Confirmed live on prod: 014 (auth.uid RLS fix), 015 (helper consolidation). Pending: migration 016 will add `receipts` + `receipt_items` tables.

---

### [2026-07-01] — [OurProvisions] — Shipped list text-size control to dev; diagnosed + fixed join-doesn't-activate-household (both dev-only)
**Goal:** BUILD the fully-specced device-local list text-size control, then diagnose and fix "join should activate the joined household" — client-only, no RPC.
**Completed:**
- Built the **list text-size control** (`SPEC_list_text_size.md`) as one scoped commit (`b8368f5`): 5-step stepper (Compact/Default/Large/XL/XXL → 0.9/1.0/1.2/1.45/1.75) in the profile-sheet Preferences (sibling to "Show prices & budget"), persisting the index (not the scale) under `localStorage.op_list_text_size` (default 1). Effect sets `--op-list-scale` on `documentElement`; `:root{--op-list-scale:1}` prevents first-paint flash. Scaled the six row-content classes via `calc(<existing> * var(--op-list-scale))`; added `flex-wrap:wrap` to `.list-item` + `.item-top` so XL/XXL wrap instead of overflowing; all chrome unscaled. Deferred the optional live-preview row.
- **Diagnosed** the join-activation defect diagnosis-first (`SPEC_join_activates_household.md`, 4-hypothesis truth table) rather than blind-editing — the switch (Route A) already existed. Killed H2 by code (the ref write is synchronous before `await refreshHouseholds()` resolves); an initial `null` from `just_joined_household_id` looked like H1 but was unmasked as a spent-invite reload artifact.
- **Ruled out H1 on deployed-dev evidence** (Dan, three joins): a fresh-invite consuming load auto-switched an existing multi-household user into the joined household with the banner — so the deployed `bootstrap_new_user` DOES report the existing-user join (`joined_via_invite=true`), resolving the standing CLAUDE.md caution about a possibly-stale RPC version. No RPC touched.
- Root cause = **one-shot fragility**: the auto-switch lives only on the single invite-consuming load (flags stripped immediately, invite single-use), surviving reload only because `switchHousehold` writes `localStorage.activeHouseholdId`; if that write is interrupted, the next context-init re-pins the prior household with no recovery.
- **Fixed** it client-only (`1c5a916`): replaced the inline one-shot switch in `App.js` with a reactive `pendingJoinId` (React state) + a `[pendingJoinId, myHouseholds]` effect that fires `switchHousehold` once the joined household resolves in the membership list, then clears the intent. Intent now outlives the stripped flags and localStorage-write timing.
- Preserved the invariant — the lens (`ActiveHouseholdContext`) stays the single writer; switch routes through `switchHousehold`, never `setHousehold`; dead `acceptInvite` untouched. Both changes `CI=true` build-clean; verified green on deployed dev (text-size persists across hard reload; join auto-switch + reload-persist across three fresh joins on the multi-household profile).
**Unfinished:**
- Both changes stopped at dev (commits `b8368f5`, `1c5a916` on `dev`, NOT merged to main). Prod promotion pending.
- The interrupted-consuming-load window the `pendingJoinId` fix hardens is a race that could not be forced on demand — recovery is reasoned-correct only, not directly reproduced (noted in the commit message).
- Text-size: second-browser independence + disabled-glyph-at-bounds not formally checked (low-risk; localStorage-only, no sync path).
- Prod spot-check for the earlier 2026-07-01 full_name + heading merge still not re-confirmed on prod (carried).
**Next session:**
SESSION START
Goal: Merge both dev-verified changes (list text-size + join-activation) to main and confirm on prod; then pick up the NOW headline (per-household staple model, design-first).
State: List text-size control and join-activation fix both live and verified on dev, stopped at dev. Join auto-switch confirmed on the multi-household profile across three fresh joins, both legs (switch + reload-persist) green.
Done when: Both changes on main/prod and smoke-verified there; staple-model design work begun (mockup/spec before code).
**Files updated:** src/App.js (text-size control; join `pendingJoinId` reactive switch). No other source files.
**DB changes:** None. Both client-only — no schema, no RLS, no RPC. `bootstrap_new_user` explicitly NOT touched (H1 ruled out on evidence).

### [2026-07-01] — [OurProvisions] — Fixed item-badge / member attribution showing wrong or missing names (full_name never persisted) + profile-heading email-over-email fix
**Goal:** Diagnose why item badges and member lists showed wrong, missing, or inconsistent adder names ("Test User 30", sometimes blank, sometimes stale), ship a fix, and merge to prod.
**Completed:**
- Root-caused the attribution bug through five overturned hypotheses, each killed by a direct prod query rather than reasoning (stale `added_by` from revive → orphaned contributor rows → ghost member → deleted-user/broken FK → NULL `full_name`). True cause: `users.full_name` is NULL for ALL real users (5/5 in prod, incl. one created that day) — names live in Clerk but were never persisted, because `full_name` was only ever written once at bootstrap (before Clerk's name is reliably available), and bootstrap is a no-op on later sessions and structurally cannot re-run (`fullName` excluded from Effect 1 deps to avoid the loading-wedge regression).
- Built **Effect 1b** — a dedicated name-reconciliation effect in `useProvisions.js` (`2b223ff`), decoupled from bootstrap, that writes Clerk's `fullName` to `users.full_name` on each session when it differs. Guarded by `bootstrappedRef` + `internalUserIdRef`, deps `[fullName, bootstrapped]`, `lastSyncedNameRef` prevents write loops, reads-before-writes to skip needless updates. Reuses the RLS-proven `updateFullName` write path; never touches `bootstrap_new_user` (avoids its 4-overload ambiguity).
- Shipped a second small fix (`15712ba`): profile-sheet heading (`App.js` ~2639) now composes name from Clerk `firstName`+`lastName` before falling back to email — fixes an email-over-email display for accounts whose Clerk composed `fullName` is empty (e.g. Test User 34).
- Verified on deployed dev across every case: existing named user (Dan Test User) and fresh named signups (Test User 33/34/35) all land `full_name` in the DB automatically with no manual edit; nameless account (Test User 32) degrades to email-prefix fallback with no error and no write loop.
- Merged both to `main` as clean fast-forwards (`2b223ff` full_name, `15712ba` heading); Vercel deploying to prod. Existing NULL users self-heal on next load — no SQL backfill.
- Deliberately did NOT fix several pre-existing bugs surfaced during multi-account testing (join-not-activating, propagation latency, first-sign-in banner) to keep the merge clean — queued for follow-up.
**Unfinished:**
- Prod spot-checks pending Vercel deploy: confirm a signed-in user with a Clerk name has `users.full_name` populated + heading composes on `ourprovisions.velayo.ai`.
- New pre-existing bugs surfaced during testing, queued not fixed (see Next session / roadmap BACKLOG).
**Next session:**
SESSION START
Goal: Fix "join should activate the joined household" — joining via invite lands membership but does not switch the active-household lens (existing users stay in their prior household).
State: full_name reconciliation (Effect 1b) + profile heading fix live on main/prod. Attribution names now correct in DB and UI. Invite membership works and is single-use; realtime converges but lags (~30s).
Done when: pasting an invite URL (or accepting an invite) sets the joined household as active and resets household-scoped UI state, so the user lands IN the household they just joined — verified for an existing user with prior households.
**Files updated:** src/hooks/useProvisions.js (Effect 1b), src/App.js (profile heading fallback).
**DB changes:** None (client-only; no schema/RPC/migration).

### [2026-06-29 → 06-30] — [Cross] — Shipped the two NOW migrations + swipe arc, added the BUILD command, cleaned up Test House data, and designed the shared declutter-cycle control for Browse + Shop
**Goal:** Clear the NOW sprint — fix the `auth.uid()` RLS type-mismatch and consolidate the duplicate helper functions — then work the queue; expanded into completing the swipe arc, building the BUILD command, Test House cleanup, and a long design session turning "filter show/hide toggle" into a cross-tab declutter primitive. A staple data-model bug was found and queued.
**Completed:**
- Shipped **migration 014** (auth.uid RLS fix) to dev + prod, verified both ways (0 rows on auth.uid check; all 8 policies read `ok` on the affirmative is_member_of/get_current_user_id check). Rewrote 8 policies across `known_stores`, `shopping_sessions`, `velayo_crews`, `velayo_crew_members`. RLS enabled/disabled state left untouched (auth-neutral). Repo record committed `a081d59`.
- Shipped **migration 015** (drop duplicate helpers) to dev + prod, verified exactly 2 survivors remain (`get_current_household_id`, `get_current_user_id`, both search_path-pinned). The two NULL-config variants dropped; zero callers confirmed on both envs.
- Shipped the **swipe arc** to prod (`41f4952` parity, `212dfed` close-gesture, `22a811d` pointerEvents fix): each built via BUILD (stopped at dev), Dan verified the deployed preview, then dev→main merged — all branches now converged at `22a811d`. Search rows expose swipe actions identical to Browse; catalog rows close on swipe-right past the 60px threshold; the `pointerEvents:none`-on-open bug that blocked the gesture was fixed. Prod smoke-tested clean (open/close/button-tap all pass).
- Added the **`BUILD` command** to `CLAUDE.md` (`a195319`) — Claude Code implements a spec from the airlock as one scoped commit, grep-before-edit, test on deployed dev, stop at dev. Used it 3× this session; works.
- Refined the **workflow-discipline model** (supplemental design handoff): `BUILD` earns being a real command (it compresses a six-step routine); `SPEC` is *not* a trigger — the design chat produces specs by judgment, with `SPEC` retained only as a manual override. Adopted a **"fewer artifacts" spec rule** — write a `SPEC_*.md` only when a change carries a decision, risk, or verification need; plain instruction otherwise (this session's ~7 specs, incl. the one-line pointerEvents fix, were over-ceremony). Captured in the DECISIONS LOG + design-chat instructions.
- Added **A5** to the agent test harness — guards the four 014-tables against ever reverting to `auth.uid()`. Ran Part A by hand on prod as the post-migration gate; all green. Part C static checks run + reported (C2 flags the standing 007 collision + 009–012 gap; C3 = 3 window.confirm, the tracked item).
- Logged the **git-HEAD drift** caught at SESSION START (RUM + session-replay commits had landed unlogged) and marked roadmap items 014/015 DONE (`5970a37`).
- Cleaned up **Test House 1–6** test data on **both dev and prod** via the app's own delete-household feature (migration 013 soft-delete) — a real end-to-end exercise of the `delete_household` RPC through the prod UI, not just dev. Rows remain in `households` with `deleted_at` set (soft-deleted, the intended posture); switcher cleared cleanly on both envs.
- **Designed and mocked-approved the shared declutter-cycle control** (`SPEC_declutter_cycle.md`, reference mockup `cycle_dual_readout.html`). Started as the "filter show/hide toggle" design-queue item; iterated ~6 mockups into a 3-phase cycle shared by **Browse and Shop**. One fixed 48×48 icon (bg light/dark = Filter Off/On; line shape tapering/equal = Grouped/Flat); phases all-shown/grouped → noise-hidden/grouped → hidden/flat A–Z. On Browse phase-1 hides filter pills; on Shop phase-1 hides checked items. A descriptor line gives plain-English state. Designed + spec'd, **NOT built** — strong agent-build candidate.
**Unfinished:**
- **Staple bug (dev, found this session) — queued as headline NEXT.** `is_staple` is a single boolean on the shared global `catalog_items` row (`is_global=true`, `household_id=NULL`). Tapping Staple on a global item paints green optimistically, but per-household staple preference has no storage, so the 20s catalog poll re-reads `false` and reverts to grey. Root cause is data-model, not UI. Prod-leak check (`is_global=true and is_staple=true`) returned **0 rows** — no cross-household leak has occurred.
- `ourprovisions.app` domain wiring — parked this session pending domain-ownership consolidation (see ROADMAP decisions).
- Deferred swipe gestures (per "wait until users complain"): tap-away to close, single-open-at-a-time, velocity flick. Dan will watch real usage before building.
- **Declutter cycle — designed, spec'd, NOT built.** Substantial build: new Shop "hide checked" feature + new Browse flat (A–Z) render + unifying both tabs onto one control. `SPEC_declutter_cycle.md` routed to `docs/`, agent-build candidate. Supersedes `SPEC_filter_show_hide` (retired this merge) and the standalone grouped/flat item.
- **Shop filter axes — future, not built:** filter-by-who-added (Elly/Helen/DH) and per-store filtering point toward Shop gaining its own filter-pill bar (cycle handles *view*; pills handle *what-to-show*). Captured in the spec's future-facing section.
**Next session:**
SESSION START
Goal: Design the per-household staple model — `household_staples` join table + rewrite of toggleStaple (write/read) — fixing the global-staple data-model bug.
State: NOW sprint cleared (014+015 on prod). Swipe arc fully on prod (`22a811d`), all branches converged. App functioning across multi-account testing. BUILD command live.
Done when: a mockup-before-code spec exists for per-household staple storage (table + RLS via is_member_of + toggleStaple read/write rewrite + global-vs-custom decision), ready to BUILD.
**Files updated:** `src/App.js` (swipe parity, close-gesture, pointerEvents fix), `CLAUDE.md` (BUILD), `qa/agent_test_harness.md` (A5), migrations `014`/`015`, docs (SESSION_LOG/ROADMAP/ARCHITECTURE + routed specs `SPEC_declutter_cycle.md`, `cycle_dual_readout.html`; retired `SPEC_filter_show_hide`).
**DB changes:** Migrations 014 + 015 applied to dev + prod. Test House 1–6 soft-deleted on dev + prod (via `delete_household`).

---

### [2026-06-29] — [OurProvisions] — Backfill: Splunk RUM + session-replay instrumentation (drift capture)
**Goal:** Capture three production commits that shipped real-user-monitoring + session-replay masking but never landed in the SESSION_LOG — found as git-state drift at session start (HEAD `1037e52` was ahead of the last-logged `378efec`).
**Completed:**
- Logged the drift: `bc8edca` (environment-aware Splunk RUM instrumentation — new `src/rum.js`, wired in `src/index.js`, Splunk deps in `package.json`/`package-lock.json`), `7be2662` (tag RUM `deploymentEnvironment` via `REACT_APP_DEPLOY_ENV`), `1037e52` (session-replay masking: unmask UI, mask inputs, exclude Clerk auth) — all live on prod, all previously unlogged.
- Noted the cause for future discipline: code shipped + pushed without a SESSION_LOG entry; reinforces the queued "commit + push after edits / log before close" roadmap item.
**Unfinished:**
- None for this backfill. (RUM dashboards/alerting tuning, if any, tracked separately.)
**Next session:**
SESSION START
Goal: Resume the design queue (household-scoped UI state audit headline) per the prior entry.
State: RUM + replay masking live on prod; migrations 014/015 live + recorded on disk.
Done when: Household-scoped state audit produces a pass/fix list.
**Files updated:** None this entry (backfill only — documents `src/rum.js`, `src/index.js`, `package.json`, `package-lock.json` from the earlier commits).
**DB changes:** None.

---

### [2026-06-29] — [Cross] — Two catalog consistency bugs shipped to prod; brand-architecture direction set for the .app domains
**Goal:** Fix the search-row stepper and price-gated Edit Item bugs, and establish how the newly secured `.app` domains serve the Harbour vision without sacrificing per-app identity.
**Completed:**
- Shipped Bug 1 (search results now use the full −/qty/+ stepper, identical to Browse) by extracting a shared `CatalogItemRow` component rendered by both the search and Browse call sites — so the two row presentations can no longer drift. Extraction landed as its own commit (`2163929`) ahead of the search wiring (`8f1e471`); search list now renders inside `.items-grid` for layout parity.
- Shipped Bug 2 (Edit Item respects the pricing toggle, `378efec`): price `modal-field` gated on `showPrices`; the "only the price can be edited" catalog note gated too; new `canEdit` prop on `SwipeToRemove` hides only the Edit button (Staple/Hide remain) for catalog items when pricing is off; `openEditModal` early-returns as a guard — so no empty modal can appear. Custom items stay fully editable regardless of the toggle.
- Confirmed the catalog-item edit truth table by eye: name locked on catalog items → Edit exists only when price is editable; custom items always editable.
- Ran `/code-review` (high effort) on the diff: zero correctness findings; two non-blocking cleanup notes (duplicated price-fallback formula across Browse/Search; deliberate belt-and-suspenders `canEdit` + early-return). Smoke-tested by Dan, then promoted dev→main as a clean fast-forward (`90c4316`→`378efec`) and pushed; Vercel auto-deploys main to prod.
- Set brand-architecture direction for the four secured `.app` domains (ourprovisions / ourkeep / ourmanifest / ourpoker): vanity domains are sayable front doors over a single shared Harbour; the auth domain stays singular and platform-owned; ourpoker is the likely standalone exception. Decided `ourprovisions.app` becomes canonical with the `velayo.ai` subdomain redirecting to it (pending a check of what `velayo.ai` currently serves). Auth-domain unification deferred (Phase II, KISS) — near-term domain work stays auth-neutral and reversible.
**Unfinished:**
- `ourprovisions.app` not yet wired (Cloudflare DNS + Vercel primary-domain + Clerk allowed-domain/redirect) — teed up for tonight; pre-step: confirm what `velayo.ai` root + `ourprovisions.velayo.ai` serve before retiring/redirecting the subdomain.
- Swipe action does not work on search-filtered rows — `SwipeToRemove` wraps `CatalogItemRow` at the Browse call site but the search call site renders the bare shared row (deliberately out of scope this commit). Consistency bug, build pending.
- `SwipeToRemove` latches open with no dismiss gesture — needs swipe-right / tap-away / single-open-at-a-time close paths.
- Manage-household redesign (surface tangles household vs member actions, over-weights Delete) and filter show/hide toggle — design pending.
- Household-scoped UI state audit — yesterday's authored goal, still deferred.
**Next session:**
SESSION START
Goal: Wire `ourprovisions.app` (build) and work the design queue (household-scoped state audit, manage-household redesign, filter toggle).
State: Three commits live on prod (CatalogItemRow extraction, search stepper, price-gated Edit). `main` = `dev` = `378efec`, Vercel green. App functioning across multi-account testing.
Done when: `ourprovisions.app` reachable + canonical + auth working with the `velayo.ai` subdomain redirecting in; household-scoped state audit produces a pass/fix list; Test House 1–6 dev data cleaned up; manage-household and filter-toggle directions mocked.
**Files updated:** `src/App.js` (CatalogItemRow extraction, search stepper, Edit price gate). `SPEC_search_row_and_price_gate.md` routed to `docs/`.
**DB changes:** None.

---

### [2026-06-29] — [OurProvisions] — Defect paydown: six member/household-flow fixes shipped to prod
**Goal:** Fix a member display-name bug Elly reported; the session expanded into a focused defect-paydown sweep across the household/invite flow, shipping six fixes to production.
**Completed:**
- Fixed member display name (3 sites: roster, creator label, remove-confirm) to read Supabase `full_name` first with email-prefix fallback — was rendering email prefix, ignoring the name members set (`ec4d4af`).
- Added refresh-on-open for the manage-households sheet so member name changes surface without a full page reload (`270377e`).
- Diagnosed + fixed the name-change hang: removed cosmetic `fullName` from Effect 1 (session bootstrap) deps; a Clerk name write was re-firing bootstrap and wedging the loading state. Clerk write retained for accuracy (`4a27ada`).
- Fixed invite-paste auto-switch: gated on explicit-accept signal (`joinedId`) instead of `hadPrior`, so an existing user who accepts an invite lands in the joined household. Retired the stale "Effect 2 map-wipe" landmine (no longer real after resolver rewrite) (`75c1481`).
- Fixed join-banner persistence: auto-dismiss on 5s timer + immediate clear on switch-away, guarded by `bannerSeenRef` against clearing on the arrival switch that shows it (`0c24e5b`).
- Fixed stale invite link: Share panel's `inviteUrl` now resets on active-household change (switch or create-new auto-switch), so users can't share the wrong household's link (`90c4316`).
- Promoted all six (`ec4d4af` → `90c4316`) dev→main as a clean fast-forward; prod Ready/green on `90c4316`, verified on dashboard.
**Unfinished:**
- Multiple Supabase client instances (`useProvisions.js` client create, `ActiveHouseholdContext.js` `getDb`) share one auth storage key — GoTrueClient warning persists, confirmed SEPARATE from the hang. Non-urgent; design session first (single-shared-client pattern).
- Idle-client name propagation: refresh-on-open covers fresh loads; a name change still doesn't reach an already-open idle client until refresh. Deferred per KISS (live-push = over-engineering for a rare event).
- Test-data sprawl: Test House 1–6 cluttering dev switchers — needs cleanup before next test session.
**Next session:**
SESSION START
Goal: Household-scoped UI state audit — enumerate every piece of UI state scoped to a household and verify it resets on active-household change, fixing the whole class at once.
State: Six fixes live on prod (`main` @ `90c4316`, Ready/green). `dev` = `main` = `90c4316`. App functioning across multi-account testing. Three instances of "household-scoped state not reset on switch" found and fixed this session (join banner, invite link, plus a near-miss read as desync) — the pattern is systemic.
Done when: Every household-scoped UI state surface is confirmed to reset on switch (audited list with pass/fix per item); any remaining instances fixed; Test House 1–6 test data cleaned up.
**Files updated:** `src/App.js`, `src/hooks/useProvisions.js` (both via Claude Code); five SPECs routed to `docs/` (`SPEC_member_display_name`, `SPEC_name_change_hang`, `SPEC_invite_paste_autoswitch`, `SPEC_join_banner_autodismiss`, `SPEC_stale_invite_link`).
**DB changes:** None.

---

### [2026-06-28] — [Cross] — Ship delete-household to prod and design active-household indicator
**Goal:** Clear the prod-apply gate on migration 013, merge dev→main, deploy, and prove delete-household on prod — opening multi-household to real testers. Then design how the app shows which household you're editing.
**Completed:**
- Probed prod for `shopping_sessions.deleted_at` (exists) before applying 013 — closed the schema-drift risk; live query over stale CSV.
- Applied migration 013 to prod by hand; verified via `pg_proc.prosrc` (body_len 2550, cascade markers present).
- Merged dev→main in Claude Code (merge commit `d36a71b`); pushed main; Vercel deployed clean (Ready 16s, `CI=true` passed). DELETE HOUSEHOLD button live on `ourprovisions.velayo.ai`.
- Smoke-tested on prod (DH owner + DT member): owner silent switch and member branded removal notice both confirmed.
- Verified cascade honesty on prod: orphan count across five household-scoped tables returned 0 for the deleted household.
- Designed active-household indicator: outer chrome banner, plain name + anchor icon centered between avatar and menu, tap-to-manage; retired two-people wordmark glyph; Phase I/II layer split framed.
- Authored and filed `SPEC_household_indicator.md` (handoff payload → `docs/`).
**Unfinished:**
- `window.confirm()` → branded modal: three native dialogs in App.js (~674, 690, 2271) still live on prod.
- D7 clone-rescue escape hatch deferred (clone-forward build).
- `checkPresence` `selfDepartureRef` TODO — voluntary-leave still triggers the removal notice.
**Next session:**
SESSION START
Goal: Build Phase I active-household indicator per `docs/SPEC_household_indicator.md` — house name + anchor icon in outer banner, tap-to-manage; remove people glyph and manage subline from title bar.
State: delete-household fully live and prod-validated. Migration 013 on dev + prod. `main` = `origin/main`. Indicator spec written and filed in `docs/`.
Done when: household name renders in outer banner from `ActiveHouseholdContext`; tap opens manage-house modal; people glyph and manage subline removed from title bar; dev-validated; merged; Vercel green.
**Files updated:** `docs/SPEC_household_indicator.md` (new, filed this SESSION END).
**DB changes:** Migration 013 now live on PROD — `provision_cycles.deleted_at`, `list_item_contributors.deleted_at`, `delete_household` RPC. Dev + prod in sync.

---

### [2026-06-26] — [OurProvisions] — Build and validate delete_household end to end
**Goal:** Take delete-household from a hidden console.log stub to a fully-tested feature on dev — owner-only soft-delete cascade RPC, branded confirm, and the reused Layer-2 switch/notice path — without shipping to prod.
**Completed:**
- Locked 7 design decisions (D1 soft-delete cascade; D2 waste/cycle history soft-deleted; D3 owner-only via created_by; D4 last-household auto-provision; D5 active-household switch-to-survivor; D6 surviving-member removal notice, neutral copy, no attribution; D7 catalog-loss warning now, clone-rescue deferred).
- Derived migration number 013 — corroborated across ARCHITECTURE.md, SESSION_LOG (Jun 22 + Jun 25), and SPEC_create_household_from_template.md ("next in sequence, e.g. 013").
- Wrote migration 013: two ALTERs (provision_cycles + list_item_contributors gain deleted_at) plus delete_household SECURITY DEFINER RPC (Clerk-JWT caller resolution, member_count captured pre-cascade, jsonb return, soft-delete cascade in FK order, user_hidden_items hard-deleted). Applied to dev by hand 2026-06-26; prod PENDING.
- Refactored resolveAfterHouseholdLoss into ActiveHouseholdContext as the single switch-or-provision path guarded by provisioningRef — shared by checkPresence (detection-only, delegates resolution) and handleDeleteHousehold. Eliminated stale-closure read of myHouseholds and the raw createHousehold bypass that could race the in-flight guard.
- Wired DELETE HOUSEHOLD button in owner-branch of household-manage sheet: two-stage showResetConfirm-pattern confirm, D7 custom-item count from loaded catalogMap (no extra round-trip), calls delete_household then resolveAfterHouseholdLoss(deletedId, false).
- Validated live on dev (DH owner + DT member): owner deletes shared household → silent switch, no self-notice; member detects removal within ~30s via checkPresence → branded notice; owner deletes only household → exactly one fresh "My Household" provisioned.
- Fixed copy across all surfaces: "close/closed" → "delete/deleted" (confirm sentence, button, toast); "1 members" → "1 member" (pluralisation guard).
**Unfinished:**
- Migration 013 on DEV ONLY — prod (parpauldmbetptkmdwbd) lacks the two ALTER columns and the RPC. Header says "prod apply PENDING."
- dev→main merge held until 013 is on prod and smoke-tested.
- D7 clone-first escape hatch deferred (clone-forward build; marker comment in App.js at confirm site).
- checkPresence pre-existing TODO: selfDepartureRef not yet checked to suppress the notice on voluntary leave — Layer-2 debt, not introduced here.
**Next session:**
SESSION START
Goal: Apply migration 013 to prod, smoke-test delete-household on prod, then dev→main merge + Vercel deploy.
State: Feature fully built and dev-validated. Four local commits (021f902 migration, f606eed button wiring + confirm, 3cd5010 resolveAfterHouseholdLoss refactor, 620f223 + 5b680c6 copy fixes) awaiting review/push. RPC + deleted_at columns absent from prod.
Done when: 013 applied clean to prod (pg_proc.prosrc check confirms body); controlled prod delete stamps household + all dependents with deleted_at, zero orphans; dev→main merged; Vercel deploy green; DELETE button live on ourprovisions.velayo.ai.
**Files updated:** `migrations/013_delete_household.sql` (new), `src/App.js`, `src/contexts/ActiveHouseholdContext.js`.
**DB changes:** DEV ONLY — `provision_cycles.deleted_at`, `list_item_contributors.deleted_at`, `delete_household` RPC. PROD PENDING.

---

### [2026-06-26] — [Velayo OS] — Generalize handoff folder into a payload airlock
**Goal:** Let a design chat drop any produced files (specs, etc.) into `repo/handoff/` alongside `design_handoff.md`, and have Claude Code route each to its home on SESSION END — without confusing the reserved merge-and-delete logic.
**Completed:**
- Defined the AIRLOCK model: `handoff/` has exactly two permanent baseline files (`.gitignore`, `DESIGN_CHAT_handoff_prompt.md`); `design_handoff.md` keeps its reserved merge-and-delete role; every other file is payload, filed to its home and cleared out each SESSION END.
- Added `## DROPPED_FILES` manifest to `DESIGN_CHAT_handoff_prompt.md` so each handoff declares its payload files and their destinations.
- Added Step 0.5 to the SESSION END routine (`CLAUDE.md`): route payload files per manifest, protect the two baseline files, surface any unlisted payload rather than guessing.
- Extended Step 5 verification to confirm the airlock is clear (only baseline two remain) before committing.
- Updated the Handoff format reference in `CLAUDE.md` to document `## DROPPED_FILES` and the airlock model.
- Applied both file edits to the repo this SESSION END (diff confirmed purely additive — nothing removed from existing rules).
**Unfinished:**
- `handoff/.gitignore` patterns not inspected — confirm they don't block payload files. Low risk (payloads land in `docs/`, not `handoff/`).
- Two handoffs cannot sit in the airlock simultaneously (one `design_handoff.md` filename). Must go through SESSION END sequentially. Accepted.
**Next session:**
SESSION START
Goal: Dry-run the new flow — SESSION END with a real payload spec present, confirm Step 0.5 routes it to `docs/` and leaves `handoff/` holding only the two baseline files.
State: AIRLOCK convention live in repo. `CLAUDE.md` + `DESIGN_CHAT_handoff_prompt.md` both updated. Step 0.5 active next run.
Done when: A SESSION END run with a payload spec files it to `docs/` correctly and the airlock ends clean.
**Files updated:** `CLAUDE.md` (repo root, Step 0.5 + airlock model added), `handoff/DESIGN_CHAT_handoff_prompt.md` (## DROPPED_FILES section added).
**DB changes:** None.

*[Velayo OS] flag: this is company-wide workflow infra, not app-specific. Once a `velayo-os` repo exists, this entry belongs in that log.*

---

### [2026-06-26] — [OurProvisions] — Part C static checks (PASS/FINDINGS) + design "create household with cloned catalog"
**Goal:** Run the first live Part C static checks against the repo and design the catalog-carry-forward feature for new household creation.
**Completed:**
- C1 PASS: 14 client `.rpc()` names exactly match the Part A1 prod list — no unknown or missing RPCs. Check confirmed working.
- C2 FINDING: `009`–`012` migration files absent from local `migrations/` folder (all four functions confirmed live on prod); `007_dev_restore_role_grants.sql` documented in DONE but absent from repo. No current numbering collision. Check caught the expected gap — working as designed.
- C3 FINDING: 3 `window.confirm` calls at [App.js:674](src/App.js#L674), [:690](src/App.js#L690), [:2271](src/App.js#L2271); no `window.alert`. Count unchanged — all three are the known tracked sites.
- Designed "create household with cloned catalog": clone-forward (snapshot at creation) over persistent fleet catalog; scope = custom catalog only (lists never travel); source household user-chosen, most-recently-active default; "Standard provisions" as the no-custom opt-out label.
- Decided new RPC `create_household_from_template(p_name, p_clerk_id, p_source_household_id default null)` wraps `create_household` (006) rather than modifying it; null source = passthrough; `is_member_of(p_source_household_id)` security guard before any clone.
- Settled UI: single dropdown inline in manage-household sheet between name field and Cancel/Create; "Standard provisions" in Playfair Display 15px roman, muted sand-brown.
- Authored `SPEC_create_household_from_template.md`; moved to `docs/` this SESSION END.
**Unfinished:**
- Feature not yet built — migration + client wiring + UI are next session.
- Item-count-in-picker RPC shape unresolved: extend `get_my_households()` (alters prod column set) vs. new `get_my_household_catalog_counts()`. Defer to Claude Code build session.
- "Most-recently-active" picker default must align with existing active-household resolution — resolve during build.
- Migration folder reconciliation (009–012 gap) still deferred; C2 is the standing alert.
**Next session:**
SESSION START
Goal: Build `create_household_from_template` per `docs/SPEC_create_household_from_template.md` — migration on dev, client wiring, manage-household sheet dropdown.
State: Spec fully approved and in `docs/`. `create_household` (006) live on prod. No code or migration started. C2 gap (009–012) still open, not blocking this build.
Done when: migration applied + verified on dev (prosrc check, functional clone count, security non-member raise, null-source passthrough); `createHousehold` wired with source param; manage-household sheet shows picker with item counts; item-count RPC question resolved.
**Files updated:** `docs/SPEC_create_household_from_template.md` (moved from handoff/). `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`.
**DB changes:** None.

---

### [2026-06-25] — [Cross] — Hide DELETE button + dev→main merge + fix get_my_households prod drift + agentic testing strategy
**Goal:** Hide the stub DELETE HOUSEHOLD button, merge 8 Layer 2 commits to prod, smoke-test — which surfaced and fixed critical DB drift (get_my_households missing on prod) and produced a testing strategy + harness for future sessions.
**Completed:**
- Hid owner-branch DELETE HOUSEHOLD button (rendered null); removed dead `handleDeleteHousehold` handler and `[ActiveHousehold TEST]` log; committed dev (`b8cd86b`), merged dev→main (9 commits, merge `f952c9f`), Vercel prod deploy green.
- Prod smoke-test surfaced "created households never appear in switcher" — root-caused: `get_my_households` (migration 001) was missing on prod entirely despite docs claiming "Dev + Prod (2026-06-18)." Applied migration 001 to prod; switcher now enumerates correctly (DH: 3 households, DT: 5 households).
- Ran full dev↔prod function audit: confirmed authorization spine (003 `is_member_of`, 004/005/007 policy sweep, 006 `create_household`, 008–012 RPCs) IS live on prod; 001 was the sole gap.
- Verified on prod: owner sees no DELETE button (DH all households, DT on owned household). Verified Layer 2 auto-provision on prod: real-name removal notice ("No longer a member of Aquila 50 - BVI") + fresh "My Household" auto-provisioned, persisted across refresh, in-flight guard held.
- Created `qa/` folder: `agent_test_harness.md` (Parts A/B/C), `prod_test_plan.md` (Sections 0–6), `fixture_gathering.dev.sql`, `qa/README.md`; gitignored `test_fixture.dev.json`. Committed + pushed dev (`c8e59c5`).
- Defined human/agent test split: DB-correctness + static checks → agent; UI/visual/two-party real-time → human. Test is event-triggered (pre-merge gate + post-migration suite + static on commit), NOT a SESSION END sub-step.
- Designed staged agentic-QA pipeline (Stage 0: deterministic gate → Stage 1: automate file copies → Stage 2: automate QA run → Stage 3: guarded fix loop → Stage 4: provenance handoff). Secrets hygiene (Bitwarden) promoted to BLOCKER for automation past Stage 0.
**Unfinished:**
- Prod smoke-test partially run: owner-hide ✅, Layer 2 auto-provision ✅, switcher reads ✅. DEFERRED (not failed): Sections 1 (create→appear loop), 2 (non-owner remove matrix), 4 (single-household regression), 5 (write isolation), 6 (invite/rejoin).
- Migrations folder bookkeeping broken: `007` numbering collision (disk `007_dev_restore_role_grants` vs canonical `007_finish_authorize_sweep`); files `009`–`012` described in docs but absent from local `migrations/` folder.
- `window.confirm()` branded-modal replacement designed (reuse `showResetConfirm` pattern) but not built — 3 call sites in App.js.
- ARCHITECTURE.md docs incorrectly recorded `get_my_households` as "Dev + Prod (2026-06-18)" — corrected this session.
**Next session:**
SESSION START
Goal: Reconcile the `migrations/` folder (fix 007 collision, recover 009–012, gapless ordering) — prerequisite for Supabase CLI workflow and agent test harness Part B.
State: Layer 2 live + auto-provision verified on prod. `get_my_households` now on prod; switcher works. dev↔prod authorization spine confirmed in sync. Three test deliverables in `qa/` on dev. ARCHITECTURE.md corrected.
Done when: migrations folder is gapless/canonical with no numbering collisions; `window.confirm` modal replacement specced or built; Part C static checks run via Claude Code.
**Files updated:** `src/App.js` (hide DELETE button, remove dead handler + test log — `b8cd86b`). `qa/README.md`, `qa/agent_test_harness.md`, `qa/prod_test_plan.md`, `qa/fixture_gathering.dev.sql`, `.gitignore` (`c8e59c5`). `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/SESSION_LOG.md` (this commit).
**DB changes:** PROD (`parpauldmbetptkmdwbd`) — applied migration 001 `get_my_households` (2026-06-25). Was dev-only since ≈06-12; never reached prod despite docs claiming "Dev + Prod (2026-06-18)".

---

### [2026-06-25] — [OurProvisions] — Layer 2 point-4 validation: clean dev environment + controlled retest (PASSED)
**Goal:** Clean the polluted dev test environment, then run a valid controlled point-4 test (removed-from-only-household auto-provision); if it passes, sign off Layer 2.
**Completed:**
- Ran a two-query read-only inventory of dev (`zxwtxjjmssykhqrghouf`) to establish ground truth before deleting anything; surfaced the exact source of prior point-4 failures — lookalike `+test4`/`+test5` accounts (both single "My Household", indistinguishable in the switcher) plus accumulated junk households.
- Executed a targeted, reversible soft-delete cleanup (set `deleted_at`, never hard-deleted): retired Janet (`jan64holmes`) and all five `+test`–`+test5` aliases, plus named junk households under both kept accounts — incl. London + Bristol (real account) and Japan/Berlin/Removal A–C/Test* (Dan Test User). Verified clean end-state: only `dan@velayo.ai` (My Household, BVI) and `daniel.l.holmes@gmail.com` (member of My Household) remain.
- Established a fresh, uncontaminated test fixture: Dan Test User as RemovalTest owner/remover; `+test9` joined RemovalTest **invite-first**.
- Confirmed (via `bootstrap_new_user` body + live UI) that invite-first signup early-returns on a valid invite and **skips My Household creation** → invite-only users are single-household by construction. This made `+test9` a clean point-4 victim with zero SQL surgery.
- Ran a DB gate query immediately before removal: `+test9` = `live_household_count = 1`, `households = {RemovalTest}` — the controlled single-household state never achieved on a clean run before.
- **Point 4 PASSED:** Dan Test User removed `+test9`; within the 30s poll `+test9` saw the notice "No longer a member of **RemovalTest**." + "We've set you up with a fresh household.", auto-landed in a fresh empty My Household, notice survived the switch and auto-dismissed.
- **Bug 1 RESOLVED:** the "that household" wording was a **test-environment artifact, not a code defect** — real household name rendered correctly on the clean run (sticky `activeHouseholdNameRef` populated as designed). In-flight guard confirmed: exactly **one** auto-provisioned household (`62737a3b…`), no duplicate spawn.
**Unfinished:**
- DELETE HOUSEHOLD button still visible + still a `console.log` stub — must be hidden before `dev→main` merge.
- `dev → main` merge still HELD (now unblocked by point-4 pass, gated only on hiding DELETE). Eight Layer 2 commits remain local on `dev`, nothing pushed.
- No application code changed this session (SQL/ops only) — nothing new to commit from the design chat.
**Next session:**
SESSION START
Goal: Hide the DELETE HOUSEHOLD button, then do the deliberate `dev→main` merge + Vercel deploy and run the multi-household behavioral smoke-test on prod.
State: Layer 2 fully validated on a clean dev environment (points 1–4 green, Bug 1 resolved, in-flight guard confirmed). Dev test environment is clean (only real account + Dan Test User + the live `+test9` fixture remain). Eight commits local on `dev`, unpushed.
Done when: DELETE button hidden + committed; `dev` pushed and merged to `main`; Vercel prod deploy verified; prod smoke-test passes (switch household, add item, leave, rejoin via invite; regression: single-household add/remove still works).
**Files updated:** None (no application code changed this session).
**DB changes:** Dev-only operational cleanup (soft-delete of retired users/households/memberships/list_items). **NOT a migration — do not file in `migrations/`.** Prod is unaffected and does not carry this junk.

---

### [2026-06-24] — [OurProvisions] — Layer 2 build: removal notice + auto-provision (steps 1–4, fixes, partial validation)
**Goal:** Build Layer 2 (removed-user detection, contextual removal notice, fresh-household auto-provision) per `SPEC_layer2_removal_notice.md`, and validate via the four-point dev test.
**Completed:**
- Built Layer 2 in clean, individually-building commits: step 1 (presence-detection refs + `markSelfDeparture` scaffold), step 2 (30s `checkPresence` + `clerkId`-keyed interval, detection only), step 3 (removal response: switch-survivor or auto-provision + `provisioningRef` in-flight guard), step 4 (typed `systemMessage` channel + variant-B notice render + context `onRemoval` wiring).
- Diagnosed and fixed a Layer-2-introduced GoTrueClient leak (`checkPresence` was calling `createSupabaseClient` every 30s tick); fixed by caching the client in a `dbRef`/`getDb()` getter, repointing all three call sites — folded into the step-3 commit (tested together).
- Fixed Fix 1 (own-row trashcan): hid the remove control on the current user's own member row via the existing `isMe` condition (`clerkId === user?.id`), removing a redundant self-departure path that double-fired both the legacy toast and the new rectangle. LEAVE button is now the sole self-departure path. Owner/other-member trashcan behavior unchanged.
- Fixed Fix 2 (notice name capture): root-caused the "No longer a member of your household" wording bug to a mutable-ref clobber (`oldHouseholdName` read from `myHouseholdsRef`, which `refreshHouseholds` overwrites before `checkPresence` reads it). Added a sticky `activeHouseholdNameRef` (updates only when the active household name positively resolves); softened the fallback from "your household" → "that household."
- Fixed Bug 2 (transient guard vs. legitimate-empty): narrowed the `checkPresence` guard from `if (error || !data || data.length === 0) return;` to `if (error || !data) return;`, so a successful empty result (user removed from their only household) reaches the auto-provision branch instead of being treated as a transient failure. Confirmed safe: genuine transient failures always surface as `error` truthy or `data` null, never `{error:null, data:[]}`.
- Validated four-point dev test: **points 1, 2, 3 PASSED** — leave button shows clean pill no rectangle (1); remove-others on a survivor household shows the removed user a real-name rectangle ("No longer a member of RemovalA") and auto-switches (2); own row has no trashcan, owner row protected (3).
- Diagnosed Bug 1 (wrong name on auto-provision path) and traced root cause: sticky ref unpopulated + transient guard was blocking the only-household removal path entirely, meaning the "that household" notice came from a different code path (survivor branch with junk pre-existing household), not the auto-provision branch.
**Unfinished:**
- **Point 4 (auto-provision real-name notice) NOT validated — blocked by test-environment pollution.** Every point-4 attempt was invalidated by lookalike `+testN` accounts, accumulated junk "My Household"s, and (critically) watching the wrong window: the account removed from RemovalC was `+test4`, but the window observed was `+test5` (never a member). Genuinely unknown until a clean controlled retest.
- **Bug 1 (notice name on auto-provision path) OPEN.** "That household" was observed but possibly on the wrong account/window. Genuinely unknown until a clean controlled retest with a DB-verified single-household user.
- **TU5/`+test4` single-household question OPEN.** Decisive query set up but not run — need to confirm whether `+test4` was genuinely single-household or had a pre-existing "My Household."
- **Part B (`selfDepartureRef` slow-network wiring) deliberately deferred** — scaffolded from step 1, unwired. Build only if a real slow-network voluntary-leave double-message appears in production.
- `dev → main` merge HELD. Eight commits local on `dev`, nothing pushed.
**Next session:**
SESSION START
Goal: Clean the dev test environment (purge junk households + lookalike accounts), THEN run a valid controlled point-4 test; if it passes, sign off Layer 2 and do the deliberate dev→main merge.
State: Layer 2 fully built (steps 1–4 + Fix 1 + Fix 2 + Bug 2 fix), points 1–3 passed, point 4 blocked by environment pollution. Bug 2 fix committed (`2587b7d`). All commits local on `dev`, none pushed.
Done when: On a DB-verified single-household user, removal from their only household shows a rectangle naming the REAL household (not "that household") + "fresh household" subtext + auto-provision fires on the poll within 30s; then dev→main merged and behaviorally tested on prod.
**Files updated:** `src/contexts/ActiveHouseholdContext.js` (refs, `checkPresence`, interval, `dbRef`/`getDb` leak fix, sticky `activeHouseholdNameRef`, Bug 2 guard narrowing, `onRemoval` wiring), `src/App.js` (typed `systemMessage` state, `postSystemMessage`/`dismissSystemMessage`, variant-B notice render, own-row trashcan hide via `isMe`). Plus `docs/SPEC_layer2_removal_notice.md`, `docs/mockup_notice_translucent.html`, `.claude/settings.json`, `.gitignore` (chore commit).
**DB changes:** None.

---

### [2026-06-22] — [OurProvisions] — Layer 2 removal notice + fresh-household auto-provision (design only)
**Goal:** Design the "you were removed" detection and notice flow for the removed user, and confirm whether a realtime path is viable.
**Completed:**
- Probed live dev DB: confirmed `household_members` SELECT policy is `is_member_of(household_id)` (live state), not `get_current_household_id()` — the `000` canonical baseline is stale on this policy.
- Ruled out realtime: Supabase applies the SELECT policy against the new (soft-deleted) row image to decide per-recipient delivery; `is_member_of` filters `deleted_at is null`, so the removed user's own removal broadcast is RLS-suppressed. `replica identity = default` (PK only) also makes old-image reads unavailable. General pattern: any realtime-on-soft-delete feature using an `is_member_of`-style policy will hit this.
- Decided detection mechanism: 30s membership-presence re-check (KISS), not a realtime subscription. No new server surface, no RLS change.
- Designed removed-vs-left asymmetry: local `selfDepartureRef` flag set in `handleLeaveHousehold`; fail-safe leans toward explaining on uncertainty (never silent-unexplained-removal).
- Approved notice visual: Register-3 shape, teal-accent translucent espresso wash (variant B) — flagged PROVISIONAL pending daily-use validation.
- Approved fresh-household auto-provision for the only-household case (reuse `create_household`, in-flight guard against duplicate spawn); notice line 2 explains the fresh empty list.
- Produced full build spec `SPEC_layer2_removal_notice.md` with ordered surgical build steps and two-window verification checklist (in design chat — needs committing to `docs/` before build starts).
**Unfinished:**
- Live two-window listener test (empirical RLS-suppression confirmation) not run — spec rests on unambiguous function-body reading.
- No implementation done (design-only session, correctly held for Claude Code).
- `SPEC_layer2_removal_notice.md` content lives in design chat, not yet in `docs/`.
**Next session:**
SESSION START
Goal: Commit `SPEC_layer2_removal_notice.md`, then implement Layer 2 — 30s presence check in `ActiveHouseholdContext`, removal notice component, auto-provision for removed-from-only-household case.
State: Design complete, spec written, mockup approved (variant B). Realtime path ruled out and documented. All required RPCs (`is_member_of`, `create_household`, `remove_member`, `leave_household`) live on dev + prod. Three unpushed commits on local `dev`; dev→main still HELD.
Done when: Removed user gets a contextual notice + household switch within ~30s; voluntary leave stays silent; transient blip holds position; no duplicate "My Household" on double-fire; full two-window dev regression passes.
**Files updated:** None (design only). Implementation will touch `src/contexts/ActiveHouseholdContext.js`, `src/App.js`.
**DB changes:** None.

---

### [2026-06-22] — [OurProvisions] — Member management (leave/remove/rejoin) + offline/online race hardening
**Goal:** Ship offline optimistic-write race fixes (A), atomic badge-reset RPC (B), and the complete leave/remove/rejoin member management flow (C); bring dev and prod schemas in sync.
**Completed:**
- Fixed three optimistic-write races in `useProvisions.js`: suspect-empty poll guard (stale RPC response with zero rows bails before any setter runs); transient-vs-genuine rollback classification (offline write taps preserve optimistic value; genuine errors roll back); `pendingQtyRef` write guard (in-flight items excluded from 2s poll commits — eliminates 5→4→5 flicker).
- Resolved Vercel CI build failure (`CI=true` + `react-hooks/exhaustive-deps` on ref-pattern callbacks) via surgical `eslint-disable-next-line` on dep-array lines — not by adding deps that would re-stack poll intervals.
- Shipped migration 009 `remove_list_item` (atomic soft-delete + contributor clear in one transaction); swapped `updateQty` qty≤0 path from `.update({deleted_at})` to RPC; fixes badge-resurrection on re-add. Dev + prod.
- Built member-management UI: `role` added to member select, "Created by {name}" household attribution, remove button on non-creator rows, Leave/Delete bottom action branched on creator status.
- Shipped migrations 010 (`remove_member` + `leave_household`), 011 (`join_household` revive-or-insert upsert), 012 (`bootstrap_new_user` revive fix); all applied dev + prod.
- Wired `handleRemoveMember` + `handleLeaveHousehold` to RPCs; diagnosed and fixed leave-then-rejoin bug on BOTH join paths (`acceptInvite` → 011; URL-invite `bootstrap_new_user` → 012).
- Added `refreshMembers` `useCallback` to `useProvisions` and called it after remove — actor's member list updates live without page reload.
**Unfinished:**
- Layer 2: removed-person's live "you were removed" notice + auto-switch (needs `household_members` realtime subscription). Removed person sees stale state until manual refresh — gracefully degraded (RLS blocks their writes), not broken.
- Delete-household: UI stub in place; RPC + cascade design NOT built. Cascade decisions needed before any code.
- `dev → main` merge deliberately held — 2 local unpushed commits on dev. Not pushed, not deployed, not merged.
**Next session:**
SESSION START
Goal: Complete C — build `household_members` realtime subscription (Layer 2: live "you were removed" notice + auto-switch for the removed person), then design + build delete-household with agreed cascade behavior.
State: Working/live — race fixes, badge RPC (009), leave/remove/rejoin all functional; remove updates actor's view live. All RPCs (009–012) live on dev AND prod. Two unpushed commits on local dev branch. Delete-household stub present, handler is `console.log` only.
Done when: Removed-while-viewing shows a live notice and auto-switches in the removed person's window; delete-household works with agreed cascade behavior and tested two-window; then deliberate `dev → main` merge with full multi-household behavioral test on prod.
**Files updated:** `src/hooks/useProvisions.js` (race fixes, `remove_list_item` swap, `join_household` swap, `refreshMembers`), `src/App.js` (member-management UI, wired handlers).
**DB changes:** 009 `remove_list_item`; 010 `remove_member` + `leave_household`; 011 `join_household`; 012 `bootstrap_new_user` revive fix — all applied dev + prod.

---

### [2026-06-20] — [OurProvisions] — Connectivity pill: soft offline/retry UX
**Goal:** Replace the alarming red error toast on transient network drops with a gentle bottom pill (Reconnecting / Offline / Back online) that keeps last-good data visible.
**Completed:**
- Built `src/lib/classifyFetchError.js` — pure classifier (no imports): transient (Failed to fetch, ERR_CONNECTION*, NetworkError, AbortError, TypeError+network) → pill; real (HTTP error, Supabase code/status, RLS denial, anything else) → red toast. Default `'real'` (fail safe).
- Built `src/contexts/ConnectivityContext.js` — state machine (online → reconnecting → [3 fails] offline → [success] recovered → [2s] online); `failureCount` ref; recovered timer cleared on re-entry + unmount. Built `src/components/ConnectivityPill.js` — brand-token styled (sand/amber pulse, dark-dot offline, teal back-online), bottom-center mirrors toast, `pointerEvents:none`, `role=status aria-live=polite`, returns null when online.
- Wired `ConnectivityProvider` into `App.js` (outside `ActiveHouseholdProvider`); rendered `<ConnectivityPill />` adjacent to existing error toast.
- Converted 4 read-path error guards in `useProvisions.js` (catalog-refresh ×2, list-load, household-fetch): transient → `reportTransientFailure()` + keep last-good; real → unchanged `setError()`. `reportSuccess()` on boot load success and 20s catalog-poll success.
- Converted 2 write-path error guards (`updateQty`, `toggleChecked`): rollback UNCONDITIONAL (runs on any catch), then branch (transient → pill, real → setError); `reportSuccess()` on confirmed write. Verified: offline write rolls back + shows pill; reconnect reconciles server value.
- Diagnosed badge resurrection bug (design chat): zero-out soft-deletes `list_items` row but does NOT clear `list_item_contributors`; migration 008 upsert resurrects the same row → old badges reappear. Fix = migration 009 atomic RPC (soft-delete + contributor clear, both-or-neither for marine-wifi robustness).
- Designed membership exit (Leave/Remove) in principle (design chat): LEAVE ≈ HIDE (per-user, non-owner self-exit); REMOVE = owner-only. Gated on cycle-boundary question: if provision_cycles are user-facing, ship with "applies at next boundary"; if still backend-only, ship simpler rule first. Do not stack on an unloaded seam.
**Unfinished:**
- Poll-clobber on offline: offline write → optimistic shows correctly → ~1s later background 2s list poll fires, fails/returns empty, resets quantity to 0 → reconnect heals. Transient handling not yet extended to the poll/realtime path (next session).
- Feature files not yet committed (verified on localhost dev). Commit: `feat(ux): connectivity pill — soft offline/retry for transient fetch failures`.
- Remaining `setError` sites (clear list, open cycle, start session) still red toast — optional polish, not core.
- SPEC_leave_remove_member.md not yet produced; cycle-boundary gating question unanswered.
- Migration 009 (badge reset on zero) designed but not built.
**Next session:**
SESSION START
Goal: Fix poll-clobber on offline — extend transient-failure handling to the 2s list poll so a failed/empty background fetch does not reset visible quantities to 0 while offline.
State: Connectivity pill verified working on dev (not yet committed). Read paths keep last-good data on transient fail. Write paths roll back unconditionally and branch notification. Poll-clobber is a pre-existing bug exposed by offline testing: offline write shows correct optimistic value ~1s, then 2s poll fires, fails, resets quantity to 0, reconnect heals. No data loss; cosmetic only.
Done when: An offline write optimistic value stays visible and stable for the full offline window — no collapse to 0 on the poll tick.
**Files updated:** `src/lib/classifyFetchError.js` (new), `src/contexts/ConnectivityContext.js` (new), `src/components/ConnectivityPill.js` (new), `src/App.js` (ConnectivityProvider wrap + pill render), `src/hooks/useProvisions.js` (read-path + write-path error guard conversions).
**DB changes:** None.

### [2026-06-20] — [OurProvisions] — Concurrent-add 409 fix (migration 008)
**Goal:** Make insert_list_item conflict-safe so two members adding the same item at once stop throwing a 409 on the losing client.
**Completed:**
- Designed migration 008: converted insert_list_item from plain INSERT to INSERT ... ON CONFLICT (household_id, catalog_item_id) DO UPDATE.
- Chose column-target conflict form over named-constraint form after discovering dev/prod constraint-name drift (dev: auto-named key; prod: list_items_household_catalog_unique).
- Settled merge semantics: last-write-wins on quantity (matches updateQty set-value model), force status='pending', clear deleted_at to resurrect tombstoned slots, COALESCE-preserve cycle_id and price_per_unit.
- Applied 008 to dev; verified upsert_present = true via pg_proc.prosrc; passed both two-window manual tests (concurrent new-item add + concurrent add against soft-deleted tombstone).
- Applied 008 to prod after two-way environment confirmation; verified upsert_present = true on prod.
- Committed 008 (`6cb82c7`) and bundle_003_007_prod.sql historical record (`f764200`), both local on dev.
**Unfinished:**
- 3 commits on dev unpushed (deliberate — awaiting Dan's review/push).
- bundle_003_007_prod.sql not yet annotated with "APPLIED TO PROD — historical record, do not re-run" header.
**Next session:**
SESSION START
Goal: Reconcile the dev/prod constraint-name drift on list_items, and/or close the quiet quantity-bump race.
State: Concurrent-add 409 and Lemons 409 both fully fixed and live in prod. Multi-household invite-join flow is live. insert_list_item is now an upsert on both DBs.
Done when: (a) dev and prod agree on the list_items unique-constraint name via a deliberate reconciliation migration, and/or (b) simultaneous +1 quantity increments on an existing row no longer undercount.
**Files updated:** `migrations/008_insert_list_item_upsert.sql` (new), `migrations/bundle_003_007_prod.sql` (now tracked).
**DB changes:** insert_list_item replaced with upsert body on dev AND prod.

### [2026-06-19] — [OurProvisions] — Multi-household invite-join flow end-to-end
**Goal:** Fix three sequential invite-join bugs so new and established users can join via invite code without reload, data split, or switcher lag — and verify both branches end-to-end with two real users.
**Completed:**
- Fixed invite code not surviving Clerk sign-up redirect: captured `?invite=` in `index.js` before `ClerkProvider` mounts, persisted to `sessionStorage`; bootstrap reads URL-or-stored; new users now join on first load.
- Fixed resolver highlight/data split: Effect 2 trusts `activeHouseholdId` unconditionally; removed `justJoinedViaInviteRef` forced-fallback that loaded joined-household data even on silent joins.
- Fixed silently-joined household missing from switcher: restructured join-banner effect — `hadPrior` captured before async work; silent join calls `refreshHouseholds()` directly; auto-switch awaits refresh before `switchHousehold`.
- Verified Test 1 (first-household auto-switch) and Test A (established-user silent-join): both pass across data, highlight, and switcher list.
- Confirmed `bootstrap_new_user` RPC is correct — all invite-join failures traced to client-side timing/redirect; RPC needed no change.
- Characterized concurrent same-item insert race: two clients adding the same new item simultaneously → second client 409s (unique constraint working correctly; app surfaces it as an error). Root cause and fix direction identified.
**Unfinished:**
- Test B (two-window realtime sync) and Test C (4-household switch cycle) not formally run.
- Concurrent same-item insert race not fixed — characterized, deferred to next session.
- Invalid/spent invite silently lands user in blank "My Household" — no error feedback.
- Join detection keys off fragile name string `household.name !== "My Household"` — should re-key off `joined_via_invite` from bootstrap.
**Next session:**
SESSION START
Goal: Make `insert_list_item` conflict-safe so concurrent same-item adds don't 409.
State: Multi-household join/switch/silent-join working and verified on dev. Three invite-join fixes shipped (index.js capture, resolver single-source, silent-join refresh). Data integrity sound — unique constraint works; the failure is a surfaced error on the losing client.
Done when: Two users adding/bumping the same new item in the same household simultaneously results in one clean row and NO error toast on either client — the second writer updates instead of erroring.
**Files updated:** `src/index.js` (pre-ClerkProvider sessionStorage capture), `src/hooks/useProvisions.js` (URL-or-stored invite code, resolver trusts `activeHouseholdId`), `src/App.js` (join-banner effect restructure: `hadPrior` before async, silent-join refresh, await before auto-switch).
**DB changes:** None.

### 2026-06-18 — Cross — Contributor 403 root-caused; migration 007 sweep; 003–007 applied to prod
**Goal:** Fix the contributor 403, finish the `get_current_household_id()` → `is_member_of` sweep, and ship the migration bundle (003–007) to prod.
**Completed:**
- Root-caused contributor 403 to `household_members_select` (gated on single guessed household, blinding every inline membership join); ruled out duplicate `users` rows and orphaned memberships via Supabase "External user" impersonation — `get_my_households()` returned 5 households while direct `household_members` read returned 1, isolating the SELECT policy as the single blinding gate.
- Authored migration 007 (`007_finish_authorize_sweep.sql`): converted five remaining `get_current_household_id()` gates to `is_member_of` — `household_members_select`, `waste_events_all`, `catalog_items_select`, `catalog_items_insert`, `household_invites invites_insert`. Used SECURITY DEFINER `is_member_of` (not inline subquery) on `household_members_select` to avoid RLS recursion.
- Applied 007 to dev; verified end-to-end: badge writes with no 403 in non-default household; co-member "DT" now correctly visible; custom item created in My Household, absent in London, persisted across switch — proving `catalog_items` select/insert follow membership.
- Committed 007 to dev, pushed to `origin/dev` (`c277021`). Built `bundle_003_007_prod.sql`; caught and fixed transaction-integrity bug (migration 005's inner `begin;`/`commit;` stripped from bundle only — source 005 untouched).
- Applied corrected bundle to PROD (`parpauldmbetptkmdwbd`) atomically. Verified: `is_member_of`, `create_household`, `get_my_households` present; `household_members_select` reads `is_member_of(household_id)`.
**Unfinished:**
- `dev`→`main` merge NOT done — 19 commits on dev ahead of main; multi-household frontend undeployed. DB deliberately ahead of code (harmless direction; existing single-household users unaffected).
- Unpushed `771effe` on local `main` (docs-only, 2026-06-16 SHOP swipe redesign) — push before merge session.
- Prod behavioral regression not yet tapped (confirm single-household add/remove still works on live prod with new policies).
- `bundle_003_007_prod.sql` untracked on dev — decide: commit as audit record or discard.
- Owner-gate not built; Lemons 409 not started; delete-household not started; `[ActiveHousehold TEST]` log still at `App.js:207`; dev test households clutter.
- Contributor INSERT/UPDATE policies still use inline joins; UPDATE lacks `WITH CHECK` (cleanup only — they work now that `household_members_select` is fixed).
**Next session:**
SESSION START
Goal: Ship multi-household to prod users — push `771effe`, merge `dev`→`main`, deploy via Vercel, run full behavioral test on deployed prod.
State: DB spine 003–007 live + verified on PROD. All multi-household frontend on `dev`, unmerged to `main`. Prod runs old single-household frontend over the new (correct, more-permissive) policies. `771effe` docs commit unpushed on local main.
Done when: `771effe` pushed; `dev`→`main` merged + pushed; Vercel prod deploy live; hard-refreshed prod passes multi-household test (switch to non-default household, add item, no 403); regression confirmed for single-household path. **Decision required up front:** go live now vs. after owner-gate, given invites/rename are member-gated with no owner enforcement yet.
**Files updated:** `migrations/007_finish_authorize_sweep.sql` (new, committed `c277021`, pushed `origin/dev`); `migrations/bundle_003_007_prod.sql` (new, untracked). No app source changed this session.
**DB changes:** **PROD** (`parpauldmbetptkmdwbd`) — migrations 003–007 applied atomically (first multi-household DB migrations on prod). Created `is_member_of`, `create_household`, `get_my_households`; converted `list_items` (write/update/delete), `households` (select/update), `household_members` (select), `waste_events`, `catalog_items` (select/insert), `household_invites` (insert) policies to `is_member_of`. **DEV** — migration 007 applied (same five-policy sweep).

### 2026-06-17 — Cross — Household switcher built end-to-end (re-scope → unified sheet → create/rename), authorized by membership
**Goal:** Build the multi-household switcher — re-scope `useProvisions` so the list follows the active household, then layer the unified manage-household sheet on top — and authorize it server-side.
**Completed:**
- Lifted `ActiveHouseholdProvider` above the `useProvisions` call (split `ShoppingListApp` into a thin provider wrapper + inner `ProvisionsApp`) so the hook can consume `useActiveHousehold()` — structural prerequisite for the switcher (commit `edcd683`).
- Re-scoped `useProvisions` via a two-effect split: Effect 1 (session setup + client creation, keyed on identity) and Effect 2 (household-scoped loads + polls, keyed on `activeHouseholdId + bootstrapped`). List now follows `ActiveHouseholdContext`; bootstrap's `household_id` is a fallback only. GoTrueClient-stacking guard; teardown clears polls + resets per-household state (commit `acecef5`). PROVEN: switching `activeHouseholdId` loads the chosen household's list.
- Built the unified "manage household" sheet: household switcher (active marked, tap to switch in-place), create-new-household flow (name → `create_household` RPC → `switchHousehold` → land on empty list → toast), active-household member list with rename + invite. Toast primitive added (`toastMessage` state + 2500ms auto-dismiss). Title bar tappability + sub-line decoupled from member count (always available when signed in).
- Fixed intermittent load hang: Effect 2 was gated on `bootstrappedRef` (a ref) that can't re-trigger the effect once bootstrap finishes — on some mounts the household load never fired, leaving the app stuck on "LOADING YOUR PROVISIONS" with zero Supabase requests. Re-gated on a `bootstrapped` STATE flag added to Effect 2's deps; closed the race (commit `e5b816e`).
- Fixed stale switcher list: `createHousehold`/`renameHousehold` changed the DB but didn't refresh `myHouseholds` — new/renamed households only appeared after reload. Added `refreshHouseholds()` to `ActiveHouseholdContext`; called after create + rename (commit `e5b816e`).
- Applied migration 005 (households SELECT/UPDATE → `is_member_of`; `with check` on UPDATE the original lacked; invite-preview branch preserved verbatim; fixes 406 "cannot coerce to single JSON object" on Effect 2 household fetch) and migration 006 (`create_household` SECURITY DEFINER RPC — atomic household + owner-membership insert, returns `{household_id, household_name}`) to dev; both smoke-tested (commits `0804d4b`, `18551c0`).
**Unfinished:**
- Contributor 403: `list_item_contributors` upsert rejected by RLS on a fresh load — `auth.jwt()->>'sub'` membership gate may be `auth.uid()` mismatch or membership-join gap on this table. Non-blocking; diagnose next session.
- Lemons 409: revive-after-soft-delete collides with `list_items` unique constraint `(household_id, catalog_item_id)` — not a partial index, so soft-deleted rows still hold the key. Fix candidates: partial index `WHERE deleted_at IS NULL` or a revive-via-upsert RPC.
- No-leak WRITE check not fully demonstrated end-to-end (blocked by above). Read isolation IS proven; write isolation is RLS-guaranteed (003/004) but not demo'd via add-to-one-verify-missing-from-other.
- Temp `[ActiveHousehold TEST]` console log still in `App.js` — strip next session.
- Rename is currently allowed for any member (migration 005 gates `households` UPDATE on membership, not ownership) — tighten to owner-only next session.
- Migrations 003–006 are DEV ONLY — must ship to prod together as one authorization + create bundle.
- Test households clutter dev (BVI, Bristol, "Lake House Test", Smoke/Test* leftovers) — clean up next session.
**Next session:**
SESSION START
Goal: Multi-household hardening — fix the contributor 403 + Lemons 409, finish the RLS sweep, then design + build delete-household; ship the dev migration bundle to prod.
State: Switcher works end-to-end on dev (switch/create/rename/invite, no hang, list follows active household). Authorization spine 003+004+005+006 live on dev only. Known bugs logged above. Owner-vs-member DB enforcement does not yet exist.
Done when: contributor 403 fixed (badges write under multi-household); Lemons 409 fixed (revive-after-soft-delete works); remaining `get_current_household_id()` write gates + `auth.uid()` mismatches converted to `is_member_of` / `auth.jwt()->>'sub'`; delete-household designed (soft vs hard + cascade scope) and built (owner-gated RLS DELETE policy + `delete_household` RPC + guards: can't delete last/active household + UI); rename tightened to owner-only; temp `[ActiveHouseholdTEST]` log removed; test households cleaned up; 003–006 (plus hardening fixes) applied to prod.
**Files updated:** `src/App.js` (provider split, `ProvisionsApp` inner, unified sheet, toast, `refreshHouseholds` wiring), `src/hooks/useProvisions.js` (two-effect split, `bootstrapped` state gate, `createHousehold`/`renameHousehold`), `src/contexts/ActiveHouseholdContext.js` (`refreshHouseholds` added + exposed). Commits: `edcd683`, `acecef5`, `0804d4b`, `18551c0`, `e5b816e`.
**DB changes (DEV ONLY — prod pending):** Migration 005 (households SELECT/UPDATE → `is_member_of`; `with check` on UPDATE; invite-preview preserved). Migration 006 (`create_household` SECURITY DEFINER RPC). Both smoke-tested on dev.

### 2026-06-17 — Cross — Active-context standard set, authorization spine built & proven (003 + 004)
**Goal:** Decide where "which household is active" resolves (and make it the Harbour standard), then build and prove the server-side authorization spine — before any switcher UI.
**Completed:**
- Set the **active-context standard** (Harbour-wide): active context is client-authoritative (held in `ActiveHouseholdContext` + localStorage, passed into writes); the server authorizes membership, never picks a household. Chosen over a server-global `users.active_household_id` because that forces cross-device lockstep (explicit non-goal) and prevents desired per-app divergence.
- Settled the **layered default rule**: device-last (localStorage) → fresh device falls back to home household (deterministic, replaces 002 stopgap) → future confident-GPS one-tap confirm ("You're in Day, NY — shopping for NewLeaf?"), never a silent switch. Location gets a voice, never a vote.
- Built & PROVEN migration **003 `is_member_of(p_household_id)`** — shared SECURITY DEFINER authorization primitive (boolean; resolves Clerk `sub`; `search_path` pinned; fails closed on null). Applied to dev; verified with `pg_get_functiondef` + JWT smoke test returning true/true/false/false for two-household test user.
- Built & PROVEN migration **004** — converted `list_items` write/update/delete policies from `= get_current_household_id()` to `is_member_of(household_id)`; added `with check` on UPDATE the original lacked. Applied to dev; item write committed and round-tripped (Apples, SHOP badge ticked) under new policy.
- Committed both migrations to repo (003 = `412f951`; 004 = `a1a9730`). Local only, not pushed, per convention.
**Unfinished:**
- **KEY DISCOVERY — the switcher's real work:** `useProvisions` and `ActiveHouseholdContext` are disconnected. `useProvisions` resolves its household via `bootstrap_new_user` and keys everything off `householdRef.current`; it does NOT read `activeHouseholdId` from the context. A switcher built today would update context and change nothing visible. The real work is re-scoping `useProvisions` to treat `activeHouseholdId` as its single household source, re-run load sequences, and tear down/re-subscribe realtime on switch.
- Honest recalibration: the Apples write proved `004` lets a write SUCCEED under `is_member_of`, but because the write path uses `householdRef` (not the context), we did NOT cleanly prove "wrote to the chosen household." SQL-layer proof of 003/004 stands; app-layer "write to a chosen household" awaits the re-scope.
- No-leak check (item added to one household staying out of the other) not yet confirmed. Verify once switching is easy.
- 003 + 004 are dev-only — must ride to prod together (helper + policies as one bundle).
- Temp `[ActiveHousehold TEST]` log still in `App.js:207` — strip before switcher ships.
- No switcher UI built (title-bar sub-line, sheet, create flow still unbuilt; mockups approved earlier).
- Six other `= get_current_household_id()` write gates remain (waste_events, catalog_items insert, households update/select, household_invites insert, household_members select) — same latent bug, dormant, flagged as future migration 005.
**Next session:**
SESSION START
Goal: Build the household switcher — beginning with the `useProvisions` re-scope so the LIST follows the active household, then the title-bar sub-line + switcher sheet on top.
State: Authorization spine (003 + 004) built and proven on dev. `ActiveHouseholdContext` resolves + persists active household and is wired into `App.js` (display-only today). Blocker: `useProvisions`/context disconnect documented above — re-scope is step one, visible switcher UI is step two. Strict don't-stack: do the re-scope as its own tested change before layering the sheet.
Done when: `useProvisions` reads `activeHouseholdId` from `ActiveHouseholdContext` as its single household source; on switch it re-runs catalog/list/cycle loads and tears down + re-subscribes realtime to the new household; household modal and list agree on the active household; THEN title-bar sub-line (reveals at 2+) + switcher sheet + create flow per approved mockups. Temp debug log removed. 003 + 004 applied to prod.
**Files updated:** `migrations/003_is_member_of.sql` (new, committed `412f951`), `migrations/004_list_items_authorize.sql` (new, committed `a1a9730`). No app source changed this session.
**DB changes (DEV ONLY — prod pending):** Created `is_member_of(uuid)`; replaced `list_items_write` / `list_items_update` / `list_items_delete` policies to authorize via `is_member_of`.

### 2026-06-17 — OurProvisions — Build & prove the multi-household data spine
**Goal:** Stand up the multi-household spine (households query + active-household state) and prove it works end-to-end through real Clerk auth before building any switcher UI.
**Completed:**
- Built `ActiveHouseholdContext` (context + localStorage persistence, `switchHousehold`, `hasMultiple`); mounted `ActiveHouseholdProvider` in `App.js` via a null-rendering `HouseholdDebugLog` helper so it sits inside Clerk auth and above consumers.
- Diagnosed the keystone RLS trap: `household_members` SELECT policy is `(household_id = get_current_household_id())`, scoped to the ACTIVE household — so a user cannot enumerate their other memberships via normal RLS. Authored `get_my_households()` SECURITY DEFINER RPC (migration 001) to return ALL of a user's households, resolving identity internally from the JWT.
- Verified on dev: built a two-household test user (Dan Holmes in "My Household" + new "Lake House"), confirmed the RPC logic returns two rows in SQL, then confirmed the live app logs `Array(2)` households through a real Clerk token. Spine proven end-to-end.
- Found & diagnosed a three-way "which household is active?" ordering bug exposed by multi-household (see ARCHITECTURE). Shipped migration 002 as a labeled TEMPORARY stopgap (align `bootstrap_new_user` to `joined_at DESC`) so the app stops crashing; applied to dev. App now loads clean with a two-household user.
- Established `repo migrations/` as the single source of truth (baseline 000 + 001 + 002); Google Drive copies are stale/pre-baseline and are NOT authoritative.
**Unfinished:**
- Temp verification log still in `App.js` (`[ActiveHousehold TEST]`) — remove next session.
- Migrations 001 and 002 applied to DEV ONLY — prod still needs them before multi-household ships.
- Bootstrap stopgap (002) is a holdover, not the real fix.
- No switcher UI yet: title-bar sub-line, switcher sheet, create flow all still unbuilt (mockups approved last session).
- Minor: `bootstrap_new_user` step 1 has dead `if v_user_id is null` logic (insert never sets it via RETURNING). Harmless; cleanup later.
**Next session:**
SESSION START
Goal: Replace the bootstrap stopgap with the real fix — make bootstrap/RLS read the ACTIVE household from `ActiveHouseholdContext` rather than each picking one by heuristic — then build the switcher UI.
State: Spine built, wired, and proven on dev: `get_my_households()` returns all households through real Clerk JWT; context resolves + persists active household; provider mounted. App runs clean on dev with a two-household test user. Migrations 001 + 002 live on DEV ONLY. Three-way ordering bug documented (see ARCHITECTURE) — currently masked by the stopgap.
Done when: Bootstrap loads the context's active household (one source of truth), superseding the 002 stopgap. Temp console log removed. 001 + 002 (or replacement) applied to prod. Then: title-bar switch sub-line (reveals at 2+ households), switcher sheet, create-household flow built per approved mockups.
**Files updated:** `src/contexts/ActiveHouseholdContext.js` (new), `src/App.js` (provider mount + temp log), `migrations/001_get_my_households.sql` (new), `migrations/002_bootstrap_ordering_stopgap.sql` (new)
**DB changes (DEV ONLY — prod pending):** `get_my_households()` created; `bootstrap_new_user` altered to `ORDER BY joined_at DESC`. Test data: "Lake House" household + Dan Holmes membership added on dev.

### 2026-06-16 — OurProvisions — Multi-household design + store-awareness discovery
**Goal:** Design the multi-household switching experience (the last structural feature before AI) and scope store awareness.
**Completed:**
- Designed multi-household model: schema already supports it (`household_members` is a junction table); the work is app-layer, not DB.
- Settled title-bar UX: wordmark stays; a new tappable household-name sub-line appears ONLY at 2+ households and opens the switcher. One household = no switcher, zero new chrome.
- Approved two mockups: switcher bottom sheet (lists households + "Create new household") and the create flow (name → insert → add creator as owner → auto-switch → land on empty list).
- Settled roles: two only. Creator = owner (rename/remove-member/delete-household); everyone shares all list actions. Succession passes to oldest member if owner leaves. No co-owners.
- Adopted reusable toast pattern (app-level slot + showToast, ~2.5s auto-dismiss, new replaces current) — first toast in the app; fires on household create.
- Read migration 005 and discovered the store-awareness foundation is already fully designed (`known_stores`, `provision_cycles`, `shopping_sessions`, `match_known_store` RPC, silent GPS auto-detect = Scenario D). Likely written but NOT yet applied to prod.
**Unfinished:**
- No Claude Code prompts written yet (design-only session).
- Re-scoping risk in `useProvisions` (realtime re-subscribe on household switch) NOT yet inspected — needs a fresh read of `useProvisions.js` + App.js state block.
- Whether migration 005 is actually live on prod is UNCONFIRMED. Column inventory suggests `list_items` has `session_id`/`checked_lat`/`checked_lng` but NOT `cycle_id` — strong signal 005 was never run.
- Default active-household rule proposed (last-selected from localStorage, fallback oldest membership) but not yet blessed/implemented.
- Whether any existing RLS policy keys off `role` — needs a live check before the create flow writes 'owner'.
**Next session:**
SESSION START
Goal: Begin multi-household implementation, starting with the data spine and the re-scoping hook (NOT the toast — that's the warm-up).
State: Multi-household fully designed; two mockups approved (switcher sheet, create flow). Roles decided (owner/member in DB, capability-based UI, succession by seniority). Toast pattern agreed. Store awareness deferred to its OWN arc after multi-household ships.
Done when: `useProvisions.js` + App.js state block read fresh and re-scope-on-switch plan (realtime teardown/re-subscribe) is written; first Claude Code prompt ready (candidate order: toast primitive → myHouseholds query + active-household context → switch sub-line → switcher sheet → create flow); default-active-household rule confirmed; `role` RLS dependency checked.
**Files updated:** None (design only; mockups produced as artifacts, not repo files).
**DB changes:** None this session. Pending verification: is migration 005 live on prod?

### 2026-06-16 — Velayo OS — Retire v1 Scribe; rebuild project template as dual-mode
**Goal:** Kill the last of the v1 Google-Drive Session Scribe across the OurProvisions instructions and the parent project template, aligning both with the v2 handoff flow.
**Completed:**
- Rewrote the OurProvisions project instructions whole: replaced the v1 Drive-writing Scribe with the v2 SESSION END (chat produces `design_handoff.md`, Claude Code merges), carrying the canonical `### [YYYY-MM-DD] — [SCOPE] — [GOAL]` header.
- Confirmed scope tagging was already shipped (06-11, commit `8396b8e`): `[SCOPE]` = OurProvisions / Velayo OS / Platform / Cross lives in CLAUDE.md and is the merge-time authority — no chat-side duplication needed.
- Corrected the model line to Opus 4.8 at Medium effort (had wrongly reverted to Sonnet 4.6 from the old model-strategy note).
- Rebuilt `VELAYO_PROJECT_TEMPLATE.md` (Velayo OS project) as dual-mode with a MODE switch: DESIGN (no repo — chat is scribe, paste entries in) vs HANDOFF (repo + Claude Code — chat feeds `design_handoff.md`, Code merges). New apps default to DESIGN, flip to HANDOFF at first coding session.
- Reframed the template's "Project Knowledge" section: repo `docs/` is canonical in HANDOFF mode; Project Knowledge is a convenience mirror, not source of truth. Dropped the retired "re-upload these files" step.
- Generalized the template's `[SCOPE]` to `[APP NAME]` so new apps (OurChef, OurGarden) don't inherit OurProvisions' scope vocabulary; added `**DB changes:**` and the canonical header to the seed format.
**Unfinished:**
- Velayo OS project's OWN instructions may still carry v1 Scribe language (the second of the two surfaces flagged in the 06-11 Harbour entry) — Dan to verify and apply the same v2 replacement.
**Next session:**
SESSION START
Goal: Confirm Velayo OS project instructions are on v2; then resume OurProvisions — merge dev → main and begin the email receipt parser.
State: OurProvisions instructions + parent template both on v2 handoff flow. Template is dual-mode. Scope tagging canonical in CLAUDE.md. v1 Scribe debt from 06-11 now closed except the Velayo OS instruction field.
Done when: Velayo OS project instructions verified on v2 (no Drive-writing language); OR OurProvisions dev→main merged green and receipt parser specced.
**Files updated:** OurProvisions project instructions (chat-side, not repo); `VELAYO_PROJECT_TEMPLATE.md` (Velayo OS project + Drive backup)
**DB changes:** None

### 2026-06-16 — OurProvisions — SHOP swipe redesign + toggleChecked id fix + dev grant restoration
**Goal:** Fix the "not in catalog" error hit while shopping and resolve the design question it exposed — SHOP swipe was wrongly a catalog action (Hide) when it should act on the list only.
**Completed:**
- Diagnosed "not in catalog" toast as a name-key failure in `toggleChecked`: rolled-forward items missed the name-keyed catalog lookup. Rewired to resolve by `catalog_item_id` carried on `listRows` → `shoppingList` item → all tap handlers.
- Shipped SHOP swipe redesign: swipe in SHOP now calls `removeFromList` (list-layer soft-delete), not `hideItem` (catalog-layer). Own item removes instantly; shared item opens an ownership-aware confirm modal naming the adder. Cancel springs the row back because `listRows` is never mutated on Cancel. BROWSE swipe unchanged (still Hides).
- Added `catalogItemId` to `shoppingList` useMemo items; plumbed through all 4 `toggleChecked` call sites and both SHOP `SwipeToRemove` handlers.
- Replaced `toggleChecked(itemName)` signature with `(itemName, catalogItemId)` — resolves stable id from caller first, falls back to name-keyed catalog map only if no id arrives.
- Added `removeFromList` to `useProvisions`: soft-deletes one `list_item` by `catalog_item_id`, optimistic `listRows` filter with rollback on RPC failure. Added to hook return object.
- Added `handleSwipeRemove` + `removeConfirmItem` state to `App.js`; inserted confirm modal for shared-item removes.
- Closed the dev "permission denied for table households" bug open since Jun 13: root cause was missing `authenticated`/`anon` grants (not the `auth.uid()` RLS bug assumed). Wrote `007_dev_restore_role_grants.sql` (dev-only) to restore grants matching prod. Verified 28-row grant count matches prod.
- Cold-tested on dev with two members (Dan + Dan Test): rolled-item toggle, own-item instant remove, shared-item confirm + Cancel spring-back + Remove, BROWSE hide regression — all passed.
**Unfinished:**
- `dev → main` merge not yet done — all tests green, immediate next action.
- "Fabric Softemer" orphaned list row (no `catalog_item_id`, free-typed) — needs rename/cleanup on prod.
- Open decision: block roll-forward of items with no `catalog_item_id` to prevent new orphans?
- "Reset Public Schema Permissions" query still in dev + prod SQL editors — the loaded gun that caused tonight's detour. Rename or delete.
- CLAUDE.md lacks an explicit "commit + push after edits" rule — stranded a commit early in the session, causing a Vercel-stale-build false alarm.
**Next session:**
SESSION START
Goal: Merge dev → main, confirm prod green, then begin the email receipt parser (first AI feature).
State: SHOP swipe redesign + toggleChecked fix live and fully tested on dev. Dev role grants restored to match prod. Prod healthy throughout.
Done when: `main` deployed green on Vercel, prod smoke-tested (load + tap, no destructive actions on the live household), and the receipt parser is specced or the orphan-row cleanup is shipped.
**Files updated:** `src/App.js`, `src/hooks/useProvisions.js`, `migrations/007_dev_restore_role_grants.sql` (new), `docs/SPEC_shop_swipe_remove.md` (new)
**DB changes:** DEV SANDBOX ONLY (`zxwtxjjmssykhqrghouf`) — restored `GRANT`s on all public tables/sequences/functions to `authenticated`, `anon`, `service_role` + matching `ALTER DEFAULT PRIVILEGES`. Mirrors prod. No prod DB changes. No schema changes.

### 2026-06-13 — Cross — Multi-machine dev environment + Surface stand-up
**Goal:** Make OurProvisions development reproducible on any machine (NH, NY, lake Surface, lake desktop, boat) so a new machine rebuilds a working env from clone + one secret file + npm install — and stand up the lake Surface as the first proof.
**Completed:**
- Established principle: the machine is disposable, the repo is the source of truth. Any machine rebuilds from `git clone` + `.env.local` + `npm install`.
- Pinned Node to major 24 (matches Vercel's default build runtime): added `.nvmrc` (`24`) + `engines: { node: "24.x" }` in `package.json`.
- Added `.npmrc` with `legacy-peer-deps=true` to pre-empt React 19 / `react-scripts` 5.0.1 peer-dep conflict on fresh installs.
- Wrote `docs/DEV_SETUP.md` — fresh-machine recipe, multi-machine commit/pull discipline, boat/offline notes, per-machine checklist.
- Diagnosed Vercel env-scope misconfig: Preview correctly points at dev DB, but Development scope still carries prod Supabase vars — `vercel env pull` silently returns prod. Documented as debt; warned in `DEV_SETUP.md`.
- Chose interim secrets route: copied `.env.local` (anon/publishable keys only) to personal Google Drive (My Drive, unshared); documented Bitwarden as planned replacement.
- Committed + pushed to `dev` (`1409a5c`): `.nvmrc`, `.npmrc`, `package.json`, `docs/DEV_SETUP.md`, `.gitignore`.
- **Stood up lake Surface end-to-end:** removed accidental nested clone (`src/ourprovisions`); fetched + checked out `dev` (Surface was frozen at March initial commit); dropped `.env.local`; `npm install` clean; `npm start` compiled; Clerk sign-in succeeded.
- **Isolated a dev-DB permission issue (→ OurProvisions project):** localhost AND `dev.ourprovisions.velayo.ai` both throw "permission denied for table households"; prod works fine. Dev-DB RLS/bootstrap problem, not a Surface/code issue.
**Unfinished:**
- Dev Supabase `households` returns "permission denied" for authenticated user — prod works (handed off to OurProvisions project).
- Vercel Development-scope Supabase vars still point at prod — repoint or remove.
- Preview missing `REACT_APP_CLERK_PUBLISHABLE_KEY` (only Production has it).
- Google Drive `.env.local` copy is a stopgap — replace with Bitwarden, then delete Drive copy.
- Lake desktop not yet stood up (will follow `DEV_SETUP.md`; Surface proved the recipe).
- Stale-clone remote on Surface: `github.com/dan-velayo/ourprovisions` vs canonical `Velayo-ai/ourprovisions` — reconcile remotes across machines.
**Next session:**
SESSION START
Goal: [Velayo OS] Reconcile Vercel env scopes + stand up lake desktop. (Separately, in OurProvisions: fix dev-DB households permission error.)
State: Multi-machine setup committed to `dev` (`1409a5c`); Node pinned to 24 across machines + Vercel; lake Surface fully stood up and synced. Vercel Development scope still returns prod. Dev DB throws households permission-denied (prod fine) — owned by OurProvisions project.
Done when: Vercel Development-scope Supabase vars repointed to dev and a test `vercel env pull` returns the dev URL; AND/OR lake desktop completes the DEV_SETUP recipe end-to-end.
**Files updated:** `.nvmrc`, `.npmrc`, `package.json`, `docs/DEV_SETUP.md`, `.gitignore` (committed `1409a5c`)
**DB changes:** None

### 2026-06-12 — OurProvisions — Canonical schema baseline + migrations/ folder
**Goal:** Close the schema drift between repo migration files and prod by producing one validated canonical baseline, and give schema files a real home in the repo.
**Completed:**
- Pulled six prod introspection dumps; diagnosed 14 live objects (13 tables + `category_avg_prices` view) vs. the 10 the docs claimed — 4 undocumented live tables: `household_invites`, `known_stores`, `provision_cycles`, `shopping_sessions`.
- Wrote `000_canonical_baseline.sql` — single file rebuilding prod from empty: 14 objects, 17 canonical functions (3 dead `bootstrap_new_user` overloads dropped), 35 RLS policies, all constraints/indexes, clean 38-item seed.
- Validated against a freshly wiped dev sandbox; deep diff caught one defect (`list_items` unique constraint auto-named vs. prod's explicit `list_items_household_catalog_unique`) — fixed in the file.
- Created `migrations/` + `migrations/archive/` in repo; placed baseline + 6 historical files; committed on `dev` (`e43ce59`).
**Unfinished:**
- Dev carries the pre-fix baseline (auto-named constraint) — harmless, self-corrects on next dev rebuild from the committed file.
- `category_avg_prices` view body is a reconstruction, not a verbatim dump — run `SELECT pg_get_viewdef('category_avg_prices'::regclass, true);` on prod to verify if exactness is wanted.
- Constraints layer verified by inference, not row-by-row diff (Supabase export truncates at ~100 rows).
**Next session:**
SESSION START
Goal: Fix the two known-debt items sitting on the clean baseline.
State: Canonical baseline committed (`migrations/000_canonical_baseline.sql`, dev `e43ce59`). Six historical files in `migrations/archive/`. Prod untouched throughout.
Done when: (1) RLS policies using `auth.uid()` on `known_stores`/`shopping_sessions`/`velayo_crews`/`velayo_crew_members` rewritten to `auth.jwt()->>'sub'` and tested in dev as a separate named migration; (2) duplicate helper pairs consolidated as a separate named migration. Neither fix touches `000_canonical_baseline.sql`.
**Files updated:** `migrations/000_canonical_baseline.sql`, `migrations/README.md`, `migrations/archive/` (6 historical files)
**DB changes:** None to prod. Dev sandbox wiped and rebuilt from baseline as validation test.

### 2026-06-12 — OurProvisions — Dev DB sandbox + catalog propagation + Browse tab UI overhaul
**Goal:** Stand up isolated dev database, fix cross-client catalog propagation, and overhaul the Browse tab UI.
**Completed:**
- Set up isolated dev Supabase project (`zxwtxjjmssykhqrghouf`); repointed Vercel Preview to dev; reconciled four prod/file schema drifts into `003_apply.sql`, `007_functions.sql`, `008_policies.sql`; configured Clerk Third-Party Auth on dev project.
- Fixed catalog propagation: guarded-merge `refreshCatalog` (respects `hiddenIdsRef`/`deletedIdsRef`, commits only on real field-level diff); added `refreshCatalogRef` for stable closure access; wired 20s `catalogPollInterval` alongside the 2s list poll.
- Replaced direct `list_items`/`catalog_items` writes with SECURITY DEFINER RPCs (`insert_custom_catalog_item`, `insert_list_item`); switched list read to `get_list_items_for_household` RPC (inline name/category/is_staple); removed `pendingWrites` guard that was blocking cross-user poll visibility.
- Built Browse tab UI: real-time search bar, wrapping category chip filters, two-layer `displayCategories` (staples cross-cut → chips narrow), no-match row with category picker and inline new-category creation.
- Removed `CUSTOM_CAT = "⭐ My Custom Items"` constant entirely from App.js and useProvisions.js; all fallbacks replaced with `"Household"`.
- Fixed pre-existing build failures (duplicate declarations, merge conflict markers, unused `realtimeSub`); stabilized splash screen timer (empty deps array + `useCallback`).
- Merged `dev` → `main` (fast-forward), pushed both; production green at `9a3008d` — Hide/Delete/propagation features live.
**Unfinished:**
- Prod schema diverges from migration files on four axes (undocumented tables/columns, 15+ RPCs, RLS rewrite) — prod works, files are not canonical; clean rewrite not yet done.
- Background-tab sync lags (~60s) due to browser `setInterval` throttling on unfocused tabs — accepted as non-issue for foreground use.
**Next session:**
SESSION START
Goal: Regenerate a clean, canonical migration set from prod's actual live state.
State: Catalog propagation shipped to prod. Dev sandbox isolated and functional. Migration files `001`–`006` are behind prod; `003_apply`/`007_functions`/`008_policies` exist as dev-only patches.
Done when: A migration set that reproduces prod's real schema (tables, columns, RPCs, RLS) from scratch exists in repo, validated by a clean dev rebuild.
**Files updated:** `src/hooks/useProvisions.js`, `src/App.js`
**DB changes:** Dev only — `003_apply.sql`, `007_functions.sql`, `008_policies.sql` applied; RLS disabled on `provision_cycles`/`shopping_sessions`/`known_stores`; soft-deleted duplicate `household_members` row. Prod: code-only deploy.

### 2026-06-11 — Velayo OS — Build & ship The Harbour + harden the SESSION END pipeline
**Goal:** Stand up a company "intranet" — refined into a private, push-to-deploy founder operating dashboard ("The Harbour") gated to crew only — then resolve the resulting logging-pipeline conflict.
**Completed:**
- Designed The Harbour: a four-lane balance instrument (Business Foundation / Product / Marketing / Sales & Support), not a link launchpad. Cold-signal hierarchy: neglect detector loudest, then priority, owner, tools.
- Added a leverage gauge — 1 human : tasks run by agents, goal 1:20, summed from per-lane agent counts. Separated the "intelligence layer" (C-suite Claude projects = advice) from the ratio (keeps the number honest and un-inflatable).
- Built + shipped: new repo `Velayo-ai/velayo-os` (private), Git-wired to Cloudflare (push-to-deploy), custom domain `harbour.velayo.ai` (HTTPS), gated with Cloudflare Access (OTP, "Crew only" policy). Verified end-to-end in incognito.
- Decided repo architecture: OS stays its own repo, separate from `velayo-platform` and app repos. Cockpit ≠ engine.
- Resolved the SESSION END conflict: retired v1 chat-Scribe (Drive-writing) in favor of v2 (chat emits handoff → Claude Code merges canonical docs). One record, chat is a feeder.
- Added scope tagging to CLAUDE.md SESSION END routine ([SCOPE] = OurProvisions / Velayo OS / Platform / Cross) so the single rolling log stays one narrative now but splits cleanly later.
**Unfinished:**
- Harbour placeholders: C-suite seat URLs, tool chips (Banking, Cap table, Social, Brand deck), and lane content (priorities, agent counts, "moved Xd ago" dates) are all illustrative — need a real first pass.
- v1 chat-Scribe language still lives in this project's instructions + `VELAYO_PROJECT_TEMPLATE.md` — needs the v2 "produce a handoff" replacement.
- Company-log-in-app-repo is a conscious interim choice; split into `velayo-os/docs` at the trigger (app #2's first session).
**Next session:**
SESSION START
Goal: Wire The Harbour's live data + retire v1 Scribe language.
State: Harbour live + gated at harbour.velayo.ai, push-to-deploy via velayo-os. CLAUDE.md scope-tagging committed. Placeholders throughout the dashboard.
Done when: C-suite seats open the right Claude projects; tool chips resolve; lane data reflects reality; pushed live; project instructions + template updated to v2 handoff-producer language.
**Files updated:** `velayo-os/index.html`, `velayo-os/velayo_os_flight_checklist.html`, `CLAUDE.md` (scope tagging)
**DB changes:** None

### 2026-06-11 — OurProvisions — Add [SCOPE] tag to session log infrastructure
**Goal:** Add a [SCOPE] field to CLAUDE.md so the single rolling session log can distinguish OurProvisions / Velayo OS / Platform / Cross work and support a future per-repo split.
**Completed:**
- Added `[SCOPE]` slot to `SESSION LOG ENTRY FORMAT` header (`### [YYYY-MM-DD] — [SCOPE] — [GOAL]`)
- Appended scope-tagging paragraph to Step 1 of SESSION END routine (defines four values; explains why a filter beats a migration)
- Added scope discipline bullet to Rules (directs against filing OS/Platform work as OurProvisions history; flags future velayo-os log)
- Committed all three surgical edits (`8396b8e`, `dev`)
**Unfinished:** None
**Next session:**
SESSION START
Goal: Stand up dev DB sandbox, THEN fix catalog propagation.
State: Delete verb (client side) done; `delete_custom_catalog_item` RPC not yet deployed; catalog propagation cross-client broken (catalog loaded once at boot, not on poll); ESLint exhaustive-deps warning present; dev NOT merged to main.
Done when: dev DB isolated (Supabase branch + Vercel env repointed); custom catalog adds + catalog-only deletes propagate cross-client within a poll cycle; lint clean; dev merged to main.
**Files updated:** `CLAUDE.md`
**DB changes:** None

### June 11, 2026 — Delete verb (client side) + pre-merge cleanup
**Goal:** Implement client-side Delete for custom catalog items; strip debug artifacts before dev→main merge.
**Completed:**
- Rewired `deleteItem` in `useProvisions.js` to call `delete_custom_catalog_item` RPC (hard-delete + reference cascade server-side); added `is_global` guard refusing deletion of seed items; optimistic UI removal with `prevCatalogRef` snapshot rollback on error
- Removed dead `pendingWrites` ref (orphaned by prior debug-log removal)
- Added Delete button to Edit Item modal footer — custom items only, `window.confirm` gate, left-slot placement, taupe-red text style
- Fixed `isCustom` discriminator in `openEditModal`: `created_by != null` → `is_global === false` (canonical discriminator, reliably present in all catalog read paths)
- Added `deletedIdsRef` poll guard in `loadListItems`: prevents 2-second poll from transiently re-adding a just-deleted item during the RPC round-trip; wired into `deleteItem` (mark before RPC, unmark on rollback)
- Stripped 6 debug `console.log` statements from `useProvisions.js`
**Unfinished:**
- Catalog propagation across clients is broken (DIAGNOSED, not fixed): custom items created on one client don't appear on others until hard-reload. Root cause: the 2s poll refreshes LIST state only; the catalog_items read runs once at boot, never on the interval. Confirmed live (proptest1 created on DT never reached DH).
- ESLint exhaustive-deps warning on the boot effect — still present, blocks main merge.
- dev NOT merged to main (gated on the two items above).
- Note: dev preview + Supabase SQL Editor both currently run against PRODUCTION (main); no isolated dev DB branch exists. This session's test deletes hit prod (throwaway items only).
**Next session (SESSION START):**
Goal: Stand up a dev DB sandbox, THEN fix catalog propagation against it.
Order: (1) Create Supabase `dev` branch + repoint Vercel preview env vars to it — stop testing against prod. (2) Fix catalog propagation (separate slower catalog poll + harden refreshCatalog into a guarded merge; it currently does a full setCatalogMap replace and ignores deletedIdsRef). (3) Resolve ESLint exhaustive-deps warning. (4) Merge dev → main.
Done when: dev DB isolated; custom catalog adds + catalog-only deletes propagate cross-client within a poll cycle; lint clean; dev merged to main.
**Files updated:** `src/hooks/useProvisions.js`, `src/App.js`
**DB changes:** `delete_custom_catalog_item` SECURITY DEFINER RPC deployed and tested

### June 10, 2026 — Repo housekeeping & handoff bridge
**Goal:** Clean up repo structure and wire the design→implementation handoff path.
**Completed:**
- Moved `src/docs/` → `docs/` and `src/handoff/` → `handoff/` (repo root); updated all path references in CLAUDE.md and the docs themselves
- Tracked `tools/` (velayo OS flight checklist)
- Added `handoff/.gitignore` (`*` / `!.gitignore`) so transient `design_handoff.md` files are never accidentally committed
- Added `.gitattributes` to normalize all text files to LF; renormalized existing files
- Removed `src/App_legacy.js` backup (unused)
**Unfinished:** None
**Next session:** —
**Knowledge updated:** CLAUDE.md (all `src/docs/` → `docs/` refs, Step 5 git-add path), ARCHITECTURE.md, ROADMAP.md, SESSION_LOG.md

### June 9, 2026 — Implement Hide verb + fix poll/boot races
**Goal:** Wire up per-user Hide (per SPEC_hide_delete) and eliminate the two root causes of hidden items reappearing.
**Completed:**
- Added `hideItem` function to `useProvisions.js` — inserts into `user_hidden_items`, optimistic local removal of item from `catalogMap`/`catalogRef`/`quantities`, rollback on error; exported from hook return object
- Repointed all three `SwipeToRemove` `onRemove` handlers in `App.js` from `deleteItem` to `hideItem`
- Renamed "Remove" → "Hide" in SwipeToRemove action row and swipe-reveal; recolored from red (`#e05c5c`) to warm taupe (`#8A7968`); Staple button non-staple state stays slate (`#6B7E8F`)
- Updated Add Item restore-hidden copy: "select to reset" → "tap below to unhide"; "restored" → "items unhidden"; button now shows count-aware "Unhide N hidden {category} item(s)"
- Fixed poll re-adding hidden items: added `hiddenIdsRef.current.has()` guard in `loadListItems` in both the `catalogRef.current` forEach and the `setCatalogMap` forEach — hidden items are now skipped on every 2-second poll tick
- Removed `await refreshCatalog()` from `hideItem` try block (optimistic removal + poll guard is sufficient; the full re-fetch caused flicker)
- Fixed boot effect stacked-poll race: added `getTokenRef` to hold the latest Clerk `getToken` without re-triggering the effect; removed `getToken` from the `useEffect` dependency array — effect now only fires on `userId`/`clerkId`/`email`/`fullName` changes
- Added 3 temporary debug `console.log` lines to diagnose any remaining catalog repopulation path

**Unfinished:**
- Debug logs still present (remove after confirming hide is stable cross-user)
- Delete verb not yet implemented (custom items, household-wide, cascades to list)
- Cold cross-user test of Hide still needed

**Next session:**
SESSION START
Goal: Confirm hide is stable across two users; remove debug logs; begin Delete verb.
State: Hide is wired. Boot race fixed. Poll guard in place. 3 debug logs in `useProvisions.js` (loadListItems, hideItem, refreshCatalog).
Done when: Hide survives 2-second poll on both clients with no reappearance; debug logs removed; Delete verb spec'd or started.

**Files updated:** `src/hooks/useProvisions.js`, `src/App.js`
**DB changes:** None (user_hidden_items table pre-existing)

### June 8, 2026 — Fix multi-user list sync (OurProvisions)
**Completed:**
- Rendered SHOP list from raw RPC rows (`listRows`) instead of `catalogMap`, so synced items (e.g. Bakery) appear on every client regardless of local catalog state
- Removed per-user `hiddenIdsRef` filter from the `listRows` loop — catalog hides must not suppress shared active list items
- Removed now-unused `addedByMap` from App.js destructuring; build passes clean
- Added `docs/` to repo: SESSION_LOG, ROADMAP, SPEC_hide_delete

**Unfinished:**
- SPEC_hide_delete implementation (hide/delete rework per spec)

**Next session:**
- Implement SPEC_hide_delete: per-user hide via `user_hidden_items`, hard-delete for custom items, restore flow

**Knowledge updated:**
- `listRows` is now the source of truth for the SHOP list; `catalogMap` is catalog-browse only

### June 2026 — Velayo OS Foundation
**Completed:** 
- Built complete Claude OS framework (project structure, hygiene rules, session templates)
- Clarified model strategy: Sonnet as default, Opus for hard problems
- Mapped first agent: Session Scribe
- Created all four Velayo OS base documents (VELAYO_BRIEF, CLAUDE_OS, ROADMAP, SESSION_LOG)

**Unfinished:** 
- OurProvisions Project Knowledge audit
- Session Scribe v1 build

**Next session:** 
- Build Session Scribe v1 as a prompt-based tool in Velayo OS project
- Audit OurProvisions Project Knowledge

**Knowledge updated:** 
- All four base documents created fresh tonight
