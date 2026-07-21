# SPEC — Receipt Import (v1: photo)

**Scope:** OurProvisions · Phase 3 beachhead
**Status:** Design settled, ready for BUILD
**Author:** Design chat → Claude Code

---

## Why

End-of-shopping ritual: capture the receipt, ground real prices into the catalog,
and start accruing structured purchase history. This is the first AI feature and
the substrate for Phase 3 (price history, cross-store comparison). The asset is
the **structured, reprocessable history** — so v1 persists every line from day one,
even where it can't yet do anything clever with it.

## The core problem

A receipt is dumb text that doesn't know your catalog. The whole feature is
crossing the **reconciliation gap**: `"GV WHL MLK 1G"` → your `catalog_items` row
for whole milk. Everything below is about crossing that gap gracefully and putting
the human only where the machine is genuinely unsure.

---

## Pipeline

```
SOURCE ADAPTER   →  NORMALIZE   →  RECONCILE      →  REVIEW        →  COMMIT
(photo, v1)         (raw→lines)    (match catalog)   (human, gated)   (persist)
```

The **normalize → reconcile → review → commit** core is written once. Email (v2)
and store API (v3) are thin adapters onto the same core. Do not couple the core
to the photo path.

### 1. Capture (photo)
Image → Claude vision API. Vision does OCR **and** extraction in one call — no
separate OCR service. Returns structured JSON: `store_name`, `purchased_at`,
`total`, and `lines[]` (each: `raw_text`, `parsed_name`, `quantity`, `price`).
Persist the full extraction as `receipts.raw_payload` (jsonb) — **never discard
the original**; a better parser can re-run over it later.

### 2. Reconcile — two tiers (honest confidence is the whole contract)
The review gate ("confirm only low-confidence") only works if confidence is
honest. So:

- **Tier 1 — deterministic (cheap, no AI):** exact + fuzzy string match of
  `parsed_name` / `raw_text` against this household's `catalog_items.name` plus
  globals. High-confidence hits auto-commit. Most repeat purchases land here.
- **Tier 2 — AI fallback:** only lines Tier 1 can't confidently place go to Claude,
  which returns the best catalog match **or** "new item," with a confidence score.

Every line carries `match_source` (`deterministic` / `ai` / `human`) and
`match_confidence` (0–1).

### 3. Review — confidence-gated (see mockup)
- Lines above the auto threshold: **collapsed**, quiet, auditable ("10 items
  matched"). Committed silently but visible on expand.
- Lines below threshold: **surfaced** with the AI's guess pre-filled and four
  actions: **Confirm** · **Pick another** · **Create new** · **Discard**.
- The review pile is finite and shown shrinking (progress bar).

**Threshold:** start at `0.80` (constant, not user-facing). Tunable after real
receipts. Above = auto; at/below = needs_review. "New item" always needs_review.

### 4. Commit
For each confirmed/auto line:
- Write `receipt_items` row (status `auto` or `confirmed`, final `catalog_item_id`).
- Refresh `catalog_items.price_hint` = **rolling average** (see below).
- `receipts.status = 'committed'`.

**v1 does NOT touch `list_items`.** Receipt is standalone. The list-loop
("mark bought") is Phase 2+. `session_id` column exists (nullable, unused) so the
loop wires in later with no migration.

---

## Schema (migration 014)

Two new tables. Follows existing conventions: `household_id` scope, soft-delete
`deleted_at`, `created_by uuid` → `users.id`, RLS via `is_member_of`.

### `receipts`
| column | type | notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| household_id | uuid NOT NULL | RLS scope |
| session_id | uuid NULL | Phase 2 hook, unused v1 |
| source | text NOT NULL | `'photo' \| 'email' \| 'api'` |
| store_name | text NULL | parsed |
| purchased_at | timestamptz NULL | **receipt date**, not import date |
| total | numeric NULL | parsed; reconcile vs. sum of lines |
| status | text NOT NULL | `'parsing' \| 'review' \| 'committed' \| 'discarded'` |
| raw_payload | jsonb NULL | full extraction — never discard |
| created_by | uuid | |
| created_at | timestamptz | `now()` |
| deleted_at | timestamptz NULL | |

### `receipt_items`
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| receipt_id | uuid NOT NULL | FK → receipts |
| raw_text | text NOT NULL | audit anchor — exactly what was printed |
| parsed_name | text NULL | AI's cleaned name |
| quantity | numeric NULL | |
| price | numeric NULL | grounds `price_hint` |
| catalog_item_id | uuid NULL | the match; NULL = unmatched/new |
| match_confidence | numeric NULL | 0–1, drives the gate |
| match_source | text | `'deterministic' \| 'ai' \| 'human'` |
| status | text | `'auto' \| 'needs_review' \| 'confirmed' \| 'discarded'` |
| created_at | timestamptz | `now()` |
| deleted_at | timestamptz NULL | |

**RLS:** both tables — membership via `is_member_of(household_id)` on `receipts`;
`receipt_items` authorized through its parent receipt's household. Use
`auth.jwt()->>'sub'` for identity, never `auth.uid()`. `SECURITY DEFINER` RPC for
commit if RLS keystones it.

---

## Rolling average — price_hint

`price_hint` stays a **denormalized cache** of "recent price." On commit, for each
confirmed catalog item, recompute the average from the **last N `receipt_items.price`**
for that item (default **N = 5**), rather than blending blindly into the old value.

Why derive instead of store a counter: no new column, and the average is always
computed from real history. `receipt_items` is the source of truth; `price_hint`
is a convenience mirror for the list UI. Phase 3 price history queries
`receipt_items` directly.

---

## Deferred, with hooks (do NOT build in v1)

- **Alias learning table** — deferred. `match_source` is the hook; every
  `match_source='human'` line in `receipt_items` IS the training set. Backfill an
  alias table from one query in Phase 3. **Discipline: never hard-delete confirmed
  `receipt_items`** — that's future training data. Soft-delete only.
- **List loop** (`list_items` "mark bought") — Phase 2+, `session_id` hook present.
- **Email / API adapters** — v2 / v3, core is source-agnostic.

---

## Entry points (both)
1. **End of a shopping session** — offered when a session wraps.
2. **Standalone** — import any receipt anytime (this is why receipt is a
   first-class object with nullable `session_id`, not a session appendage).

---

## Done when
- Photo → parsed structured lines via Claude vision.
- Tier 1 auto-matches repeat items; Tier 2 handles the rest with honest confidence.
- Review screen surfaces only sub-threshold lines; auto lines collapsed & auditable.
- Commit writes `receipts` + `receipt_items` and refreshes `price_hint` (rolling avg N=5).
- No write to `list_items`. `raw_payload` + `raw_text` persisted.
- RLS verified on both tables in the **correct environment** (query by project ID,
  not the Supabase badge).

## Watch-outs
- **Honest confidence is load-bearing.** If Tier 2 returns "0.95 trust me" for
  everything, the gate is theater. Test with a deliberately ambiguous line.
- **Vision extraction is the unproven part.** Test on a real crumpled receipt,
  not a clean synthetic one, before trusting the pipeline.
- Sum-of-lines vs. parsed `total` mismatch is a useful sanity signal — surface it,
  don't silently swallow.
- Dev-first. Verify on deployed dev preview. Stop at dev. Promote only after check.
