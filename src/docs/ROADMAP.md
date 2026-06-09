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
| 1 | **Cold-test sync fix + merge `dev` → `main`** | Per-user-hide-leak fix is on `dev`, warm-tab confirmed (both clients match). Run a cold cross-user test (fresh tabs, cold sign-in, lists match on first load) BEFORE merging. Gates everything below. |
| 2 | **Hide/Delete verb split** | Per the decided catalog model. Split the single "remove" gesture into two explicit verbs: **Hide** (seed/global items, per-user, reversible) and **Delete** (custom items, household-wide, cascades to list). Make Delete refuse on seed items; add per-user unhide UI (`restoreHiddenByCategory` already partial). **No new tables** — `user_hidden_items` + `catalog_items.deleted_at` cover it. Do NOT start until #1 is merged. |
| 3 | **Fix close_cycle contributor carry-forward** | When rolling items forward, copy `list_item_contributors` rows to new `list_items`. Currently badges reset to `added_by` only after wrap-up. Fix is in the `close_cycle` RPC. |
| 4 | **Receipt scan entry point in wrap-up modal** | After wrap-up, prompt user to scan receipt. Natural on-ramp for Phase 3 price intelligence. |

---

## NEXT — Clearly Defined, Not Yet Started

| # | Feature | Notes |
|---|---|---|
| 5 | **Cascade soft-delete (catalog → list)** | Deleting a custom catalog item should cascade to active `list_items` rows. Same gesture as the Delete half of #2 — pairs with it. |
| 6 | **Multiple household support** | Header-tap switcher UI. User belongs to more than one household. |
| 7 | **Global category rename** | `household_category_overrides` table. Designed, not yet built. |
| 8 | **Reset Household (nuclear option)** | Confirmation-gated. Returns catalog to factory seed and clears household customizations. NOT the everyday undo for hides/deletes — recovery-from-chaos only. |
| 9 | **Email receipt parser** | Most actionable near-term price ingestion path. No partnerships required. |
| 10 | **Remove debug console.log statements** | Attribution check logs firing on Helen's device — remove before beta. |

---

## LATER — Catalog / View Refinements

| Feature | Notes |
|---|---|
| Multi-item / category-level Hide | Hide several items (or a whole category) in one action. Build ONLY if user feedback shows one-by-one hiding is a real pain. Deferred by decision June 8. |

---

## LATER — Phase 2: Shopping Intelligence

| Feature | Notes |
|---|---|
| Store recognition | GPS cluster → learn store locations. Auto-name after 3+ visits. |
| Smart list ordering | Sort list to match user's path through their store. |
| Pantry scan | Camera → Claude Vision → home inventory. |
| Pantry layer | "What's in the house" view, distinct from shopping list. |

---

## LATER — Phase 3: Price Intelligence

| Feature | Notes |
|---|---|
| Receipt scanning | Primary price ingestion. Camera → OCR → price_history. |
| Cross-store comparison | Same item, different stores. Savings surfaced proactively. |
| Email receipt parser | Forward grocery receipts → parsed automatically. |
| DB: `receipts` | `id, household_id, scanned_by, store_id, raw_image_url, parsed_json, total, purchased_at` |
| DB: `price_history` | `id, household_id, catalog_item_id, store_id, price, quantity, scanned_at, receipt_id` |

---

## LATER — Phase 4+: Smart Nudges & Gamification

| Feature | Notes |
|---|---|
| Savings nudges | "You saved $12 vs last month" — framed as unlocking better living |
| Waste detection | Item bought repeatedly but never consumed → gentle flag |
| OurChef integration | List items connect to meal planning |
| OurGarden | Tracks savings vs. provisions |

---

## DECISIONS LOG

| Date | Decision |
|---|---|
| June 8, 2026 | **Catalog visibility model.** Global seed list = permanent, undeletable household-wide, exists to get households started. Custom items = any member can add/delete, household-wide. **Hide** = per-user, browse-only, reversible, never touches the shared list. **Delete** = custom items only, household-wide, cascades. Global reset = separate, gated, re-seeds. Multi-item hide deferred until demand. Two principles: (1) the shared list is sacred — no per-user view preference suppresses it; (2) every removal has a proportionate undo. |

---

## DONE ✓

| Feature | Shipped |
|---|---|
| Core list UI — categories, quantities, prices, My List tab | March 2026 |
| Household sharing + real-time sync | March 2026 |
| Clerk auth + Supabase RLS | March 2026 |
| Staple toggle | May 2026 |
| Manage Categories | May 2026 |
| Per-category + Add item button | May 2026 |
| Show prices toggle (localStorage) | May 2026 |
| Category-average fallback pricing with `~` prefix | May 2026 |
| `refreshCatalog()` replaces `window.location.reload()` | May 2026 |
| Contributor badges `[D][H][E]` | June 1, 2026 |
| `list_item_contributors` table + RLS + Realtime | June 1, 2026 |
| Social share link preview (OG tags + og-image) | June 5, 2026 |
| Provision cycles model (`provision_cycles` table) | June 6, 2026 |
| Shopping sessions model (`shopping_sessions` table) | June 6, 2026 |
| Known stores table | June 6, 2026 |
| `close_cycle` + `archive_trip_items` + `get_active_cycle` RPCs | June 6, 2026 |
| Wrap-up modal with roll-forward checklist | June 6, 2026 |
| "Wrap Up" button + "Wrap Up Trip →" all-done CTA | June 6, 2026 |
| Auto-open cycle on first item add | June 6, 2026 |
| Contributor badge RLS fix (householdMembersRef pattern) | June 6, 2026 |
| **Merged to production — ourprovisions.velayo.ai** | June 6, 2026 |
| `get_list_items_for_household` JOIN refactor (name/category/is_staple inline) | June 8, 2026 |
| SHOP list renders from RPC rows (`listRows`) not `catalogMap` | June 8, 2026 |
| Per-user-hide-leak fix (hides no longer suppress shared list rows)* | June 8, 2026 |

*\*On `dev` as of June 8 — promote to production line once #1 (cold test + merge) completes.*
