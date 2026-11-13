# SPEC: Fix duplicate `checked` event emission (list_item_events)

## Problem
Two real prod trips (2026-09-21) confirmed store resolution works end to end — both sessions resolved `leg_anchored = true`. Neither trip produced a duplicate `checked` event, but historical prod data (six pairs, first spotted 2026-09-20) needed a real diagnosis before any 053 floor gets tuned against it.

Applying the "was there an `unchecked` event between the two `checked` events" discriminator to all six pairs:

| Pair | Gap | Unchecked between? | Verdict |
|---|---|---|---|
| 09-12 | 1.9s | no | emission defect |
| 09-13 | 1.2s | no | emission defect |
| 09-14 (same item) | 8.14s | yes | legitimate recheck |
| 09-20 ×3 | 0.66–0.84s | no | emission defect |

Five of six are the defect; one is a real uncheck→recheck. This matters because a blunt dedupe would risk swallowing that legitimate case.

## Root cause
`useProvisions.js:1123` derives the event to emit from `checked`, the status captured in the tap-time closure — not from the write's actual before/after transition. `App.js:3881`'s row-motion guard blocks re-taps for only ~570ms, and not at all under reduced motion. A second tap landing just past the guard, while the closure/poll still reports the row as unchecked, re-derives "bought" and emits a second `checked` event. The `list_items` write itself is idempotent (the visible list is correct), so only the event log double-counts.

## Decision
Fix at emission, not with a post-hoc dedupe filter. Derive the `checked`/`unchecked` event from the write's actual state transition (server-confirmed before/after), not from the closure's `checked` map at tap time.

Rejected alternative: dedupe by `(list_item_id, session_id, last_event_type)`. A hard dedupe would have correctly caught the five defect pairs but risks collapsing a legitimate fast recheck — the 8.14s pair proves real toggles can happen quickly. Deriving from the actual transition fixes the race at its source and handles legitimate toggles correctly by construction, with no filter to get wrong later.

## Fix
- Wherever the checked/unchecked event is emitted (the `toggleChecked` path and its callers), read the transition from the write's result or a fresh row state, not from `checked` as captured at tap time.
- **No schema change.** `list_item_events` stays append-only. Historical duplicate rows are not corrected — this stops new duplicates, it does not retroactively clean the six existing pairs. `aisle_order_sessions` (053) reads the raw events, so cleanup there, if ever wanted, is a separate decision.

## Verification
1. On dev, force two taps inside the ~570ms guard window (or simulate the race directly) and confirm exactly one `checked` event is written.
2. Confirm a genuine uncheck→recheck sequence still writes both events correctly — regression case, shaped like the 8.14s pair.
3. Re-run the unchecked-between discriminator against a week of fresh dev/prod traffic: zero sub-2s duplicate pairs with no `unchecked` between them.

## Out of scope
- The 09-14 item's `added_in_store` sequence restart mid-session (looks like a remove-and-re-add) — noted, not investigated here.
- `chain_slug` grouping — today's two new stores (`market-basket-lee`, `hannaford-dover`) confirm the 09-20 finding unchanged; no fix attempted here.
