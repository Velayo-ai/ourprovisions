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

### [2026-08-20] — [Cross] — Design the recipe card + HOME tab, file the mockups, and preserve the "loop of care"
**Goal:** Design a recipe-card view for meals (with an eye toward the future OurChef seam) and a first pass at the HOME tab, capturing the forward-looking product/strategy ideas that surfaced along the way — without touching Vegas demo scope.
**Completed:**
- **Designed the recipe card and locked the meal→recipe navigation pattern.** The meal card in PLAN stays the **one-click add path**; the recipe card is a separate **read-only** detail view reached via a "Recipe" link, with no add action of its own — so exactly one surface ever changes what's on the list.
- **Designed the HOME tab v1 concept** — a "Tonight" card surfacing the planned meal plus its provenance chip, over an activity feed, quick stats and shortcuts.
- **Reviewed three ChatGPT-drafted reference mockups** (home, recipe card, cooking mode), validated the ingredient-staple-checkbox idea against existing idea-log item (14) rather than re-inventing it, and identified full step-by-step cooking mode as **new idea (16)**.
- **Filed every mockup and committed them as one commit (`7f5a055`)** — 3 token-accurate HTML files to `docs/mockups/`, plus the repo's first reference-quality renders to the new `docs/mockups/reference/`. The three PNGs were **compressed before commit** (1024×1536 → 800×1200, JPEG q85, ~5.2 MB → ~490 KB), so their paths are now `.jpg`.
- **Logged HOME tab v1.0 (static, no new data) to ROADMAP NEXT**, sequenced strictly after meal-planning v1 is demo-stable and prod promotion is decided.
- **Captured the "loop of care"** — recipe provenance as a *relationship* that can notify the giver — and placed it at **Harbour scale**, not OurChef or OurProvisions. Written into `STRATEGY_consumption_signal.md`'s meal-intelligence section this session.
**Unfinished:**
- **Button-colour convention undecided** — teal for foundation/utility actions vs. clay/maroon for ritual/house actions ("Add to list" vs. "Start cooking") was raised as an observation on the reference mockups, never decided. Open for whoever next does a visual pass on Home or the recipe card.
- **Two reference images remain filed but unlinked** (`mockup_home_reference_A.jpg`, `mockup_recipe_card_reference_AB.jpg`) — deliberate per this session's instruction, recorded here so a future session doesn't read it as an oversight.
- **The future `recipe_cards` / `meals.origin_recipe_id` shape is a sketch only.** Parked in the DECISIONS LOG rather than `ARCHITECTURE.md`, since nothing structural actually changed.
- **Nothing from this session is built or spec'd** — recipe card and HOME tab are design threads only.
**Next session:**
SESSION START
Goal: Depends on tonight's dry run — either (a) resolve any defects it surfaces ahead of Saturday's demo, or (b) if the dry run is clean, pick up "Build HOME tab v1.0 (static)" from NEXT.
State: Meal-planning v1 designed and spec'd, not built. Create/edit meal shipped and verified on dev; **prod promotion still undecided with the demo on Saturday 2026-08-22**. Recipe card + HOME tab mocked, not spec'd or built.
Done when: (a) dry-run defects triaged and either fixed or explicitly deferred with reasons; or (b) HOME tab renders on dev with the static Tonight card + shortcuts, no new table.
**Files updated:** `docs/ROADMAP.md`, `docs/SESSION_LOG.md`, `docs/strategy/STRATEGY_consumption_signal.md`, `docs/mockups/mockup_recipe_card.html`, `docs/mockups/mockup_meal_to_recipe_flow.html`, `docs/mockups/mockup_home_activity.html`, `docs/mockups/reference/` (3 JPGs)
**DB changes:** None

### [2026-08-20] — [OurProvisions] — Ship create/edit meal, then design the meal-planning model and cut it down to a buildable v1
**Goal:** Build create-meal from spec, verify it live, then work out what "planning" actually is — and land on something small enough to build before Saturday.
**Completed:**
- **Shipped create/edit meal to dev and verified it end to end under real auth** (`SPEC_create_meal_ui.md`, commit `0fd9c39`): one parameterized `MealSheet`, `updateMeal` added to the hook. Create, edit, edit-doesn't-touch-the-list, and `+ New category` all walked against real data. **PLAN is no longer fixture-dependent — a user can populate it.**
- **Ran four rounds of verification-driven polish, each traced to a cause rather than tuned by eye:** the `+ New category` inline input (**shipped as a dead control — it was passed a no-op stub**), row-border and stepper styling (the mockup had invented a visual language next to Browse's shipped one), and finally the stepper's missing `.qty-controls` wrapper — **found by DOM diff after two attempts guessing from source.**
- **Generalized `SwipeToRemove` and converted meal rows to swipe-to-edit.** It now renders only the buttons whose handlers are passed, with reveal width scaling per action. **Counted by handlers passed, not buttons rendered** — deliberately, because `canEdit` is false for global seed rows and counting renders would have silently shrunk those panels 240→160.
- **Fixed two swipe regressions, both mine, both diagnosed to root cause.** (1) `SWIPE_THRESHOLD` was a flat 60px tuned for a 240px panel; at 80px it became a **75% dead zone**, so short drags snapped the row back open — it wasn't failing to register, it was actively re-opening. (2) A **stale-closure read**: the gesture logic read `offsetX` state while `move` events are continuous-priority in React 18, so a discrete `mouseup` could run before the last move committed. Now mirrored in a ref.
- **Fixed the create/edit `canSave` asymmetry** — an empty meal was unreachable by creating one but reachable by emptying one. A meal now needs only a name in both modes.
- **Designed the entire meal-planning model across ~6 mockups — then deliberately talked it back down to a small v1.** Days/calendar, no-shop meal types, unassigned section, batch shop-the-week, and plan/list divergence were all mocked and **deferred with reasons, not abandoned**; each layers onto v1 without a rebuild.
- **Wrote `SPEC_meal_planning_v1.md`.** Core simplification: **"In This Week" is DERIVED, not stored** — a meal is in the week iff it has ≥1 unbought ingredient on the list. No new table in v1; This Week is a query, not a set.
**Unfinished:**
- **`SPEC_meal_planning_v1.md` is written, not built**, and carries **two open build-time questions**: where arrangement `sort_order` lives, and whether `removeMealFromList` is a client loop or a new RPC. It also wants a fresh-session read before BUILD.
- **Shared-ingredient quantity accounting remains unsolved.** `list_item_meals` records *that* a meal contributed, never *how much*. v1 sidesteps it via reverse-merge; the general case still needs its own session, with the Dan/Helen bread scenario as the test.
- **`deleteMeal` still carries the phantom-badge landmine** — `fetchMealProvenance` doesn't filter `meals.deleted_at`, so a soft-delete would leave the Shop badge naming a deleted meal. The read path must be fixed first, or hard-delete chosen deliberately.
- **⚠️ Process failure: a feature push carried six review-pending docs commits with it** — the exact 2026-07-23 hazard CLAUDE.md documents. `dev` only, `main` untouched, content all reviewed live, but the gate was skipped and I should have warned first.
- **⚠️ Three false "deployed" reports before the verification method got fixed.** Markers were chosen that already existed in the bundle (`Pet Supplies`, `1.5px solid #c8973a` from `.price-input`), so they returned hits against the *old* build. **A marker is only evidence if it is absent before and present after** — both directions now checked every time.
- **`migrations/fixtures/dev_meals_seed.sql` still modified and deliberately uncommitted** — sentinel filled with a live household UUID.
**Next session:**
SESSION START
Goal: Fresh-read `SPEC_meal_planning_v1.md`, resolve its two open build-time questions (arrangement `sort_order` location; `removeMealFromList` as client loop vs. RPC), then BUILD it — **or** make an explicit call to spend the remaining runway on Vegas prep instead.
State: Create/edit meal shipped and verified on dev; PLAN is user-populatable. Meal rows swipe to edit. `main` untouched — **nothing of the meals UI is on prod**, and that promotion decision is still open with the demo on Saturday 2026-08-22. Planning v1 designed and spec'd, not built. Full planning model mocked and deferred to v2+ with reasons.
Done when: v1 is building against a spec whose two open questions are closed, **or** a deliberate priority call against it is recorded in the DECISIONS LOG with its reason.
**Files updated:** `src/App.js`, `src/hooks/useProvisions.js` (9 commits, `0fd9c39`→`ab4546a`, all dev), `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/specs/active/SPEC_meal_planning_v1.md` (new), `docs/specs/built/SPEC_create_meal_ui.md` (moved from `active/`), 7 new mockups in `docs/mockups/`
**DB changes:** None. No migration, no schema/RPC/RLS change.

### [2026-08-19] — [OurProvisions] — Design the create-meal UI to a build-ready mockup; scope removal OUT of v1 on evidence
**Goal:** Get the create-meal flow — Wednesday's P0, the thing keeping PLAN fixture-only — designed and mocked to build-ready, surfacing real gaps **before** Cody touches code rather than after.
**Completed:**
- **Mocked the flow end to end** (`mockup_create_meal.html`, 5 screens: PLAN entry point, empty search, active search, inline new-item creation, ready-to-save) and **iterated it against live screenshots of the shipped app rather than memory of it** — which caught real drift on every pass.
- **Locked the entry point to a dashed `+ Create new meal` ghost row terminating the meal list**, matching the household "+ Create new place" pattern exactly. A header button was rejected because it would have stood up a **second competing "create new X" convention** next to one that already exists.
- **Locked sheet conventions against the real "Add New Item" modal** — bottom Cancel + primary pair (not the header ×/Save split drawn first), small-caps eyebrow field labels.
- **Caught a live visual inconsistency: "Add" has two unreconciled treatments.** The meal-card button inherited solid-fill styling from the original 07-30 `MealsLens`, while ingredient-search "Add" is a light outlined pill — same verb, two looks. Unified to the light pill in the mockup. ⚠️ **The shipped `MealsLens` in `App.js` still carries the old solid fill — only the mockup was fixed.**
- **Matched the "ingredient not in catalog" flow to Browse's real live no-results pattern (screenshot-verified)** — label + inline box, tapping a category commits create-and-add in one motion. **Deleted the invented "Create & Add" confirm step** the first draft had added, and corrected a search panel that showed 4 results against an empty query, contradicting its own placeholder.
- **Settled button copy as plain "Add"** after working through and rejecting "Add all" and "Add to Shop" — **the destination-naming problem is structural, not lexical.** It exists only because PLAN has no Day/Time/Occasion frame; once that lands the verb resolves for free ("Add to Tuesday"). Wordsmithing it now would have papered over the real gap.
- **⚠️ Found a genuine data-model gap on meal REMOVAL and scoped removal out of v1 on the evidence.** A concrete concurrent-edit scenario — two members independently decrementing one shared ingredient that two meals both contributed to — **breaks both options `SPEC_meals_model.md`'s Open Question #1 has proposed since 2026-07-28.** Deferred deliberately, with a named reason and a test case, not by oversight.
**Unfinished:**
- **No spec written — `SPEC_create_meal_ui.md` does not exist.** Tonight was mockup iteration and edge-case discovery, not spec authoring. The mockup is build-ready in *shape*; nothing is build-ready in *writing*, and **Cody cannot BUILD from a mockup.**
- **`MealsLens`'s shipped "Add" button still has the old solid-fill styling.** Must be reconciled to the light-pill convention when create-meal ships, or PLAN carries two visual eras in one tab.
- **`remove_meal_from_list` / provenance-aware removal is genuinely unscoped** and needs its own design session, with the Dan/Helen bread scenario as the concrete case any proposal must survive.
- **Day/Time → Occasion → Dish → Ingredient (headcount scaling) surfaced three times tonight from three independent angles** — a day-picker instinct, a guest-count stepper instinct, and the "Plan my week" framing. **Convergent signal that it is real**, still explicitly unscoped; held for the post-Vegas sorting pass.
- **⚠️ `migrations/fixtures/dev_meals_seed.sql` is modified in the working tree and deliberately NOT committed** — its all-zeros sentinel was filled with the live Sacandaga UUID to run the seed. See DB changes.
**Next session:**
SESSION START
Goal: Write `SPEC_create_meal_ui.md` from the approved mockup and hand it to Cody — **or** explicitly decide to spend the remaining runway on Vegas prep instead. **This is a scheduling call, not a design call**, and it is Dan's.
State: Create-meal UI fully designed and mocked across 5 screens, matching every existing convention it touches. Add-only scope confirmed; removal deferred with a named reason. PLAN v1 is live on dev only (`ea1c170`), still fixture-populated. `main` untouched — prod promotion still undecided. Thursday 2026-08-20 is the dry-run gate; Saturday 2026-08-22 is immovable.
Done when: either `SPEC_create_meal_ui.md` exists and is build-ready, **or** a decision to prioritize something else ahead of it is recorded in the DECISIONS LOG with its reason — not left to lapse by default.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/mockups/mockup_create_meal.html` (routed from `handoff/`). **None in `src/` — design-chat only, no code touched.**
**DB changes:** None. ⚠️ **Uncommitted working-tree change:** `migrations/fixtures/dev_meals_seed.sql` has its all-zeros sentinel replaced with the live Sacandaga household UUID from last night's seed run. **Left uncommitted on purpose** — the sentinel is a deliberate guard (`all-zeros = "not set" → raises`), so committing the filled value would bake one dev household into the fixture and disarm the guard for the next runner.

### [2026-08-19] — [OurProvisions] — Ship PLAN tab v1: relocate the Meals lens out of Browse, verified live on dev
**Goal:** Get meals rendering on the PLAN tab by end of session, replacing Browse's Ingredients⇄Meals toggle, per the 2026-08-17 IA decision.
**Completed:**
- **Built and shipped the relocation to dev as one scoped commit (`ea1c170`, 18 insertions / 58 deletions, one file).** Six diffs against `src/App.js`: `MEALS_ENABLED` `false`→`true`, `browseLens` state deleted, the `loadMeals` and `fetchMealProvenance` effects repointed to `view === "plan"`, the "Plan coming soon" placeholder swapped for `<MealsLens>`, and the Browse lens toggle stripped out. **`MealsLens` itself is unchanged — only its mount point moved.**
- **Done as a true relocation, not a flag-flip in place** — the standing ARCHITECTURE note warned that flipping `MEALS_ENABLED` alone would leave the lens in Browse's render tree. The spec's line numbers were re-grepped against the current tree before any edit and all six sites matched.
- **Confirmed the flag's original reason was already resolved** — `025`/`026` reached prod 2026-08-18, so the gate that existed *because the tables did not exist on prod* had nothing left to gate. Flipped without re-litigating it.
- **Seeded dev meals for a real verification** — resolved the active dev household as **Sacandaga, not Madbury** (`select id, name from households where deleted_at is null`), filled the fixture sentinel, ran `dev_meals_seed.sql`: **3 meals** (Lemon Pasta, Sheet-pan Salmon, Taco Night) plus the CASCADE-test custom catalog item.
- **Verified live on the deployed dev preview under real Clerk auth, against seeded data rather than the empty state.** Plan renders all 3 meals with correct ingredient counts; **the Bread item seeded from two overlapping meals shows `×4` with a single "Multiple meals" badge — the increment path, not the duplicate path, which is the harder one**; Browse renders ingredients directly with the toggle fully gone; Shop badge count (6) matches. Console shows only two pre-existing unrelated warnings (Clerk dev-keys, multiple `GoTrueClient` instances) — **nothing traceable to the `browseLens` removal**, which was the named regression risk.
- **Caught the `browseLens` removal statically before deploying** — `CI=true` production build compiled clean (the specific failure mode of a half-removed variable under Vercel's warnings-as-errors), and a grep proved zero `browseLens`/`setBrowseLens` references left in `src/`. The deployed bundle was then confirmed by **content**, not by hash: "Plan coming soon" and the `["ingredients","meals"]` toggle array absent, the meals strings present. **The hash deliberately was not used as the signal** — Vercel's env differs from local, so a hash mismatch proves nothing either way.
- **Incidental evidence worth keeping: household scoping on `meals` holds under the new render path** — Sacandaga showed its 3 fixture meals, Madbury correctly showed the empty state. Not what this session set out to test, but a real RLS observation under the relocated mount point.
**Unfinished:**
- **NOT merged to `main` — deliberate.** BUILD stops at dev by design. **Whether PLAN gets promoted to prod before Saturday's demo, or is demoed straight from the dev preview, is an open decision and Dan's call.**
- **Wednesday's create-meal UI is still pending** — `createMeal` exists in the hook and **nothing calls it**. Tonight's meals came from a dev-only fixture, so **PLAN is currently fixture-dependent, not user-populatable.** That is the roadmap's own named failure mode ("a lens a user cannot populate").
- **The 8–10 real seeded meals the demo plan calls for do not exist** — there are 3 fixture meals on dev only.
- **The two pre-existing console warnings (Clerk dev-keys, multiple `GoTrueClient` instances) are filed nowhere as known debt** — noted here, not actioned.
- **Process slip:** the first push carried a mangled commit subject (PowerShell here-string syntax used in the Bash tool, which does not parse it). Amended and force-pushed to `dev` within the minute; **the diff was never wrong, only the message.** Recorded because a force-push to a shared branch is worth seeing in the log.
**Next session:**
SESSION START
Goal: Build the create-meal UI so PLAN is user-populatable rather than fixture-dependent, seed 8–10 real household meals, and make the call on prod promotion ahead of Saturday's Vegas demo.
State: Meals lens live on PLAN and verified end-to-end on dev under real auth. Browse is clean — ingredients only, no toggle. `MEALS_ENABLED = true`. **Nothing of this is on prod**; `main` is untouched. `createMeal` exists in `useProvisions.js` with no caller. Dev has 3 fixture meals in Sacandaga. Open and non-blocking: `close_cycle` strands unrolled survivors (16 rows on prod, left as evidence); `insert_list_item` is anon-executable with no membership guard.
Done when: a meal can be created from inside the app on dev and appears on PLAN with correct ingredient counts and a working "Add all"; the demo household holds 8–10 real meals; and the prod-promotion decision is made and recorded in the DECISIONS LOG — promoted and verified, or explicitly chosen to demo from dev.
**Files updated:** `src/App.js` (commit `ea1c170`, dev only), `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/specs/built/SPEC_plan_tab_meals_v1.md` (routed from `handoff/`)
**DB changes:** None — no migration, no schema/RPC/RLS change. **Dev-only data:** `dev_meals_seed.sql` run against the Sacandaga household (3 meals, 1 custom catalog item, 1 pre-seeded manual list-item collision). Never applied to prod.

### [2026-08-18] — [OurProvisions] — Ship `038` cycle integrity, promote the meals migrations to prod, and capture the meal-planning idea log
**Goal:** Close the last database debt before Vegas-demo feature work — ship cycle integrity to dev and prod, promote `025`+`026` out of their prod gate, and capture the meal-planning ideas that opening unlocked **without letting any of them expand this week's scope.**
**Completed:**
- **Shipped `038` + `025` + `026` to prod as one batch, applied step-by-step with independent verification between every step — from both the build and design sides.** Five pastes: the UUID-keyed repair, the partial unique index (bare — `CONCURRENTLY` cannot run in a transaction block), the enforcement fixture, `025`, `026`. **No step was accepted on "no error";** each was confirmed by a separate query run against prod from outside the SQL editor, and each result was cross-checked against its expected values before the next step was authorised. The `025`/`026` gate open since 2026-07-28 is **closed**, which also removes the hazard of nine meals commits on `main` running against a prod DB with no `meals` tables.
- **`uq_open_cycle_per_household` is live on dev + prod**, converting "more than one open cycle per household has not recurred" into **cannot recur**. Proven behaviourally, not by catalogue inspection: a fixture creates a throwaway household, **attempts the violation** (rejected, `unique_violation`), then closes the first cycle and opens another (**accepted**) to prove the predicate is partial and close-then-open still works. Self-cleaning; zero leftovers on both environments.
- **Repaired `Our calendar` and `Lake house`, and closed §F5 by database-side substitute.** Merged the two open cycles keeping the 14-item survivor (now 16), closed the emptied cycle rather than deleting it, and repointed the 2 stranded `Lake house` rows. **The spec's "open the app as a real user" check could not run as written — neither operator is a member of `Our calendar`** (it belongs to Christopher and Heddi). Substituted a `list_items` → `catalog_items` join over the survivor cycle: **16 live rows, no duplicates, sane quantities/status, and the 2 repointed rows carrying tonight's `2026-08-18 03:43:42` stamp while the other 14 retained their original `2026-07-16`/`07-24` stamps** — direct proof the repair moved exactly the intended rows and nothing else. `get_list_items_for_household` independently returns 16.
- **⚠️ Overturned the 2026-07-31 "residue, not an active defect" premise — the premise that shrank this migration to an afternoon and dropped the detector.** That census reported **2** stranded rows in a 48-hour window; re-measured at point-of-build, prod held **18 across 4 live households**, closes spanning 2026-06-07 → **2026-08-08**. Most predate 07-31, so **the census under-counted; the data did not grow into it.** Third re-measurement correction in two sessions.
- **Reversed the `close_cycle` "Bug A — no evidence" deferral and opened it as its own item.** 16 of the 18 are the close-side shape (`created_at < closed_at`); only the 2 Lake house rows were insert-after-close. Confirmed structurally in the live function body: `close_cycle` closes the cycle and, when `p_roll_item_ids` is empty, returns immediately — unrolled live items keep pointing at the closed cycle, **on both branches**. **The 16 rows were deliberately left untouched as live evidence** — new standing rule: *do not clean up residue from a defect you have not closed.*
- **Renumbered `031` → `038` at point-of-build, and found `insert_list_item` unguarded.** The spec claimed `031` when the mark was `030`, was not built that day, and `032`–`037` shipped since — `031` lapsed unclaimed exactly as `027` did. **A design-time migration number in a spec title is a liability.** Separately, while reviewing `026`: `insert_list_item` is `anon`-executable SECURITY DEFINER, write-capable, and contains **no `is_member_of()` call at all** (verified against the live prod body before *and* after `026`; `CREATE OR REPLACE` preserves the ACL, so `026` neither caused nor closed it). **It also invalidates the 21-function sweep's "relies on internal checks" framing** — the first function actually inspected disproved it.
- **Design layer: added the Vercel MCP connector, parked Splunk, and captured a 16-item meal-planning idea log — deliberately unscoped.** Vercel MCP scoped to the **`ourprovisions` project only** (read-only and read-write are inseparable in Vercel's OAuth flow, so project scoping was the available least-privilege lever); it closes the same assumed-vs-queried deployment blind spot that caused tonight's bundle-hash false start. Splunk platform MCP **rejected** (admin-provisioned OAuth + community-reported result fabrication on `tstats`); Observability Cloud MCP **parked as extra credit**. The idea log — triggered by the meals model becoming real — was **captured and explicitly not scoped, sequenced or prioritised**, to protect the Vegas plan. **Incidental product signal worth preserving:** `Our calendar`'s contents are **not groceries** — they are family caregiving and ride logistics ("Dad eye dr 950 am"). Organic off-label usage, not a defect.
**Unfinished:**
- **§F5 has no first-party confirmation yet.** The database-side substitute is strong — 16 rows, correct timestamps, no duplicates — but it does not prove the rendered UI. **Christopher and Heddi are both the unverified cutover keepers AND the members of the household this repair touched**, so their next sign-in closes two gates at once. Prioritise it.
- **The 16 close-orphan rows remain on prod, by design**, and `close_cycle` will strand more on the next close that leaves items unrolled. Fix not designed — deliberately deferred, tracked in NEXT.
- **`insert_list_item` is still `anon`-executable with no membership guard on prod.** Opened tonight, not fixed tonight.
- **The 16-item meal-planning idea log needs a sorting pass** — v1.0-adjacent vs. genuinely later — **after the Vegas trip**, before any of it becomes a spec.
- **The company-thesis line** — *"families will need and value our ability to help them enjoy food and do it on a budget — this stuff is hard right now"* — **should be pulled into `OurProvisions_Vision_Roadmap` / the investor narrative in Dan's own words.** Flagged as belonging there, not drafted there.
- **Splunk Observability Cloud MCP** — parked for Vegas travel time. Needs a realm check (GCP/GovCloud unsupported) before attempting.
- **⚠️ The Supabase SQL editor never surfaced `raise notice` output all night, in either environment.** Both fixtures reported success only through notices, so a successful dev run printed nothing and looked identical to not having run. Amended before the prod batch: every apply script now ends with a row-returning `SELECT`. Recorded in `migrations/README.md`.
**Next session:**
SESSION START
Goal: Build the PLAN tab and relocate the Meals lens out of Browse (Vegas week, Tue 2026-08-18).
State: `038`/`025`/`026` live and verified on dev + prod; meals is live infrastructure, so PLAN can build against real prod data. More than one open cycle per household is now structurally impossible. §F5 closed by database-side substitute, first-party confirmation still pending. Broken/open: `close_cycle` still strands unrolled survivors (16 rows on prod, left as evidence); `insert_list_item` is anon-executable with no membership guard — **not a blocker**. `createMeal` exists in the hook and nothing calls it yet.
Done when: PLAN exists as the standing fourth nav item with the Meals lens relocated out of Browse's render tree per the 2026-08-17 IA decision, verified on the deployed dev preview — not localhost.
**Files updated:** `docs/ROADMAP.md`, `docs/SESSION_LOG.md`, `docs/ARCHITECTURE.md`, `docs/specs/built/SPEC_cycle_integrity_038.md` (renamed from `active/SPEC_cycle_integrity_031.md`), `migrations/038_cycle_integrity.sql` (new), `migrations/fixtures/one_off_038_prod_cycle_repair.sql` (new), `migrations/fixtures/verify_038_index_enforces.sql` (new), `migrations/README.md`, `migrations/025_meals.sql` + `026_resurrect_integrity.sql` (header stamps only)
**DB changes:** **PROD:** `uq_open_cycle_per_household` created; `meals` / `meal_ingredients` / `list_item_meals` created with RLS + 11 policies; `add_meal_to_list` created (anon EXECUTE revoked); `list_items_resurrect_cleanup` + `trg_list_items_resurrect` created; `insert_list_item` replaced in place at one overload; 4 `list_items` rows repointed; 1 `provision_cycles` row closed. **DEV:** `uq_open_cycle_per_household` created. Both verified by direct query.
### [2026-08-17] — [OurProvisions] — Close Authorization Parts 5, 3 and 2 — the entire RLS/RPC spec is now shipped
**Goal:** Clear the remaining RLS/RPC authorization items (Parts 5, 3, and — once dev verification proved it safe — Part 2) so meal planning can start without carrying open security debt.
**Completed:**
- **Shipped Part 5 (`034`) — dev + prod.** Pinned `search_path = public, extensions` on the five SECURITY DEFINER functions still missing it (`archive_trip_items`, `close_cycle`, `get_active_cycle`, `get_household_user_ids`, `match_known_store`). `proconfig is null` is now **0 in both environments**. Behaviour-neutral by inspection *before* authoring: none of the five bodies references `auth.*`, `storage.*`, `extensions.*` or earthdistance — `match_known_store` computes distance arithmetically despite taking lat/lng.
- **Shipped Part 3 (`035`) — dev + prod.** Dropped `household_members_insert` (`WITH CHECK (true)`, i.e. any authenticated caller could self-insert into any household at `role: 'owner'`). **The safety argument was verified, not assumed:** a SECURITY DEFINER function bypasses RLS only if its owner is exempt, which requires table ownership **and** no FORCE RLS — `household_members` is `postgres`-owned with `relforcerowsecurity = false`. **Had FORCE been set, this migration would have locked every user out of joining a household.** Verified live: a direct anon-session insert now returns `42501`, and a real invite-accept between two accounts still succeeded.
- **Shipped Part 2 (`036` + `037`) — dev + prod — establishing the zero-downtime RPC-signature pattern.** `bootstrap_new_user` no longer accepts `p_clerk_id`; identity derives from `auth.jwt()->>'sub'`. Split deliberately: `036` adds the hardened 3-arg alongside the still-live 4-arg (nothing breaks) → client deploy → `037` drops the 4-arg. **Dropping a signature breaks every in-flight caller, and for bootstrap that is every *sign-in*, not just signups.** One portable file covered both environments despite prod carrying three legacy overloads dev did not — `drop function if exists` no-ops cleanly, so no environment-specific migration was needed. DROPs had to precede the CREATE: the new `(text,text,text)` was type-identical to a legacy overload and Postgres refuses to rename parameters via `CREATE OR REPLACE`.
- **Verified Part 2 behaviourally before closing it.** Three genuinely fresh cold sign-ups on dev: plain (clean single household, correct `owner` role), valid-invite (joined the inviting household as second member), and **expired/already-used invite (fell through to a fresh household with a graceful toast — no error, no wedge)**. That last one was flagged in advance as the most likely regression, because raising instead of falling through rolls back the user upsert and leaves a new user unable to sign up at all. Real prod sign-in confirmed clean before `037` removed the fallback.
- **Proved closure with real evidence rather than a trivially-true check.** A bare anon `POST {"p_email":…}` returns `42501` **identically before and after** `037` — it proves nothing (same trap as `033`'s unchanged row count). The evidence: the **forged shape** `{"p_clerk_id":"000…0","p_email":…}` against a non-existent identity returned `PGRST202`, paired with a **control call** firing the identical forged shape at `create_household` — which reached the function body and raised `P0001` from inside, proving the block is signature-specific, not a broken-RPC false negative. Advisor on prod: `anon_security_definer_function_executable` **25 → 21**, `function_search_path_mutable` **5 → 0**, cross-checked against `pg_proc` rather than eye-counting lints.
- **Corrected the advisor backlog attribution before it propagated further.** "~59 warnings ≈ the Part 5 `search_path` gaps" was wrong: the real baseline is 53 dev / 56 prod, of which `function_search_path_mutable` is only **5**. The bulk — **23–25 `anon`-executable SECURITY DEFINER functions** — is Part 2's severity class, not Part 5's. ROADMAP corrected in place; SESSION_LOG took a dated addendum per the append-only rule.
- **Corrected two long-standing ARCHITECTURE claims by direct observation.** "Legacy anon key format required" — prod ships a modern `sb_publishable_` key and an anon `GET /catalog_items` returns `200`. And "`bootstrap_new_user` step 3 has NO `ORDER BY` on prod" — the live body on both databases (byte-identical, `md5 54518e04…`) carries the ordered, liveness-joined lookup; it had been fixed by a later rewrite and the doc went stale.
**Unfinished:**
- **`create_household(p_name, p_clerk_id)` carries the identical defect Part 2 just closed** — SECURITY DEFINER, **anon-executable**, trusts a client-supplied clerk id. Found *as* tonight's verification control, so it is confirmed live and reachable on prod. Not in the original spec's scope; needs its own item, but the fix pattern is now proven and reusable.
- **21 remaining `anon`-executable SECURITY DEFINER functions on prod**, including `delete_household`, `remove_member`, `leave_household`. Not audited individually — this wants a dedicated sweep, not reactive spot-fixes as each surfaces.
- **Cutover keepers:** Tyler and Aidan confirmed signed in this session; **Christopher and Heddi remain unverified.** The dev Clerk integration (rollback path, two live issuers) cannot come out until all four are confirmed.
- **A false-positive "no longer a member" toast appeared on one brand-new cold start** and traced to nothing in the data (confirmed by direct query — the membership was correct). Likely a `checkPresence` timing artifact on a cold start, **not** a Part 2 regression. Unexplained, so it stays here rather than being written off.
- **`shopping_sessions` policies still verified by inspection only** — `startSession()` remains unwired in `App.js`.
- **Supabase MCP is read-only in BOTH environments** (`supabase_read_only_user`, no `apply_migration`), so every migration this session was applied by hand in the SQL editor. Worth solving before the next migration-heavy session.
**Next session:**
SESSION START
Goal: File and scope the `create_household` client-supplied-`clerk_id` defect as its own item (reusing tonight's proven pattern), OR begin PLAN tab design now that meals placement is settled and authorization debt is clear.
State: The entire `SPEC_rls_and_rpc_authorization.md` (Parts 0, 1, 2, 3, 4a, 4b, 5) is shipped and verified on dev + prod, every part checked from outside the SQL editor. `dev` and `main` are both at `1ebe263`. Two narrower authorization items are open (`create_household`; the 21-function anon-exec sweep) but neither blocks meal planning.
Done when: `create_household`'s fix is spec'd (or built, if scope stays small) — OR PLAN tab scope is chosen and its spec drafted.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/specs/built/SPEC_rls_and_rpc_authorization.md` (status header → closed), `migrations/034_pin_search_path_secdef.sql` (new), `migrations/035_drop_household_members_insert.sql` (new), `migrations/036_bootstrap_new_user_derive_clerk_id.sql` (new), `migrations/037_drop_bootstrap_new_user_4arg.sql` (new), `src/hooks/useProvisions.js` (dropped `p_clerk_id` from the RPC call — `1ebe263`)
**DB changes:**
- **dev (`zxwtxjjmssykhqrghouf`):** `034` applied + verified (0 unpinned). `035` applied + verified (structural, live app-level RLS check, real invite-accept). `036` applied + verified (two-overload intermediate state, correct per-signature grants). `037` applied + verified (one overload, anon locked out, three cold sign-ups correct).
- **prod (`parpauldmbetptkmdwbd`):** same four migrations, same order, same depth. `034`: `proconfig is null` = 0. `035`: `household_members` policy surface down to SELECT-only. `036`+`037`: real prod sign-in clean before the 4-arg was dropped; forged-identity `PGRST202` plus the `create_household` control call; advisor `anon_security_definer` 25 → 21, cross-checked via `pg_proc` (`anon_secdef 21 / auth_secdef 23 / unpinned 0`).

### [2026-08-17] — [OurProvisions] — Close the MCP blocker; ship Part 4b + a self-found RLS bypass; settle PLAN/Meals IA

> **Addendum 2026-08-17:** This entry's Unfinished line *"**59 warnings in Security Advisor** — seen, not investigated; likely the Part 5 `search_path` gaps"* is **wrong on attribution**. Measured directly on both databases later the same day: `function_search_path_mutable` is **5 on dev and 5 on prod** — the Part 5 gaps are **5 warnings, not ~59**. The bulk is `authenticated_security_definer_function_executable` (25 dev / 26 prod) and `anon_security_definer_function_executable` (**23 dev / 25 prod**), with `rls_disabled_in_public` **0 on both**; totals are **53 dev / 56 prod**. So migration `034` (Part 5) clears **5** of them and leaves ~48/51 untouched, and **the real backlog is `anon`-executable SECURITY DEFINER functions — PART 2's surface, not Part 5's**, in the no-credential severity bracket. Also established: prod's three extra warnings in both SECURITY DEFINER categories are the three legacy `bootstrap_new_user` overloads dev no longer has (canonical intent per `000_canonical_baseline.sql:401-406`, never applied to prod). See ROADMAP NOW. *(Correction appended; original entry unchanged.)*

**Goal:** Fix the three-session Supabase MCP blocker, ship Authorization Part 4b (RLS on the three cycle tables), and clear whatever else surfaced along the way.
**Completed:**
- **Fixed the three-session-blocking MCP connection.** Root cause: OAuth completed *after* session start, and MCP clients bind at startup — a mid-session grant is never picked up retroactively. Full restart resolved it. Both servers confirmed reaching the correct, distinct databases via `pg_control_system()` `system_identifier`, not by server label.
- **Shipped migration `032` — Authorization Part 4b, dev + prod.** RLS enabled on `known_stores`, `provision_cycles`, `shopping_sessions`. **The spec's fix block rested on a false premise:** it assumed all three tables were policy-free, but `known_stores` and `shopping_sessions` each already carried three **dormant** policies (authored `archive/005`, repaired by `014`) encoding a *more careful* design — per-user session writes ("can't start a session on behalf of Helen") and `deleted_at` filters on both SELECTs. Creating the spec'd set alongside them would have **OR-widened** access, defeating both soft-delete filters and turning per-user writes household-wide. Preserved the existing design, added only the three missing `provision_cycles` policies, and repaired two real gaps: `sessions_update_own` had **no membership check at all**, and both it and `known_stores_update_household` had `USING` with no `WITH CHECK`, leaving the UPDATE post-image free to move a row to another household.
- **Investigated the `Security Definer View` advisory and shipped migration `033`.** `category_avg_prices` ran owner-privileged (`postgres`), bypassing `catalog_items` RLS entirely — including the `022` anon policy. Deeper finding: **dev and prod carried two different view bodies under one name**, and no migration on disk performed prod's redefinition (applied out-of-band — same record hole as `024`). **Prod's undocumented drift was the *safer* shape:** the canonical baseline aggregates `list_items.price_per_unit`, and prod's 63 priced rows belong to **exactly one household**, so under the baseline prod's "cross-household average" would have been one household's real shopping prices served to anon with zero aggregation cover. Unified both environments on the `catalog_items` shape, added an explicit `is_global = true` filter, and set `security_invoker = on`.
- **Corrected `000_canonical_baseline.sql` itself, not just the docs** — a deliberate, logged exception to "never edit fixes back into `000`", justified because the baseline *was* the source seeding the vulnerable definition and a rebuild would have reintroduced it.
- **Corrected the same stale blocker claim in two places** — `SPEC_rls_and_rpc_authorization.md` and `ARCHITECTURE.md:393` both still said `is_member_of()` had an unresolved soft-delete gap "gating Part 4." Resolved by `029` on 2026-07-31; re-verified tonight by `pg_get_functiondef` on both databases (byte-identical). Part 4b was never actually blocked — the docs had gone stale. The ARCHITECTURE bullet carried a third error too: `delete_household` **does** cascade to `household_members`.
- **Wrote and routed `SPEC_retire_dormant_user.md`** — captures the two retirement shapes (mangle-only vs. full inner-to-outer chain), the FK teardown-surface query, and the `user_hidden_items` orphan class from the 2026-08-15 cutover. Retroactive documentation of a procedure already run on 11 users. Routed straight to `docs/specs/built/` per its manifest — it documents executed work, not a future build.
- **Settled a standing IA question.** Beta feedback drove moving the Meals lens out of BROWSE to keep the catalog pure items + categories. **PLAN confirmed as a standing fourth tab**, closing the 2026-07-28 "3-vs-4 doors" question. Caught before `MEALS_ENABLED` ever flipped live — the built lens code sits inside Browse's render tree and needs relocating at build time, not just a flag change.
**Unfinished:**
- **`shopping_sessions` policies verified by inspection only, never live.** `startSession()` exists in `useProvisions.js` but is never called from `App.js`, so there is no UI path to exercise either session policy. Cannot be closed until the shopping-session feature ships a UI. The two riskiest call sites in `032` are therefore still unproven against real traffic.
- **Authorization Parts 2, 3 and 5 remain open** — `bootstrap_new_user` still trusts a client-supplied `p_clerk_id`, `household_members_insert` is still `WITH CHECK (true)`, and five SECURITY DEFINER functions still have no pinned `search_path`.
- **59 warnings in Security Advisor** — seen, not investigated; likely the Part 5 `search_path` gaps.
- **Four of five cutover keepers still unverified** — only Helen confirmed. Christopher (4 memberships), Heddi (2), Aidan (1), Tyler (1) still need a successful sign-in.
- **Dev Clerk integration still enabled in Supabase** as the cutover rollback — two live issuers remains an open auth surface.
- **PLAN tab scope undecided** — meals-only first, or meals + day-scheduling together?
- **`TRUNCATE` is not governed by RLS** and `authenticated` still holds it on all three cycle tables; `shopping_sessions` is FK-referenced by nothing, so it is not blocked. Not reachable via PostgREST (no TRUNCATE verb), noted rather than assumed away.
**Next session:**
SESSION START
Goal: Close out the remaining cutover items (verify the four keepers, remove the dev Clerk integration), or begin PLAN tab design now that its placement is settled.
State: Migrations `032` and `033` applied and verified on dev + prod; advisors show the `rls_disabled` and `security_definer_view` errors cleared. MCP reaching both databases, identity-confirmed. Both specs routed to `docs/specs/built/`. PLAN confirmed as the standing 4th tab; Meals relocation decided, not built (still flagged off). Authorization Parts 2, 3, 5 outstanding.
Done when: The four keepers have signed in successfully and the dev Clerk integration is removed, OR a PLAN tab scope is chosen and its spec drafted.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `migrations/000_canonical_baseline.sql`, `migrations/032_rls_cycle_tables.sql` (new), `migrations/033_category_avg_prices_security.sql` (new), `docs/specs/built/SPEC_rls_and_rpc_authorization.md` (moved from `active/`), `docs/specs/built/SPEC_retire_dormant_user.md` (routed from `handoff/`)
**DB changes:**
- **dev (`zxwtxjjmssykhqrghouf`):** `032` — RLS enabled + 9 policies across the three cycle tables. `033` — `category_avg_prices` redefined (`catalog_items`/`price_hint`, `is_global` filter, `security_invoker=on`).
- **prod (`parpauldmbetptkmdwbd`):** same two migrations, both verified — `032` structurally, by policy shape, by anon-key `42501`, and by a live cross-account regression sweep on dev; `033` by `reloptions` plus an anon-key read returning the identical 5 categories/values before and after (correct — today's data is 100% global, so the fix is invisible today).

### [2026-08-15] — [OurProvisions] — Execute the prod Clerk cutover
**Goal:** Move the live app off the dev Clerk instance and onto the prod instance at `clerk.ourprovisions.velayo.ai` — reconcile every live user's `clerk_id`, re-point Supabase Third-Party Auth, flip the Vercel key, and verify from the running app.
**Completed:**
- **Cut prod over to the prod Clerk instance and verified it end-to-end.** Issuer added, Vercel Production flipped `pk_test_` → `pk_live_`, cache-free redeploy (`80a5a54`, 46s, green). Verified on three independent accounts — Dan (4 households), Charles (2), Elly — with a clean console, no dev-keys banner, and the Sacandaga banner photo rendering, which is a **live pass on the deferred OurBanner storage-RLS check** (those policies key on `auth.jwt()->>'sub'`).
- **Found a nine-row drift between the migration roster and the database — the flip was gated on a number that had been wrong since July.** The "12 keepers" was a *roster*, never a row count; prod held 19 live users. Nine were live, held live households, and existed in **no Clerk instance** — each a permanent lockout waiting to happen. Discoverable only by counting both sides.
- **Retired 11 dormant users, and established that a retire has two distinct shapes.** Jean got the full inner-to-outer chain (own solo household: 8 list items → invite → membership → household → mangle). Michael and the other nine got **mangle only** — their footprint lived in *someone else's* household, and deleting it would have edited Sacandaga's history to tidy up `public.users`.
- **Reconciled the nine remaining `users.clerk_id` values** (ten counting the pilot), keyed on `id` rather than email, with the VALUES block generated by Excel formula so no character passed through human eyes or a screenshot.
- **Discovered Supabase Third-Party Auth accepts multiple simultaneous Clerk connections — which deleted the downtime window entirely.** The plan assumed delete-then-re-add with a gap where no provider existed. Adding prod *alongside* dev meant both issuers were accepted at once: zero-downtime auth-plane change, and rollback became "redeploy the old build" with nothing to re-create under pressure.
- **Mapped the true teardown surface from `information_schema` rather than the column inventory** — 16 FK columns reference `users`, **all `NO ACTION`**, six of them on tables neither the spec nor the census had listed. Derived the replacement invariant: every live prod user with a live membership has a prod Clerk account and a captured sub — ten users, ten Clerk accounts, ten reconciled rows, `0 still gating`.
- **Confirmed the cutover from outside the app, and corrected the bundle check itself.** Fetched the deployed prod bundle and diffed it against the dev preview as a same-build control: prod carries `pk_live_…` decoding to `clerk.ourprovisions.velayo.ai$`, dev carries `pk_test_…` decoding to `many-puma-34.clerk.accounts.dev$` — an independent pass on cutover verification, from outside the app and outside the database. **The bare `pk_test_` string still present in the correctly-cut-over prod bundle is Clerk SDK prefix constants** (`const rf="pk_live_",nf="pk_test_"`), not an injected key — so the spec's step-7 check "bundle no longer contains `pk_test_`" would have reported a false failure. The check must match the key *with its payload* and base64-decode it.
  Superseded the two doc lines still describing the pre-cutover state — `ROADMAP.md`'s 2026-07-25 decision row (corrected in place) and `SESSION_LOG.md:379` (addendum, per append-only); both were accurate when written and went stale with the flip. An intermediate reading of the bundle evidence — that Production had been silently `pk_live_` since the 2026-07-27 promotion — was **wrong**, and the handoff's direct account of flipping it tonight settled it: **deployment evidence dates a state, not its cause.**
**Unfinished:**
- **Five keepers unverified** — Christopher (4 memberships), Heddi (2), Helen (2), Aidan (1), Tyler (1). A wrong character in a `clerk_id` presents as an **empty app with no error**, so silence is not evidence. Dan is working through them.
- **Dev Clerk integration still enabled in Supabase — deliberately.** It is tonight's rollback. It should not live there indefinitely: two enabled issuers means a stale dev token is still accepted.
- **`SPEC_retire_dormant_user.md` does not exist in this repo.** The handoff files it as "not amended," but no such file is in `docs/specs/{active,built,retired}/` and nothing in `docs/` references it — so the two-shapes rule and the FK map have **no spec to land in**. It must be written or imported, not amended.
- **`user_hidden_items` orphans.** Keyed on `clerk_id` *text* with no FK to `users`, so the mangle strands those rows pointing at a string that resolves to nobody. Harmless in practice; a real orphan class the schema cannot express.
- **`Supabase_Snippet_Public_Schema_Column_Inventory.csv` is stale** — covers 11 tables, missing `household_staples`, `list_item_contributors`, `meals`, `provision_cycles`, `shopping_sessions`, `known_stores`. It was trusted as a column source and produced a wrong query (`household_invites.used_at`, which does not exist).
- **EXIF-upright verification still outstanding** — the storage-RLS half of the carried OurBanner pair passed live tonight; the rotated-photo check did not run.
- **Two Supabase MCP servers still unauthenticated** in Claude Code — third session blocked by this. Worked around by running everything in the SQL editor.
- **Tracker cosmetics:** M11's note still claims Aidan has 0 live memberships (he has 1); `#9` missing from the numbering.
- **`Security Definer View` advisory on `category_avg_prices`** noticed in the prod advisor panel and not confirmed as tracked anywhere. Same anon-surface class as the migration-022 exposure.
**Next session:**
SESSION START
Goal: Close out the cutover, then take Authorization **Part 4b** — enable RLS + policies on `known_stores`, `provision_cycles`, `shopping_sessions`.
State: Prod Clerk cutover **COMPLETE and verified** on three accounts. Ten live prod users, all reconciled to prod subs, all with prod Clerk accounts. Eleven dormant users retired. Dev Clerk integration still enabled in Supabase as rollback. No repo source changed tonight; `main` unchanged at `80a5a54`. **`origin/dev` pushed `4f73779..36b5bb5`** — this cutover-docs commit `36b5bb5`, shipped together with the held-back Content Loop docs commit `2f861d0` (cleared for push this session). `dev` is in sync with origin; the tip is one commit ahead of `36b5bb5`, being the follow-up that wrote this hash in. Three CRITICAL advisories still open on the RLS-disabled trio.
Done when: the five remaining keepers have signed in successfully; the dev Clerk integration is deleted from Supabase Third-Party Auth; and Part 4b ships RLS + policies on all three tables in **one migration** (enable-and-policy must not split), dev-green before prod, verified from outside the database.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`; `docs/specs/active/SPEC_prod_clerk_instance.md` → **`docs/specs/built/`**; `handoff/design_handoff.md` consumed and deleted. No app source, no migrations.
**DB changes (prod, `parpauldmbetptkmdwbd`):**
- 11 `users` rows soft-deleted with `email` and `clerk_id` prefixed `retired-2026-08-15-` (Jean, Michael, Barb, `danholm@cisco.com`, and 7 `+testNN` accounts).
- Jean's household chain soft-deleted: 8 `list_items`, 1 `household_invites`, 1 `household_members`, 1 `households`.
- 9 `users.clerk_id` values reconciled to prod Clerk subs (10th was the pilot, already done).
- No schema changes, no migrations, no function changes.

### [2026-08-15] — [Velayo OS] — Charter the Content Loop, and replace the Ritual → Seat → Agent ladder
**Goal:** Design a reusable content-generation agent pipeline that mines Velayo's own docs for teaching moments, and resolve the promotion-tier vocabulary surfaced along the way.
**Completed:**
- **Chartered the Content Loop** — four roles: **Content_Idea** (renamed from "Watcher" this session), **Copy Drafter** (existing Growth charter, remit extended), **Editor**, **Publisher** — gated by two human checkpoints that instantiate the Growth group's standing rule *"no Growth agent addresses a human unsupervised — draft, never send."* **Publisher is the only role that ever sends**, and only immediately downstream of the final gate. Gate queue is unified but tagged `[scope]` + `[owner]`, defaulting to Dan — the Harbour's lane-ownership pattern one level down.
- **Replaced the Ritual → Seat → Agent ladder in `docs/AGENTS.md` — this was a supersession, not a first definition.** `AGENTS.md` §1 has carried a ladder since **2026-08-05**; the design chat's claim that the vocabulary was "previously used but never documented" was **wrong**, and the correction changed the work from *writing* a definition to *replacing* one. Tier now turns on **autonomous trigger + judgment + independent observation surface — all three**. The old gate-vs-assembly-line promotion line is **withdrawn**. Two new rules carry most of the weight: **fan-out is part of the same Seat** (tier is a property of the chain's root trigger, not of each link) and **a Seat put on a schedule is still a Seat** — removing the keystroke does not add judgment.
- **Re-verified the whole roster against the new test rather than re-wording it — and two entries moved.** **Inspector is DEMOTED** from "Agent #1 (in promotion)" to **Seat**: deterministic pass/fail is a fixed sequence *by design*, so no judgment, and it is wired into `dev→main` as a synchronous gate step, so no observation surface. **Watchman becomes the strongest Agent candidate** (clears all three). **Tester's billing as the old ladder's worked example of an agent is now false.** **Fixer is structurally barred** as pipeline Stage 3.
- **Ruled Analyst L1 an Agent** — selecting a restore action from a named list, on observed conditions, **is** judgment; bounded choice is still choice. **Classification only:** it remains Charter-tier, unbuilt, and staffed last, still gated behind Watchman's signals being proven trustworthy. It is the first role to *qualify* as an Agent and will be the last one built.
- **Reconciled the two downstream conflicts the new ladder created.** **§2's counting rule** had counted any task completing *"with no human between its steps"* — which a scheduled Seat satisfies, contradicting §1 and §2's own "Seats count zero" line; it now carries §1's three conditions verbatim, so **a task counts only if the job doing it is an Agent**. **§3's "Allowlist, not judgment"** is reworded to **"Allowlist-constrained judgment"** — the rule gates *what* an agent may do, not whether choosing among bounded options counts as judgment at all.
- **Specified Content_Idea's contract, signal split, and Publisher's cadence.** Silence is the **default, expected output**, not a failure state. Triggers **only on SESSION END, never on a schedule** — the docs it reads only change at SESSION END, so a timer would re-check an unchanged door. Two signal sources, not one stretched across channels: DECISIONS LOG → blog + LinkedIn; ROADMAP DONE stamps + ExD-tagged entries → Instagram. Publisher drips from a channel-tagged ready backlog at per-channel ceilings (blog ≤30d, LinkedIn ≤10d, Instagram ≤3d) — **maximums, never floors** — skipping silently rather than manufacturing a post. Instagram's visual gap resolves **at the final gate**, not as a new step.
- **Established charter-vs-instance reuse and the standalone-watcher build constraint.** The charter is written once, generically; each project runs its own instance paired to that project's SESSION END, because `project_knowledge_search` is project-scoped. And **every Agent candidate is built as a standalone watcher with its own read access from day one, never grafted in as a step inside a Seat's script** — a grafted watcher fails the observation-surface condition structurally, where a standalone one promotes by **config change** (remove the keystroke gate) rather than rewrite.
**Unfinished:**
- **Content Loop role charters are not written.** Content_Idea, Editor and Publisher have **no trigger/steps/output/verification blocks** in `docs/AGENTS.md` matching the format every existing charter uses. Content_Idea's is the one that matters most — it is the fleet's nearest true Agent, missing only the autonomous trigger.
- **CONTENT_IDEA trigger not spec'd step-by-step** (mirroring SESSION START / SESSION END / BUILD).
- **Scribe's and Tester's "promotes when" lines are stale** — both describe removing the human, which under the new test yields a **scheduled Seat**, not an Agent. They need rewriting against all three conditions.
- **Three Growth charters name no trigger** — Funnel Inspector, Feedback Scribe and Copy Drafter predate the new test; Funnel Inspector's judgment is also disputed (classifying users against a fixed taxonomy may be a predetermined sequence).
- **Cadence ceilings are aspirational** — no usage data on escalation frequency; ≤30d/≤10d/≤3d is unverified against any real backlog-fill rate.
- Instagram's screenshot step is manual/Ritual-tier — no tooling, by design, for now.
- OurProvisions Content_Idea instance not stood up. **And no OurProvisions app work this session** — no code, no migrations, no deploys. Verified at session start that `dev` and `main` are both in sync with origin; the 2026-08-10 push-gap check held.
**Next session:**
SESSION START
Goal: Write the Content Loop role charters (Content_Idea, Editor, Publisher) in `docs/AGENTS.md`'s existing charter format, and spec the CONTENT_IDEA trigger step-by-step.
State: Content Loop designed and recorded; ladder replaced and the roster re-verified against it; zero Content_Idea passes have occurred. OurProvisions app unchanged — prod at `80a5a54`; the dormant `is_staple` clobber remains the top open app bug in NEXT.
Done when: `docs/AGENTS.md` carries a charter block for each of Content_Idea, Editor and Publisher, and CONTENT_IDEA has a written step-by-step trigger routine.
**Files updated:** `docs/AGENTS.md`, `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`; `handoff/design_handoff.md` consumed and deleted. No app source touched.
**DB changes:** None.

### [2026-08-10] — [Cross] — Ship the Browse category rail to production, and close a six-session git push gap
**Goal:** Take the Browse category filter rail from an airlock-ready spec to a device-verified build live on production, correcting the design in the hand rather than on paper.
**Completed:**
- **Shipped the rail + add-item picker to production** — `dev→main` fast-forward `8cbbf43..80a5a54`, no merge commit: 16 commits, 13 files, **no migrations and no auth-path change**. Also **closed a six-session push gap** found at session start: `dev` was six commits ahead of `origin/dev`, every one a docs-only SESSION END commit running 2026-08-03 → 08-09 — the rail spec and both mockups existed on one laptop and nowhere else.
- **Cut the Clear chip.** First element in the rail, the only dashed element on screen, taking visual priority over the categories while not being one. Deselect is now tapping an active pill — which dissolves the phase-1 reachability question the spec had to argue away.
- **Settled the descriptor on one verb, `Showing only`,** replacing both `Showing` and the phase-1 `Filtering` special case. `Filtering Produce` is backwards — Produce is what *survives*. The real question is not "are filters on" but "where did Bacon go", and `only` states withholding in one word. Also dropped the phase-2 eyebrow's count, which reprinted the descriptor's number ~40px below it.
- **Replaced the desktop pagers with a styled scrollbar.** The pagers existed solely to compensate for hiding the scrollbar; the scrollbar shows position *and* affords dragging, which they never did. Removing a part beat adding one.
- **Built the first-run nudge, then cut it entirely** — animation, localStorage key, reduced-motion guard and pointerdown cancel. The scrollbar made it redundant, on device it read as a layout glitch, and it fired ~400ms after the splash resolve.
- **Root-caused the startup shimmy — it was never the nudge.** A page renders shorter than the viewport, grows past it as content loads, Chrome adds the vertical scrollbar mid-load, and the ~15px it occupies shifts the centered column ~7px left. Fixed app-wide with `scrollbar-gutter: stable` on `html`. **The nudge had already been cut before this was found, and cutting it changed nothing.**
- **Diagnosed Staples as a predicate, not a category** (`household_staples` row-presence, migration 016), and **verified on device across desktop Chrome, iOS Safari and a Windows touchscreen** — descriptor in all three phases, phase-2 eyebrow, count accuracy, picker steps 9–11, scrollbar present on desktop and absent on iOS, permanent track on Windows touch accepted, shimmy gone.
**Unfinished:**
- **Dormant `is_staple` column** — the list RPC selects it and the client merges it into `catalogMap`, overwriting correct `household_staples` stamping on every poll. Migration 016 states no read path should use it. **Blast radius is the shared list, not just Browse.** Filed to NEXT, untouched.
- **Staples descriptor phrasing.** `Showing only Staples, Produce and 1 more` joins a predicate into a category list as a peer, but Staples *intersects* the others — the line claims three category sets when the truth is stapled items within two categories. Grammatically fine, semantically wrong. Filed to NEXT.
- **`Multiple GoTrueClient instances detected`** in the prod and dev console — promoted from LATER to NEXT, because it sits directly in front of the Clerk auth-plane flip.
- **Defect 3 diagnosis was blocked twice on unauthorized Supabase MCP,** then resolved by device observation instead. The two queries were never run.
- **Commit `a6e94d9` carries a malformed subject line** (literal `@`, real subject on the body's first line — PowerShell here-string syntax passed to the Bash tool). It is now in production history. Deliberately not amended: force-pushing a shared branch for cosmetics is a habit worth not forming.
- **Android untested** for the permanent-scrollbar question. iOS clean; the Surface shows a permanent track and that was judged acceptable, with no viewport gate built.
- **Sticky rail** and **category data cleanup** still deferred, unchanged.
**Next session:**
SESSION START
Goal: Execute the prod Clerk cutover.
State: Browse rail + add-item picker **live on production** — `dev`, `main`, `origin/dev` and `origin/main` all at **`80a5a54`** before this docs commit; working tree clean and in sync with origin. Prod otherwise on RELEASE-2026-08 with Authorization Part 1 live. Meals still flag-hidden. Prod Clerk instance provisioned with DNS/SSL cleared; user migration half-executed.
Done when: Christopher, Heddi and Jean have accepted their Clerk invites and their subs are captured; all 11 remaining `users.clerk_id` reconcile UPDATEs are run; prod Supabase Third-Party Auth is re-pointed to `https://clerk.ourprovisions.velayo.ai`; Vercel Production is flipped `pk_test_` → `pk_live_` and deployed; and a migrated family user (Helen or Elly) signs in and sees their own household.
**Files updated:** `docs/specs/active/SPEC_browse_category_rail.md` → **`docs/specs/built/`** (amended: Clear chip struck, verb rule rewritten, Staples model recorded, scroll-affordance section added with both rejections, verification step 1 rewritten to record the accepted Windows-touch track), `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/SESSION_LOG.md`, `src/App.js`, `src/index.css`, `src/hooks/useProvisions.js`. Commits `a75fc0a` → `28a52ec` → `6bee28d` → `a6e94d9` → `507b9e0` → `80a5a54`.
**DB changes:** None.
**Machine:** Madbury desktop — the session **started on the Surface** (lake) and finished here. The desktop was two weeks behind at pickup — missing `RELEASE-2026-08.md`, `docs/AGENTS.md`, the splash arc extraction, and the rail spec — and was fast-forwarded `6f7daeb..6bee28d` before any work began.

### [2026-08-09] — [OurProvisions] — Redesign Browse category filters as a single-row rail and fix the add-item category picker
**Goal:** Replace the four-row wrapped grid of emoji category pills in Browse with something that reads as a filter control and stops eating a third of the viewport.
**Completed:**
- **Diagnosed the real defect as layout, not emoji** — ragged rows came from variable glyph widths, solved by a **fixed 17px glyph box** rather than by removing the icons.
- **Rejected the tab/underline treatment** on Dan's read that filters must not borrow navigation's visual language; multi-select confirmed against `selectedCategories`.
- **Settled the rail:** single horizontal row, hidden scrollbar, proximity snap, cream gradient edge masks (fade, never clip), active pill fills espresso, **no checkmark swap**.
- **Established the icon map as a lookup with a mandatory 📦 fallback** — category values are not a closed set, so an exhaustive map is a map that breaks on the next user-created category.
- **Resolved the descriptor collision:** one slot shared with the declutter cycle; filter text **fully replaces** cycle text when filters are active. Truth table authored across all six phase × filter states.
- **Chose descriptor copy that names categories** (`Showing Produce and Dairy — 25 items`) over consequence-phrasing or bare counts, because names survive the rail scrolling out of reach.
- **Designed the add-item category picker as the deliberate opposite of the rail** — wrapped grid, all categories visible, single-select, pre-selected when entered from a section header.
**Unfinished:**
- **Build not started.** The spec is routed and ready; no code was written this session.
- Category data cleanup (merge `Bakery & Bread` / `Bread & Desserts`, retire `Mexican Asian`) — scoped and deferred, needs its own spec and must not land during the Clerk cutover.
- Sticky rail beneath the search bar — deliberately cut from v1; interacts with the photo header scroll and phase-1 hidden state.
- **Airlock note:** the payload arrived **mid-merge**, several minutes after `design_handoff.md` — the first airlock read showed the manifest's files absent everywhere (repo, `~/Downloads`, Desktop). All three keepers were routed once they landed. The three superseded explorations (`mockup_category_row.html`, `mockup_category_filters_icons.html`, `mockup_filters_check_ab.html`) were marked **discard** in the manifest and never arrived, so nothing was deleted. **Drop the handoff and its payload together** — a manifest that arrives before its files is indistinguishable from files that were never saved, which is exactly what happened to the 2026-08-05 agent charter.
**Next session:**
SESSION START
Goal: Build the Browse category rail + add-item picker per `docs/specs/active/SPEC_browse_category_rail.md`.
State: Spec and both mockups routed and in the repo. Design settled; decisions merged into ROADMAP + ARCHITECTURE. No schema or auth-path change involved. Clerk prod cutover still gated on Christopher, Heddi and Jean accepting invites — unchanged by this work.
Done when: the rail ships to dev and all eleven verification steps in the spec pass — notably **truth-table row four** (phase 1 + filters active shows the filter line) and the **📦 fallback firing on `Mexican Asian`**.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`; routed from the airlock — `docs/specs/active/SPEC_browse_category_rail.md`, `docs/mockups/mockup_filters_emoji_descriptor.html`, `docs/mockups/mockup_add_item_category_picker.html`. No source files.
**DB changes:** None.

---

### [2026-08-09] — [Cross] — Bitwarden stood up (human/machine split); `.env.local` completed and verified; Vercel Development scope cleared
**Goal:** Decide the Bitwarden secrets architecture — which product fits, what genuinely needs to be secret, which agents get which credentials, and whether it clears the Vercel Development-scope debt.
**Completed:**
- **Decided the human/machine split and stood up the stack.** Password Manager for human retrieval (interactive unlock); Secrets Manager for unattended agent auth (machine accounts + scoped, independently revocable tokens) — different consumers, not competing products. Bitwarden account on `dan@velayo.ai`, Velayo free org, Secrets Manager subscribed. Free tier = unlimited secrets / 2 users / **3 projects / 3 machine accounts** (Inspector, Scribe, Tester); **Watchman is seat #4 and the first paid seat** (~$6/user/mo Teams).
- **Sorted credentials into tiers** — public-by-construction (Supabase URL + anon/publishable, Clerk `pk_`) vs. genuinely secret (`service_role`, Postgres connection string, `SUPABASE_ACCESS_TOKEN`, Clerk secret, Vercel token, agent PATs). Established that **`.env.local` was never the reason Bitwarden mattered** — the agent roster introduces the first Tier-1 credentials into the system at all.
- **Found and fixed a missing Clerk key that broke local dev everywhere.** No `.env.local` on any machine — Drive copy, lake desktop, or Surface — carried `REACT_APP_CLERK_PUBLISHABLE_KEY`. `src/index.js` reads it from `process.env` with no fallback and throws on absence; the hardcoded `pk_test_` literal was removed at some point and **no distribution path carried the replacement anywhere.** Pulled `pk_test_` from the Clerk Velayo/Development instance, completed `.env.local`, and verified **functionally** — `npm start` compiled and the Clerk modal rendered in Development mode.
- **Cleared the Vercel Development scope — root cause was worse than "stale."** `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` were each a **single row scoped to "Production and Development"** — structurally bound, not merely out of date; the shared value is the **prod** project (`parpauldmbetptkmdwbd`), confirmed by inspection. Edited both rows to Production only. Development now holds **zero** variables, by design.
- **Fixed a corrupted Preview variable** — Preview-scoped `REACT_APP_SUPABASE_ANON_KEY` carried leading/trailing whitespace and a return character (flagged by Vercel since Jun 11, never acted on). Retyped clean and matched against the vault copy.
- **Stored `ourprovisions .env.local (dev)`** as a secure note in the personal vault (initially with an explicit INCOMPLETE header rather than a silent gap), then **retired the Google Drive `.env.local`** (301 bytes, Jun 12, two-line) once the vault copy was verified by use.
- **Corrected repo bookkeeping.** `velayo-os/handoff/` is empty and `velayo-os/docs/` holds only the 2026-06-23 scaffold. **The 2026-08-05 agent-charter handoff was produced on the iPhone and never saved to any repo** — the airlock read clear because the file never landed, not because it merged. It was merged immediately ahead of this entry. The 06-23 entry gates the doc split on OurProvisions reaching production, so the empty `velayo-os` stub is by design.
**Unfinished:**
- **Inspector's credential shape undecided** — dedicated read-only Postgres role vs. `service_role` with a promise. Recommendation stands: a credential that *cannot* write beats one you promise not to write with.
- **Scribe's dependency unverified** — it may need no credential at all if it runs inside a Claude Code session on Dan's existing git credentials. Check before treating Bitwarden as its blocker.
- **No machine account or token created.** The token is shown exactly once, so it was deferred to a session where it can be generated and used together.
- YubiKeys not purchased (two, ~$110 total). **Vercel recovery codes not in the vault** — the gap that caused tonight's lockout.
- **RLS still disabled** on `provision_cycles`, `shopping_sessions`, `known_stores` — which is a live correctness gap in the "the anon key is public by construction because RLS is the lock" claim, not a separate hygiene item.
- **Preview verified by inspection only**, not by an actual preview deploy.
- **Drive `Velayo OS` folder not audited** — a parallel doc set (`SESSION_LOG.md`, `ROADMAP.md` ×2, `CLAUDE_OS.md`, `VELAYO_BRIEF.md`) sits alongside the repo, including **two files literally named `ROADMAP.md` in the same folder**.
**Next session:**
SESSION START
Goal: Unblock Inspector Part A — decide the credential shape, create the read-only Postgres role, create the `inspector` machine account, generate and use the token in the same sitting.
State: Bitwarden account + Velayo org + Secrets Manager live on `dan@velayo.ai`; zero machine accounts created. `.env.local` complete and functionally verified on the Surface and in the vault. Vercel Development scope empty; Preview and Production correct. Drive `.env.local` retired. RLS still off on three tables.
Done when: Inspector can query prod read-only via `bws run` with a credential that **cannot** write, and the token is not stored anywhere on disk in plaintext.
**Files updated:** No source files. Docs: `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DEV_SETUP.md` (three corrections directed by the handoff). Changes that landed **outside git**: `ourprovisions/.env.local` (local, gitignored — Clerk key added), Bitwarden vault (new secure note), Vercel `ourprovisions` project env vars (2 rows rescoped, 1 value cleaned), Google Drive (`.env.local` deleted).
**DB changes:** None. A read-only Postgres role is proposed, not created.

---

### [2026-08-05] — [Velayo OS] — Charter the agent crew: the ladder, the counting rule, and the Dev/Ops/Growth groups
**Goal:** Define what actually counts as an agent — in a way that survives the leverage gauge becoming external positioning — then charter the founding roster.
**Completed:**
- **Established the ladder `Ritual → Seat → Agent`** with the promotion line *"the human may stand at the gate, but not on the assembly line"* and four qualifying conditions (fails visibly / no human between its own steps / deterministically verifiable output / bounded blast radius). **Ruled Scribe a Seat, not Velayo's first agent** — a human is its transport layer.
- **Locked the counting rule** — tasks not seats, binary, no partial credit; phrased **"would otherwise require a human"** (not "used to cost Dan time") so it survives a 30-employee company. Gauge is **company-wide, not per-app**, so the 1:20 target must rise with headcount. **Instruments are equipment, not crew** — Splunk Synthetics doesn't count; the Watchman that reads it does.
- **Promoted Inspector to Agent #1, ahead of Scribe** — Part C static checks need no DB, no secrets, no Bitwarden, and the first hire should be the one that checks the others' work. Adopted **literal crew naming** (Inspector / Scribe / Tester / Fixer / Watchman / Analyst / Migrator) over nautical.
- **Split the proposed "SRE agent" into Watchman (detect) and Analyst (diagnose)** — SRE is a discipline with no gradeable failure condition. Added the **heartbeat requirement** (a silent Ops agent is indistinguishable from a healthy system) and established **restore ≠ repair**, the rule that lets Analyst L1 have hands without breaching the prod boundary — allowlist only, one attempt then escalate.
- **Structured the crew as lanes → squads → groups.** Dev / Ops / Growth is a permanent taxonomy by trigger, clock, and blast radius; squads are per-arc and DevOps by construction. **File agents by blast radius, not where the work starts** (Migrator is Ops). **Charters are fleet-level, instances app-level**; agents justify themselves on platform economics, never "find the current."
- **Added the Growth group** with its own rule — **no Growth agent addresses a human unsupervised: draft, never send.** Chartered Funnel Inspector, Feedback Scribe, Copy Drafter, and set the governing split: **behaviour comes from telemetry, outcomes come from the database** — the R2 invite/depth metric is a `household_members` fact and is never computed from RUM.
- **Set two-tier escalation** — SMS = wake me (app down, L1 couldn't restore, chosen because SMS rides the cell network where the boat/lake lack data); email digest = tell me. **On-call written as a role, not a person.** Produced `AGENTS.md` (9 sections) and merged it to `docs/AGENTS.md`.
**Unfinished:**
- **Ladder event taxonomy undefined** — the closed, named set of R1–R5 events every app implements identically. Gates the Funnel Inspector fleet-wide. Highest-leverage open item.
- Watchman's thresholds are not numeric; Analyst L1's restore allowlist is not enumerated; Feedback Scribe's tagging taxonomy is undefined.
- Business Foundation lane still has zero agents and zero charters.
- **No agent was actually built or promoted** — Inspector remains "in promotion," not hired. This was charter work only; no code was written in either the design session or this merge pass.
- `AGENTS.md` roster is prose referencing OurProvisions-specific artifacts; will want a per-app instance table at app #2. Deliberately not built early.
- Bitwarden remains a blocker for automation past pipeline Stage 0 (unchanged).
- **Scope flag:** this entry is `[Velayo OS]`, not OurProvisions history. It is logged here because the velayo-os repo has no docs yet — it should move on the "Split company log into `velayo-os/docs`" trigger (app #2's first session).
**Next session:**
SESSION START
Goal: Define the ladder event taxonomy — the closed, named set of activation events (R1–R5) that every app fires identically — then verify what Splunk RUM/DEM already captures versus what needs new instrumentation.
State: `AGENTS.md` chartered and merged to `docs/`. Three groups defined (Dev/Ops/Growth). Inspector is Agent #1 in promotion, unbuilt. Growth charters written, unstaffed. Funnel Inspector blocked on the taxonomy.
Done when: a named event list exists with each event's source declared (telemetry vs. database), the R2 invite pivot is explicitly assigned to the database, and the gap between "already captured" and "needs building" is written down.
Watch-outs: this is the last cheap moment to get the taxonomy right — divergent per-app events defeat the fleet-charter model. The taxonomy itself stays Velayo OS; the instrumentation build routes to OurProvisions.
**Files updated:** `docs/AGENTS.md` (**new** — routed from `handoff/AGENTS.md` per the handoff's `## DROPPED_FILES` manifest), `docs/SESSION_LOG.md`, `docs/ROADMAP.md`. No source files. `docs/ARCHITECTURE.md` deliberately untouched — the new patterns are company-operating-layer, not app architecture (the activation-ladder events become an app-architecture concern at instrumentation time, not now). Design handoff (2026-08-05) consumed + deleted.
**DB changes:** None.

---

### [2026-08-03] — [OurProvisions] — Ship RELEASE-2026-08 (dev→main) to production
**Goal:** Close the merge blockers and ship the accumulated dev delta — RLS authorization Part 1 (`030`), the splash horizon arc, and supporting work — to prod as one coordinated apply-030-then-merge sequence.
**Completed:**
- **Shipped RELEASE-2026-08 to prod** (`origin/main` `1a13e98`→`8cbbf43`): applied `030` to the prod DB, then fast-forward merged dev→main and pushed; Phase 3 verified on device (invite feedback, no meals tab / zero meals requests on the list view, core loop intact). Includes the splash horizon arc (v3 raster, ground gradient darkened downward, arc placed as a wordmark-scaled lockup).
- **Closed B1 and corrected its rationale** — `acceptInvite` (the only `join_household` caller) was **dead code**, so `db5ec66` never called the RPC at runtime; the mismatch was real only once the new fix added a live call. Applying `030` to prod was therefore **window-free** (the current prod frontend's only live `household_invites` op is `createInvite`'s INSERT).
- **Fixed the bad-invite feedback regression** (`90d5b92`) — the `?invite=` path runs through `bootstrap_new_user` and fell silent on a bad code; added a bootstrap fallback that calls `join_household(text)` and surfaces its specific error ("Invite not found." / "…already used." / "…expired."). This is the live call that makes the `030` dependency genuine.
- **Verified `030` on dev then prod (B2)** — F2 (rejoin revives, no unique violation), F5 (server `upper`+`trim`), F6 (three distinct errors incl. deleted-household fold), F8 (non-member reads zero invite rows via authenticated PostgREST, cross-checked against a member seeing rows) all pass; prod read confirmed single `join_household(text)`, `invites_select` = `is_member_of(household_id)`, no anon.
- **Flag-hid the Browse Meals lens (B6, `8cbbf43`)** — `MEALS_ENABLED=false` gates the tab entry, lens body, `loadMeals`, **and the list-view `fetchMealProvenance`** (which reads `list_item_meals`/`meals` on the core path); ships the code, hides every reachable path to prod-absent meals objects.
- **Corrected the `search_path` audit six→five** — `bootstrap_new_user` was already pinned by `029`; an observed `proconfig is null` read on prod + dev returned an identical five-function set (no drift). Fixed in ROADMAP + spec Part 5; SESSION_LOG addendum on the 07-31 entry.
- **Resolved the stale-local-main hazard** — `merge --ff-only origin/main` caught local main up from the Jul-19 pointer before merging dev; fast-forward push only, no force-push.
**Unfinished:**
- **Defect (2):** `join_household` raises `P0002` as **HTTP 500** (should be 4xx) — every bad-invite attempt logs a server error in Splunk. Needs a migration change; logged to ROADMAP, out of this release.
- **B7 — ARCHITECTURE reconciliation:** the `join_household` catalog entry + the resolved authorization Known-Debt items updated this session for `030`-to-prod; a full sweep of the remaining stale items remains.
- Meals migrations `025`/`026` to prod = a separate decision for a separate session (lens stays flag-hidden until then).
- Authorization Parts 2, 3, 4b, 5 and the five unpinned `search_path` functions remain open.
- **B4 — rotate the two exposed Splunk tokens in Vercel** (flagged highest-priority; independent of the release) and **B5 — verify session-replay masking** (`maskAllText:false`/`maskAllInputs:true`) on a preview deploy — both still open (from the design handoff).
- **Prod RUM is blind** — Splunk RUM ingest failing on prod (CORS + 503 against `rum-ingest.us1.observability.splunkcloud.com`); cause unknown, may relate to the exposed tokens.
- **Clerk is loading with DEVELOPMENT keys on production** (observed in the prod console during verification; dev instances carry strict usage limits).
- **Invites are URL-only** — no join-by-code field (an invite by voice/phone/screenshot can't be redeemed), and the desktop share falls through to the OS share sheet with no obvious copy-link.
**Next session:**
SESSION START
Goal: Operational cleanup first (design handoff) — (1) rotate the Splunk tokens, (2) investigate the prod RUM ingest failure, (3) verify session-replay masking, (4) finish the ARCHITECTURE sweep (B7) — then feature work: `031` (cycle integrity) + the `025`+`026`+`031` prod batch, or Authorization Part 2.
State: RELEASE-2026-08 live on prod (`8cbbf43`); `028`/`029`/`030` all live on the prod DB; meals lens flag-hidden; local main = origin/main = `8cbbf43`. ⚠️ Prod RUM blind + Clerk on dev keys.
Done when: Splunk tokens rotated (new live, old revoked, RUM still reporting) + prod RUM flowing again or cause logged + replay masking watched-and-confirmed + B7 leaves no ARCHITECTURE entry describing a defect `028`/`029`/`030` resolved; then the chosen feature milestone (031 index proven on prod, or Part 2 JWT-derived + dead overloads dropped, verified dev→prod).
**Files updated:** `RELEASE-2026-08.md`, `src/App.js`, `src/hooks/useProvisions.js`, `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/specs/active/SPEC_rls_and_rpc_authorization.md`, `docs/assets/splash/SPLASH_ARC_EXTRACTION.md` + `README.md` (routed from the 2026-08-03 design handoff, now consumed + deleted)
**DB changes:** **Migration `030` applied to PROD** — `join_household(uuid)` dropped for `join_household(p_invite_code text)`; `invites_select` re-scoped `qual=true` → `is_member_of(household_id)`; `anon` EXECUTE + table grants revoked. (`028`/`029` already on prod since 2026-07-31.) `025`/`026` NOT on prod.

---

### [2026-07-31] — [OurProvisions] — Ship Part 1 to dev, then re-scope the remaining queue against measured evidence
**Goal:** Ship Part 1 — `join_household` validates the invite server-side — dev-green, with the client-side pre-flight deleted and `household_invites` SELECT locked to members.
**Completed:**
- **Shipped migration 030 to dev** (`db5ec66`): `join_household(p_invite_code text)` returning `{household_id, household_name, revived}`; `join_household(uuid)` **dropped**; `anon`/`PUBLIC` EXECUTE revoked; `invites_select` re-scoped `qual = true` → `is_member_of(household_id)`; `anon` table grants revoked. Evidence pair captured: `join_household_uuid` 1→0, `join_household_text` 0→1, `invites_select_qual` `true`→`is_member_of(household_id)`, `anon_select_on_invites` true→false. `invites_insert`/`invites_accept` and `household_invites_code_key` confirmed untouched.
- **Found the exploit was worse than the spec described** — no out-of-band code needed. `invites_select` was `qual = true`, so any authenticated account read **every invite row in the system**, and `join_household` took the bare `household_id` those rows handed over. **Blast radius: 9 of 23 live prod households (39%).** `live_redeemable = 0` was no protection — the RPC never consulted invite state, so a dead invite still leaked a permanently valid UUID.
- **Verified F1, F3, F4 on the deployed dev preview** with two real accounts, and confirmed the member no-op does **not** consume the invite (`accepted_at`/`accepted_by` still NULL after).
- **Dated the cycle-integrity evidence — it is archaeology, not a live defect.** All known-bad prod rows sit in a 48-hour window, 2026-07-14→07-16; **nine cycle-closes across three households since, zero new violations.** Query 2's BVI/Carrots shape is **absent from prod entirely**.
- **Found the 025/026 prod gate inverted and dissolved it.** The observed corruption is exactly what `026` prevents, so withholding it kept prod on the **unfixed** insert path. 025+026+031 now ship to prod as one SQL batch.
- **Retired 027 as a number; the work becomes 031.** Claimed in prose five times, never written to disk, while 028/029/030 shipped. No stub — the 026→028 gap joins 009–012 and 017 as honest drift.
- **Closed the disclosure decision as NOT WARRANTED**, and adopted a stopping rule: authorization work closes after Part 2; new findings go to ROADMAP unspecced until meals ships.
**Unfinished:**
- **F2, F5, F6 not run** — `revived` flag, lowercase-code normalization, the three error strings. Low-risk literals in the function body.
- **F7/F8 verified structurally, not from a running app.** `supabase` is module-scoped rather than on `window`, and no Supabase token sits in `localStorage` because auth is Clerk-brokered. F7 rests on `join_household_uuid = 0` + `overloads = 1`; F8 on the policy `qual`. Honest, but neither is a console query. **A second account that is a member of nothing would settle F8 properly.**
- **030 is on dev only. NOT on prod.** Parts 2, 3, 4b remain, plus the `search_path` item on six SECURITY DEFINER functions.
- **`joined_at` divergence found and deliberately not fixed** — membership revive does not reset it, so a leave-and-rejoin user still sorts by original join in `029`'s cold-start resolution.
- Multi-use invites: design settled (Option A), build not scoped.
- 031 unbuilt. `main` 17 commits behind `dev`, deliberately closed.
**Next session:**
SESSION START
Goal: Ship **031** (cycle integrity) to dev, then promote **025 + 026 + 031 to prod as one SQL batch** — the step that unblocks meals.
State: 030 applied + verified on dev, `dev` pushed, `main` deliberately closed. Authorization Parts 4a, 0 and 1 shipped (1 dev-only); 2, 3, 4b open and all account-required. Cycle-integrity evidence dated as testing-era residue. Disclosure closed.
Done when: `Our calendar` holds one open cycle with 16 live items; `uq_open_cycle_per_household` exists and is proven by a **failed** duplicate insert on a throwaway dev household; the two stranded Lake house rows are **repointed, not deleted**; and 025+026+031 are live on prod with a real user in `Our calendar` seeing 16 items unchanged.
Watch-outs: **The two Lake house rows must not be tombstoned** — they are live rows on a real user's list, so deleting them turns an accounting cleanup into a user-visible edit. **`create index concurrently` cannot run inside a transaction** — bare auto-commit statement, on its own. The prod batch is **SQL only**; no client change rides along, so the merge gate stays closed until create-meal UI lands.
**Files updated:** `migrations/030_join_household_invite_validation.sql` (new, applied dev, `db5ec66`); `src/hooks/useProvisions.js`; `docs/specs/active/SPEC_rls_and_rpc_authorization.md` (patch merged); `docs/specs/active/SPEC_cycle_integrity_031.md` (new); `docs/SESSION_LOG.md`; `docs/ROADMAP.md`; `docs/ARCHITECTURE.md`
**DB changes:**
- **030 (dev only)** — `create or replace function public.join_household(p_invite_code text) returns json`, SECURITY DEFINER, `search_path` pinned. `drop function public.join_household(uuid)`. `revoke execute … from public, anon`; `grant execute … to authenticated`. `drop policy invites_select` + recreate `for select to authenticated using (is_member_of(household_id))`. `revoke all on public.household_invites from anon`. One transaction.
- **Dev test data:** invite `JV4ZAR` hand-expired for F4; TEST household and DT membership created during verification.

---

### [2026-07-31] — [OurProvisions] — Ship the two highest-severity authorization defects to prod, verified from outside the database
*(Session ran 2026-07-30 → 07-31; decisions dated 07-30 where made.)*
> **Addendum 2026-08-02:** the "six SECURITY DEFINER functions with no pinned `search_path`" recorded below is **five** — the sixth, `bootstrap_new_user`, was pinned by `029`; confirmed by an observed read-only `proconfig is null` query on prod + dev (identical set, no drift). See ROADMAP + SPEC Part 5. *(Correction appended; original entry unchanged.)*
**Goal:** Begin the five-defect authorization spec at Part 1 — instead re-ordered by measured exposure and shipped the two defects that outranked it.
**Completed:**
- **Shipped migration 028** — `revoke all` from `anon` on `known_stores`, `provision_cycles`, `shopping_sessions`, dev + prod. Verified from outside the database with the bundled anon key: prod `provision_cycles` went from `206 / Content-Range: 0-0/56` to `401 / 42501 permission denied`.
- **Shipped migration 029** — household + account liveness in `is_member_of` and `bootstrap_new_user`, dev + prod, both `CREATE OR REPLACE`d in place with OIDs unchanged (dev 18480 / prod 43112). Verified by calling the real function with an injected JWT subject: `Test House 200` (deleted 2026-07-10) `true → false`, three live households unchanged.
- **Re-ordered the spec by credential requirement.** `anon` held full DML on 56 live prod `provision_cycles` rows with no account at all — that outranks Parts 1–3, which all require an authenticated identity. Split Part 4 into 4a (revoke, near-zero regression surface) and 4b (RLS + policies, still required).
- **Diagnosed the `is_member_of` / `bootstrap_new_user` compound bug** and established the two must ship in one migration: `is_member_of` alone leaves a user resolved into a household they can neither read nor write.
- **Decided `users.deleted_at` means "account closed"** (no writer anywhere — no trigger, no function, no client code; six hand-set dev rows, zero on prod), and cold-start household resolution orders by `hm.joined_at desc`.
- **Established that migration 027 exists only in prose** — five references across ROADMAP and inside the bodies of 025 and 026; no file anywhere in the repo.
- **Reversed a drafted `raise` to a fall-through** on the dead-household invite branch after tracing that the rollback kills the step-1 user upsert and `useProvisions.js:319` throws before `:323` clears `sessionStorage` — wedging signup permanently.
**Unfinished:**
- Parts 1, 2 and 4b of the authorization spec, plus a newly-identified sixth item: six SECURITY DEFINER functions with no pinned `search_path`.
- **`docs/specs/active/SPEC_rls_and_rpc_authorization.md` still argues the original 1→2→3→4 ordering, which this session disproved.** Live trap — a future session reading it builds the wrong part first. Correcting it is the first action next session.
- `household_invites` RLS policies still uninspected. Blocks Part 1.
- 027 still unwritten and still nominally gates the 025+026 prod deploy.
- Beta disclosure decision still open — now sharper: full unauthenticated DML on live household data, indefinite window, no logging that would show exploitation either way.
- Test/dev data purge parked deliberately; reframed as retention, not cleanup.
- **028 (`559bfca`) and 029 (`8944f63`) committed, NOT pushed.** `origin/main` is 15 commits behind `dev`.
**Next session:**
SESSION START
Goal: Ship **Part 1** — `join_household` validates the invite server-side — dev-green, with the client-side pre-flight lookup deleted and `household_invites` SELECT locked to members.
State: 028 and 029 live on dev and prod, both verified from outside the database. `is_member_of` checks household and account liveness; `bootstrap_new_user` checks household liveness on both the invite and cold-start branches, orders deterministically, and has a pinned `search_path`. The no-credential path to `provision_cycles` is closed. `authenticated` still holds full unfiltered DML on all three previously-exposed tables — 4b remains required.
Done when: `join_household(uuid)` is gone; its replacement validates the invite server-side **including `households.deleted_at`**; `anon` EXECUTE revoked; the client-side pre-flight lookup deleted with three distinct server-raised error messages replacing it; `household_invites` SELECT locked to members; invite-accept and rejoin-after-leave both verified on the deployed dev preview.
Watch-outs: **`household_invites` policies were never inspected** — if a permissive SELECT policy exists, every live invite code is readable by anyone holding the bundled anon key, which is a zero-account path into any household and would outrank Part 1 itself. Inspect before drafting. Also: the merge-to-main gate is closed and one push from opening — nine of the fifteen unpushed commits are meals work whose client code would ship to prod against a database with no `meals` tables.
**Files updated:** `migrations/028_revoke_anon_unprotected_tables.sql` (new, applied dev + prod, `559bfca`); `migrations/029_household_liveness.sql` (new, applied dev + prod, `8944f63`); `docs/SESSION_LOG.md`; `docs/ROADMAP.md`; `docs/ARCHITECTURE.md`
**DB changes:**
- **028** — `revoke all on public.known_stores, public.provision_cycles, public.shopping_sessions from anon`. Dev + prod. No PUBLIC grant reaches `anon`; `authenticated` retains SELECT/INSERT/UPDATE/DELETE on all three.
- **029** — `is_member_of(uuid)` joins `users` and `households`, filtering `u.deleted_at is null` and `h.deleted_at is null`. `bootstrap_new_user(text,text,text,text)` gains a household-liveness join on the invite branch (fall-through, not raise), a household-liveness join plus `order by hm.joined_at desc` on the cold-start branch, and `set search_path = public, extensions`. Dev + prod, replaced in place, OIDs unchanged.

---

### [2026-07-30] — [Cross] — Wire Claude Code to Supabase; five authorization defects found and specced
**Goal:** Integrate Claude Code with Supabase so database truth can be verified directly instead of from docs or pasted output — then act on whatever that surfaced.
**Completed:**
- **Wired Claude Code to Supabase via project-scoped MCP** — `supabase-dev` + `supabase-prod-readonly`, both `read_only=true`, both scoped by `project_ref`, in `.mcp.json`. **Landed in two commits:** `8c907aa` added the **dev** server only (pushed); the **prod read-only** server followed in a separate local commit this session (unpushed). Convention set: one registration per environment, environment named in the server name, never edit-and-swap a single entry. Scoping proven **by evidence** (025 meals tables present on dev, absent on prod, project URL confirmed both ways) rather than by label.
- **Found RLS disabled on `known_stores`, `provision_cycles`, `shopping_sessions` in BOTH dev and prod** — no policies, and the full Supabase default grant (SELECT/INSERT/UPDATE/DELETE/TRUNCATE) to `anon` and `authenticated`. The anon key ships in the client bundle, so this path needs no account at all.
- **Traced that into four further defects** — `join_household` performs **no invite validation** (any authenticated user joins any household by UUID; all invite checks are client-side JS); `bootstrap_new_user` trusts a client-supplied `p_clerk_id` (anon-callable impersonation: overwrite a user's email/name, join a household as them); `household_members_insert` is `WITH CHECK (true)`; and soft-delete does not cascade to `household_members`.
- **Wrote `SPEC_rls_and_rpc_authorization.md`** — four parts, each with finding / one-line exploit / fix SQL / verification, plus commit-and-migration plan. Named the common root: **the server trusts client-supplied values instead of deriving them from the JWT**, and sound invite validation already exists inside `bootstrap_new_user` — merely unreachable from the path the client uses.
- **Corrected the fix ordering under review.** The first-argued basis (Part 4 subordinate to Part 1) was wrong: they cover **different attack populations** — Part 1 needs an authenticated account, Part 4 needs nothing — so Part 1 alone leaves the zero-barrier path open. Kept 1→2→3→4, re-argued on the real basis: **Part 4 is the only part touching the core loop (seven call sites), making the SQL-only change the highest-regression-risk of the four**, not the safest.
- **Counted prod directly and found the working figures wrong by an order of magnitude.** `list_tables` reports `reltuples` planner estimates, not counts. Prod is **21 users / 23 live households / 31 live memberships / 19 people with a live membership / 50 live cycles** — not the "2 households, 3 members" a disclosure decision had briefly been closed on. Reopened it.
- **Established the soft-delete cascade gap has a live consequence, not just one stale row** — `bootstrap_new_user` resolves the caller's household with `limit 1`, no `ORDER BY`, filtering `household_members.deleted_at` but not `households.deleted_at`; one named prod user with 4 live memberships (one to a deleted household) can be resolved into it on cold start. `is_member_of()` carries the identical omission.
**Unfinished:**
- **Nothing applied to any database.** Read-only session throughout; the spec is written, twice-reviewed, and unbuilt.
- **Disclosure is an open decision for Dan.** The spec's original "not warranted" rested on the bad count. 19 people across 23 households is a real beta population. The spec lays out the neutral points — no confirmed disclosure of user text (unlike the 2026-07-18 `catalog_items` exposure), no exploitation observed, no logging that would prove absence either way, long unknown window. The call has not been made.
- **`is_member_of()`'s soft-delete gap must be resolved BEFORE Part 4 ships, not after** — membership in a deleted household currently satisfies every RLS policy in the schema, so the new Part 4 policies would inherit the gap.
- **Parts 1–3 were confirmed against prod only.** Dev's function signatures, grants, and `household_members` policies are unverified; reconciliation queries are in the spec. Part 4 is confirmed in both.
- **`household_invites` policies were never inspected** — blocking for Part 1's pre-flight invite lookup (a not-yet-member reads that table today; something permits it, unknown what).
- **027 / the 025+026 prod gate untouched** and now sits behind this work.
- **Process note:** the spec was drafted by Claude Code rather than the design chat, inverting the standing division of labor. Caught mid-flight, allowed to finish, and corrected across two review rounds instead of restarted. Proximity-to-code is a real argument but not sufficient to flip the pattern — **specs originate in the design chat.**
**Next session:**
SESSION START
Goal: Ship Part 1 of `SPEC_rls_and_rpc_authorization.md` — `join_household` validates the invite server-side — dev-green.
State: MCP live and committed, dev + prod both read-only. Spec written, twice reviewed, routed to `docs/specs/active/`. Nothing applied to any database. Disclosure decision open. `is_member_of()` soft-delete gap open and gating Part 4. 027 gate still open behind all of it.
Done when: `join_household(uuid)` is gone; `join_household(text)` validates the invite server-side with `anon` revoked; invite accept AND rejoin-after-leave both verified on the deployed dev preview; and the browser-console exploit (`rpc('join_household', {p_household_id})`) returns *function does not exist*.
**Files updated:** `.mcp.json` — **two commits, not one**: the `supabase-dev` server in `8c907aa` (pushed), the `supabase-prod-readonly` server in a separate local commit this session (unpushed; SHA omitted deliberately — local commits get rewritten). `docs/specs/active/SPEC_rls_and_rpc_authorization.md` (routed from `handoff/`), `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`
**DB changes:** None — read-only session throughout, nothing applied to dev or prod.

### [2026-07-29] — [OurProvisions] — Ship the meals add-path (025) to dev + fix the resurrect/cycle-integrity defects it surfaced (026)
**Goal:** Get migration 025 (meals + `add_meal_to_list`) dev-verified, and resolve the `list_items` provenance + cycle-handling problems the new add-path exposed.
**Completed:**
- **Built + migrated 025 to dev** — `meals`, `meal_ingredients`, `list_item_meals` (RLS on, 11 policies, all FKs `ON DELETE CASCADE`) + `add_meal_to_list`. Hardened the RPC: server-side cycle resolution (client `p_cycle_id` = hint only), `deleted_at IS NULL` on all cycle lookups, `pg_advisory_xact_lock` per household, auto-open when none, `REVOKE EXECUTE … FROM PUBLIC, anon` (SECURITY DEFINER bypasses RLS — the membership guard mustn't be the only gate).
- **Built the Browse Meals lens** — read + "Add all" + "Multiple meals"/"from {meal}" badge; committed re-runnable dev fixture (`dev_meals_seed.sql`, explicit-id target that echoes where it landed). Create-meal UI deferred by design (Option-2); `createMeal` exists in the hook, unused.
- **Fixed the phantom-meal-badge defect** Dan found using the app normally (manual add after clear-all resurrected a tombstone and inherited its dead provenance). Root cause: per-RPC fixes left `updateQty`/`updatePrice` (client-direct writes) uncovered. Resolved with a **`BEFORE UPDATE` resurrect trigger** (026) — the only place all five resurrect paths pass — that clears provenance and re-resolves `cycle_id`; also converted `insert_list_item` to plpgsql server-side cycle resolution.
- **Verified 025 + 026 dev-green end-to-end, evidence behind every line** — RPC auto-open, increment, idempotent provenance, tombstone→meal-add reset, tombstone→**manual**-add with no phantom badge, both trigger branches, anon RPC denied (401/`42501`), cross-household RLS on `meals` in a real browser.
- **Traced six pre-existing cycle-integrity defects the meals work surfaced, three in prod** — 3 live items stranded in closed cycles; 2 items inserted into an already-closed cycle; 1 live household ("Our calendar") with two open cycles holding 2 and 14 items. Root cause: `activeCycleRef` is a boot-set client cache with no cycle realtime, and every legacy open path guards on the ref, not the DB.
- **Scoped 027 as one "cycle integrity" pass and promoted it ahead of the 025/026 prod gate** — won't ship an add-path whose fallback picks newest-open into a state we haven't fixed. Established the meal-FK **CASCADE carve-out** (tripwire, not policy) and the **"provenance dies with the row"** principle.
**Unfinished:**
- **025 + 026 not in prod** — gated behind 027 by decision, not by any defect in the meals code.
- **027 not opened.** Order agreed: detector first (known-bad prod data to fire it against), then server-side open-cycle resolution replacing the client-ref guards, then the unique index, then cleanup.
- **"Our calendar" merge is a design question** (2 vs 14 live items across two open cycles — rewrites a real user's list); needs a reviewed proposal before execution. 3 stranded prod rows left untouched deliberately — they're the only evidence of Bug A until the sweep is understood.
- **Test A** (authenticated non-member calling `add_meal_to_list`) not directly exercised — inferred only (anon denial at the grant layer, cross-household read denial in-browser, `is_member_of` proven `false` not NULL with no JWT). Prod live-RLS test must run it directly.
- **Create-meal UI absent** (next PR — 025 isn't user-complete without it). Meals lens empty-state copy instructs rather than describes until it lands. Duplicate household names on dev (switcher shows names) — logged to 027.
**Next session:**
SESSION START
Goal: Open 027 cycle integrity — build the detector, then replace the client-ref guards in every cycle-open path with server-side resolution.
State: 025 + 026 dev-green and verified on `dev.ourprovisions.velayo.ai`; both held at the prod gate. Prod carries 3 stranded rows + 1 household with two open cycles. Meals lens is read + "Add all" only; no create UI.
Done when: The detector fires against the known-bad prod data (never ship an alarm we haven't watched fire), and no cycle-open path can produce a second open cycle for a household.
**Files updated:** `migrations/025_meals.sql`, `migrations/026_resurrect_integrity.sql`, `migrations/fixtures/dev_meals_seed.sql`, `src/hooks/useProvisions.js`, `src/App.js`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/SESSION_LOG.md`
**DB changes:** 025 + 026 applied to **dev only** (`zxwtxjjmssykhqrghouf`). New tables `meals`/`meal_ingredients`/`list_item_meals` (RLS, 11 policies, all FKs `ON DELETE CASCADE`); new RPC `add_meal_to_list`; new trigger `trg_list_items_resurrect` + fn `list_items_resurrect_cleanup`; `insert_list_item` rewritten to plpgsql (server-side cycle); `PUBLIC`/`anon` EXECUTE revoked on `add_meal_to_list`. **Prod (`parpauldmbetptkmdwbd`) unchanged.**

### [2026-07-29] — [OurProvisions] — Meals data model (buildable) + giving meals between households (design)
**Goal:** Design the meals feature (meals-as-lens that fills the shared list) down to a buildable data model, and design person-initiated meal giving between households.
**Completed:**
- **Specified the meals data model** — `meals` (household-owned, `base_servings` scaling seam, `created_by`, soft-delete), `meal_ingredients` (FK to `catalog_items` — **load-bearing:** the FK is what lets a meal flow to the list; `quantity_per_serving`), and a `list_item_meals` provenance JOIN. Two approved specs → `docs/specs/active/` (`SPEC_meals_model.md`, `SPEC_meal_sharing.md`).
- **Chose scaling-ready schema + simple behavior** — store `quantity_per_serving` + `base_servings` (=1) day one, defer the serving dial; the recipe-with-scaling option (3→1) becomes additive later, no migration/rewrite. Resolved that the two existing mockups encoded two different mental models (recipe-with-scaling vs. labeled bundle).
- **Chose one-row-per-item + "Multiple meals" badge** over per-meal rows (`uq_live_list_item` holds — the shopper doesn't care which meal a lemon is for); **JOIN table over array column** for meal↔item links (referential integrity on the sacred shared list).
- **Drew the OurProvisions/OurChef boundary: places vs. people.** Copy (snapshot, drift-OK) = household op (OurProvisions); reference (live-sync, evolving) = person op (OurChef) and a natural OurChef signup driver. Closed copy-vs-reference as a product split, not a toggle.
- **Specified giving meals** — a `meal_shares` pending-offer ("doorbell") table, **accept-first** flow (the copy happens at ACCEPT, not at give — protects the shared list), batch-accept pre-checked, "{name} (from {giver})" on name collision. User-facing verb = **"give"** (leaves your hands, becomes theirs — accurate, not just warmer).
- **Incorporated external review feedback** — added the thank-you moment (at accept; optional, once, never nags), a lineage breadcrumb on the copy (`copied_from_meal_id`/`_household_id`/`copied_at` — provenance only, NEVER sync), and resolved `created_by` = preserve the original author (feeds OurChef lineage).
- **Held context/events + people-owned meals explicitly OUT of scope** (their own sessions), while protecting the `created_by` + lineage seams that keep those futures possible.
**Unfinished:**
- Nothing built — design session; all work is spec.
- **Open in meals model:** how a `list_item` tracks meal-contributed vs. manually-added quantity (needed for the remove-a-meal flow; NOT needed for the add path).
- **Open in giving:** thank-you delivery channel; stale pending gift on source deletion; duplicate-offer blocking; who-can-give.
**Next session:**
SESSION START
Goal: BUILD the meals model — migration for `meals`, `meal_ingredients`, `list_item_meals`; the add-a-meal-to-list path; the Browse-lens UI (both mockups drawn). Scope = **add-path only**; defer remove-a-meal and giving to later builds.
State: Two approved specs in `docs/specs/active/` (`SPEC_meals_model.md`, `SPEC_meal_sharing.md`). Phase-1 schema live in prod; Household→Place rename live. No meal tables exist yet. Two meal mockups exist in `docs/mockups/`.
Done when: The three tables are migrated (dev first, verified, then prod), a meal can be created + added to the shared list with correct quantities and "Multiple meals" provenance, and the Browse-lens renders against real data. A **live RLS test** proves a non-member cannot read/write another household's meals.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` (this SESSION END). Routed: `docs/specs/active/SPEC_meals_model.md`, `docs/specs/active/SPEC_meal_sharing.md`.
**DB changes:** None yet (three tables + `meal_shares` designed, not migrated — migration number assigned at point-of-build).

### [2026-07-28] — [OurProvisions] — Household→Place rename built to dev; app IA redesigned around meals + a consumption-signal strategy (design)
**Goal:** Rename the user-facing "Household" concept to "Place" (build), and — from the design chat — rethink the tab structure and the meal/list model end-to-end and frame the product against a single strategic thesis.
**Completed:**
- **Built the Household→Place user-facing copy rename** (`b93c64e`): 28 strings across `App.js` + `useProvisions.js` (toasts, confirms, aria-labels, placeholders, headings/labels, the share/invite copy, `setError` diagnostics). **Schema, RPCs, storage bucket, React identifiers, and the grocery aisle category "Household" all untouched** — copy-only by design (schema generalizes to `contexts` when Events lands, not to `places`). **Verified on dev + promoted `dev→main` to production 2026-07-28** — now LIVE on `ourprovisions.velayo.ai`; spec → `docs/specs/built/`.
- **Extended past the spec's drifted line-map** where it was incomplete (renamed omitted user-facing strings: `Your Households`, `Delete household`, the `Household name` label, remove-member + delete-item confirms) so the UI isn't a half-rename. **Deliberately left `App.js:943` `name !== "My Household"`** — a sentinel comparison against the DB-seeded default name (migration 006 / baseline / `ActiveHouseholdContext.js`), NOT display copy; changing it while the DB still creates "My Household" households would break the join-banner guard.
- **[design] Settled nav = HOME / PLAN / BROWSE / SHOP** — split "plan the week" (PLAN) from "build the list" (BROWSE) as genuinely different jobs; PLAN absorbs the old coming-soon placeholder.
- **[design] Designed BROWSE as a two-lens list-builder** (Ingredients ⇄ Meals) — one shared list viewed two ways, with a persistent conversational "talk to me" composer threaded under both lenses; an edit through either lens is the same realtime write.
- **[design] Established the meal↔item model** — meals carry a servings multiplier; each recipe ingredient stores a per-serving amount (stable = "the recipe"); list qty = per-serving × servings, override-able ("Have it" = override to 0). Recipe stays stable; only the shopping instance changes. Validated against two real household workflows (Dan zeroing spaghetti; Helen swiping mozzarella) as the same edit through different lenses.
- **[design] Built the consumption-signal strategy** — ten household problems → two sensors (list = intention, receipts = ground truth) → one consumption signal → capabilities tiered now/later. OurProvisions' defensible asset = the household's **live consumption signal**, not the list. Sequenced the build: **Meals → Plan → Receipts**.
**Unfinished:**
- **[design] 3-vs-4 doors unresolved** — does PLAN-the-week fold into HOME (→ HOME/BROWSE/SHOP), or does the app move to four doors? The tri-hull triad was a design goal.
- **[design] Swipe-left semantics** — set-to-zero (lens-consistent, recoverable) vs. remove-from-instance (matches "gone")? Leaning set-to-zero; Dan makes the gesture-feel call.
- **[design] "Have it" binary vs. quantity** — override-to-0 means "buy none"; the slow-tail provisions/inventory vision eventually needs "have *some amount*." Flagged, not designed.
- **[design] HOME surface content designed, not built**; the PLAN→HOME label is deferred until the surface proves what it is (behavior before label).
**Next session:**
SESSION START
Goal: Design the Meals surface — the meal↔item data model and the two-lens BROWSE Meals view.
State: OurProvisions beta live at `ourprovisions.velayo.ai` (collaborative list, households, waste tracker, realtime on `list_items`). Places rename verified + LIVE on prod. This session's design work is design-only — nothing built beyond the rename.
Done when: We've resolved where meals come from (seed / user-created / AI-generated / imported — the recipe → per-serving-ingredient data model) and mocked the Meals lens against real meal data. Do NOT design Meals UI before the meal-source question is answered — a Meals lens with no meals to fill it is the failure mode.
**Files updated:** `src/App.js`, `src/hooks/useProvisions.js` (rename build, `b93c64e`); `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md` (this SESSION END). Routed: `docs/specs/active/SPEC_places_rename.md`, `docs/mockups/mockup_browse_ingredients_meals_filter.html`, `docs/mockups/mockup_browse_meals_servings.html`.
**DB changes:** None.

### [2026-07-27] — [OurProvisions] — Splash promoted to production; prod Clerk cutover unblocked (DNS/SSL cleared, user migration half-executed)
**Goal:** Ship the finalized splash to production, and (design chat) advance the prod Clerk cutover — clear the DNS/SSL block and migrate the keeper users without orphaning live households.
**Completed:**
- **Promoted the splash to production** — merged `dev→main` (`30345d7`) shipping resolve-in-place (`8c16e46`) + shake fix (`5be6f0a`) + "Shop smarter. Shop faster." tagline (`0ed3f3e`) + Clerk key env-drive (`a652a52`) + the 2026-07-24 prod-clerk docs (`a680af9`); clean merge, pushed `origin/main` → Vercel prod deploy triggered. **No env vars touched** — Production Clerk key stays `pk_test_`, so the guard passes and auth is unchanged. Then promoted this session's SESSION END docs (`868fa3d` → merge `16a6cc4`); `dev` and `main` now in content sync.
- **[Clerk cutover] Cleared the DNS/SSL wall** that blocked two sessions: 5 Clerk CNAMEs verified live + grey-cloud (zone-file confirmed), Clerk re-verify → **DNS Verified, SSL Issued**. Prod Clerk now **live over TLS** at `clerk.ourprovisions.velayo.ai` (issuer `https://clerk.ourprovisions.velayo.ai`, API version `2025-11-10` — matches dev, so `sub`-claim shape is consistent).
- **[Clerk] Chose Path A** (reconcile `users.clerk_id` by email post-creation) over Path B (externalId re-architecture) for this cutover — Clerk can't transfer users dev→prod (mints new subs). Ran a prod census: **12-row keeper roster**, every email resolves 1:1, all `deleted_at` null; captured each `users.id`, dev sub, and `live_memberships`. Confirmed `users.email` is `unique not null` → safe join key.
- **[Clerk] Found `bootstrap_new_user` upserts `on conflict (clerk_id)`** — so a post-flip login by an **un-reconciled** user throws an email-unique violation (a hard error, not just an empty app). Proves **reconcile-BEFORE-flip is mandatory**; reconciled users self-heal through the conflict branch.
- **[Clerk] Proved the reconciliation pipeline end-to-end on the pilot** (Dan Test User): invite → capture prod sub → id-keyed `UPDATE` → verify read-back (dev sub → prod sub confirmed). Sent invites to the roster; **8/12 accepted + subs captured.**
- **[Clerk] Reversal:** Dan Test User is now a **keeper** that migrates to prod (2 live memberships), overriding last session's "delete/dev-only."
**Unfinished:**
- **Splash prod deploy:** the `main` push triggered the Vercel build; **production visual verification NOT yet confirmed** (splash resolves, new tagline, no shake, app loads signed-in) — pending Dan's hard-refresh check.
- **[Clerk] 4 subs uncaptured** (pending acceptance): Christopher, Heddi, Jean, Michael. **CUTOVER GATE:** Christopher (4 memberships), Heddi (2), Jean (1) still gate the flip; Aidan (0) / Michael (0) do NOT gate.
- **[Clerk] Only the pilot is reconciled** — the other 7 captured subs are staged but NOT yet `UPDATE`'d (held for cutover; a reconciled-but-not-flipped user's live login is broken until the flip, so run the real UPDATEs close to the flip). Cutover Stages 3–6 not done: Supabase issuer re-point, `pk_live_` flip, deploy, cutover verify, deferred OurBanner storage-RLS + EXIF-upright checks.
- **[Clerk] RISK — the migration tracker `.xlsx` is the SOLE record of captured prod subs**, on Dan's machine, not in repo/Drive (single point of failure). Tracker hygiene: a stray sub value on Helen's row; confirm/clear Heddi's "Accepted" flag.
- Marketing-site tagline still old (`ourprovisions-landing` unreachable from the build env).
**Next session:**
SESSION START
Goal: Execute the prod Clerk cutover once the gating membership-holders (Christopher/Heddi/Jean) are accepted + sub-captured.
State: Splash LIVE on prod (final visual confirm pending); prod Clerk live over TLS; prod Supabase still trusts the DEV issuer; live app still `pk_test_`. 8/12 subs captured, 1 reconciled (pilot). Tracker `.xlsx` is the sole record of captured subs.
Done when: all `live_memberships ≥ 1` users reconciled to prod subs; Supabase re-pointed to `https://clerk.ourprovisions.velayo.ai`; Vercel prod on `pk_live_`; a migrated family user (Helen/Elly) signs in and sees their own household; no `pk_test_` in bundle; Google + password sign-in both work; OurBanner storage-RLS + EXIF-upright verified on prod tokens. **At flip: run all 11 remaining UPDATEs → re-point Supabase → flip key → verify (in that order).**
**Files updated:** None (git promotion + Clerk/Supabase dashboard + tracker work only).
**DB changes:** One prod `users` row reconciled (Dan Test User `clerk_id` → prod sub).

### [2026-07-25] — [OurProvisions] — Splash finalized (resolve-in-place + shake fix + canonical tagline); Clerk key env-driven
> **Addendum 2026-08-15:** This entry's statement that Vercel **Production** env was `pk_test_` was correct on 2026-07-25 and is now **superseded** — Production was flipped `pk_test_` → `pk_live_` during the 2026-08-15 cutover (see that entry). Recorded here only so a reader arriving at this line does not act on it as current state; the original text stands as accurate for its date.
**Goal:** Make the cold-start splash read as a modern app (not a staged PowerPoint build), fix the persistent "too low" wordmark, land the Clerk env-drive code, and get it all dev-verified and ready to ship.
**Completed:**
- **Redesigned splash motion — one resolve in place** (`8c16e46`): retired v2's 3-act staged reveal (horizon→vessel→house, ~4.45s) for a single slow blur→sharp resolve IN PLACE (~2.5s, one curve `cubic-bezier(0.22,1,0.36,1)`, no travel, no self-drawing arch). Kept v2's wordmark→header hand-off exit. Per `SPEC_splash_resolve_v3.md`; `splash_motion_v2.html` the visual target.
- **Fixed "too low" at root:** `measure()` was centering the lockup's **bottom-weighted bounding box**; now centers on the **wordmark's optical center** (`OP_GROUP_CENTER` 0.48→0.46). Locked geometry: raised-crown arch at **arch↔wordmark = 2× wordmark↔tagline** (true visible, viewport-independent); **typeset "VELAYO INC." foot** (dropped the full Velayo lockup — illegible small + its crest doubled the arch, and the `velayo-mark.png` dependency); **removed the orphaned `op-bloom` horizon seam**.
- **Fixed a horizontal shake** (`5be6f0a`): the body behind the fixed splash overlay is taller than the viewport, so its vertical scrollbar toggled during load and reflowed the full-width overlay sideways. Fix = lock `document.body` scroll for the splash lifecycle, restore on unmount (scoped, not a global `overflow-x` mask). Diagnosed by evidence — the overlay's own `overflow:hidden` already clips its children, so the scrollbar had to be the document behind it.
- **Unified the tagline to "Shop smarter. Shop faster."** (`0ed3f3e`, sentence case) on the app splash — closes a long-open multi-variant conflict. Smarter-first matches fleet series grammar; order encodes causality (smarter→faster); anaphora gives rhythm and dodges the "Live Better. Live Smarter." echo. Retired "Save time. Shop smarter."
- **Env-drove the Clerk publishable key** (`a652a52`, the code half of `SPEC_prod_clerk_instance` Step 3): `src/index.js` `pk_test_` literal → `process.env.REACT_APP_CLERK_PUBLISHABLE_KEY` with a **fail-loud guard** (renders "Configuration error" on a falsy key — checks non-empty, NOT validity).
- **Verified on the dev preview:** 3G slow-load timing clean (wordmark fully sharp before dissolve), no tagline wrap on a real narrow phone, no shake. Confirmed Vercel **Preview** Clerk env set (guard passes on preview) and **Production** env = the `pk_test_` dev key (non-empty) — so a dev→main merge will NOT blank the live app.
- **Commit hygiene:** each change its own discrete commit (`a652a52` Clerk / `8c16e46` resolve / `5be6f0a` shake / `0ed3f3e` tagline), pushed to `origin/dev`; nothing squashed.
**Unfinished:**
- **dev→main promotion NOT done** — deliberate next step; all four gates cleared (3G dissolve, phone wrap, Production Clerk env, Preview Clerk env).
- **Marketing-site tagline still old:** `ourprovisions-landing` (velayo.ai) carries "Shop smarter. Eat better." — that repo is **unreachable from this build env** (not on disk here), so it wasn't updated. Greps for when in that repo: "Shop smarter" / "Shop faster" / "Eat better" / "Save time" → replace tagline instances with the canonical line (leave mood line "The Market, Distilled." alone).
- **Prod Clerk cutover still BLOCKED on DNS** — Clerk shows 0/5 verified, SSL pending; Steps 4–8 gated on Step 2. Only actionable move: check Clerk for DNS verification. **Production env must stay `pk_test_`** until the whole chain completes — `pk_live_` early passes the guard but denies every authenticated query (Supabase still on the dev issuer).
- **List-poll request volume:** ~130–295 requests on an idle "TEST" household (many `get_list_items_for_household` fetches, splunk-context initiated) — unclear if intended cadence or a re-firing storm. Own future session.
**Next session:**
SESSION START
Goal: (a) complete the dev→main splash promotion and verify on production; (b) update the marketing-site tagline in the `ourprovisions-landing` repo.
State: Splash resolve-in-place + shake fix + "Shop smarter. Shop faster." verified on dev; Production Clerk env confirmed `pk_test_` (safe). `SPEC_splash_resolve_v3` built; v2 retired.
Done when: Splash live on `ourprovisions.velayo.ai` (resolves cleanly, new tagline, no shake, app loads signed-in); marketing-site tagline unified.
**Files updated:** `src/index.js` (Clerk key env-driven + guard), `src/App.js` (splash resolve-in-place + shake fix + tagline), `docs/specs/built/SPEC_splash_resolve_v3.md` (routed from airlock), `docs/specs/retired/SPEC_splash_vessel_identity_v2.md` (v2 retired), `docs/mockups/splash_motion_v2.html` (visual target), plus `docs/SESSION_LOG.md` / `ROADMAP.md` / `ARCHITECTURE.md`.
**DB changes:** None.

### [2026-07-24] — [OurProvisions] — Found the live app runs on DEV Clerk keys; provisioned the prod Clerk instance (blocked on DNS)
**Goal:** Close the two carried OurBanner verifications (storage RLS denial + EXIF-upright) — pivoted on discovering a higher-priority prod-auth defect.
**Completed:**
- **Found the root defect:** the live app (`ourprovisions.velayo.ai`) reads/writes **prod** Supabase (`parpauldmbetptkmdwbd`) while authenticating against a **dev** Clerk instance (`many-puma-34.clerk.accounts.dev`) — prod data behind dev auth. Evidence gathered in-browser (`performance` resource URLs), not from docs; the Clerk publishable key is hardcoded `pk_test_…` in `src/index.js`.
- **Established this gates beta expansion harder than RLS/EXIF** — dev Clerk is "for internal/test users" per Clerk; expanding the audience crosses that line. Jumps the queue ahead of Trip Complete + Receipt Capture.
- **Provisioned the prod Clerk instance** — cloned from dev (carries OAuth + theme config); chose **Secondary application** so Clerk hosts at `clerk.ourprovisions.velayo.ai` and reserves `clerk.velayo.ai` (the primary slot) for a future fleet/Harbour identity layer, not this one app.
- **Authorized 5 Cloudflare DNS records** via Domain Connect — `clerk.`/`accounts.`/`clk._domainkey`/`clk2._domainkey`/`clkmail` under `ourprovisions`, all **grey-cloud (DNS-only)**, none touching the app→Vercel record; verified correct before committing.
- **Settled the user-migration roster** from a live prod census (join `users.id = household_members.user_id`, Clerk sub in `users.clerk_id`): **10 migrate, 11 drop.**
- **Completed Google OAuth prod setup end-to-end** — GCP project `ourprovisions` under the `velayo.ai` org, consent screen (User type **External**), Web OAuth client (JS origin `https://ourprovisions.velayo.ai`, redirect `https://clerk.ourprovisions.velayo.ai/v1/oauth_callback`), Client ID + Secret into Clerk, and **published to production** (basic scopes → no verification review, no user cap, no "unverified app" screen).
**Unfinished (blocked on the DNS wall — external, not a stall):**
- DNS not yet verified: Clerk shows **0/5 verified, SSL pending** — propagation + verification + SSL must complete before anything downstream.
- Supabase Third-Party Auth NOT yet re-pointed to the prod Clerk issuer/JWKS (the auth kill-switch step).
- User migration (10) NOT yet run — must preserve/reconcile `users.clerk_id` so prod `household_members` (keyed on internal `users.id`) still resolve. **Sub-continuity is the quiet trap.**
- `src/index.js` still hardcodes `pk_test_…` — not yet env-driven; `pk_live_` not in Vercel.
- The two carried items (storage RLS denial, EXIF-upright) NOT closed — deliberately deferred; they must run on **prod-minted tokens** after cutover, or they're false passes.
**Next session:**
SESSION START
Goal: Complete the prod Clerk cutover once DNS verifies — re-point Supabase, migrate the 10, deploy, then run the deferred verifications on prod tokens.
State: Prod Clerk instance live; DNS records authorized (grey-cloud); Google OAuth published (External, basic scopes). App still on dev Clerk keys until deploy. Prod census done: 10 migrate / 11 drop.
Done when: `performance` clerk resource on the live app shows `clerk.ourprovisions.velayo.ai` (not `.accounts.dev`); a migrated user signs in and sees their own households/lists (proves sub-continuity + Supabase re-point); bundle contains no `pk_test_`; Google sign-in works; storage RLS (anon + authed non-member denied, member control passes) and EXIF-upright both verified on prod.
**Files updated:** None this session (design/provisioning only). Pending for build: `src/index.js` (`pk_test_` → `process.env.REACT_APP_CLERK_PUBLISHABLE_KEY` + missing-key guard); Vercel env `REACT_APP_CLERK_PUBLISHABLE_KEY` = `pk_live_…` (Production) / `pk_test_…` (Preview). Spec filed `docs/specs/active/SPEC_prod_clerk_instance.md`.
**DB changes:** None to schema. Supabase **prod** Third-Party Auth must be re-pointed to the prod Clerk issuer/JWKS (dashboard config, not a migration). Clerk user pool: migrate 10, drop 11.

### [2026-07-23] — [OurProvisions] — Built the splash scene (auto-play + surfacing); diagnosed & guarded the list-poll refetch loop
**Goal:** Implement the splash per `SPEC_splash_vessel_identity_v2.md`, then refine it on device until the entry reads as intentional rather than as a toll.
**Completed:**
- Built the splash across four commits — static scene + reveal, threshold/crest/readiness gate, BVI water wash, measured wordmark hand-off + header standardization + wave audio — device-verified between each; retired v1 spec to `docs/specs/retired/` (after briefly misfiling it in `active/`).
- Restructured the entry into **three meaning-grouped motions**: horizon (the world) → vessel (*Our*Provisions + tagline) → house (arch + Velayo colophon). The arch groups with the house (it is part of the Velayo logo) though it sits spatially over the wordmark.
- **Removed the tap gate, "TAP TO ENTER", the BVI wash, and all audio from the entry** — the scene now auto-plays on cold start and asks nothing of the user. The dissolve is a **simple surfacing**: espresso recedes into the header, cream body revealed below, wordmark lands on the measured header position. No particles.
- Converted arch + horizon-line + tagline positioning from viewport-relative to **wordmark-relative** (measured `getBoundingClientRect`), fixing cross-device / window-height drift; composed them as one group centered against the **visible** viewport (visualViewport, not the taller layout viewport).
- Changed the wordmark entrance from slide-up to **emerge-in-place** (opacity + blur), so the hand-off is the sequence's only travel.
- Fixed the **double-wordmark on hand-off** — the real header title is hidden until the travelling clone unmounts, then revealed in the same frame (invisible swap, §6b).
- On the (now-removed) wash: perf-tuned for phone fill-rate (DPR 1.5 cap, device-scaled count, pre-rendered sprite blit), fixed an audible double-wave and a cut audio tail — all captured for the Trip Complete inheritance.
- **Diagnosed the `get_list_items_for_household` "loop" and shipped an in-flight guard (`c6fa026`).** The stated hypothesis was a React `useEffect` dependency recreated every render (fetch → setState → new reference → refetch); the diagnosis **disproved that with evidence** — the count scaled with *time on page*, not tree size, and the culprit was **three unguarded `setInterval` polls** (list every 2s, catalog 20s, presence 30s), not a dependency bug. On a slow connection a list cycle (`get_list_items` RPC → `list_item_contributors` → setStates) outlasts the 2s interval, so the interval keeps firing and cycles pile up. Fix = a `loadingListRef` in-flight guard on `loadListItems` only (skip a tick if a cycle is still running); **measured on localhost 3G: ~31 → ~12.5 fires/min (2.5×), total requests 1,124 → 704**, T≈4.8s matching the `60/T` model. Held back deliberately (not stacked): `setInterval`→`setTimeout` chain, and folding contributors into the list RPC.
**Unfinished:**
- Wave audio + BVI wash are built but **now unwired** — reserved for a **Trip Complete spec (not yet written)**. Source `wave_hit.mp3` retained in `docs/assets/splash/`; the wash canvas code was removed from `App.js` this session (recover from git history).
- Splash is **on dev only** — not merged to main/production (Dan's dev→main gate).
- Horizon-line resting glow was parked ("decide at end") then the line was reworked to a thin horizon; final resting read still unjudged.
- Footer V-mark is still the knocked-out PNG (reads cool against Dune) — a true-source SVG/alpha PNG preferred (§11).
- Removing the tap gate removed the load buffer it provided; whether the readiness gate covers a genuinely slow load invisibly is untested.
- Over a photo with the *small* wordmark, the clone lands at opacity 1 but the header settles at 0.8 — a possible barely-perceptible dip in that one state, unverified.
- Claude.ai phone↔browser conversation sync failed one-directionally all session (reported as a bug; worked around by retyping prompts).
- **Process miss:** the SESSION END docs commit (`cf12e93`) was meant to stay local for review, but a later `git push origin dev` (for the list-poll guard `c6fa026`) carried it to `origin/dev` — a single branch push ships every local commit on the branch. Impact minor (dev only, main untouched, docs still amendable). Added a CLAUDE.md rule so the next SESSION END stages the docs commit separately or warns before any push.
**Next session:**
SESSION START
Goal: Design the trip-completion moment — give the wave and wash their real home (water rising over the checked list, receding to the empty state), with audio gated behind the existing "Close & clear" confirmation.
State: Splash is live on dev — silent, gestureless, three motions, hand-off into the header working. Wrap-up flow exists (All done! → confirmation modal → empty list) but clears instantly with no transition. `wave_hit.mp3` is in `docs/assets/splash/`; the BVI wash canvas code was in `App.js` this session (recover from git).
Done when: A Trip Complete spec exists defining the wash as the clearing transition, audio gated behind "Close & clear", and a decision on whether sound defaults on or off in a store context.
**Files updated:** `src/App.js` (splash rewrite; header title ref + hidden-during-splash; header wording standardized to "*Our*Provisions"), `src/hooks/useProvisions.js` (list-poll in-flight guard), `public/velayo-mark.png` (new), `public/wave_hit.mp3` (added, now removed), `docs/specs/retired/SPEC_splash_vessel_identity.md` (v1 moved), `docs/specs/built/SPEC_splash_vessel_identity_v2.md` (routed from airlock), plus `docs/SESSION_LOG.md` / `ROADMAP.md` / `ARCHITECTURE.md`.
**DB changes:** None.

### [2026-07-22] — [OurProvisions] — Splash reimagined as a branded launch *experience* (design chat); handoff consumed + splash spec filed (Claude Code)
**Goal:** Turn the OurProvisions launch splash from a generic Velayo-branded screen into a branded, emotional entry experience — threshold → reveal → BVI water wash → app, with sound — and route the design handoff + splash spec into the repo.
**Completed:**
- (Design) Replaced the Velayo-navy splash with an OurProvisions **vessel** splash on Warm Dark espresso `#2C1A0E`; Velayo demoted to a quiet `VELAYO INC.` footer (the Harbour "colophon" pattern the whole fleet inherits). Locked the wordmark ("*Our*Provisions", Playfair italic, Our 400 / Provisions 700, Parchment) + tagline **"Save time. Shop smarter."**
- (Design) Locked **arch geometry via Dan's arch-matched logo-overlay test**: arch width = 0.52 × wordmark width (~124px at the 238px wordmark), "higher" placement with clear espresso air above the word (earlier 94/156px + "stranded/strikethrough" placements rejected).
- (Design) Designed the full experience arc — **Threshold** (compressed, breathing "Tap to enter") → **Crest** (tap lightens depth, vignette retreats, horizon blooms) → **Reveal** (arch draws, wordmark surfaces + de-blurs, tagline, footer) → **Hold** → **BVI turquoise water wash** send-off (sunset-gold rejected) → **Surfaced** into an atmospheric app.
- (Design) Established **continuity into the app**: the dark scene surfaces into the espresso header (which keeps a faint permanent BVI depth-glow); app motion shares the scene easing `cubic-bezier(0.16,1,0.3,1)`. Flagged as a likely fast-follow build phase, NOT shipped with the first splash.
- (Design) Designed the **sound** — a **single wave breaking on the dissolve** (`wave_hit.mp3`), triggered on the entry tap (satisfies autoplay), cold-start only, respects mute (chime + anchor-clank rejected; synthesis can't render heavy chain). Removed a wordmark shimmer sweep (read as a "ghost"). Produced a working end-to-end reference (`SPLASH_final.html`).
- (Claude Code) Consumed the design handoff: **+7 DECISIONS**, moved "build splash experience Phase 1" to NEXT, folded the splash architecture facts into ARCHITECTURE (post-launch React view, readiness-gated dismissal, runtime-measured wordmark hand-off, header "Our Provisions" standardization, atmospheric-header + shared-easing principles).
- (Claude Code) Filed `SPEC_splash_vessel_identity.md` → `docs/specs/active/`; deleted the consumed handoff.
**Unfinished:**
- Splash Phase 1 **not built** — this session was design + spec-routing only. Build in React/PWA next.
- `wave_hit.mp3` is a **synthesized draft** — a real wave recording (freesound.org) layered at the same spot would add grit synthesis can't; the anchor-chain idea is abandoned (use a real recording if ever revived).
- Haptic sync on the wash (native only), frame-accurate audio↔visual timing (finalize in the real build), and the atmospheric-header/shared-motion scope expansion (likely its own phase) all deferred.
- Ambiguous handoff payload assets (`SPLASH_final.html`, `bvi_palette.png`, `h_high.png`, `enter_wave_hum.mp3`, `wave_hit.mp3`) had **no `## DROPPED_FILES` manifest** — routing awaits Dan's call before the airlock can clear.
- Three-way tagline conflict unresolved: splash "Save time. Shop smarter." vs live site "Shop smarter. Eat better." vs palette page "The Market, Distilled."
- Corrupted brand-deck PDF (`velayobranddeck__March_28_2026.pdf`) needs a clean re-export; prefer a true transparent SVG/PNG Velayo V-mark over the white-PNG knockout for the footer.
**Next session:**
SESSION START
Goal: Build splash-experience Phase 1 in the React/PWA app — threshold → reveal → BVI wash → wave sound → hand-off to the header.
State: Design fully specced + proven in mockup (`SPLASH_final.html`); arch geometry, palette, tagline, sound cue, choreography all locked. Current splash lives in `App.js` as a post-launch React view (`SplashScreen` ~L174–216; render ~L1224; `showSplash` ~L360; `loading` flag already in scope). Spec at `docs/specs/active/SPEC_splash_vessel_identity.md`.
Done when: The real app plays threshold → reveal → BVI wash → app on cold start, with the wave cue on first tap; arch/wordmark/footer match the spec; the dissolve lands the wordmark on the real header title **measured at runtime** (not hardcoded), seam invisible at 390px & 430px; dissolve fires on `!loading` with a ~2s min and ~5s failsafe; no regression to signed-out / photo-header / no-photo-header states.
**Files updated:** `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`; `docs/specs/active/SPEC_splash_vessel_identity.md` (new, routed from handoff). Handoff asset files pending routing.
**DB changes:** None.

### [2026-07-21] — [Cross] — Feedback inbox + Velayo welcome email (design chat); reconciled the two-machine dev docs merge (Claude Code)
**Goal:** Stand up a customer feedback channel and land the final Velayo welcome email (design chat), and reconcile the divergent canonical docs after the Madbury/lake two-machine split (Claude Code).
**Completed:**
- Reconciled the divergent-docs merge on `dev` — 1 un-pushed local Jul-1 commit (join-activation REOPENED) vs 65 lake commits (Jul 1–19): SESSION_LOG amendment slotted chronologically, ROADMAP join-activation status yielded to the lake's **prod-verified DONE** (lake built the reopen fix `c1ceab2` + verified it Jul 7), ARCHITECTURE header + durable-intent refinement folded, orphan addendum spec removed, 4 stale spec-path refs repointed. Merge `6d63729` + cleanup `1b986e1`, pushed to origin/dev — desktop + remote back in sync.
- (Design) Created + verified **thoughts@velayo.ai** as a Google Group feedback inbox — external posting on, owner/members set, end-to-end tested from an external address, Gmail filter auto-labels → "Good Thoughts".
- (Design) Finalized the **Velayo welcome email to v17** — a COMPANY (not product) welcome: goal→how opening, two-part philosophy (world / your peace), starfish, "AI but never the point," honest co-build framing; subject "We're glad we found each other," preview "Technology that gives you time back," CTA → ourprovisions.app.
- (Design) Drafted the first **weekly beta email (Beat 1)** routing feedback to thoughts@; locked the brand thesis line and the harbour-as-refuge ("safe but never stuck") principle.
- (Design) Founder confirmed the **cold-start invite path (ourprovisions.app → toll → app) walked end-to-end by a stranger** — P0 launch-blocker considered cleared (pending the deployed-URL technical gates).
- (Claude Code) Consumed the design handoff: +6 DECISIONS, feedback inbox → DONE, welcome-email copy → NEXT, About page/founder's letter → LATER; routed `email_welcome_velayo.md` → `docs/content/`.
**Unfinished:**
- Weekly beta email drafted, not finalized/reviewed.
- Full starfish parable + harbor-refuge long-form written, not yet homed → About page / founder's letter (backlog).
- Welcome email not yet built in Mailchimp (FNAME conditional fallback + Come aboard → ourprovisions.app CTA still to wire).
- Landing-page LIVE P0: founder reports the cold-start path works, but the deployed-URL technical gates (anon zero-row read + CORS) were not formally re-confirmed this session.
**Next session:**
SESSION START
Goal: Build the Velayo welcome email in Mailchimp (FNAME fallback + CTA URL) and finalize the first weekly beta email.
State: thoughts@velayo.ai live + tested; welcome email v17 final (copy) at `docs/content/email_welcome_velayo.md`; weekly beta email drafted; cold-start path founder-confirmed; dev docs merge reconciled + pushed (desktop + remote in sync).
Done when: Welcome email live in the existing Mailchimp automation with a working FNAME merge-tag fallback and Come aboard → ourprovisions.app; weekly beta email reviewed and ready to send.
**Files updated:** `docs/content/email_welcome_velayo.md` (new, routed from handoff); `docs/SESSION_LOG.md`, `docs/ROADMAP.md`. (ARCHITECTURE.md changed earlier this session via the merge commits.)
**DB changes:** None.

### [2026-07-19] — [OurProvisions] — Built Phase I to dev: household-management redesign + OurBanner; migration 024 applied to dev
> **Addendum 2026-08-15:** This entry's Unfinished line *"Migration 024 + feature are **dev-only** — prod not touched"* and its DB-changes line *"**Prod pending**"* are **contradicted by the prod database**. Migration 024 reached **prod on 2026-07-19**, the same day — the `household-photos` bucket is created by 024, and prod `storage.objects` holds its first object `f8ea682c-…/header.jpg` at **19:58:32 UTC** that evening, a second at 20:05, a third on 07-24. Query: `select name, created_at from storage.objects where bucket_id = 'household-photos' order by created_at limit 3;` (prod, `parpauldmbetptkmdwbd`). So the storage half of 024 was live on prod within hours of this session, and a successful member-gated upload followed. **Consequence carried for four weeks:** every downstream doc inherited "prod pending" and the OurBanner storage policies ran unverified on prod from 2026-07-19 until the 2026-08-15 cutover verification — not an exposure (member-gated, no anon policy), but a live surface believed to be dev-only. Original text left intact as what was believed at the time.
**Goal:** Build the full Phase I feature set (household-management redesign + OurBanner photo header) in Claude Code, clear the DB gate on dev, and land it on the dev preview.
**Completed:**
- **(Design chat) Prepared the paste-ready build kickoff + walked the DB gate on dev.** Settled migration 024 (023 gapped for referral), the 5-step build sequence, and the watch-outs (SQL editor bypasses RLS; `is_member_of` arg signature must match the storage policies); confirmed wordmark default = **Large**, photo-gated. Confirmed dev by URL (`zxwtxjjmssykhqrghouf`), created the `household-photos` **private** bucket, confirmed `is_member_of(uuid)`, **applied migration 024** — verify passed: 5 columns, 4 CHECK constraints, 4 storage policies, 13 households on the espresso default.
- **(Claude Code) Built the full Phase I client (commit `3af39a2`).** EXIF-normalizing upload pipeline (`src/lib/image.js` — bakes orientation into pixels via `createImageBitmap`, downscales 1600px, re-encodes q80); OurBanner header (photo bg + band scrim + large/small/hidden wordmark, photo-gated, swaps on switch); Edit-household sheet (preview drag-to-reposition + zoom + replace/remove + wordmark segment + name + **creator-only Delete danger zone**, both states); two-zone management sheet (name-only rows, bare pencil on the active row, `{household} · MEMBERS` roster + Invite); Invite via `navigator.share()`.
- **Data layer:** banner columns read **best-effort** (degrades to the espresso header if 024 isn't applied → a deploy-before-migrate can't hard-error); `updateHouseholdBanner` / `uploadHouseholdPhoto` / `removeHouseholdPhoto`; private-bucket signed-URL resolution, re-resolved on switch + save.
- **Fixed the FINAL3 active-row affordance (`b9ccc50`):** bare pencil **+ "Edit" label** ("bare" = no plate, not glyph-only, per the tiebreaker mockup).
- **Root-caused + fixed a silent photo-upload no-op (`3738b6a`).** The hidden file `<input>` sat under the sheet backdrop's `onClick`, so its programmatic `.click()` bubbled and closed/unmounted the sheet mid-pick — no upload, no network request, no throw, no log. Moved it inside the `stopPropagation` container; hardened the upload path into labeled stages (normalize-EXIF vs storage) that log the full error.
- **Landed the nav-seam gradient dissolve (`419cc91`).** Header + nav now share ONE continuous photo+gradient (approved stops); dropped the nav's own solid espresso; tabs get load-bearing text-shadows — no hard line, and photo-less households are byte-for-byte unchanged.
**Unfinished:**
- On-device verification checklist not yet walked on dev (EXIF-upright on a deliberately rotated photo, framing persistence, photo swap on switch, dormancy re-add, non-creator sees no Delete, RLS as anon + authenticated non-member, legibility at zoom extremes).
- Migration 024 + feature are **dev-only** — prod not touched; dev→main held.
- **Signed-URL TTL is 1h** — a session left open past an hour 404s the header until reload (watch; add refresh-on-visibility if it bites).
- `DRAFT_privacy_beta_signups.md` still parked in the airlock (per the privacy-policy NEXT item, awaiting a `velayo-web` home) — not routed, not deleted.
**Next session:**
SESSION START
Goal: Walk the OurBanner on-device verification on dev, then stage migration 024 + the feature to prod and merge dev→main.
State: Phase I built + on dev (`3af39a2` → `419cc91`); migration 024 applied + verified on dev (5 cols, 4 constraints, private `household-photos` bucket, 4 member-gated policies); espresso fallback for photo-less households; nav dissolves into the photo with no seam.
Done when: dev verification passes (EXIF upright, framing persists, wordmark states, non-creator no-Delete, RLS anon + non-member denied); migration 024 + feature applied and confirmed on **prod** by URL; dev→main merged.
**Files updated:** `src/App.js`, `src/hooks/useProvisions.js`, `src/lib/image.js` (commits `3af39a2`, `b9ccc50`, `3738b6a`, `419cc91`); `docs/SESSION_LOG.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`.
**DB changes:** Migration **024 applied to DEV** (5 columns + 4 CHECK constraints on `households`; private `household-photos` bucket + 4 member-gated storage policies keyed on `is_member_of(uuid)`). **Prod pending.**

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

### [2026-07-01 — AMENDMENT] — [OurProvisions] — Promoted both changes to prod; list text-size DONE, join-activation REOPENED after prod failure
**Goal:** Promote the two dev-verified changes to prod and confirm there. *(Corrects the same-day entry below, which marked join-activation DONE on dev evidence only.)*
**Completed:**
- Pushed `dev` and fast-forward-merged `dev`→`main` (`15712ba`→`b3ee74d`); Vercel deployed to prod. Both changes live on `ourprovisions.velayo.ai`.
- Verified **list text-size on prod** — scales rows, persists across regular + hard reload. **Stays DONE. Green.**
- Tested **join-activation on prod** (existing user Test User 60 with a prior "My Household", incognito; inviter DH in household Madbury; fresh invite `Z8165W`) and **reproduced the original bug**: after a genuine invite-consuming load (`bootstrap_new_user` fired), the header stayed on My Household; Madbury populated into the switcher late but was never activated.
- Captured console evidence in the failed prod state: `localStorage.activeHouseholdId` = My Household's id (lens never moved); `sessionStorage.just_joined_household_id` = Madbury's id (flag SET but never consumed/cleared). GoTrueClient project id = `parpauldmbetptkmdwbd` (genuinely prod).
- Root-caused: the shipped `pendingJoinId` fix (`1c5a916`) is a **single-fire reconcile** — it switches only when `myHouseholds` already contains the joined id. On prod's slower membership propagation, Madbury arrives in `myHouseholds` late, the effect doesn't re-fire, and the flag parks forever. This is the exact "late-membership window" flagged as reasoned-but-not-reproduced in `1c5a916` — now reproduced on prod by real latency.
- Wrote `docs/specs/built/SPEC_join_activates_household_ADDENDUM_reopen.md` (diagnosis + console evidence + the concrete three-part durable/retriable fix); supersedes the original spec's "Fix" section.
**Unfinished:**
- **Join-activation is REOPENED and not shipped-as-working.** The fix is live but incomplete; prod still exhibits the bug. Fix direction specified (durable/retriable flag consumption) but not built.
- "No longer a member of that household" banner fired on a brand-new user's first prod sign-in (Test User 50) during testing — the separately-tracked pre-existing BACKLOG bug, not caused by tonight's work. Noted, not fixed.
**Next session:**
SESSION START
Goal: Build the join-activation reopen fix per `docs/specs/built/SPEC_join_activates_household_ADDENDUM_reopen.md`, and verify it ON PROD (dev-green is insufficient — the failure is latency-triggered).
State: List text-size DONE on prod. Join-activation fix `1c5a916` live on prod but INCOMPLETE — `just_joined_household_id` is set but never consumed into a switch when membership propagates late. Cause identified; fix = re-derive `pendingJoinId` from the surviving flag, re-fire the switch on every `myHouseholds` change while unresolved, clear the flag only after a confirmed switch (+ optional bounded refresh retry).
Done when: On prod, an existing multi-household user pasting a fresh invite lands in the joined household, `just_joined_household_id` reads null afterward, active id = joined id, and it survives a hard reload — including a run where the joined household populates late.
**Files updated:** None to source (prod verification + diagnosis only; the fix is next session's build).
**DB changes:** None. Cause is client-side; `bootstrap_new_user` confirmed correct on prod (flag was set).

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
