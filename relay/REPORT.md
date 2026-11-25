Reported: 2026-11-24 22:48 ET · dev 6bcc05e · main 54d453c · re: Ask off grid slices 3 + 4 · prompt 048d190

# Slice 3 is on dev, and the dev pre-walk is green: ask-offline-walk 32/32, wagon-walk ALL PASS, shop-burst 0 reverts. Ready for Dan's phone walk. Prod untouched.

## Shas, all pushed to origin/dev (Dan's OK for this prompt: each when green)
| | sha | Jest | `CI=true` build |
|---|---|---|---|
| docs: slice 2 as built (the five departures, accepted) + the three gaps NOT BUILT; ROADMAP NEXT "Ask off grid: the three known gaps (SPEC_ask_offline)" | `e92569d` | — | — |
| slice 3: O4 / D6 | `d65d795` | 84 suites / **1313** green | green |
| harness: `tools/harness/ask-offline-walk.js` (Velayo OS) | `6bcc05e` | — | — |

## Slice 3 (`d65d795`)
- **AskRun:** with a full wagon whose last send failed with a real error, Done reads **"Hold to finish"**, and holding it calls `onExit({ keep: true })`. That's not an abandon: no `ask_abandoned`. `tapTile` / `takeOut` clear `failed`, which brings "Hold to send" back. Not full → abandon, full → send, as before.
- **App:**
  - `onExit({ keep })` sets a one-shot `keepHeldRef`. At the end of the run, the clearing effect **parks** `op_ask_held` instead of clearing it.
  - `handoverAsk(askId)` → `handoverResume(loadHeldAsk(), asks, askId)`. The same ask → `setRunResume({ screen, ids })` before `setRunAskId`. Another ask → the key is cleared.
- **Jest:**
  - D6's table row by row on **both styles**: not full → finish; full → send; real error → finish; a change to the wagon → send.
  - Keep: the run closes with `{ keep: true }`, the picks are held, and no `ask_abandoned`.
  - A queued send is not a failure (Great picks, no red line).
  - The hand-over resumes on the shelf, wagon full, "Hold to send", as `ask_resumed`.
  - Another ask's hand-over clears the key. A parked key reads back as parked.
  - The App wiring is pinned by source.
- **Pinned source strings updated:**
  - `askRail.test.js`'s one-line `handoverAsk` is now a regex on the new body.
  - In the new Explorer D6 tests, the swipe's trailing click (which real browsers send and the drag swallows) is sent explicitly, because jsdom sends none.

## Slice 4: the pre-walk on the DEV deployment
**Dev bundle read-back:** the build tag on `dev.ourprovisions.velayo.ai` reads **`dev · d65d795`**, bundle **`main.649d8cc3.js`**. Every walk below logged the same bundle. (`6bcc05e` is harness-only; the app is the same.)

**`wagon-walk.js` (online, both styles): ALL PASS** (27 checks): Shopper 4 and Explorer 1, Great picks, give back, See (highlight + fade), the H1–H13 rules, reduced motion, held Close.

**`shop-burst.js` revert mode (`OP_BURST_REVERTS=5`): ALL PASS.** Bursts 1–5 were each 6/6 still checked after 6 s, with **0 reverts**, and it tidied its 7 rows.

**`ask-offline-walk.js`, new: 32/32 PASS** (after three walk fixes, below). Tab A is the phone (CDP offline, request interception); tab B is the second phone's token over PostgREST.
| # | check | |
|---|---|---|
| — | the build is `d65d795`; the walk's three asks are on the rail (or in +N more) | PASS |
| V1 | **Explorer off grid**: the swipe → Great pick, no red line · waits on the phone (`op_ask_queue` 1), **no request** · the toast "OG Kid added 1" · **See**: the row highlighted, **with the dot** and "Picked by OG Kid" | PASS ×4 |
| V2 | **Shopper off grid**: a tub tap → Great picks · "OG Shop added 2" · **Done held full** ("Hold to send") → Great picks | PASS ×3 |
| V1–V8 | every off-grid send waited (**7 runs**), no request made | PASS |
| V3 | **on grid**: the landings, the checks and the Wrap up all go out · **exactly one `land_ask_picks` per run (7), each with `p_run_id` + `p_tapped_at`, each 200** · no dots left, nothing said · the second phone reads every pick with its "Picked by" | PASS ×4 |
| V4 | **lost reply** (the request forwarded to the server, the page's copy failed): Great pick, no red line · the retry carries the **same run id** and gets the first count back (forwarded 200 "1", replay 200) · **+1, not +2** (1 → 2) · **`ask_landings` for that run: exactly 1 row, landed 1** (SQL, below) | PASS ×3 + SQL |
| V5 | the new pick shows off grid as an overlay row with the dot · its check waits under `ask:<run>:<item>` · **check-then-pick** → a new need at 1, labelled · **pick-then-check** → the row exists, **bought, `status_changed_at` = the check's tap time to the millisecond** (`03:46:18.746`) | PASS ×4 |
| V6 | Wrap up off grid waits (`op_wrap_queue`) · the unchecked pick before it is **carried forward, not archived** | PASS ×2 |
| V7 | **O4**: a forced real error (400 `22023`) → the red line, Done "Hold to finish" · holding it closes the run, `op_ask_held` kept **and parked**, both picks · **the next hand-over of the same ask opens the shelf, wagon full, "Hold to send"** · …and it sends for real (+1) | PASS ×4 |
| V8 | **O5**: picked off grid, the ask deleted on the second phone, reconnect → **lands, labelled "OG Gone"** | PASS |
| V9 | the prod bundle's call, **three named args, through PostgREST against dev** → returns 1, the row +1 | PASS |
| — | tidy: the list empty, the walk's asks deleted (read back 0 / 0) | PASS |

Spec verification 10 (Jest) is green above. What's left for the phone: real iOS, the swipe under a finger, the timing, one bar rather than airplane mode, and the second phone's screen.

**Cleanup:**
- **Walk rows:** removed by the walk itself and read back over REST: Cody Test House live list rows **0**, live "OG …" asks **0**.
- **`ask_landings`:** it has no client grant, so I read it by SQL on dev (CLI, ref `zxwtxjjmssykhqrghouf`, system id `7642734024280108049`). V4's run had exactly 1 row. All **34** rows were Cody Test House's: today's walks, the slice-2 probe, and wagon-walk's online sends, which now carry run ids. I deleted them; read back: `ask_landings` **0**, live rows **0**, walk asks **0**.

**Three walk-script fixes before the green run (the app was right each time):**
1. Shopper's "Let's pick" is `.ask-turn .ask-primary`, not `.ask-go`.
2. The tub's That's it! is an SVG part, so it needs a dispatched click.
3. The forced 400 needed **CORS headers**. Without them the browser rejects it as a network failure. The app then **correctly** treated it as transient, queued it and replayed it once, which itself shows D1 working.

The earlier runs' rows were tidied by each run and by the next setup.

## Departures from the spec, for a ruling
1. **A kept run is parked.** It's `op_ask_held` with `parked: true`, and the reload resume (A26) skips a parked key. Without it, a reload after "Hold to finish" would pop the run back open by itself, with no hand-over. O4 says the *next hand-over* reopens it. Fixture: V7 + Jest.
2. **"Hold to finish" after a real error emits no event.** Not `ask_abandoned`, since nothing is thrown away. The failure already has its `ask_land_failed`. Say if you want an event for "closed and kept".

Nothing else departs. The promotion order stays 088 → 089 → client (O6). Stopping here: Dan walks it on the phone next.
