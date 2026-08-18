# SPEC — Cycle integrity (migration 031)

**Supersedes:** the "Cycle-integrity bugs" row in `docs/ROADMAP.md` NEXT, and all
prose references to a migration numbered **027**.
**Date:** 2026-07-31
**Status:** Design-approved, unbuilt
**Scope:** SQL only. No client changes. No user-visible behaviour change.

---

## A. The number is 031, and 027 is retired

The ROADMAP has referred to this work as "027" across five references —
in sequencing notes, in DECISIONS entries, and inside forward-references
embedded in the bodies of `025_meals.sql` and `026_resurrect_integrity.sql`.

**No file numbered 027 has ever existed.** Since those references were written,
`028`, `029` and `030` have all shipped. The high-water mark in `migrations/` is
now **030**, so this work takes **031**.

Per the standing principle — *migration numbers are assigned at point-of-build,
not design time* — this is the expected outcome of a number claimed in prose and
left unclaimed on disk. **Do not create a 027 stub.** Instead, when merging this
spec, correct the five prose references to read 031 and delete the ROADMAP NEXT
item proposing a header-only 027 reservation. The gap between 026 and 028 is
honest drift and joins 009–012 and 017 as a documented gap; per the standing
rule, **never reconstruct a migration.**

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

**Deploy decision: 025 + 026 + 031 ship to prod as one SQL batch.** No client
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
| **`close_cycle` survivor sweep (Bug A)** | **Deferred, no evidence.** Query 1's rows were created *after* a close — that is insert-side, which `026` fixes. No row anywhere shows the close-side orphaning Bug A describes. Do not build a fix for a defect with no instance. |
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
2. **031 → dev.** D1, D2, D3 in order. Verify per §F.
3. **025 + 026 + 031 → prod as one SQL batch.** Verify §F5 against a real
   household.
4. **Then** build create-meal UI. `dev→main` stays closed until the Meals lens
   is user-complete — a lens a user cannot populate is the failure mode the
   ROADMAP already names.
