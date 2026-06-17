# OurProvisions — Roadmap
*Last updated: 2026-06-16 (session 2)*

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
| — | **Merge dev → main + prod smoke test** | SHOP swipe redesign + toggleChecked fix fully tested on dev. Merge, verify Vercel deploy green, smoke-test prod (load + tap — no destructive actions on live household). |
| 1 | **Fix `auth.uid()` RLS bug (migration 001)** | RLS policies on `known_stores`, `shopping_sessions`, `velayo_crews`, `velayo_crew_members` compare a Clerk string ID against a uuid column — always false. Inert today but must be fixed before any live feature relies on row-level isolation for those tables. Rewrite to `(auth.jwt()->>'sub')::uuid`. Deliver as a named migration, not an edit to `000`. |
| 2 | **Consolidate duplicate helper functions (migration 002)** | `get_household_id_for_current_user` / `get_current_household_id` and `get_user_id_from_clerk` / `get_current_user_id` are near-identical pairs. Drop the redundant copies; update any callers. Deliver as a named migration. |

---

## NEXT — Clearly Defined, Not Yet Started

| # | Feature | Notes |
|---|---|---|
| — | **Receipt scan entry point in wrap-up modal** | After rolling items forward, prompt appears: "Scan your receipt to capture prices." Natural on-ramp to Phase 3. |
| — | **Household member administration UI** | View members, remove members, manage/revoke invites. Absence is why orphaned memberships accumulated and needed raw SQL to fix (Jun 12). |
| — | **Contributor display refinement** | Keep the full name of the original adder; when another member adds quantity, append their badge rather than replacing attribution with an icon. |
| — | **Wire Harbour live data** | C-suite seat URLs (Claude project links), tool chips (Banking, Cap table, Social, Brand deck), real lane content (priorities, agent counts, "moved Xd ago" dates). Push live once done. |
| — | **Multi-household implementation** | Data spine first: `myHouseholds` query + active-household context (React context + localStorage, fallback to oldest membership). Then re-scoping hook (realtime teardown/re-subscribe on switch). Then UI: toast primitive → sub-line → switcher sheet → create flow. Prerequisite: check that no existing RLS policy depends on `role = 'member'` default before the create flow writes 'owner'. |
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
| 7 | **Multiple household support** | Header-tap switcher UI. User belongs to more than one household and can toggle between them. **Fragility found (Jun 12):** household fetch uses `.single()`/`.maybeSingle()` — throws 406 on duplicate active memberships; needs defensive handling before multi-household is real. |
| 8 | **Global category rename** | `household_category_overrides` table. Lets a household rename "Pantry" → "Dry Goods" etc. Migration pending. |
| 9 | **Reset Household (nuclear option)** | Confirmation-gated. Returns catalog to factory seed and clears household customizations. NOT the everyday undo for hides/deletes — recovery-from-chaos only. |
| 10 | **Replace remaining `window.location.reload()` calls** | Audit codebase; replace all with `refreshCatalog()` pattern. |
| 11 | **Email receipt parser** | Most actionable near-term price ingestion path. No partnerships required. Parse forwarded grocery receipts via email. |

---

## LATER — Velayo OS / Infrastructure

| Feature | Notes |
|---|---|
| Promote "Crew only" to a reusable Access Group | When a 2nd internal app or 4th person appears — scales without per-hire edits. |
| Split company log into `velayo-os/docs` | Trigger = app #2's first session, not a date. Filter-based split, not a migration (scope tags already in place). |
| Sync on unfocused tabs | Browser `setInterval` throttles to ~1 min on backgrounded tabs, causing perceived lag. Consider `visibilitychange` refresh-on-focus, or Supabase Realtime if Clerk/Realtime auth incompatibility is ever resolved. |
| Invite-accept creates duplicate memberships | Accepting an invite adds a membership without retiring the user's auto-bootstrapped household. Should move-or-block until multi-household is real. |
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
