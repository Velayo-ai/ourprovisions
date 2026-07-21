# SPEC — Receipt Import: Use-Case Catalog & Schema Validation

**Scope:** OurProvisions · Cross-phase design record (Phase 3 → 5+)
**Status:** Design record — validates the receipt substrate against the full vision
**Companion to:** SPEC_receipt_import / _vision_extraction / _reconcile

---

## The reframe

Receipts are not a Phase 3 feature. They are the **purchase-history substrate** —
the ground-truth event stream every intelligent feature downstream infers over.
Catalog seeding, price memory, savings scoring, impulse detection, meal-plan
orchestration: none are "receipt features," all are *fed by* receipts. Photo
import is simply the first sensor plugged into that substrate.

Design mandate therefore: the schema must serve **questions we can't see yet**,
not just import. This doc validates that it does.

---

## Use-case catalog

### Foundation — Phase 3 (specced now)
| ID | Name | What it does | Feeds |
|----|------|--------------|-------|
| UC-1 | Catalog Seeding | New user imports receipts to auto-build catalog; zero-friction onboarding | catalog |
| UC-2 | Price Grounding | Real prices replace guessed `price_hint`; category averages emerge | budget, planning |
| UC-3 | Estimated vs. Actual | Goal-vs-outcome game per trip — **first feature wanted** | gamification |

### Intelligence — Phase 4 (fed by the pile)
| ID | Name | What it does | Requires |
|----|------|--------------|----------|
| UC-4 | Cross-Store Price Memory | "Milk $1.20 cheaper at Market Basket" | same item × multi-store × time |
| UC-5 | Savings Nudge | Weighted in-list/in-trip flag ("let Dan grab at MB"); threshold by % or $ | UC-4 |
| UC-6 | Savings Scoring / Gamification | Score per shopper/store; "saved $200 this month"; rewards | UC-3+UC-4 |
| UC-7 | Shopper×Store Analytics | "Dan@MB best, Helen@WholeFoods worst" — attribution is the insight | shopped_by + store_key |

### Learning — Phase 4–5 (inference over history)
| ID | Name | What it does | Requires |
|----|------|--------------|----------|
| UC-8 | Impulse / Stow-away Detection | Receipt items with no planned list entry = unplanned buys | receipt ↔ list join |
| UC-9 | Forgot-Item Learning | Mirror of waste-learning: reliably bought but never listed | receipt ↔ list join |
| UC-10 | Suggestion Engine | "A few items to consider" — complements from meals + learned-forgets | UC-8/9 + meals |

### Orchestration — Phase 5+ (north star)
| ID | Name | What it does |
|----|------|--------------|
| UC-11 | Meal-Plan-to-Budget Loop | "3 meals, 2 leftovers, 2 nights out, under $300, Nobu booked" concierge. Every UC above is a tributary to this. |

### Newly named (fall out of the vision; affect schema now)
| ID | Name | Why it matters | Schema impact |
|----|------|----------------|---------------|
| UC-12 | Savings-Line Classification | Coupon/discount is a **savings win to celebrate**, not noise | `line_type` |
| UC-13 | Tax & True-Total Reconciliation | Est-vs-actual is only honest vs. real total incl. tax | `tax`, `total` (specced) |
| UC-14 | Shopper Attribution | Receipt doesn't say who shopped; importer ≠ shopper | `shopped_by` |
| UC-15 | Return / Refund Events | Negative lines / returns; unmodeled → spend analytics drift | `line_type=return` |
| UC-16 | Unit-Price Normalization | "Cheaper at MB" is false if sizes differ; needs price-per-unit | fractional qty + unit |
| UC-17 | Receipt-to-Waste Loop | "Wasted $18 of produce you bought at Whole Foods" | already keyed (catalog_item_id) |

### Deliberate non-goal (do not let creep in)
- Nutrition/health inference from receipts → Phase 5+ ourChef territory. Real, but
  must not touch this schema yet.

---

## Schema validation against the live DB

Checked all 17 against the live `parpauldmbetptkmdwbd` inventory. Findings:

### Already receipt-ready (lean on these, don't reinvent)
- `catalog_items.external_id` — hook for store SKU/UPC (UC-4/16 later).
- `category_avg_prices` table exists — UC-2 commit must update this too, not only
  `price_hint`.
- `list_items` already has `session_id`, `checked_lat/lng`, `checked_sequence`,
  `status`, `added_by`, `checked_by` — session/attribution substrate for UC-3/UC-8
  is partly built. Receipt spec leans on it.
- `waste_events.catalog_item_id` — UC-17 needs no bridge; both spines share the key.

### Changes to catch NOW (cheap now, painful to backfill)
1. **`shopped_by uuid` on `receipts`** — importer ≠ shopper. UC-7/UC-14 dead without
   it. Add.
2. **`store_key text` on `receipts`** — normalized store slug beside display
   `store_name`. Without it "Market Basket"/"MKT BASKET #34" fragment into 3 stores
   and savings math (UC-4/6/7) silently breaks. Add.
3. **`line_type text` on `receipt_items`** (`item|discount|tax|fee|deposit|return`)
   — turns UC-12 savings lines and UC-15 returns into first-class data. `price`
   already allows negatives. Add.
4. **`quantity numeric` on `receipt_items`** — already specced correct. But NOTE:
   `list_items.quantity` and `waste_events.quantity` are `integer` — UC-16 unit-price
   is limited until those go numeric. **Latent limitation, flag only, do not fix in
   receipt sprint.**

### No new column, but spec must state the rule
5. **UC-3 est-vs-actual must SNAPSHOT the estimate**, not recompute against live
   `price_hint`. Use `list_items.price_per_unit × quantity` captured at list-build
   time vs. receipt `total`. Hook exists; discipline is the deliverable.

---

## Net effect on the build

Four cheap additions to the receipt tables (`shopped_by`, `store_key` on
`receipts`; `line_type` on `receipt_items`; `quantity numeric` already correct)
keep **all 17 use cases reachable with no painful later migration.** Nothing here
expands Phase 3 scope — v1 still just imports, reviews, and grounds price. These
columns sit ready (mostly nullable/defaulted) for Phase 4–5 to light up.

## Open questions for a future session
- Full `stores` table vs. `store_key` slug — defer until UC-4 is built; slug is
  enough to avoid fragmentation now.
- When do `list_items.quantity` / `waste_events.quantity` go `numeric`? Needed
  before UC-16 ships. Separate migration, own decision.
- Return/refund UX (UC-15) — model the data now via `line_type`, design the flow
  later.

## Watch-outs
- These are Phase 3–5 concerns landing during active Phase 1 — a deliberate
  substrate-shaping pass, not a build expansion. Flagged so it's not roadmap drift.
- Adding the four columns is a schema change to prod → migration discipline,
  verify in the correct environment by project ID.
