# SPEC — Delete Household

**Scope:** OurProvisions
**Status:** Design approved (this chat, 2026-06-26). Ready for Claude Code build.
**Depends on (all already live):**
- Layer 2 removal-notice + auto-provision machinery (`checkPresence`, `systemMessage`
  channel, `switchHousehold`, `provisioningRef` in-flight guard) — fully validated on dev.
- `create_household` RPC (migration 006).
- `showResetConfirm` two-stage in-modal confirm pattern (App.js:328, 2414) — reuse, do
  NOT use `window.confirm`.
- `is_member_of` (migration 003).

---

## 1. What this builds

The owner-only ability to delete (soft-delete) an entire household. The DELETE HOUSEHOLD
button was hidden Jun 25 (owner-branch renders `null`); this restores a *real* button
backed by a real RPC, behind a branded confirm, with honest data-loss warning.

**Core insight — this is ~80% composition of Layer 2.** To a surviving member, "the owner
deleted this household" is observationally identical to "I was removed from this household":
the household vanishes from `get_my_households`, the existing 30s `checkPresence` already
catches it, and the existing removal notice + switch/auto-provision path already handles it.
The genuinely new code is the `delete_household` RPC and a confirm-gated button.

---

## 2. The seven locked decisions

| # | Decision | Resolution |
|---|---|---|
| D1 | Mechanism | **Soft-delete** — stamp `deleted_at = now()` cascading down. Sidesteps all `NO ACTION` FKs (nothing physically removed → nothing orphaned). |
| D2 | Waste/cycle history | Soft-delete with everything else. No cross-household analytics use case. Rows survive physically if ever wanted. |
| D3 | Who can delete | **Owner only** (`households.created_by` = actor). Enforced server-side in the RPC, not just UI. |
| D4 | Last-household guard | Reuse Layer-2 auto-provision: if delete leaves the owner with zero memberships, provision a fresh "My Household". Never zero memberships. |
| D5 | Active-household guard | Reuse Layer-2 switch-to-survivor: if the deleted household was active, switch lens to a survivor (or D4's fresh one). |
| D6 | Surviving members | Reuse Layer-2 removal notice. **Neutral copy, no cause attribution** — members learn the household is gone and they've been moved, not who/why. |
| D7 | Catalog rescue | **Warn now, clone-button later.** Confirm modal counts the household's custom catalog and warns honestly. The clone-first escape hatch lands when clone-forward (`SPEC_create_household_from_template.md`) ships. |

---

## 3. PREREQUISITE (do FIRST, before writing the RPC)

**Enumerate the live `household_id`-bearing tables on dev.** The column-inventory CSV
truncated and does NOT show all prod tables. Confirmed-live-on-prod-but-absent-from-CSV:
`provision_cycles`, `shopping_sessions`, `known_stores`, `list_item_contributors`.

Run on **dev** (`zxwtxjjmssykhqrghouf`):
```sql
select table_name, column_name
from information_schema.columns
where column_name = 'household_id' and table_schema = 'public'
order by table_name;
```
Also find any table that references the household transitively (e.g. `list_item_contributors`
references `list_items`, not `household_id` directly — must be cascaded in FK order anyway).

**A cascade that misses a table leaves orphaned rows pointing at a dead household.** Do not
trust this spec's table list — derive it live.

---

## 4. The RPC — `delete_household(p_household_id, p_actor_clerk_id)`

SECURITY DEFINER (cross-user cascade bypasses per-user RLS — same pattern as
`get_list_items_for_household`). One transaction.

**Steps:**
1. **Resolve actor:** `users.id` from `p_actor_clerk_id` (clerk_id string, not uuid — see
   `auth.jwt()->>'sub'` convention).
2. **Guard — owner only:** `households.created_by` must equal the resolved actor id.
   Else `RAISE EXCEPTION`. Defense in depth (UI also owner-gates the button).
3. **Guard — household exists and not already deleted:** `deleted_at IS NULL`. Else RAISE
   (idempotency / double-tap safety).
4. **Soft-delete cascade**, stamping `deleted_at = now()` in FK-dependency order. Derive the
   exact set from §3; the order (deepest dependent first) is approximately:
   `list_item_contributors` → `list_items` → `catalog_items` (custom only:
   `is_global = false` / `household_id = p_household_id`) → `waste_events` →
   `shopping_sessions` → `provision_cycles` → `known_stores` → `household_invites` →
   `household_members` (ALL rows, every member) → `households`.
   - Each UPDATE filters `where household_id = p_household_id and deleted_at is null`.
   - Tables lacking a `deleted_at` column: confirm during §3. If a referenced table has no
     `deleted_at`, decide per-table (likely leave it — soft-delete of the parent is enough
     since reads filter on the parent). Flag any such table in the build session.
5. **Return** `{ deleted: true, member_count, household_id }`.

**Verify with** `select proname, position('delete_household' in prosrc) > 0 from pg_proc`
(avoids the SQL-editor `LIMIT 100` truncation on `pg_get_functiondef`).

---

## 5. Owner's client path (after RPC succeeds)

The owner is now a member of a soft-deleted household → **reuse the exact Layer-2
switch-or-provision branch:**
- ≥1 other live household → `switchHousehold(survivor.id)`.
- 0 remaining → auto-provision fresh "My Household" via `create_household`, guarded by the
  existing `provisioningRef` (no duplicate provision on flaky wifi), then switch.

Owner sees a **confirmation toast** ("Household closed"), NOT the removal notice — they did
this deliberately. `refreshHouseholds` after the switch.

---

## 6. Surviving members' path (almost free)

The existing 30s `checkPresence` (in `ActiveHouseholdContext`) already fires when the active
household disappears from `get_my_households`. A soft-deleted household disappears exactly
like a removal. Extend the existing **removed-vs-left disambiguation** (§3 of
`SPEC_layer2_removal_notice`) only insofar as needed: a deletion is NOT a self-departure, so
`selfDepartureRef` is false → the **removal notice fires** and the switch/provision branch
runs. **No new copy, no cause attribution (D6).** Members get:
`No longer a member of {oldHouseholdName}.` (+ line 2 if auto-provisioned).

No new server surface. No RLS change. The transient/suspect-empty guards already protect
against marine-wifi false positives.

---

## 7. The button + confirm (new UI)

**Location:** owner-branch of the household-manage sheet — the ternary that currently renders
`null` (hidden Jun 25). Render a real **DELETE HOUSEHOLD** button, destructive styling,
visually separated from Save/Cancel.

**Confirm — reuse the `showResetConfirm` two-stage in-modal pattern (App.js:2414), NOT
`window.confirm`.** First tap reveals the confirm; second tap fires the RPC.

**Confirm copy (D6 + D7 — honest blast radius, honest catalog loss):**
- Always: `Closing "{name}" removes it for all {memberCount} members, including their lists.
  This can't be undone.`
- **If custom catalog non-empty (D7 warning):** append
  `This household has {customItemCount} custom catalog items — they will be permanently
  removed.`
  - Count = `catalog_items where household_id = {id} and is_global = false and
    deleted_at is null`. Resolve count client-side from already-loaded catalog, or a small
    count RPC — decide in build (prefer reusing loaded state, no new round-trip).

**D7 upgrade path (NOT this build):** when clone-forward ships, add a "Clone catalog to a new
household first" button beside "Delete anyway" in this same confirm. Copy upgrades from
*warning* to *rescue*. One-line change + button wiring — leave a `// D7: clone escape hatch`
marker comment at the confirm site.

---

## 8. Build sequence

0. **§3 prerequisite** — enumerate live `household_id` tables on dev. Gate everything on this.
1. Write `delete_household` SECURITY DEFINER RPC on **dev**. Verify via `pg_proc.prosrc`.
2. Owner-side: wire RPC call → reuse Layer-2 switch/provision → confirmation toast.
3. Surviving-member side: confirm `checkPresence` catches the deletion and fires the removal
   notice unchanged (it should require zero new code — verify, don't rebuild).
4. Button + two-stage confirm in the owner-branch of the manage sheet, with the §7 copy
   (including the D7 custom-item-count warning).
5. **Multi-account test on dev** (DH owner + DT member): owner deletes a shared household →
   owner lands on survivor/fresh; DT (the member) gets the removal notice within ~30s and is
   moved. Test the last-household case (owner auto-provisions). Test the catalog-count warning
   fires when custom items exist.
6. Hold `dev→main` until all green. One tested commit per step.

---

## 9. Acceptance tests

- Owner deletes a shared household → owner switches to a survivor; no removal notice for owner.
- Member of that household → within ~30s, removal notice fires, member moved to survivor/fresh.
- Owner deletes their ONLY household → owner auto-provisions fresh "My Household"; no duplicate
  provision under repeated interval fires (`provisioningRef` holds).
- Non-owner attempts delete (forced RPC call) → RPC RAISEs; no rows stamped.
- Double-tap delete (idempotency) → second call RAISEs on `deleted_at IS NULL` guard; no
  double cascade.
- Household with custom catalog → confirm copy shows the "{N} custom items permanently
  removed" warning; count matches live custom catalog.
- Household with no custom catalog → warning line absent.
- Post-delete: no orphaned rows in ANY `household_id`-bearing table (run the §3 query filtered
  to the deleted id; all dependents carry `deleted_at`).

---

## 10. Open items for the build session (flag, don't guess)

- **Full table set** (§3) — derive live; spec's list is a starting point, not authoritative.
- **Tables without `deleted_at`** — decide per-table during §3.
- **Custom-item count source** — reuse loaded catalog state vs. small count RPC. Prefer no
  new round-trip.
- **D7 clone escape hatch** — deliberately deferred to the clone-forward build. Leave a marker.
