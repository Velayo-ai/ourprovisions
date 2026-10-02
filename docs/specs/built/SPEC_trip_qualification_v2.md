# SPEC_trip_qualification_v2.md
2026-10-01 · OurProvisions · **DESIGNED — airlock-ready, not built**

Supersedes the *exclusion-first* framing of `SPEC_learning_qualification.md` (053). Keeps 053's three aisle-order legs. Unblocks the revision of `SPEC_wrapup_share.md`.

Mockup of record: `mockup_trip_reality_ask.html` (three states). The mockup is the tiebreaker over this prose.

## What this is

The app must tell a real shopping trip from a demo **by observing the trip**, the same way for every user, with no hand-maintained list. It presumes trips are real, excludes only on several agreeing signals, and asks when it is genuinely unsure.

This spec answers two questions that 053 fused into one:

1. **Is this trip real?** One verdict per trip, shared by every learning task. *(Layer 1 — trip reality.)*
2. **Is this real trip useful for task X?** Each task adds its own legs on top of "real". *(Layer 2 — task qualification.)*

053's Paced leg rejects a cashier blast, but a cashier blast is a *real* trip — it just teaches nothing about aisle order. That is the seam this spec cuts along.

## Decisions (locked 2026-10-01)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Presumption | **Trips are presumed real.** Exclusion needs affirmative evidence of a demo, from several signals agreeing. | DECISIONS 2026-09-30. Real users demo and play too; a hand list never scales. |
| D2 | Signals are tri-state | Each signal reads **demo / not-demo / unknown**. Missing data is always **unknown**, never demo. | No location permission is not suspicious. A signal that cannot be measured has no vote. |
| D3 | Vote, not a score | Count the signals that read *demo*. **0–1 → counts silently · 2 → ask · 3 → excluded silently.** | A single wrong signal can never exclude a trip; every verdict reads straight off the table; nothing to calibrate. |
| D4 | Exclusion needs GPS | Three demo signals is only possible when GPS is present and resolves to no store. **With location off, the worst outcome is an ask.** | Consequence of D2 + D3, stated so nobody "fixes" it. |
| D5 | Precedence | **Admin flag → the person's answer → the signals.** | Flags (053) are admin-only overrides for synthetic accounts. A human answer always beats the heuristic. |
| D6 | Unanswered ask = real | Dismissing or ignoring the question is not a vote for "testing". | D1 applied to the ask. |
| D7 | Excluded is never invisible | The summary carries a quiet line: **"Not counted as a shopping trip · Count it."** Count it records the answer *real*. | A household's own data must never vanish silently and irreversibly. |
| D8 | Server verdict | Reality is computed in the database (view `trip_reality`), read by one RPC; the answer is written by one RPC. The client displays, never decides. | Same rule as 053 and `cook_meal`: an event is a server-confirmed fact. Two clients, one answer. |
| D9 | Task registry | Every learning task has a row naming its legs and the false lesson each leg prevents. **A task reads no trip data until its row exists.** | 053 D5 ("name views after the task") made explicit. |
| D10 | Derived, not stored | Signals and the verdict are computed at read time. Only the person's answer is stored. A floor change is a re-read. | 053 D6. History is never rewritten by a tuning pass. |
| D11 | Ask rate is a health metric | Track asks per trip and the share answered *real*. **If most answers are "real", the model is too suspicious.** | The ask is a cost paid by the user; it must stay rare. |

## Layer 1 — the three demo signals

| Signal | Measures | Reads **demo** | Reads **not-demo** | Reads **unknown** |
|---|---|---|---|---|
| **S1 Fresh list** | how long before its check each item was added | ≥ 80 % of checked items added within **15 min** of their check (≥ 3 items measured) | otherwise | fewer than 3 items have a known add time (see Step 0) |
| **S2 No walking** | pauses between checks | ≥ 5 checks, **no gap ≥ 30 s**, and first-to-last span **< 3 min** | any gap ≥ 30 s, or span ≥ 3 min | fewer than 5 checks |
| **S3 Not at a store** | where the checks happened | GPS present and `resolve_store` found **no store** | `store_id` resolved | no GPS fix |

> **Amendment 2026-10-01 (S1 row — the 80 % denominator, settled at build):** the share is of **ALL checked items in the session**, not only the items whose add time is known. Unmeasured items count against the demo share, so they can only ever push S1 *away* from `demo` — the safe direction. The `≥ 3 items measured` gate is what separates `unknown` from `not_demo`; it is not the denominator. This follows the row's own reasoning below ("a real in-store add is one item, not the whole cart"): three aisle-added items in a twenty-item cart is 15 %, not a demo. Measured-only as the denominator would have made that case read `demo`. Implemented in `059` as `s1_fresh_items >= s1_demo_share * greatest(s1_checked_items, 1)`.

> **Amendment 2026-10-01 (S1 source — Step 0.1 answered):** a resurrected `list_items` row does **not** get a fresh add timestamp (`insert_list_item`'s `ON CONFLICT DO UPDATE` omits `created_at`; the trigger's function `list_items_resurrect_cleanup` only clears meal links and re-homes `cycle_id`). So S1 reads `list_item_events.event_type = 'added_in_store'` only, per this spec's stated fallback. **Coverage on dev at build: 3 of 396 checked items (0.8 %), 3 of 84 sessions** — S1 is `unknown` for 81 of 84, because the event fires only from the Shop Add sheet and a Browse-at-home add fires none. A third candidate, `list_item_contributors.added_at`, was tested and **ruled out**: `archive_trip_items` deletes every contributor row during wrap-up, which runs *before* the summary reads the view (0 surviving rows across 12 wrapped dev sessions). **Consequence to keep:** with S1 usually `unknown`, three demo votes is usually unreachable, so in practice the worst outcome for a trip with no GPS fix is an **ask**, never silent exclusion — D4 holding more strongly than stated, not failing. It also means reproducing test cases 4 and 5 requires the demo's items to be added **through the Shop Add sheet**, not Browse.

Every number above is a **placeholder floor**, declared once in a `floors` CTE (053's pattern). See *Tuning*.

Why these three and nothing else:

- **Add-to-check latency** (S1) is the signature of a demo: you add things and tap them off. A real list is written at home, days or hours earlier. A real in-store add ("oh, we need limes") is one item, not the whole cart — hence the 80 % share, not any single item.
- **Bursty rhythm with walking gaps** (S2) is the signature of a store: tap, push the cart, tap. A checkout blast has no gaps; so does a couch demo.
- **Location** (S3) is the only signal a demo cannot fake without driving to a store — and the one that is most often simply absent, which is why it can only ever add a vote, never carry one.

Ordering rule for S2: order by `created_at`, never by `sequence` — `sequence` restarts on every page load.

## Layer 1 — truth table

| Admin flag | Answer on record | Demo votes | Verdict | Summary shows |
|---|---|---|---|---|
| set | any | any | **excluded** | nothing (synthetic accounts only) |
| — | `real` | any | **real** | plain summary |
| — | `testing` | any | **excluded** | "Not counted as a shopping trip · Count it" |
| — | — | 0 or 1 | **real** | plain summary |
| — | — | 2 | **real, pending** — asks | the ask card (mockup state 2) |
| — | — | 3 | **excluded** | "Not counted as a shopping trip · Count it" (mockup state 3) |

"Real, pending" is **real** for every consumer until answered (D6). The ask is shown once, on the summary; it is never re-raised.

## Layer 2 — task registry

| Task | Learns from | Requires | False lesson each leg prevents | Reads |
|---|---|---|---|---|
| **Aisle order** (auto-sort the list) | check order | real + **Anchored** + **Traverses** + **Paced** | no store → a route with no layout; few sections → the errand, not the store; no pacing → the app's own sort order | `aisle_order_sessions` (053, amended) |
| **Restock nudges** ("you usually buy milk weekly") | what was bought, and when | real | a demo "buying" milk nobody bought | a task-named view, when built |
| **Store patterns** ("big shops at Market Basket, top-ups at Hannaford") | store, size, time of trip | real + Anchored | a parking-lot demo counted as a visit | a task-named view, when built |
| **Wrap-up share** ("beat your last big shop") | trip duration | real + **min checks** + **Paced** | a checkout blast posting as a speed record | `get_wrap_up_summary` (revised, below) |
| **Price intelligence** (best store, "10 % higher here") | **receipts** | the receipt itself | — | Phase 3; not trip-qualified |

Two Phase 3 notes, reserved not built:

- **Price learning is self-qualifying.** A check records *that* you bought eggs, never what you paid; price comes only from a receipt, and a kitchen-table demo has no receipt. Trip reality guards the check-fed tasks, not prices.
- **A matched receipt is the strongest "real" signal there is.** When Phase 3 matches a receipt to a session, it overrides every demo vote (precedence: admin flag → receipt → answer → signals). The slot is named here so the view grows one leg, not a rewrite.
- **The in-store price nudge needs the current store while shopping.** That is a display need, not a learning need, and a second reason store recognition matters beyond sorting.

## Named test cases

| Case | S1 | S2 | S3 | Votes | Layer 1 | Aisle order (Layer 2) |
|---|---|---|---|---|---|---|
| **Hannaford Dover 2026-09-21** — real, 3 checks, 1.6 min, store resolved | not-demo | unknown (< 5 checks) | not-demo | 0 | real | **rejected by Traverses**, correctly: a two-section run teaches opposite layouts at two chains |
| **Two-store outing** (Lee → Dover) — splits into two per-store sessions | not-demo / not-demo | not-demo / unknown | not-demo / not-demo | 0 / 0 | both real | Lee qualifies; the Dover list-finisher is rejected by Traverses |
| **Sacandaga parking-lot demo 2026-09-15** — items added then tapped, at a store | demo | demo | not-demo | 2 | **asks** | — |
| **Kitchen-table demo, location on** | demo | demo | demo | 3 | excluded, "Count it" shown | — |
| **Kitchen-table demo, location off** | demo | demo | unknown | 2 | **asks** | — |
| **Real cashier blast** — list written at home, all tapped at the register | not-demo | demo | not-demo | 1 | real | rejected by Paced |
| **Madbury `8ee6e792` 2026-09-12** — 12.6 min, 16 checks, 5 sections | not-demo | not-demo | not-demo | 0 | real | qualifies |
| **One-item top-up** — one lime, added in the aisle | unknown (< 3) | unknown | not-demo | 0 | real | rejected by Traverses and Paced; **counts for restock** |

The first two are the ROADMAP P2 inputs. Each must be reproduced from the live tables at build time, not asserted.

> **Amendment 2026-10-01 — the eight cases, reproduced at build (059 on dev; Dover, Lee and Madbury read from prod inline, since prod carries no view). Three rows change; no floor was touched.**
>
> **S3 rule (migration `060`).** S3 reads **not-demo when `store_id` is resolved OR `store_name_raw` is non-null**; **demo only when GPS is present and both are null**; unknown with no fix. Found on case 7: Madbury `8ee6e792` predates 054 store identity, so its store was *named* ("Market Basket Lee") but never *resolved*, and 059's S3 cast a demo vote against the spec's own reference shop. A named store is evidence of being at a store. D4 still holds — a demo vote still needs a GPS fix.
>
> | Case | Observed (059 → 060 where it differs) | Disposition |
> |---|---|---|
> | **1 Hannaford Dover `f5aee06f`** | S1 **unknown** (0 add events), S2 unknown, S3 not-demo, **0 votes, real**. Layer 2: 2 sections against a floor of 2 — **Traverses PASSES**, all three legs pass, `qualified = true`. | **Row amended: qualifies at floor 2.** The expected "rejected by Traverses" contradicted §Tuning step 4 (floor stays at 2). Dover is now **the designated target for the 053 Traverses tune after the duplicate sweep**: the tune is right when this session, and only sessions like it, drop out. |
> | **2 Two-store outing (Lee `c25299ac` → Dover)** | Lee: S1 **not-demo** (5 measured items — prod carries in-store adds), S2 not-demo, S3 not-demo, 0 votes, real, **qualifies**. Dover as case 1. | **Amended to match case 1:** both legs qualify at floor 2; the list-finisher is caught by the same future tune. |
> | **3 Sacandaga parking-lot** | It is on **dev**, not prod: `5b2fd39b`, 2026-09-15 11:35, 7 checks, max gap **1.6 s**, span **0.11 min** → S2 **demo**; S1 **unknown** (no add timestamp — Step 0); S3 **unknown** (that session has **no GPS fix**, so "at a store" in the expected column was also wrong). **1 vote → real.** | **Recorded as observed, not a failure.** The expected column assumed an add timestamp existed. One vote short of the ask, by design (D1). |
> | **7 Madbury `8ee6e792`** | S1 **not-demo** (4 measured), S2 not-demo, S3 **demo under 059 → not-demo under 060**; **votes 1 → 0**; real both ways. Layer 2: `store_id` is NULL (pre-054), so `leg_anchored` fails — **`no_store`, not "qualifies"**. | **Row amended: real at 0 votes; Layer 2 `no_store` until a pre-054 `store_id` backfill** (queued, ROADMAP NEXT). Still the reference for what a genuine traversal looks like (5 sections). |
> | **4, 5, 6, 8** | Not historical rows — a kitchen-table demo (location on / off), a cashier blast and a one-item top-up are **walk scenarios**. | Walked live on dev, household Test 500 House (the one unflagged dev household). Cases 4 and 5 need their items added through the **Shop Add sheet**, or S1 cannot vote. |
>
> **Two build facts that follow from the table.** (a) S1 reads `unknown` on every historical row with no in-store add, and `not-demo` wherever prod carried adds — so the dev 0.8 % coverage was a dev-data artifact and S1 is genuinely measurable on prod. (b) Nearly every dev household is admin-flagged, so `verdict_source = admin_flag` masks the signals there; the vote columns are still computed and are what the cases test.
>
> **`get_trip_reality` returns `first_ask` (060).** The RPC stamps `reality_asked_at` before it returns, so in a pending response the stamp is never null and the client could not tell a first read from a reload. `first_ask` is true only on the call that did the stamping; the ask renders only then. Needed by verification step 4; the stamping guard itself is unchanged.


## Data

- **New columns on `shopping_sessions`** (additive migration, number taken at build — 058 is taken, so 059+): `reality_answer text check (reality_answer in ('real','testing'))` nullable, `reality_answered_at timestamptz`, `reality_asked_at timestamptz`. The last records that the ask was shown, so it is shown once and the ask rate can be measured.
- **View `trip_reality`** — `security_invoker = on`, revoked from public / anon / authenticated, select to service_role (the 053 pattern). One row per live session: the three signals as text (`demo` / `not_demo` / `unknown`), their measurements, `demo_votes`, `verdict` (`real` / `pending` / `excluded`), `verdict_source` (`admin_flag` / `answer` / `signals`), and the floors as columns.
- **RPC `get_trip_reality(p_session_id)`** — `security definer`, 051 pattern (`is_member_of` first, `42501`; identity from `auth.jwt()->>'sub'`; `search_path` pinned; execute to `authenticated` only). Returns the view row for the session **and stamps `reality_asked_at` when it returns `pending` for the first time**.
- **RPC `answer_trip_reality(p_session_id, p_answer)`** — same pattern. Writes `reality_answer` + `reality_answered_at`. The only write path; clients hold no UPDATE on these columns (column-scope it in the 051-tables pass, ROADMAP NEXT).
- **`aisle_order_sessions` amended**: replace the two `excluded_*` legs with `trip_reality.verdict <> 'excluded'` (reason code `not_real`); keep Anchored / Traverses / Paced unchanged. `pending` counts as real (D6).
- **Nothing else stored.** Signals and verdict are computed at read time (D10).

### Step 0 — reads before authoring (do not skip)

1. **Where does an item's add time live?** `list_items.created_at` may record the *first-ever* add, because the 026 resurrect reuses rows. Read `trg_list_items_resurrect` and `insert_list_item` on dev: if the resurrect sets a fresh timestamp, S1 reads it; if not, S1 reads only `list_item_events` where `event_type = 'added_in_store'` in the same session, and the spec records the coverage gap (Browse adds at home have no event, so S1 reads **unknown** for them — which is the honest answer and also the common real case). Decide at build, write the decision into the migration header.
2. **Confirm `shopping_sessions` columns** by `information_schema`, not the June CSV in project knowledge (it is missing seven tables).
3. **Reproduce the eight test cases** from the dev and prod tables with the view, before any client work.

## Tuning (how thresholds get set, not what they are)

1. **Run the gap-bucketed duplicate sweep first.** The sub-2 s race is fixed (`bf4f9cc`); the ≥ 60 s reload mechanism (Mozzarella, dev) is not investigated. It inflates S2's span and 053's median gap. No floor is tuned on data that has not been swept.
2. Read the distribution of each measurement across **non-excluded** sessions on prod once ≥ 10 households have trips. Today prod has roughly one learning-grade non-Dan trip; the floors above are placeholders until then.
3. Tune by moving one floor one line in the `floors` CTE and re-reading the eight test cases. If any named case changes verdict, the tune is wrong.
4. **Traverses stays at 2 in this spec**, labelled too low as 053 already says. Raising it is a 053 floor change, not a v2 change, and waits for step 2.
5. Watch D11: asks per trip, and the "real" share of answers.

## The ask — copy and placement

On the trip summary (the snapshot shipped 2026-09-30), below the values line and above Done. Three states, in the mockup:

1. **Real** — the summary as it is today. Nothing added.
2. **Pending** — one card: eyebrow *QUICK QUESTION*, headline **"Quick trip, or just testing?"**, line *"We couldn't tell. Real trips teach the app your store."*, two equal buttons **Real trip** · **Just testing**. Dismissing the summary leaves it unanswered (= real).
3. **Excluded** — one quiet line under the values: *"Not counted as a shopping trip ·* **Count it**". Count it writes `real` and the line changes to *"Counted."*

RUM: the three controls carry fixed copy only and get classes `.trip-reality-real`, `.trip-reality-testing`, `.trip-reality-countit`; review them for the allow-list before promotion (2026-09-28 rule). None of them is `.all-done-btn` or `.trip-summary-done`.

Teal is not used: answering a question is not a celebrated completion.

## How `SPEC_wrapup_share` gets revised

- Its "Qualification" and "Which legs" rows change to: **real (Layer 1) + minimum checks + Paced.** The exclusion flags disappear from its logic; they live only inside `trip_reality` as the admin override.
- `get_wrap_up_summary` reads `trip_reality` for the verdict instead of carrying its own; its `qualified` / `reason_codes` keep their names, with `not_real` as a new code.
- A `pending` trip may still **become a baseline** (it is real until told otherwise); a later `testing` answer removes it as a baseline at the next read, since baselines are derived.
- Its truth table's first row, "Not qualified (excluded / unpaced / below minimum)", splits into "not real" (summary carries the Count-it line) and "unpaced / below minimum" (plain summary).
- Its other prerequisite, the crew RLS status, is **unchanged and still open**.

The revision is a dated amendment block on that spec, not a rewrite; its decisions and open questions stand.

## Verification (dev preview, deployed, two accounts)

1. The eight test cases reproduce from the tables with the stated votes and verdicts.
2. Kitchen-table demo, location off → the summary shows the ask; **Just testing** → `reality_answer = 'testing'`, read back; the session leaves `aisle_order_sessions` with `not_real`.
3. Same demo, location on, no store → no ask; the Count-it line; **Count it** → `reality_answer = 'real'`, the line reads "Counted.", the session re-enters the view.
4. Pending ask dismissed → no answer row, verdict stays `real`; the ask is **not** shown again on reload (`reality_asked_at` set).
5. A real trip at a store → no ask, no line.
6. Non-member calls both RPCs → `42501`, from the running app, not the SQL editor.
7. Admin-flagged account (Dan Test User) → `excluded`, `verdict_source = 'admin_flag'`, no line, no ask.
8. Bundle: the three new classes present; `CHROME_ALLOW_LIST` reviewed and either unchanged or extended by exactly those three.

## Out of scope

- Tuning any floor (see *Tuning*).
- The restock and store-pattern views (named in the registry; built when their features are).
- Receipt matching (Phase 3; its precedence slot is reserved).
- Reading the answer anywhere but the summary.

## Why a spec

It changes a schema (three columns, a view, two RPCs, an amendment to 053's view), carries a truth table and a precedence rule a future session must not re-derive, and sets a tuning discipline that forbids the obvious shortcut (fitting floors to unswept data). The decision trail — vote not score, GPS-gated exclusion, unanswered means real — is the part that would otherwise be lost.
