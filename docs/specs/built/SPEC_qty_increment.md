# SPEC — Quantity changes are deltas: concurrent changes both count (Ask launch blocker 4)

**Scope:** OurProvisions · DB (one RPC, migration 085) + client (`useProvisions`, `mealLinks`, `App.js` callers, `checkWrites`) · **Status:** design-final 2026-11-15; Q4–Q6 confirmed by Dan; build-ready on dev
**Environment:** dev only. Nothing in this spec touches prod. 085 is the next free number; confirm at build.
**Owner of the build:** Claude Code (Cody), on `dev`. Ends at "report and stop".

---

## 1. The bug, in one example

Carrots are on the list at 1. Easton's pick lands (`land_ask_picks`: 1 → 2). At the same moment Dan taps **+** on his phone, which still shows 1. `updateQty` works out 1 + 1 = 2 **on the phone** and writes `quantity = 2`. The server ends at 2 when it should be 3, so Easton's pick is lost without anyone seeing it.

The cause is a **read-modify-write split across the network**: the phone reads, the phone adds, the server stores whatever number it's sent. Anything that changes the row between the read and the write gets overwritten. There are three places that do this today:

| Path | Where | Today |
|---|---|---|
| Manual stepper / Add / Shop add / landscape | `useProvisions.updateQty` → `.update({ quantity: qty })` | the phone computes the total |
| Removing a meal (or ingredients dropped in an edit) | `mealLinks.takeMealOffList` → `.update({ quantity: remaining })` or `remove_list_item` | the phone computes `quantity − contributed` |
| Ask landing | `land_ask_picks` (077 / 083) | **already safe:** `quantity + 1` on the server, under the household lock |

The same split also hurts **your own quick taps**. Three fast + taps send `2`, `3`, `4`. If `4` reaches the server before `3`, the row ends at 3.

## 2. The fix, in two parts

**Part 1: send the change, not the result.** The phone sends "+1" or "−1". A new RPC, `adjust_list_item_quantity`, reads the row, applies the change and writes it, all in one transaction under the **same household advisory lock** that `land_ask_picks`, `insert_list_item` and `add_meal_to_list` already take. Every writer of a household's list then waits its turn, and each change is applied to the current value, never to a value some phone saw earlier. Two concurrent changes both count, whatever order they arrive in.

**Part 2: stop a refresh from showing an old number.** Once Part 1 is in, a stale screen can't **lose data** anymore, because the next tap sends a change, not a stale total. But it can still **show** an old number: a 2-second poll requested before a write and answered after it settles puts the old quantity back on screen until the next poll. That's the same gap `fe03670` closed for check-off. So quantity writes get the same sequence stamp (`mergePolledChecked`'s rule): a row written after a poll was requested keeps its local value, and the next poll brings the server's.

**Why both:** Part 1 is about **data** (nothing is lost). Part 2 is about **trust** (what you see is never older than what you did). Part 1 also lays the groundwork for offline (Connection-independence, 2026-11-08): a queued "+1" replays correctly later, while a queued "set to 3" replays a stale total.

---

## 3. Rulings (design chat, 2026-11-15)

| # | Ruling | Why |
|---|---|---|
| Q1 | **One RPC for every manual and meal quantity change:** `adjust_list_item_quantity(p_household_id uuid, p_catalog_item_id uuid, p_delta integer, p_price_per_unit numeric default null) returns json`. | Keyed by **catalog item**, like `remove_list_item` and `land_ask_picks`: the phone may have no row id (a `pre:` key, a removed row, nothing yet), and (household, catalog item) is the row's identity. |
| Q2 | **`p_delta` is a non-zero integer with \|delta\| ≤ 99.** 0 or out of range → `22023`. | Coalesced taps (§6.2) stay small. A bigger jump is a sign of a bug, not a person. |
| Q3 | **The server floors at 0, and 0 means the row is removed.** If the **server's** result is ≤ 0, the RPC does `remove_list_item`'s work in the same transaction (soft-delete, the caller's household's contributor rows cleared as today, labels null). If it's > 0, the row stays. | This answers "does − to 0 remove the row?" **Yes, as today, but the server decides, not the phone.** Dan at 1 taps − while Easton's pick lands: either 2 − 1 = 1, or removed and then the pick revives it at 1. **Both orders end at 1, with Easton's label.** Today the phone sends 0 and the pick is gone. |
| Q4 | **Branches for `p_delta > 0`** mirror `land_ask_picks`' four row states (table in §5.2). **None** → insert at delta. **Removed** → revive at delta. **Live pending** → `quantity + delta`, meal ledger untouched. **Live bought** (or any non-pending status) → **the new need at delta**, the meals' contributions zeroed. | **Behaviour change, confirmed by Dan 2026-11-15:** today a manual + on a bought row (e.g. the Shop add sheet on milk already in the cart) writes `old + 1` and un-buys it, so the 2 you bought come back as 3 to buy. 048 fixed this for meals and R1 (2026-11-03) for picks: "never old + new". After 085, **a manual + and a pick do the same thing**, which was the 11-03 principle (A18 / Step 0 #1). |
| Q5 | **Branches for `p_delta < 0`:** **Live pending** → `quantity + delta`, removed at ≤ 0 (Q3). **Live bought** → **lower the bought quantity, stay bought**, removed at ≤ 0. **None / removed** → no-op, returns `outcome: 'absent'`. | **Behaviour change, confirmed by Dan 2026-11-15:** today − on a bought row writes `status: 'pending'`, so pressing − un-buys the item. "I want fewer" never means "I didn't buy it". (Whether a − can reach a bought row today is Step 0 #3.) |
| Q6 | **Contributor badges:** on `p_delta > 0`, the caller's `list_item_contributors.quantity_added` goes **up by delta** (a new row starts at delta; on the new-need branch the caller's row is **reset** to delta). On `p_delta < 0`, contributor rows are **not touched** (removal at 0 clears them as `remove_list_item` does today). Other members' rows are never touched. | **Behaviour change, confirmed by Dan 2026-11-15:** today the caller's `quantity_added` is set to **the row's total** on every write, so a + on Paige's 2 records Dan as asking for 3, and a − puts a badge on someone who only asked for fewer. The change moves toward `SPEC_contributor_ledger_desync.md`'s model ("your badge is the last thing you said"; Elly never gets a badge for lowering), and **closes that spec's open question**: the server now knows each person's delta. That spec's rule (a), clearing your badge when you take off your full ask, stays its own build. |
| Q7 | **What moves to the RPC:** every manual stepper **+ / −**, **Add** (Browse row, search quick-add, new-item form with its price, Shop add sheet), landscape **tap-add (+1)** and **tap-undo (−1)**, and `takeMealOffList` (**−contributed**). **What stays:** an explicit remove (landscape press-and-hold, swipe or confirm "remove") stays `remove_list_item`, because the person meant "off the list", not "one fewer". `land_ask_picks` stays as it is (already safe). `add_meal_to_list` / `decrement_meal_from_list` stay as they are (server-side, already locked). `updatePrice`'s quantity-0 placeholder insert stays. | Landscape tap-undo is "undo **my** add", so −1 is the honest version. Today it sends 0 and would remove a pick that landed in between. |
| Q8 | **Ask landing does not move.** It already applies `+1` on the server under the shared lock. 085 makes the manual path join it, not the other way round. | No need to touch 077 / 083 or re-walk Ask. |
| Q9 | **No automatic retry, no idempotency key.** A failed or timed-out change rolls the stepper back to the server's last value and shows the transient pill (unchanged: `SPEC_offline_retry` §4). If it actually committed, the next poll shows it. | Retrying a delta without an idempotency key could apply it twice. The offline queue will add a request id when it's built. Noted here, not built. |
| Q10 | **Telemetry:** `item_added_to_list` fires when the RPC returns `outcome` `inserted` or `revived`, never `bumped` / `renewed`. | It replaces the phone's `hadLiveRow` guess, which double-fired on a row inserted and bumped before the poll delivered it. Same attributes as today. |

**Not settled here (stays open):**
- A manual − on a pending row with meal links can still take `quantity` below Σ`quantity_contributed` (R2's "≥"). That's true today and unchanged by 085. `decrement_meal_from_list`'s cap keeps meal removals safe. Raise it if the walk shows a meal's ingredients vanishing after a manual −.
- Carrots ×13 after one pick (2026-11-15 walk): not diagnosed. If Step 0, the harness or the walk reproduces it, **report it with the steps and don't fix it inside this spec.**

---

## 4. Step 0 (read-only, on dev; report, then build unless something is surprising)

1. **Every quantity writer.** List every client write to `list_items.quantity` and every caller of `updateQty` / `onUpdateQty` in `src/` (PowerShell `sls`), each classified as **delta** or **explicit remove**. Expected: `App.js` 1281 / 1284 / 1286 (row Add, −, +), 7376 / 7379 (search add), 7827 (new-item form), 8178 (Shop add sheet), 8661 / 8665 (landscape), `mealLinks.js:120`, and `useProvisions.js:1282`. **Stop and report** if there's an absolute writer not on this list (e.g. a typed-quantity field).
2. **Live bodies on dev** (`prosrc` from `pg_proc`, not `pg_get_functiondef`): `insert_list_item`, `remove_list_item`, `land_ask_picks`, and the function behind `trg_list_items_resurrect`. Confirm the insert columns `insert_list_item` writes, what the resurrect trigger does on a revive (links, cycle, labels), and the name of the one-row-per-(household, catalog item) constraint. 085 copies those, it doesn't invent them.
3. **Can a − or + reach a bought row today?** Do the Browse / Shop steppers render for a row with `status = 'bought'`, and does the Shop add sheet bump one? Report the screens. (This decides whether Q4 / Q5 change anything a person can actually do today.)
4. **Constraints:** any `CHECK` on `list_items.quantity`; confirm 085 is free (`migrations/` and the dev ledger).
5. **How a landing refreshes:** how `landAskPicks` reloads the list after the RPC returns, and whether that reload can be skipped by `loadingListRef` while an older poll is in flight. Display only; report what you find.

---

## 5. Migration 085 — `085_adjust_list_item_quantity.sql` (+ `085_rollback.sql`)

### 5.1 Shape (077's conventions)
- `language plpgsql`, `security definer`, `set search_path to ''`, schema-qualified names throughout.
- **Membership first** (051): `public.is_member_of(p_household_id)` else `42501`. Caller from `public.get_current_user_id()` (JWT `sub`, never `auth.uid()`), null → `42501`.
- Validate `p_delta` (Q2) and that the catalog item is live and visible to the household (`ci.deleted_at is null and (ci.is_global or ci.household_id = p_household_id)`), else `22023`.
- `perform pg_advisory_xact_lock(hashtext(p_household_id::text));`, the **exact key** the other list writers use. Then `select … from public.list_items where household_id = … and catalog_item_id = … for update`.
- Returns `json_build_object('list_item_id', …, 'quantity', …, 'status', …, 'outcome', …)` with `outcome ∈ {inserted, revived, bumped, renewed, lowered, removed, absent}`. `quantity` is 0 and `list_item_id` the removed row's id when `removed`. Both are null when `absent`.
- Grants: `revoke all … from public, anon, service_role; grant execute … to authenticated;` then `notify pgrst, 'reload schema';`.
- **No new table, so no table grants.** The function's ACL is read back with `aclexplode` (the 10-29 lesson) and must show **exactly** `authenticated = EXECUTE` and nothing else.

### 5.2 Branches

| Row state (under the lock) | `p_delta > 0` | `p_delta < 0` |
|---|---|---|
| **None** | Insert as `insert_list_item` does (Step 0 #2): `quantity = delta`, `status = 'pending'`, `added_by = caller`, the latest open cycle, opened if none (as `land_ask_picks`), `price_per_unit = p_price_per_unit` when > 0. Caller's contributor row inserted at `delta`. → `inserted` | No-op → `absent` |
| **Removed** (`deleted_at` set) | Revive exactly as today's update did: `quantity = delta, status = 'pending', deleted_at = null, updated_at = now()`. `trg_list_items_resurrect` runs (links, cycle, labels). Caller's contributor row at `delta` (removal cleared them). → `revived` | No-op → `absent` |
| **Live, pending** | `quantity = coalesce(quantity,0) + delta, updated_at = now()`. Meal ledger untouched (R2). Caller's `quantity_added += delta` (upsert). → `bumped` | `new = quantity + delta`. If `new ≤ 0` → `perform public.remove_list_item(p_household_id, p_catalog_item_id)` → `removed`. Else `quantity = new` → `lowered`. Contributors untouched. |
| **Live, not pending** (bought; skipped / deferred alike) | The new need, `land_ask_picks`' R1 branch without the label: `quantity = delta, status = 'pending', checked_by = null, cycle_id = <open cycle>, updated_at = now()`; `list_item_meals.quantity_contributed = 0` for the row. Caller's contributor row **reset** to `delta`. → `renewed` | `new = quantity + delta`. If `new ≤ 0` → remove as above → `removed`. Else `quantity = new`, **status unchanged** → `lowered`. |

Comment the invariant at the top of the body as 077 does: *one writer per household at a time; this function applies a change to the current value and never writes a total it didn't compute under the lock.*

### 5.3 In-file VERIFY and fixture (077 pattern: a definer-run savepoint, rolled back)
Probe every cell of §5.2, plus: removal at exactly 0 and below 0; a − on an absent row returns `absent` and writes nothing; `p_delta = 0` and `100` refused with `22023`; a non-member refused with `42501`; on a linked pending row a + leaves `list_item_meals` unchanged; the new-need branch zeroes `quantity_contributed`; a pick then a + on the same row ends at `start + 2`; labels survive a `bumped` / `lowered` and die on `removed`; `trg_list_items_picked_by_guard` doesn't fire on any branch (runs as postgres). Closing SELECT: the function exists once, `prosecdef` true, `proconfig` pins `search_path`, ACL exact (above), `md5(prosrc)` printed for the ledger read-back.

### 5.4 Rollback
`085_rollback.sql`: `drop function if exists public.adjust_list_item_quantity(uuid, uuid, integer, numeric);` + `notify pgrst`. Revert the client **first**: the function is new and nothing else depends on it.

---

## 6. Client

### 6.1 `useProvisions`
- Replace `updateQty(name, qty, category, price)` with two functions, and **remove `updateQty`** so nothing can quietly keep writing totals:
  - `adjustQty(itemName, delta, categoryName, price)`: resolves or creates the catalog item exactly as `updateQty` does today (hidden-match resolver, `insert_custom_catalog_item`), then queues the delta (§6.2). If there's no live row and no open cycle, keep the client's `ensureOpenCycle("planned")` before the call, so `activeCycle` state stays current (the RPC also opens one if needed).
  - `removeItem(itemName)`: the explicit remove (`remove_list_item`, unchanged).
- Return `touched = { listItemId, catalogItemId }` from the RPC's `list_item_id` (Shop's `added_in_store` needs it).

### 6.2 One row at a time, taps coalesced
Per row (key = the row id, or `pre:<catalog id>` until it has one):
- **Optimistic:** each tap moves the displayed quantity by its delta at once (floored at 0 on screen).
- **One request in flight per row.** Taps that arrive while a request is in flight **add up** into one queued delta, sent when the in-flight request settles. Five fast taps become `+1`, then `+4`. Nothing is ever dropped or aborted: unlike a check, a delta that might have reached the server can't be safely replaced.
- **Adopting the server's number:** when a response settles **and nothing is queued or in flight for that row**, set the displayed quantity to the RPC's returned `quantity` (or drop the key if `removed`). Otherwise ignore it, because a later response will report.
- **On failure:** drop that row's queued delta, roll back to the server's last value (`rollbackQty`, unchanged), transient → the pill, else the error. No retry (Q9).
- Put this in `src/lib/qtyWrites.js` (pure, testable), next to `checkWrites.js`.

### 6.3 The refresh stamp (Part 2)
- Replace `pendingQtyRef` (a `Set` of in-flight keys, which has the `fe03670` gap) with `qtySeqRef` + `qtyTouchRef`, stamped at **send and at settle** of every quantity request, exactly as `touchCheck`.
- `loadListItems` captures `qtySeqAtStart` **when the poll is requested** (next to `checkSeqAtStart`).
- Merge with the same rule as `mergePolledChecked`: a row in flight, or stamped after `qtySeqAtStart`, keeps its local value. Make the helper generic (`mergePolledById`) and call it for both maps, rather than copying it.

### 6.4 Callers (`App.js`)
| Caller | Today | After |
|---|---|---|
| Row **Add** (1281), search add (7376 / 7379), new-item form (7827, with price), Shop add sheet (8178) | `updateQty(name, 1 \| qtyFor+1, …)` | `adjustQty(name, +1, …)` |
| Row **−** / **+** (1284 / 1286) | `onUpdateQty(name, qty ∓ 1)` | `onAdjustQty(name, ∓1)` |
| Landscape tap-add (8661) | `updateQty(name, 1)` | `adjustQty(name, +1)` |
| Landscape **tap-undo** of this visit's add | `onRemove` → `updateQty(name, 0)` | `adjustQty(name, −1)`. Split `LandscapeStaples`' `onRemove` into `onUndo` (tap) and `onRemove` (press-and-hold). |
| Landscape press-and-hold remove (8665) | `updateQty(name, 0)` | `removeItem(name)` |

### 6.5 `mealLinks.takeMealOffList`
For each pending link with `contributed > 0`: **one** `adjust_list_item_quantity(household, catalog item, −contributed)` call replaces both the `.update({ quantity: remaining })` and the `remove_list_item` branch (Q3 does the removal at ≤ 0). Then delete the link as today. The read of `li.quantity` is no longer used for arithmetic; keep the select for the bought filter. Legacy rows (`contributed = 0`) are unchanged: link dropped, quantity untouched. The bought-row filter stays first, so the never-un-buy guarantee is kept.

---

## 7. Verification (dev only)

| # | Check | Pass |
|---|---|---|
| V1 | **085 applied on dev** by Dan; ledger entry read back; `md5(prosrc)` on dev = the closing SELECT's; ACL exact by `aclexplode`. | All three match. |
| V2 | **In-file fixture** (§5.3) runs and rolls back. | Every probe passes; no fixture rows remain. |
| V3 | **Two writes at the same moment:** `tools/harness/qty-race.js`, two Supabase clients on dev (two JWTs, Cody Test House), `Promise.all` per round, 20 rounds each, row reset between rounds: **(a)** pick ∥ `+1` on Carrots at 1 → **3** every round; **(b)** `+1` ∥ `+1` → **3**; **(c)** pick ∥ `−1` on Carrots at 1 → **1, live, labelled** every round; **(d)** `takeMealOffList`'s `−contributed` ∥ pick → `start − contributed + 1` (or 1 if it reached 0). **Negative control:** `--legacy` runs (a) with today's read-then-write `.update` and must show **at least one** lost update in 20 rounds (insert a small delay between read and write if it doesn't), which proves the harness can see the failure it's guarding against. Same idea as `shop-burst.js`' revert mode. | (a)–(d) 0 losses in 80 rounds; the legacy control shows ≥ 1. Output pasted in the report. |
| V4 | **Jest:** `qtyWrites` (coalescing, one in flight, adopt only when drained, failure drops the queue), `mergePolledById` (a poll requested before a write and answered after it settles keeps the local value; the next poll takes the server's), every §6.4 caller sends the right delta or remove, `takeMealOffList` calls the RPC with `−contributed`, `item_added_to_list` only on `inserted` / `revived`. | Green; `CI=true` build compiles. |
| V5 | **Burst on dev:** `shop-burst.js` in a quantity mode (or `qty-burst.js`) on a throttled connection: 5 fast + taps on one row, 10 bursts. | The number on screen never goes down mid-burst, settles at +5, and the server reads +5. |
| V6 | **Dan's two-phone walk on dev:** (1) Carrots at 1. Easton's Ask on phone B picks Carrots and taps **That's it!** as Dan taps **+** on phone A. Both phones show **3** within one poll and hold through three. (2) Carrots at 1. Dan taps **−** as the pick lands. The row stays at **1** with "Picked by E". (3) Milk checked in Shop. Shop add sheet → Milk shows **1 to buy**, not old + 1 (Q4). | Dan confirms each. |
| V7 | **Flag-off:** `ask-off.js` + `flagoff-extra.js` on a flag-off build. Manual quantities work with Ask off (085 isn't an Ask table). | Clean pass; zero Ask requests. |
| V8 | **Prod untouched:** `main` head unchanged before and after; `to_regprocedure('public.adjust_list_item_quantity(uuid,uuid,integer,numeric)')` is null on prod (read-only MCP). | Both. |

## 8. Promotion note (for the launch session, not this build)
The client change is **not behind the Ask flag**. Every manual + calls the RPC. **085 must be applied on prod before the next dev → main merge of anything**, Ask or not. Launch order becomes: 077 → 084 on prod, **085**, then the client merge (tree identity proven; main still carries the `143393d` cherry-pick), then the flag, then `meal-photo-sweep`.

## 9. Files
`migrations/085_adjust_list_item_quantity.sql` (new), `migrations/085_rollback.sql` (new), `src/hooks/useProvisions.js`, `src/lib/qtyWrites.js` (+test, new), `src/lib/checkWrites.js` (+test: `mergePolledById`), `src/lib/mealLinks.js` (+test), `src/components/LandscapeStaples.js` (+test), `src/App.js`, `tools/harness/qty-race.js` (new), `tools/harness/shop-burst.js` (quantity mode).
