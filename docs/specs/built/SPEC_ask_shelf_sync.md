# SPEC_ask_shelf_sync.md: Ask shelf edits reach every phone, and never undo each other

**Status:** DONE, LIVE ON PROD 2026-11-22. Part A + rulings: main `dac0fc3` / `main.407e2ad6.js`. Part B: 087 applied to prod 04:09:12 UTC (read back by object), client main `80cd739` / `main.4e6c5a9d.js`; walked on dev (V1–V2, V4, V5, V9, V10) and on prod (V4, V9, V10).
**Scope:** OurProvisions · Ask
**Parts:** A, a client-only refetch (no migration). B, a delta shelf save (migration 087, plus a client change).
**Order:** Build and walk A, then B. Promote each separately. B is a migration: 087 goes on prod **before** its client.

---

## Why

Walked on dev 2026-11-21, 20:01–20:09 ET. DH was on an iPhone and TD in a desktop browser, both in Sacandaga_Dev, both on Ask Easton.

1. DH added Bananas and saved. TD's open run ("Pick 2, Easton!") did not show them until TD reloaded.
2. TD sat in Edit Ask Easton (4 items). DH removed Bananas and saved. TD's sheet stayed at 4 items.
3. TD, still showing the stale sheet, swapped Baking Powder for Carrots and saved. **Bananas came back**, silently undoing DH's removal.

Claude Code's diagnosis, confirmed in source and live on both databases:

- **Stale view.** `fetchAsks` and `fetchItemPhotos` run only when the place loads and after this device's own save. The app syncs by polling (`listTick` 2 s, `catalogTick` 20 s), and neither tick reads asks. The Ask tables are not in `supabase_realtime`, and the app doesn't rely on realtime for sync anyway.
- **Lost update.** `update_ask` is replace-all. It deletes every shelf row the form didn't send and upserts the form's array. `NewShelfSheet` snapshots `editing.tiles` once, on open (`NewShelfSheet.js:93`), and sends that whole array. The function's own comment says "the later form wins whole (S4-3)". The function is byte-identical on dev and prod (`md5 bda189ca…`), so **prod has this bug today**.

Part A fixes the staleness. Only Part B stops the data loss: any form open across another member's save still writes its snapshot back, however fresh the refetch keeps it.

---

## Part A: every phone catches up (client only)

**A1. When to refetch.** Call `fetchAsks` and `fetchItemPhotos`:
- when the **Edit sheet opens** and when a **run starts** (before the first tile renders). This matters most, because opening is the moment a stale shelf does damage;
- on **`visibilitychange → visible`**;
- on **`catalogTick`** (20 s), behind the same `isPollingOpen` gate.

Reuse in-flight requests: if a fetch is already running, don't start a second.

**A2. A run in progress is frozen.** The run screen keeps the shelf it started with until **That's it!** or Done. A refetch updates `asks` state but never adds or removes tiles mid-run. The next run uses the fresh shelf. If a child picks an item a parent removed mid-run, the pick still lands on the list (harmless).

**A3. An open Edit sheet merges (built with B; until B ships, A only keeps the sheet's *initial* load fresh).** See B4.

**A4. No realtime.** No publication change and no new channel. Polling is the app's sync model.

---

## Part B: a delta shelf save (migration 087)

**B1. New function `public.edit_ask`, not an overload of `update_ask`.** PostgREST can't reliably choose between same-name overloads (PGRST203). `update_ask` stays in place so phones on older JS keep working. It is revoked in a later migration once the new client has been on prod a while (WATCH).

Signature (Claude Code's sketch, approved):

```
edit_ask(p_household_id uuid, p_ask_id uuid,
         p_add_ids uuid[] default '{}', p_remove_ids uuid[] default '{}',
         p_label text default null, p_shelf_noun text default null,  -- null = unchanged; '' clears the noun
         p_screen_style text default null, p_pick_target smallint default null)
returns json   -- { ask_id, tiles }
security definer, search_path = '', identity from the JWT (051 pattern, as update_ask)
```

**B2. Behaviour, in one transaction:**
1. Membership and JWT check, as `update_ask`.
2. **Lock: the ask lock**, `pg_advisory_xact_lock(hashtext('create_ask:' || hh))`, then `select … for update` on the ask row (P0002 if missing or deleted).
3. Validate the inputs: no nulls, no duplicates, `add ∩ remove = ∅`, `|add| ≤ 48`, adds pass the live-tile rule, and changed scalars pass `update_ask`'s own checks (K2 label uniqueness against the other live asks).
4. **Removes:** delete `p_remove_ids`, plus dead tiles (deleted catalog items), as today. Already gone = no-op.
5. **Adds:** append after the current last tile, in the order tapped. Already present = no-op (someone else added it first).
6. Compact positions to `0..n-1`.
7. **Scalars:** only the fields this editor changed. Last write wins **only for a field both people changed**. `updated_at = now()`.
8. **Validate the resulting shelf**, not the form's: 1–48 tiles, `pick_target ≤ n`, Explorer (`simple`) ≤ 4.
   - If the merged result fails and **another member's change caused it** (the same delta would pass against the shelf the form opened with), raise a **distinct SQLSTATE** (Claude Code picks one in the `P0` class, documents it, and tests it), e.g. "the shelf changed under you".
   - A failure the editor caused alone keeps today's `22023`.
   - Either way, the transaction rolls back whole.
9. Grants: revoke from `public`, `anon`, `authenticated`; grant execute to `authenticated`. Read back with `aclexplode`.

**B3. Client save.** The sheet tracks **this editor's own changes** explicitly: `pendingAdds`, `pendingRemoves`, and a set of touched scalar fields. Don't derive them from the displayed shelf, which A1/B4 may change underneath the editor. Save sends `edit_ask` with those changes only. Create still uses `create_ask`.

**B4. The open sheet merges on refetch.** When a refetch arrives while the sheet is open:
- displayed tiles = the latest server shelf − `pendingRemoves` + `pendingAdds` (pending adds keep their tapped order at the end);
- untouched scalar fields take the server value, and touched fields keep the editor's draft;
- no modal. A quiet line, "Updated just now by {First}", is optional at build (Claude Code proposes; Dan approves the string).

**B5. The distinct "shelf changed" error.** The sheet re-reads, re-applies the editor's pending changes per B4, and shows one line: "Someone else just changed this shelf. Check it and save again." The editor's work is kept, and they save again.

**B6. Where adds go:** at the end. The form has no reorder control, so tile order is the order items were added, consistent with the form today.

**B7. A pick always lands if it can (amends `land_ask_picks` in 087).** Found on dev 2026-11-21, 21:05. In a frozen run (A2), Bananas was removed on the other phone, and Easton picked it with Carrots. ✓ failed with `22023` "a pick is not on this ask's shelf" on every retry. Unpicking Bananas and picking Apple landed normally. Prod's copy is byte-identical (`md5 0defbd6e…`), so prod has this today, and worse before Part A.
- **Membership:** a pick lands if its catalog item is **live and either a seed or this household's own**, whether or not it is still on the shelf. The shelf is the menu, and landing is "add to the list", which any member can already do (`insert_list_item`). No privilege widens.
- **Count:** at least 1 and at most 48, no duplicates. This replaces the exact match with `least(pick_target, live tiles now)`, which also failed when another member trimmed the shelf below the target mid-run.
- **Per item:** a pick that truly can't land (catalog item deleted or not the household's) is skipped inside the loop, and the rest land. One pick never fails the call.
- **Return:** still an integer, the number landed. The return type doesn't change, because phones on older JS still call it. The client compares the number landed with the number of picks: when every pick landed, the usual celebration; when fewer, the celebration plus one plain line, "{Item} isn't available any more. The rest are on the list." Never the endless "Tap ✓ again" for this case.
- An ask deleted mid-run (`P0002`) is unchanged here: WATCH.

**B8. `asks.deleted_by` (087).** Record who deleted an ask, so the Edit sheet's notice (Part A ruling) can read "{First} removed this ask." Until then it reads "This ask was removed."
- Asks are deleted today by a direct client UPDATE (`deleted_at`, `updated_at` column grants), not a function. So `deleted_by` is stamped by a **BEFORE UPDATE OF deleted_at trigger** (live → deleted only), `SECURITY DEFINER`, empty `search_path`, `new.deleted_by := public.get_current_user_id()`. This covers phones on older JS. No column grant on `deleted_by`: clients can't write it.
- The sheet maps `deleted_by` to a first name through the household's members. Someone who has since left the place falls back to "This ask was removed."

**B9. Step 0 rulings (Dan, 2026-11-21 21:55).**
1. **`P0409`** ("the shelf changed under you") is raised for **every** failure of the resulting-shelf check (B2 step 8), and for an add whose catalog item was deleted mid-edit. `22023` stays for input problems. No "opened-with" parameter: the form already disables Save on an invalid shelf, so a resulting-shelf failure means someone else's change. This supersedes B2 step 8's "same delta would pass" test.
2. **Hard deletes:** `delete_custom_catalog_item` removes catalog rows outright and takes no lock. So `land_ask_picks` takes **`FOR SHARE`** on each pick's catalog row before landing it, which makes a concurrent delete wait.
3. **Zero landed** (every pick skipped): no celebration; one line, "{Items} aren't available any more."; the run stays open. **The dead picks leave the wagon and their tiles leave the run**, so the child can't re-pick a dead tile. The skipped names come from one read of `catalog_items` for the picked ids (the live rule), named from the run's frozen tiles.
4. **B4's "Updated just now by {First}" is dropped** from this build: `edit_ask` records no saver.
5. Migration **087** = `087_ask_shelf_deltas.sql` + `087_rollback.sql`, per Claude Code's Step 0 outline (pre-flight by sysid; VERIFY by object and behaviour; closing SELECT showing exact grants; ledger row on dev only; prod read back by object).

---

## Decisions (for the DECISIONS LOG)

| 2026-11-21 | **Ask shelf saves are deltas, merged on the server** (`edit_ask`, 087), replacing S4-3's "the later form wins whole". A save sends only the tiles this editor added and removed and the fields they changed. Scalars are last-write-wins only for a field both people changed. Reason: on dev, a stale Edit sheet's save silently undid another member's removal. |
| 2026-11-21 | **`edit_ask` takes the ask lock** (`'create_ask:' || hh`), not 085's list lock. Label uniqueness has to serialize against `create_ask`, and the list lock would queue shelf saves behind list writes. "Like 085/086" means the pattern (a server-side delta under a household-scoped lock), not the same key. One lock only, so no lock-order rule. |
| 2026-11-21 | **Ask data stays in sync by polling plus refetch on open and on foreground**, not realtime, matching the app's sync model. |
| 2026-11-21 | **A run in progress is frozen**: tiles never change while a child is choosing. The next run uses the fresh shelf. |
| 2026-11-21 | **An Ask pick lands if its item is live for the household, on the shelf or not; one pick never blocks the others** (`land_ask_picks` in 087). A frozen run picked a tile removed mid-run, and the whole land failed on every retry, a dead end for a child. The shelf is a menu, not a permission. |
| 2026-11-21 | **An open Edit sheet never closes on its own**: if the ask is deleted elsewhere, it says so (Save disabled, OK closes). Background read-error events are throttled to one per run of failures. |
| 2026-11-21 | **A merge another member broke gets its own error**, and the sheet keeps the editor's changes on a re-read. It never fails as a generic validation error, and never drops the editor's work. |

---

## Rollout

**Part A:** client only. Build on dev, walk V1–V2 on two devices on the **dev URL**, then promote (the standing client-only rule applies: walked on dev, `src` tree diff to dev is empty on main, bundle marker read back on prod).

**Part B:**
1. Step 0 on dev: confirm `update_ask`'s current validation and error codes and the live-tile rule, so `edit_ask` copies them exactly. Report, then stop if anything surprises.
2. 087 on dev through the CLI, with a closing VERIFY and a ledger read-back by object (`prosrc` hash, definer, `search_path`, ACL via `aclexplode`).
3. Client on dev. Walk V3–V8.
4. **087 on prod through the CLI, read back by object, before the client.** Ask is live on prod.
5. Promote the client. **Prod walk required** (the change touches a migration).
6. Rollback: client = Vercel Instant Rollback to the previous deployment. 087 is additive (`update_ask` untouched), so the old client keeps working against it.

**Separate small commit (no spec):** store the `acceptInvite` channel in `realtimeChannelRef` so the cleanup at `useProvisions.js:1176-1179` removes it.

---

## Verification (two devices, dev URL, same household)

- **V1, catch-up:** A adds a tile. B is backgrounded, then brought forward: the tile shows at once. B left open on Browse: the tile shows within 20 s. B opens the Edit sheet or starts a run: the tile is already there.
- **V2, frozen run:** B mid-run; A removes a tile B shows. B's tiles don't change. After That's it! / Done, B's next run shows the new shelf.
- **V3, tonight's repro:** B opens Edit (with X). A removes X and saves. B swaps Y for Z and saves. Result: X stays gone, Y is gone, Z is present.
- **V4, live merge in the sheet:** B opens Edit and adds P (unsaved). A removes X and saves. Within 20 s or on foreground, B's sheet drops X and still shows P. B saves: P is added, X stays gone.
- **V5, conflict error:** Explorer with a target of 2 and 4 tiles. B opens Edit and removes one tile (unsaved). A removes two tiles and saves. B saves: the distinct error, the "Someone else just changed this shelf" line, the sheet re-read with B's removal still pending, and the shelf unchanged in the DB.
- **V6, scalars:** A changes the label and B changes the count: both stick. Both change the label: the later save wins.
- **V7, old client:** a build still calling `update_ask` saves successfully against dev with 087 applied.
- **V9, a pick off the shelf:** B mid-run with tile X showing. A removes X and saves. B picks X plus another tile and taps ✓: both land, celebration, no error. Then with the same setup, A deletes X's custom catalog item altogether: B's ✓ lands the other pick and shows "{X} isn't available any more. The rest are on the list."
- **V10, the deleted-ask notice:** B in the Edit sheet; A deletes the ask. Within 20 s B shows "{First} removed this ask." (after B8), Save disabled, OK closes.
- **V8, database:** `edit_ask` grants are exactly `authenticated` execute (via `aclexplode`). Removes and adds are idempotent: the same delta saved twice gives the same shelf.

**Done when:** V1–V10 pass on dev, Dan has walked V1–V5, V9 and V10 on two devices, and both parts are on prod with the prod walk passed.
