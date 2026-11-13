# SPEC_wrapup_share.md
2026-09-27 · OurProvisions · **DEFERRED 2026-09-30 — blocked, not retired**

> **Status 2026-09-30 — DEFERRED. Stays in `docs/specs/active/`; it is blocked, not superseded.**
> Two things changed under it on 2026-09-30:
> 1. **The household-facing half shipped differently and is LIVE ON PROD** (2026-09-30, `main`
>    `15f6880`, bundle `main.2079d0a6.js`; built on dev as `619068e` → `b32ba71`, walked A–D on
>    prod). A client-side snapshot summary: items, carried forward, minutes and store — facts
>    only, no share, no claims. It does **not** use `get_wrap_up_summary`, which remains unbuilt.
> 2. **The `qualified` verdict below predates the "trips are presumed real" principle**
>    (DECISIONS 2026-09-30) and must be revised against it before this is built. The spec's
>    exclusion-first framing — exclusion flags plus floors, trips guilty until they clear a bar —
>    is the approach that was explicitly retired when the founder-account exclusion was reversed.
>    Rework it against **trip qualification v2** (ROADMAP NEXT), which presumes trips real,
>    requires several agreeing signals to exclude, and resolves ambiguity by asking.
>
> Its other hard prerequisite — the crew RLS status (`velayo_crews` / `velayo_crew_members`) — is
> still open. **Do not build from this spec until both are settled.** Decisions and truth table
> below are unedited and remain the design of record for the share half.

## What this is
At Shop → Wrap Up, show the household how the trip went and offer to share a *relative* win with the crew ("Dan beat his last shop and stayed under budget"). This spec covers **which trips count, what they're compared against, and what may leave the household.** The crew feed that displays the post is a separate spec (not yet written).

Mockups: canvas "OurProvisions Home v2", artboards **Shop — wrap up, choose what to share** and **Home — essentials + crew news**.

## Decisions (locked 2026-09-27)

| Decision | Choice | Why |
|---|---|---|
| Baseline | Compare to the **last share-qualified trip of the same size bucket**, never an all-time record | Always beatable; one freak trip can't set a bar nobody reaches again |
| Size buckets | **Quick trip** (5–10 items) · **Regular shop** (11–25) · **Big shop** (26+), counted as distinct checked items. Boundaries are placeholders | People think in trip sizes, not minutes per item. "Beat his last big shop" reads naturally; a per-item rate doesn't |
| First trip | No comparison; offer "Your first shop with OurProvisions" as the share | Nothing to compare yet; the first shop is itself the win |
| Qualification | A **separate, task-named** qualification. Do **not** read `aisle_order_sessions` | 053 D5: that view is named for aisle order so other tasks don't inherit its legs. Its Anchored leg (needs a store) would wrongly disqualify real trips with no store recognised |
| Which legs | Exclusion flags (account + household) + **Paced** (same idea as 053) + a minimum check count | Exclusion kills demo trips; Paced kills the checkout-blast; minimum kills 2-item "trips" |
| Like-for-like | Buckets do this. A trip is only ever compared within its own bucket. First trip in a bucket makes no speed claim (budget can still be claimed) | A milk run always beats a weekly shop |
| Baseline movement | Only a share-qualified trip becomes the next baseline for its bucket. Non-qualified trips never move it | A demo can't reset the bar |
| Duration | `last_check − first_check`, not `started_at → ended_at` | People open Shop at home; the clock should run in the store |
| Crew payload | **Claim strings only** ("faster than last time", "under budget"). Never minutes, dollars, items, or store | Crew sees how it went, never the details |
| Sharing | Opt-in each time at Wrap Up (chips pre-set, "Keep it to us" always available). No standing setting | Nobody broadcasts by accident |

## Truth table

| Trip state | Household sees at Wrap Up | Share offered? | Becomes baseline? |
|---|---|---|---|
| Not qualified (excluded / unpaced / below minimum) | Own summary only | No | No |
| Qualified, no prior qualified trip | "Your first shop with OurProvisions" | Yes, "first shop" | Yes |
| Qualified, earlier trip in same bucket, faster | "4 min faster than your last big shop" | Yes, "beat his last big shop" chip | Yes, for its bucket |
| Qualified, earlier trip in same bucket, not faster | Time shown plainly, no comparison language | Only a budget claim, if true | Yes, for its bucket |
| Qualified, first trip in this bucket (not first overall) | Time shown plainly | Only a budget claim, if true | Yes, for its bucket |
| Any qualified trip, budget_goal set and week spend ≤ goal | "$18 under this week's budget" (household only) | "under budget" chip | n/a |
| budget_goal not set | No budget line | No budget chip | n/a |

## Data
- **No new tables or columns.** Everything is computed from `shopping_sessions` + `list_item_events` (as 053 does) at read time. The verdict is derived, never stored.
- **One read path: RPC `get_wrap_up_summary(p_session_id)`**, `security definer` with the 051 household-authorization pattern (the caller must be a member of the session's household; identity from `auth.jwt()->>'sub'`, never `auth.uid()`). Returns: `duration_seconds`, `item_count`, `size_bucket` ('quick' | 'regular' | 'big'), `qualified`, `reason_codes[]`, `baseline_session_id` (null if none in bucket), `faster_by_seconds`, `under_budget`, `is_first`.
- **Bucket boundaries** are declared once (like 053's `floors` CTE), so changing one is a one-line re-read, never a rewrite of history.
- **Floors:** the Paced floor is shared with 053. Reference one definition rather than copying the number, so tuning one tunes both. The minimum-checks floor (placeholder **5**) is new and belongs to this task only.

## Prerequisites (hard)
1. ~~**Duplicate `checked` events from one tap**~~ — **MET** (amended 2026-09-28): fixed at emission 2026-09-21 (dev `bf4f9cc`, prod `b6afec6`; `docs/specs/built/SPEC_checked_event_duplicate_emission.md`), on prod. The concern stands as the reason the fix mattered here: duplicates inflate check count and deflate median gap, corrupting both Paced and "faster".
2. **Crew RLS bug** (`velayo_crews` / `velayo_crew_members`, Clerk string vs uuid) — **OPEN**, before anything is actually posted to a crew. Status still contested: migration `014` rewrote these policies and may already cover it; settle it by reading the live policies before any crew build (ROADMAP NEXT P1, widened 2026-09-27 to recipe giving and crew news). Wrap Up's household-only summary can ship without it.

## Out of scope
- Storing and displaying crew posts (crew feed spec, next).
- Budget truth from receipts: v1 spend = checked items' `price_per_unit × quantity`, an estimate (see open question 2).
- Photos on the share (the "+ A photo" chip is designed, not spec'd).

## Open questions (do not invent resolution)
1. **Baseline scope: household or person?** If Dan and his wife both shop, is "your last trip" the household's last trip or Dan's own? Recommend **person** (it's a personal brag), with fallback to the household's trip when the person has none.
2. **Is the estimated spend good enough to say "under budget" publicly?** Recommend yes for v1, since the crew never sees the number, only the claim. Revisit when receipts land (Phase 3).
3. **Minimum-checks floor and bucket boundaries:** 5 / 10 / 25 are placeholders. Tune from the real distribution of trip sizes across non-excluded households, the same way 053's floors are tuned.
4. **Bucket names in copy:** "quick trip / regular shop / big shop" are proposed. Confirm the words before they appear in the UI.

## Verification (dev preview, deployed, not localhost)
1. Excluded (demo) household: shop → Wrap Up shows a summary with no share offer, and the next real trip does not compare against the demo.
2. Tap everything at the checkout in a few seconds → not qualified, no share.
3. First real trip → "first shop" offer.
4. Second big shop, faster than the first → "N min faster than your last big shop" plus the chip. Then a quick trip → no speed claim (first in its bucket), and the big-shop baseline is untouched.
5. With `budget_goal` null → no budget line or chip.
6. RPC from a non-member of the household → refused (live RLS test in the running app; the SQL editor bypasses RLS).

## Why a spec
It reuses 053's legs across tasks while deliberately not reading 053's view. It carries a truth table and one open hard prerequisite (the crew RLS status) a future session would otherwise miss; the other, the duplicate `checked` fix, was already met when this spec was filed.
