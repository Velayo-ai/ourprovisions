# SPEC — Crew-based catalog sharing (Madbury ↔ Sacandaga)

**Scope:** OurProvisions
**Status:** Design approved, not built
**Session decision date:** 2026-08-23
**Author:** Design-chat Claude → for Claude Code

---

## Why this exists

Families running two households (Madbury, Sacandaga) currently rebuild the custom catalog
twice — a household-scoped `catalog_items` row created at one house doesn't exist at the
other. This spec makes catalog sharing **optional, per household-pair**, without touching
lists (which must stay fully separate) or without duplicating rows.

---

## Decisions locked this session

| Decision | Choice | Rationale |
|---|---|---|
| Lists | Never shared, never merged, always household-local | Lists reflect what's needed *this week at this house* — inherently local. Not up for debate; every design below assumes this holds. |
| What's shareable | The catalog (item + category), not the list | The catalog is the menu of possible items; the list is what's currently on it. Two different things that were being conflated in early conversation. |
| Sharing mechanism | Reuse the existing, currently-inert `velayo_crews` / `households.crew_id` layer | It already exists for exactly this — "harbor-level identity that links households." Using it here also forces the overdue RLS fix (Clerk-string-vs-uuid mismatch, already flagged as known debt) rather than inventing a parallel grouping concept the brand docs explicitly rejected. |
| Sharing scope | Optional, opt-in, **per household-pair** — not global, not automatic | A household only pools its catalog with siblings sharing its `crew_id`. A household with no crew link (e.g. BVI, standalone) behaves exactly as today. |
| Write path | Unchanged — a new custom item is still inserted with `household_id = active household` | No migration of existing rows. Sharing is a read-time widening, not a data restructure. |
| Read path | Widened — a household's custom-catalog read becomes "this household's items OR any crew-sibling's items" | Categories ride along for free (category is just a column on `catalog_items`, not a separate entity). |
| Who links two households | Not user-facing UI at this scale — an admin RPC Dan calls directly | This happens rarely (a handful of household-pairs, ever, at current scale). Building a self-serve "Link Households" screen now is UI for a workflow with ~0 repeat frequency; revisit if/when other families need to self-serve it. |
| Membership vs. sharing | Fully orthogonal | A person can belong to any number of households with no bearing on catalog sharing, which rides only on the household↔household crew link. Confirmed against: mismatched rosters (Sacandaga has Andrew, Madbury doesn't), Andrew having his own unrelated household, and a person leaving a household (catalog rows are unaffected — `created_by` is provenance only, `household_id` is what governs the row). |
| Unlink behavior | Clears the crew link; existing items **stay** in both households; only future sync stops | Matches the existing "leaving a household doesn't strip items" principle, applied to a household-pair instead of a person. |
| Hide | Stays personal, **unchanged**, no build required | `user_hidden_items` already has no household scope — a hide already applies everywhere that person shops. Verified this is the *desired* behavior (Elly/broccoli allergy: hide once, stays hidden at every linked household) rather than the bug it looked like earlier in the session. |
| Delete | Two-tier, lives inside the Edit Item sheet's danger zone — never on swipe | Swipe stays reserved solely for personal hide (no gesture collision). Delete is rare and consequential by design, so it earns deliberate friction — mirrors the already-shipped household-delete pattern (D3, `SPEC_household_management_phase1.md`: "you go *into* the thing to destroy it") and the meals two-stage delete confirm. |
| Delete — tier 1 (default) | "Remove from [Household]" — excludes the item from this household's catalog view only; the row and every linked household's access are untouched | The safe, everyday action. Only offered as a distinct choice when the item is actually crew-shared; a household's own unshared item has no second household to protect, so this collapses to a plain delete. |
| Delete — tier 2 | "Delete everywhere" — destroys the row for all linked households, named specifically (e.g. "also removes it from Sacandaga"), not a generic warning | Reserved for genuine cleanup (test items, mis-shared items). Requires a live existence check against sibling households so the confirm names them accurately — same shape as the already-logged meal-usage-count debt for catalog delete. |

---

## Build dependencies / must-fix-first

1. **Crew RLS bug** — `velayo_crews` / `velayo_crew_members` policies compare `auth.uid()`
   (uuid) against Clerk's string `sub`; they never match. Already flagged as known debt
   (NEXT #1). This spec is the forcing function — sharing is inert until this is fixed.
2. **Crew-aware dedup** — `insert_custom_catalog_item`'s idempotent reuse (migrations
   018/019) currently matches only *global* scope or *this household's own* custom items.
   Once reads widen to crew scope, the dedup check must widen with it, or the
   English-Muffins duplicate-row bug recurs at crew scale (Sacandaga could re-mint a
   "Sourdough Starter" that already exists at Madbury, both visible everywhere, now two
   live rows).

---

## New pieces still needing shape at build time

- **Household-scoped exclusion table** (tier-1 delete) — same row-presence shape as
  `household_staples` (migration 016): presence = excluded, `is_member_of`-gated RLS,
  no UPDATE path. Name TBD at build (`household_catalog_exclusions` or similar).
- **`link_households_to_crew(household_a, household_b)`** — SECURITY DEFINER RPC, creates
  a crew if none exists and sets `crew_id` on both households. Gated by `is_member_of` on
  *both* households (mirrors the existing security check in
  `create_household_from_template`). Migration number assigned at point-of-build per
  standing convention.
- **Unlink** — clearing `households.crew_id`. Confirm whether this needs its own RPC or is
  a plain update once the RLS fix lands.
- **Sibling-existence check** — small query/RPC used by both the tier-2 delete confirm and
  (later) any "who else has this" UI. Likely `select household_id from catalog_items where
  ... and household_id in (crew siblings)`.

---

## Explicitly out of scope for this spec

- **Meals sharing.** Parked — whether meals auto-pool across crew-linked households or stay
  on the locked 2026-07-28 give/accept-only model is undecided. Do not extend this spec's
  logic to `meals` without a separate decision.
- **Cross-household attribution edge case** — if a household-A member (not a member of
  household B) authored an item now visible in B via crew sharing, what does B's "added by"
  badge show? Noted, not solved. Doesn't block build; revisit at the item-card design pass.
