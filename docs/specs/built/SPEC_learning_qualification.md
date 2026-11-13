# SPEC_learning_qualification.md

**Scope:** OurProvisions · `users` / `households` flags + one task-scoped view + an `ARCHITECTURE.md` invariant
**Status:** ACTIVE — build-ready. No UI. No thresholds committed (deliberate; see D6).
**Authored:** 2026-09-20 (design chat)
**⚠️ SUPERSEDES `SPEC_learning_exclusion.md` (same session, earlier).** If that file is already in the airlock, **delete it** — do not build both. What changed and why is recorded at the bottom.

---

## Why

The consumption signal is the defensible asset, and demo traffic is currently indistinguishable from real shopping inside it. Measured, not suspected — `list_item_events` on dev, Sacandaga, 10-day window (2026-09-20):

- **2026-09-15 15:35:04 → 15:43:15 UTC** — two shopping sessions, two provision cycles, ~20 `checked` events, one Wrap Up. **Eight minutes.** A walkthrough for a guest, not a shop.
- Two further demo sessions on 09-11 and 09-12 in the same household.
- The same window produced one stray check that cost a five-day bug hunt, because the data could not say "this was a demo."

The learning query is **designed, not built** (046). This is the cheap moment: one predicate now, versus a rewrite plus an untrustworthy backfill later.

---

## The reframe (the central decision)

The first draft of this spec asked the user **"was this trip real?"** via a checkbox in the Wrap Up modal. That was wrong on two counts: it taxed every genuine trip with a decision relevant to roughly 1% of them, and — by its own design notes — it would be missed at precisely the moment it existed for, with a guest holding the phone.

The right question is not *"was this real?"* but **"has this trip earned its way into *this particular* learning task?"**

That reframe removes the UI entirely, and it splits qualification into two layers that must not be collapsed.

---

## Decisions

| # | decision | rationale |
|---|---|---|
| **D1** | **Two layers, never one flag.** (a) **Global exclusion** — `users.excluded_from_learning` and `households.excluded_from_learning`, booleans, default false. Nothing an excluded account or household produces counts for *any* task. (b) **Per-task qualification** — derived per learning task, in that task's own grain, never a stored verdict. | A demo was never real: global. A milk run *was* real — and is excellent staples and replenishment data — but teaches nothing about aisle order: per-task. One flag would starve `staples_candidate` in order to protect aisle-order. |
| **D2** | **Qualification, not inference.** A rule may only reject a trip when the trip would teach something **systematically false**, never when it merely looks suspicious. No duration heuristics, no "probably fake." | Inference is a guess about intent, unfalsifiable after the fact, and silently drops real data. Every leg in D4 names the specific false lesson it prevents — if a proposed rule can't name one, it doesn't belong. |
| **D3** | **Exclusion is a read-time lens over append-only events; correction is retroactive.** `list_item_events` is never edited or deleted. A session can be marked excluded *after* the fact. | Removes the decision from the user's path entirely. If Dan realises at 10pm that the 9:36 walkthrough was a demo, he marks it then. Same grain as "hide is a lens, not an edit" and "rows close, they don't die." |
| **D4** | **Aisle-order qualification has exactly three legs** (below). Each rejects a different false lesson. | See the table. |
| **D5** | **Name views after the task, never after "learning."** `aisle_order_sessions`, not `learning_sessions`. | A view called "learning sessions" will be read by the next staples query, which will then silently lose every errand — the exact failure D1 exists to prevent. The name is the guardrail. |
| **D6** | **Do not commit thresholds in this spec.** Ship the view with the measurements exposed and a deliberately permissive floor; set real numbers from the observed distribution across beta households. | A threshold picked tonight silently determines what the system is allowed to learn. Since exclusion is a lens over append-only events, waiting costs nothing and re-evaluating is a one-line change. **Store the measurements, derive the verdict** — never store the verdict, or a later threshold change rewrites history instead of re-reading it. |
| **D7** | **Record *why* a session didn't qualify, and watch the rate.** Reason codes: `excluded_account`, `excluded_household`, `no_store`, `no_traversal`, `no_pacing`. | This is a product instrument, not data hygiene. If errands dominate stock-ups, that is a real finding about how households shop. If most trips fail on `no_pacing`, check-sequence is the wrong signal for aisle order and receipt order (Phase 3) is the right one — worth discovering *before* Phase 2 is built on the other premise. |
| **D8** | **Carry global exclusion into DXA.** `setHousehold(id)` also sets `household.excluded_from_learning`. | RUM DXA went live on prod this week. A guest demo is a complete plan → lock in → shop → wrap up journey that nobody lived; it pollutes the funnel exactly as it pollutes the list. One attribute now, impossible to reconstruct later. |

---

## D4 — the three legs of aisle-order qualification

| leg | measure | rejects | the false lesson it prevents |
|---|---|---|---|
| **Anchored** | session resolves to a store | a demo at the kitchen table | attributing a route to no layout at all |
| **Traverses** | count of **distinct sections** visited ≥ floor | the milk run | learning the *errand* instead of the store — a targeted trip's path is dictated by its destination, not the layout. A dash for milk goes straight to dairy at **both** Market Basket (dairy first) and Hannaford (dairy last), so it "teaches" dairy-is-first in a store where dairy is last. |
| **Paced** | median inter-check interval ≥ floor | the cashier blast | learning the app's **own sort order** back. When the list is checked off at the register, the check order *is* the display order; feeding that in makes the model converge on its own output while appearing to learn. |

**Sections, not items.** Twelve items all in produce is a big list and a useless route; four items across four aisles is a small list and a real one. A section floor also **subsumes** any list-composition floor — a trip cannot visit more sections than its list contains — so no separate item-count or category-count rule is needed. One number, not three.

**Known simplification (write it down, don't let it harden):** thinness and wrongness are a continuum, and a gate draws a hard line through it. The statistically correct treatment is **weight, not gate** — a nine-section traversal is stronger evidence than a four-section one. Gating is the right v1 for legibility. When receipts land in Phase 3 there is a free empirical test: does an order learned from ≥6-section trips predict receipt order better than one from ≥3?

---

## Invariants (→ `ARCHITECTURE.md`)

- ★ **Every learning read filters global exclusion. Each learning task defines, names and documents its own additional qualification.** A learning query missing the global predicate is a defect, not a simplification.
- ★ **Qualification rejects only what would teach something false.** A rule that cannot name its false lesson is inference wearing qualification's clothes.
- ★ **Exclusion is a lens, not an edit.** Excluded events stay readable, exportable and forensically intact — they resolved the 09-15 stray-check hunt.
- ★ **Store measurements, derive verdicts.** A stored qualification verdict silently rewrites history when a threshold moves.

---

## Change shape (for Claude Code; not the diff)

Migration number assigned at point-of-build, not here (standing rule). Idempotent.

1. `alter table users add column if not exists excluded_from_learning boolean not null default false;`
2. `alter table households add column if not exists excluded_from_learning boolean not null default false;`
3. **No policy change.** A boolean on an already-readable row adds no exposure. Do **not** add an UPDATE policy to either table here. If the check reveals a write path no policy admits, report it — remember 041: such a write matches zero rows and raises **no error**.
4. **Retroactive marking, explicit and listed — never heuristic.**
   - `users` → true for Dan's own account (the dominant contaminant; every demo session in the 10-day read is his).
   - `households` → true for the fixture households. Candidates from the live read: `B2 - Test House`, `Board Walk`, `Berlin`. **Confirm the list with Dan before the update runs**, and read back before and after.
5. **View `aisle_order_sessions`** over `shopping_sessions` + `list_item_events` + both flags. It **exposes the measurements** (store resolved, distinct section count, check count, median inter-check seconds, first/last check) alongside a qualification boolean and a reason code. Floors are permissive placeholders in this version, declared as named constants at the top of the view so changing one is a single line.

**⚠️ Verify before building step 5:** does `shopping_sessions` actually carry a store reference? `match_known_store`, `setSessionStore` and `storeSuggestions` all exist, but I have not read the column. If the store lives only in `known_stores` with no link on the session, the *Anchored* leg needs a column before it needs a query — that is a scope change, so report it rather than inventing one.

**No client change** beyond D8's one RUM attribute. **No UI. The Wrap Up modal is untouched.**

---

## Verification

Dev first. Reads, never a trusted 2xx.

1. Both columns present, `not null default false` — `information_schema.columns`.
2. Exactly the rows named in step 4 are true. Count them and name them.
3. `aisle_order_sessions` returns a reason code for every non-qualifying session, and the reason codes partition cleanly (no session with a null reason and `qualified = false`).
4. The 09-15 Sacandaga demo sessions (`5b2fd39b…`, `5409f851…`) come back non-qualifying via `excluded_account` once Dan's flag is set.
5. **The staples counter-check** — a short, single-section, store-anchored trip is **absent** from `aisle_order_sessions` and **present** in a plain non-excluded-session read. This is the D1 guarantee; if it fails, the two layers have been collapsed.
6. DXA: a span from an excluded household carries `household.excluded_from_learning = true`.

Done when 1–6 pass on dev, the four invariants are in `ARCHITECTURE.md`, and the qualification-rate breakdown has been eyeballed once against real beta data.

---

## Risks

- **Global flags only work if set.** They cover the founder and fixture households — the measured bulk. A beta tester who starts demoing without telling anyone is uncovered until noticed. Acceptable: retroactive marking reaches them whenever it surfaces.
- **A real user demoing the app inside a store, on their own account.** Uncovered by design; they will never report it. Rare and bounded, and preferable to taxing every genuine trip with a question.
- **Pre-09-11 sessions are unknowable** and stay unmarked. The learning query will read some demo traffic from before this spec — bounded, dated, and documented here rather than silently assumed clean.
- **The permissive placeholder floors admit noise until tuned.** Deliberate. D7's reason breakdown is what tells you when and where to tighten.

---

## What changed from `SPEC_learning_exclusion.md`, and why

| v1 | v2 | why |
|---|---|---|
| Checkbox in the Wrap Up modal, off by default | **No UI at all** | It taxed every real trip with a 1%-relevant decision, and v1's own design notes admitted it would be missed exactly when it mattered. A control that fails at its own job while costing every user something is not a trade-off. |
| `shopping_sessions.excluded_from_learning` | dropped | Per-trip declaration was the UI's mechanism; with the UI gone it has no setter. Retroactive marking (D3) covers the same ground with no decision in the flow. |
| One `excluded_from_learning` concept | **Global exclusion + per-task qualification** | `staples_candidate` is starved by a single flag — the milk run is the best staples signal there is. |
| "duration" as a possible rule | **inter-check pacing** and **distinct sections** | Duration rejects the real milk run and may accept a slow demo. The two replacements each name the specific false lesson they prevent. |
| View named `learning_sessions` | `aisle_order_sessions` | A generically-named view gets reused by the next task's query and silently starves it. |
| Mockup pass required | **not required** | Nothing visual ships. `mockup_wrapup_learning_exclusion.html` is superseded; keep it only as a record of the rejected direction. |
