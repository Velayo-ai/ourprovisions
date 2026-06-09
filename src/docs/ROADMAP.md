# OurProvisions — Roadmap
*Last updated: June 8, 2026*

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
| 1 | **Cold-test sync fix + merge `dev` → `main`** | Per-user-hide-leak fix is on `dev`, warm-tab confirmed (both clients match). Run a cold cross-user test (fresh tabs, cold sign-in, adds/deletes/render all correct on both clients) BEFORE merging. Establishes the verified baseline. Gates #2. |
| 2 | **Hide/Delete verb split** | Per the decided catalog model (see DECISIONS). Split "remove" into two explicit verbs: **Hide** (seed/global items, per-user, reversible) and **Delete** (custom items, household-wide, cascades to list). Delete refuses on seed items. Add per-user unhide UI (`restoreHiddenByCategory` already partial). **No new tables** — `user_hidden_items` + `catalog_items.deleted_at` cover it. Build on the verified baseline from #1, then re-test adds/deletes. Open Q to settle first: what the other user sees when a custom item is deleted off the active list (silent vanish vs. signal). |
| 3 | **Receipt scan entry point in wrap-up modal** | After rolling items forward, prompt appears: "Scan your receipt to capture prices." Natural on-ramp to Phase 3. |

---

## NEXT — Clearly Defined, Not Yet Started

| # | Feature | Notes |
|---|---|---|
| 4 | **Cascade soft-delete (catalog → list)** | Deleting a custom catalog item should cascade to active `list_items` rows. Same gesture as the Delete half of #2 — pairs with it. |
| 5 | **Fix close_cycle contributor carry-forward** | When rolling items forward, copy `list_item_contributors` rows to new `list_items`. Currently badges reset to `added_by` only after wrap-up. Fix is in the `close_cycle` RPC. |
| 6 | **Re-enable RLS on provision_cycles, shopping_sessions, known_stores** | Currently disabled for dev. Need SECURITY DEFINER policies matching the auth pattern of other tables. (Verify current state — RLS-disabled is a prod risk.) |
| 7 | **Multiple household support** | Header-tap switcher UI. User belongs to more than one household and can toggle between them. |
| 8 | **Global category rename** | `household_category_overrides` table. Lets a household rename "Pantry" → "Dry Goods" etc. Migration pending. |
| 9 | **Reset Household (nuclear option)** | Confirmation-gated. Returns catalog to factory seed and clears household customizations. NOT the everyday undo for hides/deletes — recovery-from-chaos only. |
| 10 | **Replace remaining `window.location.reload()` calls** | Audit codebase; replace all with `refreshCatalog()` pattern. |
| 11 | **Remove debug console.log statements** | Attribution check logs firing on Helen's device — remove before beta. |
| 12 | **Email receipt parser** | Most actionable near-term price ingestion path. No partnerships required. Parse forwarded grocery receipts via email. |

---

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
| June 8, 2026 | **Catalog visibility model.** Global seed list = permanent, undeletable household-wide, exists to get households started. Custom items = any member can add/delete, household-wide. **Hide** = per-user, browse-only, reversible, never touches the shared list. **Delete** = custom items only, household-wide, cascades. Global reset = separate, gated, re-seeds. Multi-item hide deferred until demand. Two principles: (1) the shared list is sacred — no per-user view preference suppresses it; (2) every removal has a proportionate undo (hide → unhide one-tap personal; custom delete → soft-delete recovery window; reset → deliberate and total). |

---

## DONE — Shipped & Live

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
| Session Scribe moved to git (`CLAUDE.md`) | Jun 8, 2026 | Rolling log in `src/docs/`, committed to repo; off the Drive connector |

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
