# OurProvisions — Roadmap
*Last updated: 2026-06-29*

---

## Status Key
- **NOW** — actively building this week
- **NEXT** — clearly defined, ready to start
- **LATER** — planned but not yet spec'd
- **DONE** — shipped and live

---

## NOW — Active Sprint

| # | Feature | Notes |
|---|---|---|
| — | *(NOW #1 + #2 — `auth.uid()` RLS fix and helper consolidation — shipped 2026-06-29 as migrations 014/015; see DONE. Pick the next NOW item from the design queue: household-scoped UI state audit.)* | |

---

## NEXT — Clearly Defined, Not Yet Started

| # | Feature | Notes |
|---|---|---|
| — | **Household-scoped UI state audit** *(headline)* | Enumerate every piece of UI state scoped to a single household and verify it resets on active-household change — fix the whole class at once. Surfaced 2026-06-29 as systemic: join banner, invite link, and a near-miss desync all stemmed from household-scoped state surviving a switch. Deliver an audited list (pass/fix per surface) + fixes for any remaining instances. |
| — | **Wire `ourprovisions.app`** | Make `ourprovisions.app` reachable + canonical: Cloudflare DNS + Vercel primary-domain + Clerk allowed-domain/redirect; redirect `velayo.ai` subdomain → `.app`. Stay auth-neutral and reversible (auth-domain unification is Phase II). Pre-step: confirm what `velayo.ai` root + `ourprovisions.velayo.ai` serve before retiring/redirecting. |
| — | **`SwipeToRemove` search-parity + close-gestures** | Two consistency gaps surfaced 2026-06-29: (1) search-filtered rows have no swipe action — `SwipeToRemove` wraps `CatalogItemRow` at the Browse call site but not at the search call site; (2) `SwipeToRemove` latches open with no dismiss gesture — add swipe-right / tap-away / single-open-at-a-time close paths. Per the one-shared-row principle, a filtered row must behave identically to an unfiltered one. |
| — | **Manage-household surface redesign** | Re-sort by frequency × gravity: open-door actions (invite, create) earn prominence; heavy actions (delete, leave) get a quiet home, never front-door volume. Current surface tangles household vs member actions and over-weights Delete. Direction set 2026-06-29; mockup pending. |
| — | **Filter show/hide toggle** | Labeling + reclaiming list real estate for the Browse filter toggle. Mockup pending. |
| — | **Clean up Test House 1–6 dev test data** | Test households 1–6 clutter the dev switchers and have caused false test signals before. Remove before the next multi-account test session. |
| — | **Build Phase I active-household indicator** | Outer chrome banner between avatar and kebab menu: anchor icon + plain household name, Sand `#C9A97A`, Lato ~13px uppercase, letter-spacing ~0.6px. onClick: `setShowHouseholdModal(true)`. Render guard: `{isSignedIn && household?.name && (…)}`. Simultaneously remove people glyph (~App.js 989–994) and "TAP TO MANAGE HOUSEHOLD" subline (~App.js 1005). Per `docs/SPEC_household_indicator.md`. |
| — | **Create household with cloned catalog** | Build `create_household_from_template` per `docs/SPEC_create_household_from_template.md`. New RPC wraps `create_household` (006); clones source household's custom catalog into the new one (snapshot, not live link); null source = passthrough ("Standard provisions"). Client: dropdown picker in manage-household sheet. Resolve item-count RPC shape + most-recently-active default during build. |
| — | **Reconcile `migrations/` folder** | Fix the `007` numbering collision (`docs/007_dev_restore_role_grants.sql` — a 007-numbered migration filed under `docs/` — vs canonical `migrations/007_finish_authorize_sweep.sql`); recover/locate `009`–`012` (described in docs and confirmed live on prod but absent from local folder); enforce gapless ordering. **2026-06-29:** `014`/`015` now on disk, so the high-water mark is `015`; the `009`–`012` gap and the `007` collision still stand (confirmed by harness Part C — C2). Prerequisite for Supabase CLI workflow and agent test harness Part B. |
| — | **Replace native `window.confirm()` with branded modal** | 3 call sites in App.js (leave household, remove member, ~App.js:2284). Native browser confirm is unbranded — "ourprovisions.velayo.ai says…" box clashes with Layer 2's branded removal notice. Reuse the existing `showResetConfirm` modal pattern; preserve existing on-brand copy. |
| — | **Wire agent test harness — Part C + Part A** | Part C (static repo checks): no DB needed, Claude Code can run today. Part A (read-only prod gate): paste queries into prod SQL editor before each `dev→main`. Both runnable with near-zero setup. See `qa/agent_test_harness.md`. |
| — | **Migrate join banner into `systemMessage` channel** | Precondition (2nd real tenant) met — removal notice is now a shipped tenant. Scope: migrate `joinBanner` state into the typed `systemMessage` channel; decide queue/priority model (newest-wins vs. persistent vs. category-priority); match auto-dismiss parity with the removal notice. UX intent: the green "You joined …" banner auto-dismisses like the bottom notice. Do NOT bundle into the dev→main merge — own session. |
| — | **Disambiguate duplicate-named households in UI** | `households.name` has no unique constraint (by design — two real households may share a name). When names collide in the switcher, show creator name or creation date to distinguish. |
| — | **Constraint-name reconciliation (dev↔prod)** | `list_items` unique constraint is named differently across environments — dev: auto-generated `list_items_household_id_catalog_item_id_key`; prod: explicit `list_items_household_catalog_unique`. Migration 008 uses the column-target form to dodge this. Any future ON CONSTRAINT migration must account for the split. Reconcile via a dedicated migration. |
| — | **Quiet quantity-bump race** | Simultaneous +1 quantity increments on an already-existing `list_items` row serialize via Postgres row lock (no error) but can land as a single increment rather than summing — silent undercount, no toast. Concurrent-INSERT race is now closed (migration 008); this concurrent-UPDATE race on existing rows remains open. |
| — | **Surface "invite no longer valid" on invalid/spent code** | Invalid or expired invite currently fails silently — user lands in blank "My Household" with no feedback. `bootstrap_new_user` detects the failed join; surface it to the client. |
| — | **Re-key join detection off `joined_via_invite`, not household name** | Join-banner effect in `App.js` checks `household.name !== "My Household"` — fragile if a real household is named "My Household". Re-key off the `joined_via_invite` boolean already returned by `bootstrap_new_user`. |
| — | **Receipt scan entry point in wrap-up modal** | After rolling items forward, prompt appears: "Scan your receipt to capture prices." Natural on-ramp to Phase 3. |
| — | **Household member administration UI** | View members, remove members, manage/revoke invites. Absence is why orphaned memberships accumulated and needed raw SQL to fix (Jun 12). |
| — | **Contributor display refinement** | Keep the full name of the original adder; when another member adds quantity, append their badge rather than replacing attribution with an icon. |
| — | **Wire Harbour live data** | C-suite seat URLs (Claude project links), tool chips (Banking, Cap table, Social, Brand deck), real lane content (priorities, agent counts, "moved Xd ago" dates). Push live once done. |
| — | **Verify migration 005 is applied to prod** | Column inventory suggests `list_items` lacks `cycle_id` — strong signal 005 was written but never run. Confirm; if unrun, apply as a tested migration. Prerequisite for the store-awareness arc. |
| — | **Store-awareness arc (VERIFY-AND-SURFACE, post-multi-household)** | Foundation already designed in migration 005 (`known_stores`, `provision_cycles`, `shopping_sessions`, `match_known_store` RPC, Scenario D silent GPS auto-detect). First step: confirm 005 is live. North-star payoff: N3-style price steering ("cheaper at Market Basket") — build only once price-history data is dense enough to be honest. |
| — | **Verify Velayo OS project instructions are on v2 handoff flow** | The Velayo OS project's own instruction field may still carry v1 Drive-writing Scribe language (flagged in 06-11 Harbour entry). Dan to check and apply same v2 replacement. |
| — | **Auto-stamp lane "last moved" dates** | SESSION END writes the active lane's date on close — self-maintaining neglect detector in the Harbour. |
| — | **Reconcile Vercel env scopes** | Development scope still carries prod Supabase vars (79-day-old). Repoint/remove to dev; add `REACT_APP_CLERK_PUBLISHABLE_KEY` to Preview. Unblocks `vercel env pull` as clean secrets-distribution route. |
| — | **Stand up Bitwarden for secrets** | Replace Google Drive `.env.local` stopgap with Bitwarden. Delete the Drive copy once migrated. |
| — | **"Fabric Softemer" orphan row cleanup** | Free-typed list row has no `catalog_item_id`. Rename or delete it on prod so it doesn't surface as a broken state for other members. |
| — | **Roll-forward orphan guard** | Decide whether `close_cycle` should block (or skip) items with no `catalog_item_id` to stop new orphans accumulating across cycles. |
| — | **Decommission "Reset Public Schema Permissions" query** | This saved query stripped all `authenticated`/`anon` grants on the dev sandbox (Jun 16 incident). Rename to "⚠️ DANGER — strips all grants" or delete from both dev and prod SQL editors. |
| — | **Add "commit + push after edits" directive to CLAUDE.md** | Stranded commit at session start caused a Vercel-stale-build false alarm. Add explicit rule: after any code edit, commit + push before closing the session. |
| 4 | **Cascade soft-delete (catalog → list)** | Deleting a custom catalog item should cascade to active `list_items` rows. Same gesture as the Delete half of #2 — pairs with it. |
| 5 | **Fix close_cycle contributor carry-forward** | When rolling items forward, copy `list_item_contributors` rows to new `list_items`. Currently badges reset to `added_by` only after wrap-up. Fix is in the `close_cycle` RPC. |
| 6 | **Re-enable RLS on provision_cycles, shopping_sessions, known_stores** | Confirmed disabled in prod (matches dev). Anon key can cross-household read/write these tables. Low stakes now; address during migration rewrite. |
| 8 | **Global category rename** | `household_category_overrides` table. Lets a household rename "Pantry" → "Dry Goods" etc. Migration pending. |
| 9 | **Reset Household (nuclear option)** | Confirmation-gated. Returns catalog to factory seed and clears household customizations. NOT the everyday undo for hides/deletes — recovery-from-chaos only. |
| 10 | **Replace remaining `window.location.reload()` calls** | Audit codebase; replace all with `refreshCatalog()` pattern. |
| — | **Avatar two-letter monograms (small UX)** | Single-initial contributor badges are ambiguous — two users can both render "D" (Dan Holmes / Dan Test User). Fix: two-letter monogram (DH / DT — names already provide the data). Alternatively: per-user distinct colors, or lean on the existing hover-name. Two-letter likely cleanest. |
| 11 | **Email receipt parser** | Most actionable near-term price ingestion path. No partnerships required. Parse forwarded grocery receipts via email. |

---

## LATER — Phase 1.5: Active Household Identity

| Feature | Notes |
|---|---|
| **Phase II shared active-household lens at the harbour/identity layer** | Once the Harbour / `velayo-os` identity layer exists, the "which household is active" signal should be a cross-app primitive shared by all Velayo apps (OurChef, OurManifest, etc.) — not re-implemented per app. Phase I outer-chrome indicator is the OurProvisions-only stopgap; Phase II retires it in favor of the shared lens. Scope belongs to a `velayo-os` session once app #2 starts. |

---

## LATER — Velayo OS / Infrastructure

| Feature | Notes |
|---|---|
| **Consolidate multiple Supabase client instances to one shared client** *(design-first)* | `useProvisions.js` and `ActiveHouseholdContext.js` each create a Supabase client sharing one auth storage key → persistent GoTrueClient multiple-instance warning. Confirmed SEPARATE from the name-change hang (2026-06-29). Non-urgent; auth/token-flow blast radius means a design session before touching. |
| **Required first/last name at signup** | Clerk config + backfill + social-auth check. Reduces email-prefix display fallbacks; decided 2026-06-29 this makes the rare unnamed-member case a non-issue rather than something to engineer around. |
| **Show which household an invite link is for, in the Share panel** *(ExD polish)* | "Invite to <name>" in the Share panel — makes the household↔link binding legible and prevents stale-link confusion structurally (complements the 2026-06-29 stale-link reset). |
| **Authenticate/link the `vercel` CLI for Claude Code** | So deploy status can be verified directly instead of gating on a human dashboard check. Surfaced 2026-06-29 when promotion couldn't confirm prod-build-green programmatically (no `gh`, `vercel` CLI not authed/linked). |
| Promote "Crew only" to a reusable Access Group | When a 2nd internal app or 4th person appears — scales without per-hire edits. |
| Split company log into `velayo-os/docs` | Trigger = app #2's first session, not a date. Filter-based split, not a migration (scope tags already in place). |
| Sync on unfocused tabs | Browser `setInterval` throttles to ~1 min on backgrounded tabs, causing perceived lag. Consider `visibilitychange` refresh-on-focus, or Supabase Realtime if Clerk/Realtime auth incompatibility is ever resolved. |
| Invite-accept creates duplicate memberships | Accepting an invite adds a membership without retiring the user's auto-bootstrapped household. Should move-or-block until multi-household is real. |
| Apply migrations 001 + 002 to prod | Required before multi-household ships to real users. Currently dev-only. |
| **Location-confirm first-landing** *(gated behind store-awareness arc)* | When location is shared and a confident GPS match exists, offer a one-tap confirm ("You're in Day, NY — shopping for NewLeaf?") — never a silent switch. Location gets a voice, never a vote. |
| Remove temp `[ActiveHousehold TEST]` console log from `App.js` | Added for spine verification; remove before multi-household UI ships. |
| Audit SECURITY DEFINER functions for `set search_path` | `get_my_households()` and `get_household_id_for_current_user()` lack explicit `set search_path`. Low risk now; address when consolidating helper functions. |
| `bootstrap_new_user` step-1 dead-logic cleanup | `if v_user_id is null` guard is always true because the INSERT above never sets `v_user_id` (no RETURNING clause). Harmless but misleading. Fix when rewriting bootstrap as the real active-household fix. |
| Reconcile git remotes across machines | Canonical remote is `Velayo-ai/ourprovisions`; stale Surface clone pointed at `dan-velayo/ourprovisions`. Reconcile when doing next per-machine setup. |
| Local Supabase (CLI/Docker) for offline dev | Seeded from `000_canonical_baseline.sql` — for genuinely-offline boat development. Only if offline dev becomes a real need. |

## LATER — Catalog / View Refinements

| Feature | Notes |
|---|---|
| Multi-item / category-level Hide | Hide several items (or a whole category) in one action. Build ONLY if user feedback shows one-by-one hiding is a real pain. Deferred by decision June 8. |

---

## LATER — Phase 2: Know What's in the House

Shopping intelligence layer. Captures behavior silently and learns from it.

| Feature | Notes |
|---|---|
| Shopping sessions — "I'm going shopping" UI | Start session explicitly, or auto-open on first check-off. GPS captured silently. |
| Store detection | GPS match against `known_stores`. Receipt scan confirms. Manual fallback only for new stores. |
| Smart list ordering | Sort list to match user's natural path through their store. Per-user, per-store. |
| Pantry scan | Camera → Claude Vision → home inventory populated. |
| Pantry layer | "What's in the house" view, distinct from the shopping list. |
| Inventory → List nudge | Running low? App suggests adding to list. Closes the loop. |
| Impromptu trip UX | Quick-add mode: fast scratchpad, receipt scan at end, closes same day. |

---

## LATER — Phase 3: Price Intelligence

The intelligence layer. Prices are infrastructure, not UI. Everything feeds from receipt scanning.

| Feature | Notes |
|---|---|
| Receipt scan (camera) | Capture receipt image → Claude parses → populates price_history |
| Email receipt parser | Forward grocery email receipts → parse → price_history |
| Price history | Per item, per store, over time |
| Cross-store comparison | "Eggs are $1.20 cheaper at Market Basket" |
| DB: `receipts` | `id, household_id, scanned_by, store_id, raw_image_url, parsed_json, total, purchased_at` |
| DB: `price_history` | `id, household_id, catalog_item_id, store_id, price, quantity, scanned_at, receipt_id` |
| Strategic partnerships | Fetch, Ibotta (receipt aggregators); Market Basket, Hannaford, Whole Foods; Apple Wallet, Gmail |

---

## LATER — Phase 4: Smart Nudges & Gamification

Closes the loop. Turns data into action.

| Feature | Notes |
|---|---|
| Smart nudges | "You usually buy milk this time of week" |
| Savings framing | "You saved $14 this month" — unlocks better living, not just spending less |
| Waste intelligence | "You've wasted spinach 3 times — try buying less" |
| Household milestones | Meaningful moments > points systems. Contextual, earned. |

---

## LATER — Phase 5+: The Fleet

| App | Notes |
|---|---|
| **OurChef** | Meal planning integrated with OurProvisions list |
| **OurGarden** | Home garden tracking; compares harvests vs. grocery savings |
| **OurManifest** | Provisioning for sailing trips; crew drawn from Harbor family |
| **OurDiscovery** | Family experiences layer |
| **OurHelper** | Neighborhood mutual aid — share lists with a helper |
| **Data Marketplace** | Opt-in anonymized household behavior data. One consent field unlocks the future. |
| **Child mode** | Visual picture-based interface for kids; requests land on parent list |

---

## DECISIONS LOG

| Date | Decision |
|---|---|
| Jun 11, 2026 | **Founder dashboard, not intranet.** Solo founder needs a launchpad/balance instrument; Drive stays source of truth for documents. |
| Jun 11, 2026 | **Four-lane charter structure.** Dashboard organized around standing functional lanes (charters), not links — so agents/hires onboard into a charter that exists before headcount. |
| Jun 11, 2026 | **Leverage ratio definition.** 1 human : tasks run by agents, summed from per-lane agent counts. Excludes C-suite "advice" Claude projects — keeps the number honest and un-inflatable. |
| Jun 11, 2026 | **Three-repo separation: `velayo-os` / `velayo-platform` / app repos.** Cockpit ≠ engine. Different audience, lifecycle, blast radius. OS never ships to a customer. |
| Jun 11, 2026 | **Automation-first hosting.** Cloudflare + Git push-to-deploy, not drag-and-drop. |
| Jun 11, 2026 | **Private = secure auth, not obscure URL.** Cloudflare Access OTP over in-page PIN (PIN is client-side theater). |
| Jun 11, 2026 | **Access policy: named emails + `@velayo.ai` domain rule.** Scales without per-hire edits. Coupling noted: issuing a velayo.ai email = granting Harbour access. |
| Jun 11, 2026 | **SESSION END pipeline is v2.** Chat emits `design_handoff.md`; Claude Code owns the canonical write. v1 Drive-writing Scribe retired. One log, repo is source of truth. |
| Jun 11, 2026 | **Single company log for now, scope-tagged.** Stays in `ourprovisions/docs` until app #2's first session — at that point split into `velayo-os/docs` as a filter, not a migration. |
| June 8, 2026 | **Catalog visibility model.** Global seed list = permanent, undeletable household-wide, exists to get households started. Custom items = any member can add/delete, household-wide. **Hide** = per-user, browse-only, reversible, never touches the shared list. **Delete** = custom items only, household-wide, cascades. Global reset = separate, gated, re-seeds. Multi-item hide deferred until demand. Two principles: (1) the shared list is sacred — no per-user view preference suppresses it; (2) every removal has a proportionate undo (hide → unhide one-tap personal; custom delete → soft-delete recovery window; reset → deliberate and total). |
| Jun 12, 2026 | **Dev isolation = second free Supabase project, not branching.** Branching is Pro-only and metered; a second free project is $0 and gives hard isolation. Trade-off accepted: schema changes don't auto-merge — applied via files by hand, matching existing migration discipline. |
| Jun 12, 2026 | **`bootstrap_new_user` canonical = 4-arg form** `(p_clerk_id, p_email, p_invite_code, p_full_name)`. Prod has four overloads (ambiguity risk); dev installs only this one. |
| Jun 12, 2026 | **Category persistence works as designed — revisit only on user friction.** Categories are item-derived; an empty category disappears when its last item is deleted. Considered promoting to first-class persisted entities; deferred. Edge case affects only the creator of an empty category, not the common case. |
| Jun 12, 2026 | **`.env.local` now points at dev DB.** Was silently pinning local to PROD (CRA precedence: `.env.local` overrides `.env`). Root cause of repeated "test hits prod" confusion. `.env.local` is gitignored. |
| Jun 12, 2026 | **Single canonical baseline over renumbered ordered set.** One `000_canonical_baseline.sql` rebuilds prod from empty. Goal is reproducible truth validated by a clean rebuild — a single file makes the diff unambiguous. Evolutionary history stays in `archive/` + SESSION_LOG. |
| Jun 12, 2026 | **Reproduce known debt AS-IS; never fold fixes into the baseline.** The baseline must match what's actually running, bugs included. Fixes go in separate, named, tested migrations so validation isn't muddied. Debt flagged inline with `-- KNOWN DEBT`. |
| Jun 12, 2026 | **Drop the 3 dead `bootstrap_new_user` overloads; keep only the 4-arg version.** Overloads are an ambiguity landmine (PostgREST could resolve the wrong one). Confirmed against `useProvisions.js`. |
| Jun 12, 2026 | **Live `close_cycle` is canonical, not the 005 file version.** Deployed function (upsert on `(household_id, catalog_item_id)` + pre-upsert badge clear) supersedes the plain-insert version in the 005 file. Prod wins over files. |
| Jun 12, 2026 | **Don't seed the 10 duplicate catalog items in the baseline.** A clean baseline seeds clean (38 items). The duplicates remain a prod-only fixture for the future catalog-merge feature; add manually in dev if needed. |
| Jun 12, 2026 | **`migrations/` is the permanent schema home.** Schema files previously lived only in Project knowledge. `migrations/` + `migrations/archive/` + `README.md` are now committed so every future schema change has an obvious, tracked location. |
| Jun 13, 2026 | **Dev environment is reproducible-from-git, not synced.** Any machine rebuilds from clone + `.env.local` + `npm install`. Same discipline as prod rebuilding from `000_canonical_baseline.sql`. Nothing precious lives on one device. |
| Jun 13, 2026 | **Node pinned to major 24** via `.nvmrc` + `package.json engines`. Pin the major only — Vercel guarantees major version and auto-rolls minor/patch, so over-pinning a patch would drift from CI. |
| Jun 13, 2026 | **`legacy-peer-deps=true` committed in `.npmrc`.** `react-scripts` 5.0.1 + React 19 trips fresh `npm install` with ERESOLVE; sticky flag keeps every machine + Vercel consistent so plain `npm install` works. |
| Jun 13, 2026 | **Secrets interim = Google Drive file (My Drive, unshared); planned = Bitwarden.** Acceptable stopgap because `.env.local` holds anon/publishable keys only (RLS is the real lock). `vercel env pull` is NOT a safe distribution route until Development-scope vars are repointed to dev. |
| Jun 16, 2026 | **SHOP swipe acts on the list, not the catalog.** Swipe was calling `hideItem` (catalog, per-user, browse-only) — wrong layer for a shopping gesture. Split: SHOP swipe = remove `list_item` (`deleted_at`); Hide stays a BROWSE/catalog verb. "Shared list is sacred" preserved — removal is an explicit list action, never a silent side effect of browsing. |
| Jun 16, 2026 | **"Not buying this trip" needs no gesture.** Leaving an item unchecked already means "still pending." SHOP swipe has exactly one destructive meaning (remove from shared list); Cancel on the shared-item modal is the "keep it for someone else" path. No third branch. |
| Jun 16, 2026 | **Confirm modal for shared items, instant remove for own.** Own item = sole contributor = no one else affected → remove immediately. Any other contributor present → confirm modal naming the adder. Chose modal over undo-toast: the action crosses a person boundary, so explicit Cancel beats a silent timer. |
| Jun 16, 2026 | **Ownership decision lives at the swipe site (App.js), not in SwipeToRemove.** SHOP `SwipeToRemove` is full-swipe-commits — row animates off before `onRemove` fires ~400ms later. Branching own-vs-shared in `handleSwipeRemove` avoids a confirm modal fighting a committed animation. Cancel springs the row back cleanly because `listRows` is never mutated on Cancel. |
| Jun 16, 2026 | **Stop keying item actions on name; resolve by `catalog_item_id`.** The "not in catalog" bug was the same name-key footgun as the multi-session sync bug chain. `toggleChecked` and `removeFromList` now resolve the stable id from `listRows`. Name remains display and optimistic-state key only. |
| Jun 16, 2026 | **Root cause of dev block was grants, not RLS.** "Permission denied for table" = role lacks table GRANT (fails before RLS is consulted), distinct from an RLS policy returning zero rows. "Reset Public Schema Permissions" query stripped `authenticated`/`anon`. Diagnostic: `information_schema.role_table_grants`. Fix goes in a standalone dev-only migration, never folded into `000`. |
| Jun 16, 2026 | **Velayo project template is dual-mode (DESIGN vs HANDOFF), switched by one MODE line.** Rationale: new apps begin repo-less (chat must scribe directly); a single-mode template is wrong half the time. Matches the "split at app #2's first session" principle. |
| Jun 16, 2026 | **Repo `docs/` is canonical; Project Knowledge is a mirror, not source of truth.** Rationale: the v2 flow made Claude Code the merge authority — the old "re-upload Project Knowledge" model inverted ownership. |
| Jun 16, 2026 | **Template `[SCOPE]` uses `[APP NAME]` placeholder, not literal "OurProvisions".** Rationale: prevents every new app inheriting OurProvisions' scope vocabulary. |
| Jun 16, 2026 | **Multi-household is the LAST structural feature before the AI phase.** Ship it clean before store awareness / receipt parser. Rationale: AI features are more valuable with multiple household contexts to learn from. |
| Jun 16, 2026 | **Two roles only (owner/member in DB). No permission-variant creep.** Owner gets destructive/structural actions (rename, remove member, delete household); all list actions shared. Succession to oldest member on owner departure; no co-owners. |
| Jun 16, 2026 | **Role vocabulary stays out of the UI.** Internal shorthand "captain/crew"; DB stores owner/member; UI shows capability (a Remove button), not role words or badges. Avoids "seafood restaurant" theming. |
| Jun 16, 2026 | **Switcher reveals progressively: no switcher at 1 household, household-name sub-line appears at 2+.** "Create new household" is the act that unlocks the switcher. Zero new chrome until the feature is needed. |
| Jun 16, 2026 | **Store awareness sequenced as its own arc AFTER multi-household — not interleaved.** Don't-stack discipline. |
| Jun 16, 2026 | **Store awareness target model: silent GPS auto-detect (Scenario D from migration 005).** If location shared, auto-match to known_stores; manual define otherwise. N3-style price steering ("cheaper at Market Basket") is the north-star payoff — build only once price-history is dense enough to be honest. |
| Jun 17, 2026 | **Multi-household reads go through `get_my_households()` SECURITY DEFINER RPC, not direct table queries.** `household_members` SELECT policy is scoped to the active household — a direct query cannot enumerate other memberships. Identity resolved internally from JWT (no user-id param). |
| Jun 17, 2026 | **`repo migrations/` is the SINGLE SOURCE OF TRUTH for migrations.** Numbering resets after the 000 canonical baseline → new migrations are 001 onward. Google Drive SQL copies are stale/pre-baseline, NOT authoritative. New migrations born in repo via Claude Code, tested on dev, then applied to prod. |
| Jun 17, 2026 | **`bootstrap_new_user` DESC ordering (migration 002) is an EXPLICIT TEMPORARY STOPGAP.** The real fix is to make bootstrap load the context's active household. Do not treat 002 as done. |
| Jun 17, 2026 | **Future `create_household` flow must be a single SECURITY DEFINER RPC.** `households.created_by` is NOT NULL — two separate client writes (insert household, then insert membership) could half-complete. Wrap both in one atomic transaction server-side. |
| Jun 17, 2026 | **Active context is client-authoritative — the Harbour standard.** Each app instance holds its own active household (context + localStorage); the server authorizes the claimed household, never picks one. Chosen over a server-global column (forces cross-device lockstep, an explicit non-goal; forbids desired per-app divergence). Generalizes to the fleet (active vessel, active kitchen). |
| Jun 17, 2026 | **`is_member_of(household_id)` is the shared authorization primitive (migration 003).** One SECURITY DEFINER boolean: "is the caller a member of this household?" Fails closed on null. Write policies authorize through it instead of comparing against a single guessed household. Proven on dev (true/true/false/false). |
| Jun 17, 2026 | **Migration 004 scoped to `list_items` only — deliberately.** The same `= get_current_household_id()` write-gate exists on five other tables (same latent bug, dormant). Convert the hot path, prove it, take the rest as a separate reviewed arc (future migration 005). Don't-stack. |
| Jun 17, 2026 | **UPDATE policies get a `with check`, not just `using`.** Membership must gate both which rows you touch AND which household you can move a row into. Hardening the originals lacked. |
| Jun 17, 2026 | **Layered default-household rule.** device-last (localStorage) → home household (deterministic, replaces 002 stopgap) → future confident-GPS one-tap confirm. Human always commits the active context. |
| Jun 17, 2026 | **Switcher is gated on a `useProvisions` re-scope, not just UI.** `useProvisions` must consume `activeHouseholdId` from `ActiveHouseholdContext` as its single household source before any switcher sheet is meaningful; the sheet alone would update context and change nothing visible. |
| Jun 17, 2026 | **Wordmark encodes shared-vs-solo per active household.** "OurProvisions" when the active household has 2+ members; "Provisions" when solo. Falls out of `householdMembers.length`, which Effect 2 reloads per active household — no special logic needed. |
| Jun 17, 2026 | **One unified "manage household" sheet.** Not separate switcher + members sheets: switch households at top, manage members/rename/invite of the active household below. Tapping at top re-scopes the app and the member section updates live. Single coherent "manage household" mental model. |
| Jun 17, 2026 | **Title-bar tappability decoupled from member count.** Sheet opens whenever signed in (even a solo single-household user can create a second household). Only the wordmark TEXT stays member-count based. |
| Jun 17, 2026 | **Create-new-household closes the sheet and lands on the new empty list with a toast (option B, fewer clicks)** rather than staying open or requiring a separate navigation step. |
| Jun 17, 2026 | **`households` authorization converted to `is_member_of` (migration 005).** A user may read/update any household they belong to, not just the active-heuristic one. `with check` added to UPDATE (the original lacked it). Invite-preview subquery on SELECT preserved verbatim. Unblocked the 406 on Effect 2's household fetch. |
| Jun 17, 2026 | **Owner-only enforcement on `households` UPDATE/DELETE deliberately deferred.** Migration 005 gates on membership as the correct authorization FLOOR; owner-vs-member is enforced in UI today. DB-level ownership gate ships alongside `delete_household` next session. |
| 2026-06-18 | **Contributor 403 root cause was `household_members_select`, not the contributor policy.** A SELECT policy gated on the single guessed household blinds every inline membership join. Fix: authorize `household_members` SELECT via `is_member_of` — the contributor policy needed no change. |
| 2026-06-18 | **Use SECURITY DEFINER `is_member_of` (not inline subquery) on `household_members_select`.** Inline subquery against the same table re-triggers the policy (RLS recursion). SECURITY DEFINER bypasses RLS inside the function body. Recursion-safety rule: any policy that must read the table it guards must route through a SECURITY DEFINER helper. |
| 2026-06-18 | **Migration 007 completes the authorize-don't-guess sweep.** Remaining five `get_current_household_id()` gates (household_members select, waste_events, catalog_items select+insert, household_invites insert) converted to `is_member_of`. `get_current_household_id()` is now retired from all active write/read policy paths. |
| 2026-06-18 | **Prod bundles get one outer transaction; strip inner `begin/commit` from member migrations.** Migration 005's standalone transaction control would defeat the bundle's rollback protection, dropping 006+007 outside the transaction. Fix in the derived bundle, leave source migrations standalone-correct. |
| 2026-06-18 | **Ship DB ahead of code, deliberately.** New policies are strictly more permissive in the correct direction; old single-household frontend operates safely over them. De-risks a large feature: migrate + prove-harmless first, then merge the frontend. |
| 2026-06-18 | **`dev`→`main` merge is the multi-household go-live event, not a ride-along.** It deploys the switcher to all prod users on push. Treat as its own deliberate session with the live-now-vs-after-owner-gate product decision made up front. |
| 2026-06-19 | **Invite-join switching is intent-gated on user state.** First household ever → auto-switch (nothing to interrupt; invite is the front door). Established user joining another → silent join (don't yank an in-flight user; new household appears in switcher, available on tap). Extends "user holds the lens / confirmation not silent switch" from location to membership. Established-user-with-untouched-list auto-switch was specified but NOT built (requires a pre-join authored-state snapshot because Effect 2 wipes prior-household maps before the banner fires); `hadPrior`-only gate shipped instead. Rationale: silent join fails safe (one tap) vs. mid-work context loss; the edge case is rare and unmeasured, so deferred pending usage evidence. |
| 2026-06-19 | **Resolver is single-source: Effect 2 follows `activeHouseholdId`, full stop.** Removed `justJoinedViaInviteRef` forced-fallback. In auto-switch, `switchHousehold` already sets `activeHouseholdId` to the joined household before Effect 2 resolves; in silent join, it stays on the prior household. Trusting `activeHouseholdId` is correct in both cases. The forced-fallback was the third instance of "multiple paths each decide which household to load, and disagree." |
| 2026-06-20 | **Use column-target ON CONFLICT (household_id, catalog_item_id), not ON CONFLICT ON CONSTRAINT name.** Dev and prod have drifted on the unique-constraint name (dev: auto-named; prod: `list_items_household_catalog_unique`). Column form resolves to whichever covering unique index exists — one migration file applies cleanly to both environments. |
| 2026-06-20 | **insert_list_item upsert uses last-write-wins on quantity, not additive.** Additive would fight the `updateQty` UPDATE path (absolute set-value semantics); two competing semantics would cause drift. Concurrent-add race is rare enough that LWW is the safe, consistent choice. |
| 2026-06-20 | **On conflict, clear deleted_at and force status='pending'.** Concurrent add against a soft-deleted slot resurrects cleanly instead of erroring. Eliminates the Lemons 409 scenario as a side-effect of the concurrent-add fix. |
| 2026-06-22 | **Activator principle.** The person who creates a space carries NO ongoing authority over the group — only the structural responsibility of being the un-removable anchor. Equal authority within the group is foundational to "Our*" products; the moment one person retains ongoing control it becomes a different product. |
| 2026-06-22 | **Attribution vs. ownership rule (Harbour-wide).** Attribution is free and universal (who created an item/category/household, shown plainly). Ownership is reserved ONLY for irreversible, group-affecting actions (delete household) and pinned to a single consistent anchor. Items/categories carry attribution; they carry no ownership anchor. |
| 2026-06-22 | **Membership model = text-group model.** ANY member can add anyone and remove ANY non-creator (incl. self = leave). Creator cannot be removed by anyone and cannot leave — must delete the household to exit. Overrides the earlier "remove is owner-only" brief. |
| 2026-06-22 | **Keep `role = 'owner'` in the schema (do NOT rename to `creator`).** The seat is expected to accrue real responsibility later; `owner` is the honest name for "anchor that runs flat today, may carry weight tomorrow." Renaming to `creator` would mislead. Philosophy lives in BEHAVIOR (flat) + UI ("Created by …"), not the column name. |
| 2026-06-22 | **Owner exit is delete-only in phase 1.** No ownership transfer — a replacement owner creates a new household. Add transfer only if real demand surfaces. |
| 2026-06-22 | **Removed-user notification uses 30s membership-presence check, NOT realtime.** Live RLS (`is_member_of` filters `deleted_at`) suppresses the self-removal broadcast to the removed user. ~30s latency accepted under KISS; avoids touching the highest-stakes RLS surface. General pattern: any realtime-on-soft-delete using an `is_member_of`-style policy hits this suppression. |
| 2026-06-22 | **On removal from one's ONLY household, auto-provision a fresh empty "My Household."** Reuse `create_household`; in-flight guard against duplicate spawn. Never show an empty void or dead-end. Notice line 2 explains the fresh list. |
| 2026-06-22 | **Removed vs. voluntary-leave disambiguated by local `selfDepartureRef`, not a server signal.** Set in `handleLeaveHousehold` before the RPC fires. Fail-safe: explain-on-uncertainty (never silent-unexplained-removal). |
| 2026-06-22 | **Notice is built channel-ready (typed message shape) but single-tenant.** Queueing, priority, and migrating `showToast`/`joinBanner`/connectivity events DEFERRED until a 2nd real tenant exists. |
| 2026-06-22 | **No owner/creator status pill on member rows.** Attribution lives on the household header only ("Created by {name}" / "Created by you"). The creator's row is simply the one without a remove control. No explanatory text for the absent Leave button (don't explain a thing that isn't there). |
| 2026-06-20 | **Classify transport failures separately from HTTP errors (classifyFetchError pattern).** Transport failures (no HTTP response) → pill + keep last-good. HTTP/RLS/Supabase errors → red toast unchanged. Default `'real'` when uncertain — better a loud real error than silently swallowing one. |
| 2026-06-20 | **Rollback optimistic writes unconditionally on any error — transient or real.** Rollback runs first; then branch the notification. User always returns to true-server-state on failure regardless of failure type. No phantom saves. |
| 2026-06-20 | **Quantity zero = off the list (hard reset), not paused.** Re-add credits only the re-adder. Badge is present-tense ("who wants this now"), never historical. Zero-out path must atomically clear contributors (migration 009) or old badges resurrect from the tombstone on re-add (confirmed bug). |
| 2026-06-20 | **Membership exit (Leave/Remove) gated on cycle-boundary question.** If provision_cycles are user-facing → ship with "applies at next boundary." If still backend-only → ship simpler rule first; design cycle-boundary participation when cycles surface. Don't stack a dependency on an unloaded seam. Owner cannot Leave — must transfer or delete. Items stay on list (shared list is sacred). Attribution badge clears on exit (display rule only; added_by is never nulled). |
| 2026-06-24 | **Transient guard must distinguish "fetch failed, empty" from "succeeded, genuinely empty."** The marine-wifi guard conflated both. Narrowed `checkPresence` guard to `error \|\| !data` — a clean empty array (`{error:null, data:[]}`) only ever means a successful zero-row result and is a legitimate removal signal (user removed from their only household). Removing `data.length === 0` does not reopen the false-removal hole because genuine transient failures always surface as `error` truthy or `data` null. |
| 2026-06-24 | **One self-departure path only.** The own-row trashcan (self-`remove_member`) was a redundant second leave path that double-fired the legacy toast AND the variant-B rectangle, and bypassed `selfDepartureRef`. Hidden via `!isMe &&` guard reusing the existing YOU-badge condition. LEAVE HOUSEHOLD button is the canonical and sole self-departure path. |
| 2026-06-24 | **Removal-notice fallback wording: "that household," not "your household."** Avoids implying ownership of something the user may never have owned, when the real household name can't resolve. |
| 2026-06-24 | **Part B (`selfDepartureRef` slow-network wiring) deferred, scaffolded.** KISS — build only if a real slow-network voluntary-leave double-message is observed in production use. The refs are in place; the check is a TODO comment in `checkPresence`. |
| 2026-06-24 | **Hide the DELETE HOUSEHOLD button before the dev→main merge.** Delete-household is still a `console.log` stub; shipping an inert destructive button is a broken window. One-line conditional hide → merge all working multi-household value now → un-hide when delete-household is built. |
| 2026-06-24 | **Dev test-environment pollution blocks valid multi-user testing.** Junk households + lookalike `+testN` accounts caused four separate false test signals (Berlin pointer-drift, duplicate Test333, junk My Households, wrong-window observation). Environment cleanup is a prerequisite for further multi-user validation — not optional. |
| 2026-06-25 | **Bug 1 ("that household" wording) closed as test-environment artifact, not a code defect.** A clean, DB-verified single-household removal rendered the real household name correctly via `activeHouseholdNameRef`. Retroactively validates the Fix-2 sticky-ref design from 2026-06-24. |
| 2026-06-25 | **Auto-provision's real-world trigger is invite-only users.** Owners cannot leave their auto-created My Household (Leave is blocked on owner role; Delete is a stub). The only-household-removal case in production fires specifically for invite-first users, who by construction never have a personal household. Resolves the open design question about when point 4 actually fires. |
| 2026-06-25 | **Join-banner → `systemMessage` channel migration is promotable to NEXT.** SPEC §6 deferred this until a 2nd real tenant existed; the removal notice is now a shipped tenant, so the precondition is met. Migration owns the deferred queue/priority decision — must be its own session, NOT bundled into the dev→main merge. |
| 2026-06-25 | **Prod state is established only by a query against the prod tab, never by the log.** Today's drift survived because "applied to prod / verified present" was self-reported (likely run against the dev tab). The DB is the source of truth; the doc records what the query showed. No "applied to prod ✅" without the prod-tab result attached. |
| 2026-06-25 | **Adopt a pre-merge prod gate.** Before any dev→main: run the read-only RPC-presence + policy check (harness Part A) on prod. Any missing RPC the deployed frontend calls = block the merge. A green Vercel build says nothing about the DB; frontend and migrations ship on separate tracks. This gate would have caught today's bug pre-merge. See `qa/agent_test_harness.md`. |
| 2026-06-25 | **Test is event-triggered, not a SESSION END sub-step.** Pre-merge gate fires on dev→main; destructive suite fires after a dev migration; static checks on commit. SESSION END/handoff records Test results but does not invoke Test. Avoids firing tests on no-op sessions; ensures the merge gate blocks at merge time. |
| 2026-06-25 | **Adopt Supabase CLI migration workflow (staged).** CLI's `schema_migrations` table makes prod self-describing; `db push` applies only the gap. Current DBs are hand-built/drifted. Sequence: (1) reconcile migrations folder; (2) `db pull` baseline + `migration repair` to mark history on dev+prod; (3) link both, switch to migration-files-only. Prerequisite: secrets hygiene (Bitwarden). Prod `db push` stays human-triggered — no auto-rollback on prod. |
| 2026-06-25 | **Target agentic-QA pipeline (staged build order).** Stage 0: deterministic gate (the harness). Stage 1: automate verifiable file copies (handoff→Claude Code, docs→project) — only once the gate can catch a corrupted result. Stage 2: automate the QA run (report failures to human, don't auto-fix). Stage 3: guarded QA↔Claude Code autonomous fix loop — agents edit app code but NOT the tests; each fix a reviewable commit; bounded retries then escalate. Stage 4: handoff/Scribe records pipeline provenance. Principle: automate deterministic toil first, judgment last; keep a human at the prod (irreversible) boundary. |
| 2026-06-26 | **`repo/handoff/` is an AIRLOCK, not a doc home.** Permanent residents: `.gitignore` + `DESIGN_CHAT_handoff_prompt.md`. `design_handoff.md` = reserved merge-and-delete. All other files = payload, filed to their home (specs → `docs/`) and cleared each SESSION END. `## DROPPED_FILES` manifest in each handoff declares destinations. Rationale: lets design chat hand off everything it produces in one predictable place, while keeping the merge-and-delete logic unambiguous (only ONE filename is magic; baseline two are sacred; the rest is routed by manifest). |
| 2026-06-26 | **Catalog carry-forward = clone-forward (snapshot at creation), NOT a persistent fleet catalog layer.** Three-tier `is_global` model solves an unfelt sync pain and destabilizes the binary discriminator driving Hide/Delete verbs. Clone-forward fully solves the felt pain (rebuilding categories). KISS — "wait until people complain." |
| 2026-06-26 | **Clone scope = custom catalog ONLY.** Never clone `list_items`, waste events, cycles, sessions, or prices. New household opens with an empty shopping list. Lists are situational and independent; carrying them forward would break "the shared list is sacred" and confuse a fresh household with stale state. |
| 2026-06-26 | **Source household is user-chosen; default = most-recently-active.** Users expect their catalog to carry forward; "Standard provisions" (no custom items, null source) is the deliberate opt-out. |
| 2026-06-26 | **`create_household_from_template` WRAPS `create_household` (006), not modifies it.** The proven, prod-live empty-household path is preserved byte-for-byte; clone logic is purely additive; null source = identical passthrough. Two distinct RPCs, one delegates to the other. |
| 2026-06-26 | **Delete-household is soft-delete cascade, owner-only, reusing Layer-2 switch/provision.** Soft-delete sidesteps all NO ACTION FKs (nothing physically removed → nothing orphaned; cascade order is forgiving). To a surviving member, household deletion is observationally identical to removal — the existing 30s checkPresence + removal notice + switch/auto-provision path already handles it. Genuinely new code is only the RPC and the confirm-gated button. |
| 2026-06-26 | **D7 — catalog loss on delete: warn now, rescue later.** Honest in-confirm custom-item count warning ships with the delete feature. The clone-first escape hatch (a "Clone catalog first" button alongside "Delete anyway") is deferred to the clone-forward build. Delete and clone-forward are siblings; marker comment left at the confirm site. |
| 2026-06-26 | **One provisioning path only — resolveAfterHouseholdLoss owns the guarded switch-or-provision flow.** checkPresence and handleDeleteHousehold share a single useCallback in ActiveHouseholdContext that holds the provisioningRef guard, refreshes the authoritative list (no stale-closure reads), and either switches to a survivor or auto-provisions. A hand-rolled second path in the delete handler risks duplicate "My Household" spawns. |
| 2026-06-25 | **Secrets hygiene (Bitwarden) promoted to BLOCKER for agentic automation.** Agents need credentials to run DB tests or push to prod. Google Drive `.env` stopgap is acceptable for the current human-only flow; unacceptable once agents need access. Bitwarden is now a critical-path prerequisite for every automation stage past Stage 0. |
| 2026-06-28 | **Active-household indicator lives in the outer App shell, not the per-household chrome.** Outer chrome (avatar, kebab menu row) is always rendered regardless of household context; per-household chrome (title bar, wordmark, action buttons) is contextual. Indicator that survives household switches belongs in the outer shell. Header layering principle: outer chrome = identity/navigation layer; inner chrome = household-context layer. |
| 2026-06-28 | **Phase I/II indicator split: outer chrome now, harbour identity lens later.** Phase I ships a per-app (OurProvisions) indicator in the outer banner — minimal, ship-now. Phase II is a cross-app shared active-household lens at the harbour/Velayo OS identity layer. Two different scopes; deliberately separated so Phase I doesn't block on `velayo-os` maturity. |
| 2026-06-28 | **Indicator form: anchor icon + plain household name, tap-to-manage.** Anchor glyph signals "this is home base, you can navigate from here." Plain name (no quotes, no role label) is how members already refer to the household. Tap opens manage-household modal — no new navigation pattern, no new surface. |
| 2026-06-28 | **People glyph + "TAP TO MANAGE HOUSEHOLD" subline retired when Phase I indicator ships.** Both are crude substitutes for the indicator. Removing them at the same time avoids a permanent title-bar regression: the indicator only replaces them if they are gone; leaving them creates a duplicate-navigation clutter state. |
| 2026-06-28 | **Prod probe before apply is mandatory migration discipline.** Before applying any migration that adds a column (or any additive schema change), run a live column-existence query against the prod tab to confirm current state — not docs, not memory, not the log. Today's discipline: `\d table` or `information_schema.columns` query in the prod SQL editor, result attached to the session before any `ALTER` is issued. Prevents duplicate-column errors and documents prod state at the moment of decision. |
| Jun 29, 2026 | **`SPEC` mid-session command added.** Lightweight, repeatable feeder distinct from SESSION END: emits one implementation spec (grepped anchors + str_replace/SQL + test + LOG_SEED), no session-log/roadmap/next-session. Files into `docs/` as a durable record matching the existing `SPEC_*.md` family (NOT delete-after-merge). Used successfully across 4 SPECs this session. Separates the frequent "hand a change to Claude Code" act from the once-per-session close. |
| Jun 29, 2026 | **Supabase is the source of truth for display names; Clerk is auth-only.** The app reads names (and, going forward, roles/RBAC) from Supabase, never Clerk. Clerk holds a name only as a write-only mirror (kept accurate for its own transactional emails / signup-typo correction) that the app never reads for display. Keeps Clerk portable for a future Harbour-native RBAC layer across the fleet. |
| Jun 29, 2026 | **Session-bootstrap effects key on IDENTITY, never cosmetic attributes.** `fullName` in Effect 1's deps was a latent bug — a display-name change re-fired full session setup and wedged the loading state. Bootstrap re-runs on `userId`/`clerkId`/`email` only. |
| Jun 29, 2026 | **Harbour membership primitive: explicit-accept switches the active view; passive/admin grant does not.** Encoded by gating the invite auto-switch on `joinedId` (set only on explicit invite-accept) rather than user-history. A future passive/admin-provisioned join creates a membership without `joinedId`, so it correctly does not move the user's view. First fleet app establishes the pattern OurKeep et al. inherit. |
| Jun 29, 2026 | **Household-scoped UI state must reset on active-household change.** Surfaced as a systemic pattern (join banner, invite link, near-miss desync) — UI state describing a specific household must clear when the user switches or creates a new household. Elevated to the next-session audit goal. |
| Jun 29, 2026 | **SESSION START needs a sync + airlock gate.** A `git fetch` + behind-check and a "handoff/ not empty" check at session start. Tonight surfaced FOUR repo-state surprises (63-commit-stale machine, orphaned June-13 handoff, snapshot-vs-working-tree drift, "is the batch pushed?" at promote) — each caught by chance or by running the actual git command, not by assumption. The gate makes repo state visible at session open. |
| Jun 29, 2026 | **Vanity `.app` domains are sayable front doors; the Harbour is the house.** The Harbour (shared identity + combined fleet data + OurExperience) is the house; domains label the door, never address the house — so doors can repaint/multiply and houses can unify without changing what users type. |
| Jun 29, 2026 | **Auth domain stays singular and platform-owned from the start; vanity domains may multiply freely.** Protects Phase II shared-login across Our* apps and lets ourpoker opt out later without a migration. |
| Jun 29, 2026 | **`ourprovisions.app` is canonical; `velayo.ai` subdomain redirects to it** (redirect direction `velayo.ai` → `.app`). Canonical = the sayable, brand-reinforcing URL. Pending a check of current `velayo.ai` contents. |
| Jun 29, 2026 | **Auth-domain unification deferred (Phase II / app #2, KISS).** Near-term domain work must remain auth-neutral and reversible. |
| Jun 29, 2026 | **Catalog-row UI comes from ONE shared component.** Search is a filter over the dataset and must never substitute a different row presentation or behavior — steppers, swipe, and price line are identical filtered vs unfiltered. (Established with the `CatalogItemRow` extraction; stepper parity done, swipe parity pending.) |
| Jun 29, 2026 | **Manage-household surface to be re-sorted by frequency × gravity.** Open-door actions (invite, create) earn prominence on-thesis; heavy actions (delete, leave) get a quiet home, never front-door volume. (Direction set; design pending.) |

---

## DONE — Shipped & Live

### Velayo OS ✓

| Feature | Date | Notes |
|---|---|---|
| **The Harbour — company operating dashboard** | Jun 11, 2026 | Four-lane balance instrument (Business Foundation / Product / Marketing / Sales & Support). Leverage gauge (1 human : agent tasks, goal 1:20). Built + live at `harbour.velayo.ai`. |
| **Private hosting + push-to-deploy pipeline** | Jun 11, 2026 | `velayo-os` repo (private), Cloudflare Pages Git-connected, custom domain `harbour.velayo.ai`. |
| **Cloudflare Access gating** | Jun 11, 2026 | Zero Trust org, OTP "Crew only" policy (named emails + `@velayo.ai` domain rule). Verified end-to-end in incognito. |
| **SESSION END v2 pipeline + scope tagging** | Jun 11, 2026 | Chat emits `design_handoff.md`; Claude Code owns canonical write. v1 Drive-writing Scribe retired. [SCOPE] tags in CLAUDE.md. |
| **Retire v1 Scribe; rebuild project template as dual-mode** | Jun 16, 2026 | OurProvisions project instructions + `VELAYO_PROJECT_TEMPLATE.md` both on v2 handoff flow. Template is dual-mode (DESIGN vs HANDOFF). Scope tagging canonical in CLAUDE.md. |
| **Multi-household data spine** | Jun 17, 2026 | `ActiveHouseholdContext` built + wired in `App.js`. `get_my_households()` SECURITY DEFINER RPC (migration 001). Proven end-to-end on dev with two-household test user through real Clerk JWT. Bootstrap stopgap (migration 002) unblocks the crash. |
| **Authorization spine — `is_member_of` (003) + `list_items` write policies (004)** | Jun 17, 2026 | SECURITY DEFINER membership primitive (boolean, fails closed, `search_path` pinned); `list_items` write/update/delete RLS policies rewritten to `is_member_of`; `with check` added to UPDATE. Proven on dev (smoke test: true/true/false/false). Committed to repo. DEV ONLY — prod apply is immediate next step. |
| **Multi-household switcher** | Jun 17, 2026 | `useProvisions` re-scoped to `ActiveHouseholdContext` (two-effect split, `bootstrapped` state gate, GoTrueClient guard). Unified manage-household sheet: switch/create/rename/invite. `create_household` RPC + `households` RLS converted to `is_member_of` (migrations 005–006). Intermittent hang fixed; stale switcher fixed via `refreshHouseholds()`. DEV only; prod migration bundle pending. |
| **Authorization sweep — migrations 003–007 applied to prod** | Jun 18, 2026 | Contributor 403 root-caused to `household_members_select` (blinded inline joins). Migration 007 converted remaining five `get_current_household_id()` gates (`household_members` select, `waste_events`, `catalog_items` select+insert, `household_invites` insert) to `is_member_of`. Bundle 003–007 applied to PROD atomically — prod RLS now fully on `is_member_of`; `get_current_household_id()` gates retired from all write/read paths. |
| **Multi-machine dev environment + DEV_SETUP.md** | Jun 13, 2026 | Reproducible-from-git dev recipe: `.nvmrc` (Node 24), `.npmrc` (`legacy-peer-deps=true`), `docs/DEV_SETUP.md`. Committed `1409a5c`. |
| **Lake Surface stood up** | Jun 13, 2026 | DEV_SETUP recipe proven end-to-end: git clone → drop `.env.local` → npm install → npm start → Clerk auth. Node 24.14.0, peer-dep workaround validated. |

### Phase 1 Foundation ✓

| Feature | Date | Notes |
|---|---|---|
| React app scaffolded + deployed to Vercel | Mar 2026 | Create React App |
| Supabase schema live | Mar 2026 | All Phase 1 tables |
| Clerk auth + Supabase Third-Party Auth | Mar 2026 | RS256 JWT, JWKS endpoint |
| `bootstrap_new_user` RPC | Mar 2026 | Atomic onboarding |
| Real-time sync | Mar 2026 | `list_items`, `household_members` |
| 38 seed catalog items | Mar 2026 | |
| Household invite flow | Apr 2026 | 6-char code, 7-day TTL |
| Categories + budget | May 2026 | |
| Staple toggle (⭐) | May 2026 | `is_staple` on catalog_items, swipe-reveal |
| Manage Categories | May 2026 | |
| Per-category "+ Add item" | May 2026 | |
| Real-price-only on My List | May 2026 | |
| "Show prices & budget" toggle | May 2026 | localStorage, defaults hidden |
| Category-average fallback pricing | May 2026 | `~` prefix on estimates |
| `refreshCatalog()` pattern | May 2026 | Replaces `window.location.reload()` |
| Contributor badges `[D][H][E]` | Jun 1, 2026 | `list_item_contributors` table |
| Social share link preview | Jun 5, 2026 | Open Graph + og-image.png |
| **Provision cycles + wrap-up flow** | Jun 6, 2026 | `provision_cycles`, `shopping_sessions`, `known_stores`, roll-forward modal, archive RPC |
| `get_list_items_for_household` JOIN refactor | Jun 8, 2026 | name/category/is_staple inline; dropped separate name-resolver round-trip |
| SHOP list renders from RPC rows (`listRows`) | Jun 8, 2026 | catalogMap out of the display path |
| Per-user-hide-leak fix* | Jun 8, 2026 | Hides no longer suppress shared list rows. *On `dev` — promote once cold-test + merge (NOW #1) completes. |
| Session Scribe moved to git (`CLAUDE.md`) | Jun 8, 2026 | Rolling log in `docs/`, committed to repo; off the Drive connector |
| **Hide verb implemented** | Jun 9, 2026 | `hideItem` wired to SwipeToRemove (all three usages); UI renamed "Remove" → "Hide", recolored to taupe; Add Item restore copy updated with count; poll re-add bug fixed via `hiddenIdsRef` guard in `loadListItems`; boot stacked-poll race fixed via `getTokenRef` |
| Strip debug console.logs | Jun 11, 2026 | 6 `[DEBUG …]` / `[loadListItems]` / `[Poll]` / `[Sync]` logs removed from `useProvisions.js` before main merge |
| **Delete verb** (complete) | Jun 11–12, 2026 | Client: `deleteItem` → `delete_custom_catalog_item` RPC; `is_global` guard; optimistic removal + rollback; Delete button in Edit modal; `isCustom` fix; `deletedIdsRef` poll guard. Server: `delete_custom_catalog_item` SECURITY DEFINER RPC deployed (hard-delete + cascade). |
| **Dev DB sandbox** | Jun 12, 2026 | Second free Supabase project (`zxwtxjjmssykhqrghouf`); Vercel Preview repointed; dev schema rebuilt from `001`–`006` + drift patches; Clerk auth configured. |
| **Catalog propagation — 20s cross-client poll** | Jun 12, 2026 | `refreshCatalog` rewritten as guarded merge (respects `hiddenIdsRef`/`deletedIdsRef`); `refreshCatalogRef` for stable closure access; 20s `catalogPollInterval` wired alongside 2s list poll. Two-client verified (add + delete, both directions, no flicker/clobber). |
| **Browse tab UI overhaul** | Jun 12, 2026 | Real-time search bar; wrapping category chip filters; two-layer `displayCategories` (staples cross-cut → chips narrow); no-match row with category picker + inline new-category creation. `CUSTOM_CAT` constant removed. |
| **dev → main merge, prod deploy** | Jun 12, 2026 | Fast-forward merge; production green at `9a3008d`. Hide/Delete/propagation features live for real users. |
| **Canonical schema baseline** | Jun 12, 2026 | `migrations/000_canonical_baseline.sql` — single file rebuilding prod from empty: 14 objects, 17 canonical functions, 35 RLS policies, 38-item seed. Validated against clean dev rebuild. Six historical files archived in `migrations/archive/`. |
| **SHOP swipe redesign + toggleChecked id fix** | Jun 16, 2026 | SHOP swipe now calls `removeFromList` (list-layer soft-delete of `list_item`) instead of `hideItem` (catalog-layer). Own item: instant remove. Shared item: confirm modal naming the adder. `toggleChecked` rewired to resolve by `catalog_item_id` from `listRows`, eliminating "not in catalog" failures on rolled-forward items. Cold-tested on dev with two members. |
| **Dev grant restoration** | Jun 16, 2026 | Restored `authenticated`/`anon` grants on dev sandbox after "Reset Public Schema Permissions" query stripped them. Wrote `007_dev_restore_role_grants.sql` (dev-only). Root cause of the Jun-13 "permission denied for table households" dev block — was grants, not the `auth.uid()` RLS bug assumed. |
| **Multi-household invite-join flow** | Jun 19, 2026 | New-user auto-switch + established-user silent-join verified end-to-end. Three bugs fixed: invite code survives Clerk sign-up redirect (`index.js` sessionStorage capture before ClerkProvider), Effect 2 resolver trusts `activeHouseholdId` unconditionally (no data split on silent join), join-banner calls `refreshHouseholds()` on any confirmed join (switcher updates without reload). |
| **Concurrent-add 409 + Lemons 409 fixed (migration 008)** | Jun 20, 2026 | `insert_list_item` converted to upsert (INSERT ... ON CONFLICT (household_id, catalog_item_id) DO UPDATE). Concurrent new-item add: second writer folds into update instead of 409ing. Soft-deleted slot resurrection: conflict path clears `deleted_at`, forces `status='pending'`. Both two-window tests passed on dev and prod. |
| **Connectivity pill — soft offline/retry UX** | Jun 20, 2026 | `classifyFetchError` classifier + `ConnectivityContext` state machine + `ConnectivityPill` component. Read paths keep last-good data on transient fail; write paths roll back unconditionally + branch (pill vs red toast); `reportSuccess()` clears pill on any success. Converted: catalog-refresh ×2, list-load, household-fetch, updateQty, toggleChecked. Verified with DevTools network throttling on dev. |
| **Poll-clobber / offline race hardening** | Jun 22, 2026 | Three races fixed: suspect-empty poll guard (empty RPC response bails before setters); transient-vs-genuine rollback classification (offline taps preserve optimistic value; genuine errors roll back); `pendingQtyRef` write guard (in-flight items excluded from 2s poll commits, eliminating 5→4→5 flicker). |
| **Badge-reset RPC — migration 009** | Jun 22, 2026 | `remove_list_item` atomic RPC soft-deletes `list_items` row AND clears `list_item_contributors` in one transaction; fixes badge-resurrection on re-add. Client swapped from plain `.update({deleted_at})`. Dev + prod. |
| **Member management — leave/remove/rejoin (migrations 010–012)** | Jun 22, 2026 | UI: "Created by" attribution, remove controls on non-creator rows, Leave/Delete branching. `remove_member` + `leave_household` (010); `join_household` revive-or-insert (011); `bootstrap_new_user` revive fix (012). Both join paths covered. `refreshMembers` for live actor update. Dev + prod. |
| **Layer 2: removal notice + auto-provision** | Jun 25, 2026 | 30s membership-presence check; typed `systemMessage` channel; variant-B removal notice; auto-provision (`create_household`) on only-household removal; `provisioningRef` in-flight guard. Points 1–4 validated on clean dev env (point 4: DB-gated fixture, `activeHouseholdNameRef` resolved real household name, in-flight guard confirmed — single provisioned household). Bug 1 ("that household" wording) closed as test-environment artifact. Verified on prod: real-name notice + fresh household auto-provisioned, in-flight guard held. |
| **Hide DELETE HOUSEHOLD button + dev→main merge** | Jun 25, 2026 | Owner branch of household-manage ternary renders null (no household-destruction control visible to owners). Removed dead `handleDeleteHousehold` handler + `[ActiveHousehold TEST]` log. 9 commits (8 Layer 2 + cleanup) merged to main, Vercel deploy green. |
| **Delete-household — migration 013 to prod + dev→main merge** | Jun 28, 2026 | Migration 013 (`provision_cycles.deleted_at`, `list_item_contributors.deleted_at`, `delete_household` RPC) applied and verified on prod (body_len 2550). Two-stage owner confirm, D7 custom-item count warning, `resolveAfterHouseholdLoss` shared Layer-2 path. Smoke-tested (DH owner + DT member, orphan count 0). Merged to main; Vercel green. |
| **Member/household-flow defect paydown — six fixes to prod** | Jun 29, 2026 | (1) Member display name reads Supabase `full_name` first at 3 sites (`ec4d4af`); (2) manage-sheet refresh-on-open (`270377e`); (3) name-change hang fixed — `fullName` removed from Effect 1 deps (`4a27ada`); (4) invite-paste auto-switch gated on `joinedId` not `hadPrior` (`75c1481`); (5) join-banner auto-dismiss (5s timer + switch-away clear, `bannerSeenRef` arrival guard) (`0c24e5b`); (6) stale invite-link reset on household change (`90c4316`). Promoted dev→main as clean fast-forward (`eefaa72`→`90c4316`); prod Ready/green, dashboard-verified. No DB changes. |
| **Catalog consistency — shared `CatalogItemRow` + two bug fixes** | Jun 29, 2026 | Extracted a shared `CatalogItemRow` (Browse row inner body) rendered by both Browse and search (`2163929`). Bug 1: search results use the full −/qty/+ stepper instead of a +1-only button, search list wrapped in `.items-grid` (`8f1e471`). Bug 2: Edit Item respects `showPrices` — price field + catalog note gated; new `canEdit` prop on `SwipeToRemove` hides only the Edit button (Staple/Hide kept) for catalog items with pricing off; `openEditModal` early-return guard (`378efec`). `/code-review` high-effort: 0 correctness findings. Fast-forward `90c4316`→`378efec`; Vercel green. See `docs/SPEC_search_row_and_price_gate.md`. No DB changes. |
| **Fix `auth.uid()` RLS bug — migration 014** | Jun 29, 2026 | Rewrote 8 RLS policies across `known_stores`, `shopping_sessions`, `velayo_crew_members`, `velayo_crews` that compared `auth.uid()` (Clerk text `sub`) against uuid columns — always false. Household-membership checks → `is_member_of(household_id)`; ownership (`sessions_insert_own`/`sessions_update_own`) deliberately kept `get_current_user_id()` to preserve owner-is-you (membership alone would let any member touch another's session); crew policies use `get_current_user_id()` (crew-keyed, no `household_id`). RLS enabled/disabled state UNCHANGED (definitions-only). Applied + verified by hand on dev + prod: `auth.uid()` check = 0 rows, A5-style presence ok on all 8. See `docs/SPEC_fix_authuid_rls.md`; harness check A5 added. |
| **Consolidate duplicate helper functions — migration 015** | Jun 29, 2026 | Dropped the two `proconfig=NULL` helper variants (`get_household_id_for_current_user`, `get_user_id_from_clerk`); survivors `get_current_household_id` / `get_current_user_id` pin `search_path = public, extensions` and are deterministic. Zero callers verified (functions + policies, both envs) before drop. Applied + verified on dev + prod: verify query returned exactly 2 survivors. See `docs/SPEC_consolidate_helpers.md`. |

---

## Strategic Bets

- **The Harbor is the moat.** Switching away from OurProvisions is one thing. Leaving the Harbor means losing shared family history across every app. That's a much harder thing to walk away from.
- **Prices are infrastructure.** The receipt scanner is the intelligence layer. Everything — cross-store comparison, waste detection, savings nudges — flows from it.
- **Digital receipts as distribution.** Grocery chains pivoting to digital receipts represent a partnership and scaling opportunity, not just a data source.
- **Capture signals silently.** Check-off sequence, GPS, timing — captured in the background. No user configuration needed.
- **Provision cycles not just sessions.** The planning unit is a cycle (Plan → Shop → Review → repeat). Sessions are how it gets fulfilled. This model handles partial shops, multi-person splits, and impromptu runs cleanly.
- **The shared list is sacred.** No per-user view preference (hide, filter) ever suppresses what the household has collectively decided to buy. Personalization lives in the view layer; the list is shared truth. *(Added June 8 — the principle behind the per-user-hide fix.)*

---

*Velayo, Inc. — velayo.ai — dan@velayo.ai*
