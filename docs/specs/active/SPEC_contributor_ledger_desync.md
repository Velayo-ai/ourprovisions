# SPEC — Contributor badges: a badge is the last thing you said

**Scope:** OurProvisions · DB (RPC + migration) + client · **Status:** model decided, build gated on one open question
**Supersedes:** the earlier "ledger desync" A/B/C framing. Model decided 2026-07-15.
**Origin of the bug:** migration 009-era. Predates the F0/F1b integrity work.

## The model

> **Your badge reflects the last thing you said. Only your own action changes it. Everyone else's actions change the number, never your statement.**

**Attribution comes from utterance, not from arithmetic.** The badge is not an allocation of the quantity — it is a record of who has spoken. Silence is not withdrawal.

### The rule
Your badge clears when **you** either:
- **(a)** reduce by the full amount you asked for (or more), or
- **(b)** reduce to zero (which removes the item for everyone anyway).

Otherwise your ask stands, regardless of what anyone else does to the number.

Anyone may set the shared quantity to anything. **No blocking, no warning, no permission.** ("We should not need software to protect people from other people in the house.") A person with no ask (Elly) can set the number freely and never appears on the badge — she said the household needs fewer; she never said she wants any.

**Present tense.** The badge answers *"who wants this now"* — not *"who has ever wanted this."*

### Worked scenarios
| # | Sequence | Row | Badges | Why |
|---|---|---|---|---|
| 1 | DH +5, DT +5, **DH −5** | 5 | **DT** | DH reduced by his full ask → (a) clears. DT silent → holds. |
| 2 | DH +5, DT +5, **DT −3** | 8 | **DH, DT** | DT reduced partially → holds. DH silent → holds. |
| 3 | DH +5, DT +5, **DH −3, DT −2** | 5 | **DH, DT** | Both partial → both hold. |
| 4 | DH +2, DT +2, Elly +2, **DH −5** | 1 | **DT, Elly** | DH reduced by more than his ask of 2 → (a) clears. DT, Elly silent → hold. Two badges on one apple is **correct** — two people want apples, there's one apple, the household sorts it out. |
| 5 | DH +5, DT +5, **Elly →2**, **DH →1** | 1 | **DH, DT** | Elly has no ask → never badged, only moved the number. DH gave up only 1 of his 5 → holds. He still wants apples. |

Scenario 5 accepted deliberately: *if there aren't enough remaining that you can't exit unless it goes to zero, that's OK.* No special case at qty 1 — no discontinuity, no "why 1 and not 2."

## Consequences (accept deliberately)
- **`quantity_added` is not an allocation.** Row quantity and the sum of asks may legitimately diverge (scenario 4: row 1, asks DT:2 + Elly:2). Do **not** derive row quantity from the ledger.
- `list_items.quantity` remains the authoritative shared number. The ledger is a list of **who**, not **how much**.
- Keep `quantity_added` as "what I asked for" — needed to evaluate rule (a), and plausibly useful later (smart ordering, "Elly always wants 2").
- **You can never lose your badge without acting.** Correct by construction.
- Badge count may exceed what the quantity can satisfy. That's a household conversation, not a data error.

## What's broken today
**`remove_list_item` (migration 009) clears ALL contributor rows when ONE person removes the item.** Under this model that's a category error: DH's action retracts DT's and Elly's statements. 009's comment says it clears contributors to stop "badge-resurrection on re-add" — but under this model, your badge surviving your own remove→re-add is not resurrection; it's you still wanting the item. **009 solved the wrong problem.** ⚠️ Strong claim about a shipped migration — verify before acting.

Downstream symptom (verified prod 2026-07-14): remove clears the ledger; the revive path (`update … deleted_at: null`) restores the row without restoring the ledger → live row with a ledger that contradicts it → the `<= 1 contributor` UI branch fell back to the stale immutable `added_by` scalar → displayed "Dan Test User" for an item whose only contributor was Dan Holmes. (Display half already fixed — see below.)

## The fix
1. **`remove_list_item` clears only the caller's contributor row.** Soft-delete it (`deleted_at` exists on the table and is unused — it was built for this).
2. **Decrement (qty > 0):** touches no contributor row *except* the actor's, and only when rule (a) fires → soft-delete the actor's row.
3. **Revive path** must restore surviving contributor rows alongside the row, so a live row never carries a contradicting ledger.
4. **`added_by` is dead as a display source.** Remaining reader: remove-confirm dialog (`App.js` ~2683, `addedByName`). Point it at the ledger, then drop `added_by` or demote to audit-only.

## Invariant
> A live `list_items` row must never carry a contributor ledger that contradicts it — and **no user's action may soft-delete another user's contributor row.**

Make the bad state unrepresentable, not merely prevented (same discipline as F0's `uq_live_list_item`).

## ⚠️ Open question — gates the build
Rule (a) needs the **delta** ("DH reduced by 5"), but the stepper only reports an **end state** ("row is now 5"). To evaluate "did you reduce by your full ask," the write path must know the actor's prior ask and compute against it — feasible (the ledger has `quantity_added`), but confirm the client can attribute a quantity change to an actor reliably under polling/optimistic updates. **Resolve before building.**

## Already done (2026-07-14, prod)
Shop name-line now derives from the live contributor ledger instead of `added_by`. `contributors.length === 1 && !isOwnItem` → render `contributors[0].fullName`; `isOwnItem` re-sourced from `soleContributor.clerkId`; `> 1` badge branch untouched. That made the app honest about what it knows; this spec makes it know more.

## Verify (dev, three accounts)
1. Run all five scenarios above; assert row qty **and** badge set.
2. Own remove → re-add: badge returns, no duplicate contributor row.
3. One person removes to 0 → row gone for everyone; only the actor's contributor row soft-deleted; others' statements intact for a later re-add.
4. Regression: two-contributor item still shows two badges.

## Notes
- Not urgent: quantities and shared-list correctness are unaffected. This is attribution fidelity.
- `full_name IS NULL` users (jeanlhennessy, danholm@cisco) are unrelated — months-old signups, unpopulated profile names.
