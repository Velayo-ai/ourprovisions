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
