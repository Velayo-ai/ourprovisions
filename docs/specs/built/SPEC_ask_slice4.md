# SPEC — Ask · Slice 4: edit, delete, short shelves, the growth moment, the photo nudge, the `item-photos` sweep

**Status:** APPROVED in design chat (Dan, 2026-11-09 ~22:35 ET). **Step 0 first: report and stop.** Build on dev. Prod untouched.
**Reads with:** `SPEC_ask.md`, `SPEC_ask_amendment_2026-11-03.md` (wins over the base spec), `SPEC_ask_slice2.md`, `SPEC_ask_slice3.md`. This spec wins over all of them for what it covers.
**Migrations:** **083** (Ask: `update_ask`, the server Explorer cap, `land_ask_picks` on short shelves, D1 per S4-10) and **084** (the `item-photos` sweep RPCs, its own migration as S37 is). Draft both and parse-check them; **apply on dev with fresh eyes, never after midnight**; read back the objects.
**Done when:** Verification below walked on dev, including amendment V9 and V10; 083 and 084 applied on dev with VERIFY green; the sweep's `item-photos` pass runs dry and green on its schedule; prod untouched.

After this slice, Ask still needs the wagon polish (its own design pass) and then the whole-feature promotion (077 → 078 → 083 → 084 → client, prod walk, the V8 HAR).

---

## Rulings (2026-11-09)

| # | Ruling | Why |
|---|---|---|
| S4-1 | **Asks are managed in Manage Categories, renamed "Manage categories & asks".** The Browse link and the modal heading change. The modal gets an **Asks** section: one row per live ask showing "Ask {Label}" (`.op-name`), its style word (Explorer / Shopper), "pick {n}", and "{k} on the shelf". Tapping a row opens the edit sheet. **+ New shelf** sits at the end of the section. **Amends the amendment's Slice 4 row:** there is no Settings → Asks. | Dan: asks live in Browse's rail, and this is where Browse's structure is already managed. |
| S4-2 | **One sheet for create and edit.** `NewShelfSheet` gains an edit mode: titled "Edit Ask {Label}" and prefilled with name, noun, target, style and shelf, in order. **Save** calls `update_ask`. **Delete** sits at the bottom, styled as destructive, and asks for confirmation: "Delete Ask {Label}? Anything {Label} already picked stays on the list." Deleting is a soft delete (`asks.deleted_at`). The ask leaves the rail and any selected pill, a held resume key for it dies on its next read (Slice 3), and the label is free to reuse (K2's index is partial on live asks). | One form, so create and edit can't drift apart. V10: labels on live rows and the household's photos stay. |
| S4-3 | **Edits go through one RPC, `update_ask`** (083), shaped like `create_ask` (078): `security definer`, `search_path ''`, execute for `authenticated` only (revoked from `public`, `anon` and `service_role`). Arguments: `p_household_id, p_ask_id, p_label, p_shelf_noun, p_screen_style, p_pick_target, p_catalog_item_ids uuid[]` (in shelf order). It runs as one transaction, with the same checks as `create_ask` (label, noun, style, target 1–6, 1–48 live shelf items the household can see, target ≤ items). K2 excludes the ask itself and still raises `23505`. Then it replaces the shelf (delete removed rows, upsert the rest with their new positions) and sets `updated_at`. **Last write wins** between two editors. | No half-saved ask on a dropped signal. Every rule lives on the server in one place. |
| S4-4 | **The Explorer cap moves to the server.** `screen_style = 'simple'` ⇒ at most 4 shelf items, else `22023`. It's enforced in `update_ask`, and in `create_ask` by replacing it in 083 with the same body plus that one check. The client keeps its message (`ASK_SIMPLE_CAP_MESSAGE`). | Closes the client-only gap logged in Slice 3. |
| S4-5 | **A short shelf runs; the child never meets a grown-up screen.** The **effective target** is `least(pick_target, live tiles)`. "Your turn", the shelf title, the dots and That's it! all use it ("Pick 2, Everett!" on a 2-tile shelf with target 3). `land_ask_picks` (083) accepts exactly the effective target, computed on the server by the **same live-tile rule** as the client (S4-9 defines it once). **0 live tiles:** the ask can't run, and Browse's header shows "Nothing on this shelf yet · Edit" in place of "Hand it to {Label} →". **The grown-up's note:** when an ask is short, Browse's ask header and its Manage row show "{k} of {n} on the shelf · Edit" in quiet (not error) text. **The "fewer things than there are to pick… fix it in Browse" screen is removed.** | Dan: run with the target lowered. A missing tile is the grown-up's business, so the fix belongs in the grown-up's view. |
| S4-6 | **The growth moment.** After a save that **raises the target** or switches **Explorer → Shopper**, the editor sees a toast: "{Label}'s ready for more." (the label in `.op-name`). Any other save shows "Saved.". The toast is for the parent only: it sends no span, records nothing, and infers nothing about the person. | Growth lives in the move, not in the label (2026-11-09). |
| S4-7 | **The Explorer photo nudge: a camera badge on the chip.** In the sheet, on Explorer only, a shelf chip whose item has no household photo shows a small camera. Tapping it runs **the same photo flow as Browse** (`setItemPhoto`, the `item-photos` bucket, "Photograph the item, not a person."). Under the chips, in muted text (not the error colour): "Explorers pick by picture. Add a photo for {A} and {B}." With three or more: "for {A}, {B} and {n} more". The hint never blocks Save, because the parent may have a reader at the Explorer stage. | Half of tonight's Explorer shelf was words. Fix it where the parent already is. |
| S4-9 | **The live-tile rule (Step 0 #1, Dan 2026-11-10; supersedes S4-5's "Step 0 defines it").** A shelf tile is LIVE when its catalog item is not deleted and is global or this household's own. **One person's Hide never narrows a shelf** (as Staples never narrows one, K4). The effective target is `least(pick_target, live tiles)`. Server sites: `create_ask`, `update_ask`, `land_ask_picks` (083). Client sites: `liveTiles` / `effectiveTarget` in `src/lib/askRun.js`, read by the Browse blocks, the run, the Browse header note, the Manage row and the edit prefill. **Client tiles come from the shelf rows plus their catalog items, never the Browse list** (`catalogMap` drops the runner's hidden items and matches by name). Ask Everett was "short" only because one member had hidden Bread and Broccoli; under this rule it runs at 3. | The shelf is the household's. A per-person preference deciding what a child may pick, and the server disagreeing, would reject a lowered confirm. |
| S4-10 | **D1: `update_ask` is the only edit door.** 083 revokes from `authenticated` the UPDATE on `asks.label / shelf_noun / screen_style / pick_target` and the INSERT, DELETE and UPDATE (position) on `ask_shelf_items`. KEPT: UPDATE on `asks.deleted_at / updated_at` (Delete stays a plain update, Step 0 #4) and every SELECT. 077's policies stay, inert for the revoked commands. | Without it S4-4's server cap is advisory: a 5th row on an Explorer shelf, or a style or target change, could go straight through PostgREST. |
| S4-8 | **The `item-photos` sweep pass** (084 plus the `meal-photo-sweep` function), mirroring 070's posture (service-role RPCs, objects removed through the Storage API, SQL never deletes an object, dry by default under `SWEEP_LIVE`). It removes: (a) the objects of `household_item_photos` rows soft-deleted (replaced or removed) past a grace window, then hard-deletes those rows; (b) orphan objects under `item-photos/{household_id}/…` with no row, older than 7 days. **Never** a live row's objects. **Deleting an ask removes no photo** (A23: the photo belongs to the household's item). Step 0 #3 proposes the window from 070's. | A23's bucket must not grow forever. Same shape as the proven meal-photo sweep. |

---

## Step 0 — Claude Code, on dev. Report and stop.

1. **Why Ask Everett is short, and the single live-tile rule.** Run the read-only query (asks, then `ask_shelf_items`, then `catalog_items`, for Everett), and report how the client builds tiles (`runItems`: catalog `deleted_at`? the household's hidden items? anything else?). Compare that with what `land_ask_picks` counts as on-shelf today. Propose **one** rule that both sides compute identically, and name every client and server site that must use it. If the client hides household-hidden items and the server doesn't, say so: that mismatch would reject a lowered confirm.
2. **The photo flow:** can Browse's "tap to add its photo" flow be called from inside the sheet (a modal over a modal on iPhone)? Report the component boundary and any stacking or keyboard issue.
3. **The sweep:** report 070's windows and the function's pass structure, then propose the `item-photos` pass: the RPC names, the grace window for soft-deleted rows, the 7-day orphan rule, the path shape, and whether one function run does both buckets (lean: yes, a second pass, so it shares the secret, schedule and `SWEEP_LIVE`).
4. **Delete path:** confirm a member's `update asks set deleted_at = now()` passes 077's grants and policy, and that K2 frees the label afterwards. Then choose: a plain update (one column, already atomic) or a `delete_ask` RPC in 083. Lean: the plain update.
5. **Numbers:** confirm the next free numbers are 083 and 084. Then draft 083 and 084 with closing VERIFY blocks, parse-check them (rolled back), and **stop before applying**.

**Step 0 run 2026-11-10 (dev, ~04:20–04:36 UTC); calls approved by Dan the same night:**
- #1 → S4-9. #2: Browse's photo flow is a hidden file input into `setItemPhoto`, no modal; the sheet can use it directly. Manage and the shelf sheet share one overlay layer and Manage is drawn later, so **close Manage on a row tap** before opening the edit sheet. **Prefill from the shelf rows**, not the sheet's catalog list (it also drops the editor's hidden items).
- #3: 084 = `item_photo_sweep_expired / orphans / delete_rows`, 070's shape, **30-day grace for soft-deleted rows, 7 days for orphans**, paths `{household}/{item}/{uuid}-thumb|view.{webp|jpg}` (the existing path guard matches). **One function run, both buckets**, the item pass second, sharing the secret, the schedule and `SWEEP_LIVE`. **Guard beyond 070:** a soft-deleted row whose paths a live row also names is never swept (`set_household_item_photo` accepts re-used paths; 077's fixture (27) does it).
- #4: **plain-update delete**, no `delete_ask` RPC (083's fixture proves it as `authenticated`). #5: 083 and 084; both parse-checked (083 VERIFY 32/0, fixture 40/40; 084 VERIFY 23/0, fixture 11/11), rollbacks too. D1 → S4-10.

---

## Build notes

- **One `liveTiles` helper** in `src/lib/askRun.js`, returning `effectiveTarget(ask, tiles)`. AskRun, the Browse header note, the Manage row and `shelfCanRun` all read it. Delete the old guard's copy and its test, and add tests for short (2 of 3), exact, and 0.
- `useProvisions`: `updateAsk(askId, fields)` → `update_ask`, with the same `23505` / `22023` messages as create. `deleteAsk(askId)` follows Step 0 #4's choice. Refetch the asks after either.
- The edit sheet's prefill keeps the shelf's order. Explorer's over-4 state in edit behaves exactly as in create (Slice 3's header and countdown line, nothing removed automatically).
- **Name surfaces:** the Manage rows, "Edit Ask {Label}", the delete confirmation and the growth toast all carry `.op-name`.
- **Replay:** the Manage modal's ask rows are text, so `.op-name` applies. Don't put any ask label in an `<option>` value, as with categories (2026-10-19).

---

## Verification (walk on dev)

1. **V9:** a member who didn't create an ask can open it from Manage categories & asks, edit it (name, noun, target, style, shelf) and save, and can delete it.
2. **Edit, one write:** change Ask Easton's target 3 → 2 and remove one tile → one `update_ask` call (DevTools Network), and Browse shows the new shelf at once. A duplicate name → "You already have Ask {Label}."
3. **Explorer cap, server:** in a rolled-back transaction, `update_ask` and `create_ask` with `simple` and 5 items each raise `22023`. In the sheet, Explorer over 4 shows Slice 3's countdown and won't save.
4. **The growth moment:**
   - Raise EV's target 1 → 2 → "EV's ready for more."
   - Switch an Explorer ask to Shopper → the same line.
   - Lower a target, or switch Shopper → Explorer → "Saved.".
   - No span in either case.
5. **Short shelf** (changed 2026-11-10: under S4-9 Ask Everett runs at 3, so a short shelf needs a deleted custom item):
   - Create Ask Nina (Shopper, pick 3) with two global items and one custom item; delete the custom item from Browse → the shelf drops it (077's CASCADE). Browse shows "2 of 3 on the shelf · Edit"; Manage shows the same. Run it → "Pick 2, Nina!", two dots; confirm → both land (`land_ask_picks` accepts 2).
   - Ask Everett runs at 3 on every member's phone, including the one who hid Bread and Broccoli; those two tiles show in Everett's block and on the run.
   - An ask whose only tiles were deleted custom items → "Nothing on this shelf yet · Edit", and no way to run it.
   - In a rolled-back transaction, a 3-pick confirm on a 2-live shelf raises `22023`.
6. **Photo nudge:**
   - EV on Explorer with Butter photo-less → a camera on Butter's chip, and the hint names it.
   - Tap the camera, take a photo → the badge goes, the hint updates, and the run shows Butter's photo with no name.
   - Shopper shows no badge and no hint.
7. **V10:**
   - Delete Ask Easton (confirmation copy as S4-2) → it leaves the rail and Manage.
   - Rows Easton picked keep "Picked by Easton" until they're removed or revived.
   - Easton's shelf photos still show for those items in Browse and on any other ask.
   - Creating a new "Easton" ask works.
8. **Sweep:**
   - The dry run reports the expected counts against fixtures (one replaced item photo past the window, one orphan past 7 days, one live photo).
   - The live run on dev removes exactly the first two.
   - The live photo and a deleted ask's photos remain.
   - The scheduled run is green.
9. **Regression:** Slice 3's V3 (Explorer run) and V5 (b) (reload resume) still pass.
