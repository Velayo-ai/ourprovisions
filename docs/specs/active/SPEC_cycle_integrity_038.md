# SPEC — Cycle integrity (migration 038)

**Supersedes:** the "Cycle-integrity bugs" row in `docs/ROADMAP.md` NEXT, and all
prose references to a migration numbered **027**.
**Date:** 2026-07-31 (renumbered 031 → 038 on 2026-08-17 at point-of-build)
**Status:** Design-approved, unbuilt
**Scope:** SQL only. No client changes. No user-visible behaviour change.

---

## A. The number is 038 — 027 lapsed, and then 031 lapsed too

The ROADMAP referred to this work as "027" across five references — in sequencing
notes, in DECISIONS entries, and inside forward-references embedded in the bodies
of `025_meals.sql` and `026_resurrect_integrity.sql`. **No file numbered 027 has
ever existed.**

> **⚠️ CORRECTED 2026-08-17 — THE SAME LAPSE HAPPENED A SECOND TIME.** This spec
> was written on 2026-07-31, when the high-water mark was `030`, and it therefore
> claimed **031**. It was not built that day. In the interval `032`, `033`, `034`,
> `035`, `036` and `037` all shipped. **`031` was never created either** — a number
> claimed in prose and left unclaimed on disk, exactly the failure this section was
> written to describe.
>
> The high-water mark in `migrations/` is now **037**, so at point-of-build this
> work takes **038**. Filing it as `031` would sort it below `032` and imply an
> application order that never happened.
>
> **`031` now joins `009`–`012`, `017`, `023` and `027` as documented drift.** Per
> the standing rule, **never reconstruct a migration.**
>
> **The lesson is not "renumber more carefully" — it is that a design-time number
> in a spec title is a liability.** This spec's own doctrine predicted its own
> renumbering and was still followed a day late.

Per the standing principle — *migration numbers are assigned at point-of-build,
not design time* — **do not create a `027` or `031` stub.** When merging this spec,
correct the prose references to read **038** and delete the ROADMAP NEXT item
proposing a header-only `027` reservation.

---

## B. Why this shrank from a multi-part pass to an afternoon

The original 027 was scoped as a four-part consolidated pass with a
detector-first sequence, on the premise that prod held **an actively firing
defect**. A dating query on 2026-07-31 disproved that premise.

**Evidence (prod, read-only, seven queries):**

| Finding | Rows | Dates |
|---|---|---|
| Live `list_items` in a closed cycle | 2 | Both 2026-07-14, created 6 and 6½ min *after* the cycle closed. `created_at == updated_at` — untouched since. |
| Live `list_items` with NULL `cycle_id` in a household with an open cycle | **0** | The BVI/Carrots shape is **not present on prod.** |
| Households with >1 open cycle | 1 (`Our calendar`) | Both cycles 2026-07-16, **5m41s apart**, both `planned`, both `seeded_from` NULL. |

Every known-bad row falls inside a **48-hour window, 2026-07-14 to 07-16.**
Nothing since. Prod has been exercised in the fifteen days that followed —
**nine cycle-closes across three households**, 26 items created — and produced
**zero** new violations. Cycle-close is precisely the operation implicated in
both incidents. Both are single-household, minutes-apart clusters: the signature
of rapid manual testing, not of a defect firing under normal use.

**Conclusion: residue, not an active defect.**

> **⚠️ OVERTURNED 2026-08-17 — THIS CONCLUSION DOES NOT HOLD. Re-measured on prod
> (`system_identifier` 7606130613603586966) immediately before building `038`.**
>
> The 07-31 census reported **2** live `list_items` in a closed cycle, both `Lake
> house`, both 2026-07-14. Today the same shape returns **18 rows across 4 live
> households** — BVI 8, Sacandaga 7, Lake house 2, Madbury 1 — with cycle closes
> spanning **2026-06-07 to 2026-08-08**. Most of these rows predate 07-31, so they
> were present when the census ran; the census under-counted rather than the data
> having grown into it. **The "48-hour window, 2026-07-14 to 07-16, nothing since"
> claim is false.**
>
> Worse, the two shapes are not the same defect:
>
> | Shape | Test | Rows | Cause | Fixed by |
> |---|---|---|---|---|
> | Insert-after-close | `item.created_at > cycle.closed_at` | **2** (Lake house) | client wrote into a closed cycle | **`026`**, in this batch |
> | **Close-orphan (Bug A)** | `item.created_at < cycle.closed_at` | **16** | `close_cycle` never sweeps unrolled survivors | **nothing — still open** |
>
> **The newest close-orphan is 2026-08-08 — nine days before this build.** That is
> not testing-era residue. Confirmed structurally, not inferred: the live
> `close_cycle(uuid, uuid[])` body closes the cycle, and when `p_roll_item_ids` is
> empty it `return null`s immediately; unrolled live items keep `cycle_id` pointing
> at the cycle just closed. There is no sweep on either branch.
>
> **What survives:** the `Our calendar` double-open finding (D1) and the case for
> the unique index (D2) are unaffected — both re-verified today. **What does not:**
> the residue framing in this section, the D3 row count, and the Bug A deferral in
> §E. The close-side defect is tracked as **its own ROADMAP item**, deliberately
> **not** folded into `038`'s scope.

### Three caveats that bound that conclusion — keep them

1. **Post-07-16 activity is thin.** Nine closes is a real signal but a handful
   of users is not a population. "Has not recurred" is weaker evidence here
   than the same sentence would be on a busy app.
2. **Nothing structurally prevents recurrence.** Prod has no resurrect trigger
   and no server-side cycle resolution until `026` lands, and no database-level
   guarantee until Part 4b, since `authenticated` still holds unfiltered UPDATE
   on `provision_cycles`. Absence of new violations reflects **client
   behaviour, not enforcement.**
3. **We cannot say which fix closed it, or whether one did.** These rows
   predate every migration in this session. The correlation is with the end of
   the heavy-testing era, not with a specific commit — consistent with founder
   context, but coincidence in time, not demonstrated cause.

Caveat 2 is exactly what the unique index converts from *hasn't* to *cannot*.
That is this migration's whole job.

---

## C. The gate was inverted — this is the important finding

The ROADMAP holds 025+026 out of prod **behind** this migration, on the
reasoning that we shouldn't ship code into a state we can't explain.

**That gate protects nothing, and it preserves the harm it was built to
prevent.** Query 1's shape — items written into a closed cycle — is precisely
what `026`'s server-side resolution in `insert_list_item` prevents. Holding
`026` back keeps prod running the **unfixed** insert path. The gate has been
maintaining the condition it was erected to guard against.

**Second-order unlock:** the reason the 15-commit `main` gap is dangerous is
that nine of those commits are meals client code that would ship against a prod
database with **no `meals` tables**. Applying 025+026 removes that hazard
entirely. **The migrations are what unblocks the backlog, not what waits on it.**

**Deploy decision: 025 + 026 + 038 ship to prod as one SQL batch.** No client
change rides along, so there is no user-visible difference — the meals *UI*
still reaches prod only when `dev→main` merges, gated separately on create-meal
UI landing.

---

## D. Scope — three items, in this order

Order is load-bearing: **D1 must complete before D2**, or the index creation
fails.

### D1. Resolve `Our calendar` — APPROVED BY DAN 2026-07-31

Two open cycles, 5m41s apart, holding **2** and **14** live items.

**Decision: keep the 14-item cycle as survivor.** Repoint the 2 items into it,
then close the 2-item cycle.

**Why this is safe to execute without contacting the user:**
`get_list_items_for_household` filters household, `deleted_at` and status —
**not `cycle_id`.** All 16 items are already visible to that user right now.
The merge is accounting-only: nothing appears, nothing disappears on their
screen.

**Requirements:**
- Set `cycle_id` on the 2 items to the survivor cycle id. **Do not** set
  `rolled_from_item_id` — these were never rolled forward.
- Close the emptied cycle by setting `closed_at`, not by deleting it. The row is
  history.
- Capture before/after counts in the paste file. The survivor must hold 16 live
  items after; the emptied cycle must hold 0.

### D2. The partial unique index — the actual fix

```sql
create unique index concurrently if not exists uq_open_cycle_per_household
  on public.provision_cycles (household_id)
  where closed_at is null and deleted_at is null;
```

This converts caveat 2 from a hope into a guarantee: **more than one open cycle
per household becomes structurally impossible.**

Per the `uq_live_list_item` precedent — **`CREATE UNIQUE INDEX` succeeding is
itself proof the underlying data is clean.** If it fails, D1 is incomplete or
another household drifted since the census; re-run the query, don't force it.

Note `concurrently` cannot run inside a transaction block. Per the standing
rule about never splitting a transaction across SQL editor runs, this is a
**bare auto-commit statement**, run on its own.

### D3. The two stranded Lake house rows

> **⚠️ SCOPED 2026-08-17 — 18 rows match this shape, but `038` repoints only these 2.**
> Decision (Dan, 2026-08-17): repair only the **2 Lake house rows**. They are the
> insert-after-close shape whose cause — the unguarded `insert_list_item` path — is
> fixed by `026` **in this same batch**, so the repair and its structural fix land
> together. The other **16 rows are close-orphans from a defect that is still live**;
> repointing them would erase the primary evidence of a bug we have not yet fixed and
> would be re-dirtied by the next `close_cycle` with unrolled items. **They are left
> in place, untouched, on purpose.** No user-visible consequence either way —
> `get_list_items_for_household` filters household / `deleted_at` / `status` and
> **never reads `cycle_id`** (re-confirmed against the live function body today).
>
> Measured today: `Lake house` (`58ec251c-…`) holds **exactly 2 live items — both of
> them these** — and **one** open cycle, `1522085c-02f3-4824-93d0-dce133c3ab3f`
> (opened 2026-07-14 00:12:28, **3 minutes after** the two inserts), currently holding
> **zero**. The branch is therefore the *has an open cycle* branch; the NULL branch
> does not apply. Because the scope is two named rows, **D3 is not portable** — it
> ships in the one-off UUID-keyed repair script alongside D1, not in the migration.

Two live items pointing at a closed cycle, both from 2026-07-14, untouched since.

**They must NOT be deleted.** They are live rows on a real household's list and
are visible to that user today. Tombstoning them would make two items **vanish
from a user's list** — turning an accounting cleanup into a user-visible edit.

**Repoint, don't remove:**
- If Lake house **has** an open cycle → set `cycle_id` to it.
- If Lake house has **no** open cycle → set `cycle_id` to NULL.

NULL is a legitimate post-026 state and is explicitly not an alarm condition.
Check which branch applies before writing the statement; do not assume.

---

## E. Deliberately dropped from the original 027

| Item | Disposition |
|---|---|
| **Cycle-integrity detector** (two alarms) | **Dropped.** An alarm proving zero violations against 15-day-old residue demonstrates nothing, and D2 makes the second alarm structurally unreachable. The standing rule *never ship an alarm you haven't watched fire* argues **against** building it here, not for it. |
| **`close_cycle` survivor sweep (Bug A)** | ~~**Deferred, no evidence.** Query 1's rows were created *after* a close — that is insert-side, which `026` fixes. No row anywhere shows the close-side orphaning Bug A describes. Do not build a fix for a defect with no instance.~~ **⚠️ REVERSED 2026-08-17 — THE EVIDENCE EXISTS AND WAS MISSED.** 16 live prod rows across BVI / Sacandaga / Madbury show the close-side shape (`created_at < closed_at`), newest **2026-08-08**. The sentence *"No row anywhere shows the close-side orphaning Bug A describes"* was wrong when written. Confirmed in the live function body: `close_cycle` closes the cycle and, when `p_roll_item_ids` is empty, returns immediately — unrolled live items keep pointing at the closed cycle, on both branches. **Still deliberately NOT built in `038`** (Dan, 2026-08-17: do not design the fix tonight) — promoted to **its own ROADMAP item** so it is tracked as an open defect rather than a dropped one. |
| **Server-side cycle resolution in `openCycle` / `updateQty` / `wrapUpTrip`** | **Deferred.** These are client-path changes; this migration is SQL-only. D2's index is the backstop that makes the client ref harmless. Revisit if a violation ever recurs. |
| **Retire `p_cycle_id` from both RPCs + the hook** | **Deferred** — touches the client. Safe to do once D2 has held for a while. |
| **Remove `add_meal_to_list`'s redundant provenance clear** | **Deferred** — the standing rule is to drop the redundant guard only after `026`'s trigger is watched working **in prod**, never both guards in one release. 026 reaches prod in this batch; earliest this can go is the batch after. |
| **`item_count` formula** | **Deferred.** Unrelated to integrity; no evidence of user impact. |

---

## F. Verification

1. **Before D2:** re-run the double-open-cycle census. Must return **zero
   households.** If it returns any, stop — something drifted since the 07-31
   dating query.
2. **D1:** survivor cycle holds 16 live items; emptied cycle holds 0 and has a
   non-null `closed_at`.
3. **D2:** index exists and is `indisunique`, `indisvalid`. A second
   `insert into provision_cycles` for a household with an open cycle raises a
   unique violation. **Test this on dev with a throwaway household** — the index
   is worthless if unproven.
4. **D3:** zero live `list_items` pointing at a closed or deleted cycle.
5. **Prod, after the batch:** open the app as a real user in the `Our calendar`
   household and confirm **16 items visible, unchanged.** The accounting moved;
   the list must not have.

Per the standing rule: **no step is verified without output in front of us.**
Screenshot or query result, not a claim.

---

## G. Sequence

1. 030 applied + §F green on dev, `dev` pushed. *(In flight.)*
2. **038 → dev.** D1, D2, D3 in order. Verify per §F.
3. **025 + 026 + 038 → prod as one SQL batch.** Verify §F5 against a real
   household.
4. **Then** build create-meal UI. `dev→main` stays closed until the Meals lens
   is user-complete — a lens a user cannot populate is the failure mode the
   ROADMAP already names.
