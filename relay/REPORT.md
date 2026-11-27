Reported: 2026-11-27 04:56 ET · dev 01593b3 · main e93b265 · re: PROMOTE one list (Slices 1–3) + offline trip-start fix · prompt 2b541c4

# Live on prod: one list (Slices 1–3) and the offline trip-start fix. Client-only; the bundle is read back. Your signed-in prod check is next.

**Prod now:** main **`e93b265`**, a single-parent commit on `5098508` whose **tree = dev `01593b3`** (`4f7eeca…`, proven equal before the push). Deployment **`dpl_4w4EHbkyGryjpzcQF1T8JaW34V7j`**, bundle **`main.ab743abc.js`**, served by `ourprovisions.velayo.ai` and the deployment URL alike.
**Rollback:** Instant Rollback to **`dpl_3niRSygTFv6vT9RTQPhPz8Mrjpzc`** (main `5098508`, `main.92d845f6.js`), never a redeploy. No database step: nothing changed on prod's database.

## 1. Before (read only)
- **Main** was `5098508` = the tree of dev `2b07573` (`a247a84…`, re-proven). Promotions are tree-identity commits, so main isn't an ancestor of dev; the shipped range is `2b07573..01593b3`.
- **Prod** was `dpl_3niRSygTFv6vT9RTQPhPz8Mrjpzc` / `main.92d845f6.js` (READY, rollback candidate), confirmed in Vercel and on the domain.
- **The range holds exactly what this promotion means to ship (19 commits):**
  - Slice 1: `590ec35` `ebe695e` `e522940` `1ae1303` `80d4e5d`;
  - `c783bea`, the offline trip-start fix;
  - Slice 2: `d40b1f6` `7b53390`;
  - Slice 3: `4f51fc3` `6152c36` `013a402` `d6fd79a`;
  - harness: `f62dd27` `f6a9ce2` `3d47099` `01593b3`;
  - docs: `9c2eb3a` `4ef6f16`.
  - Nothing else. 37 files: 29 in src, 7 in docs, 1 in tools; **no migration files**.

## 2. Prod's database needs nothing (read only)
- **No migration between 089 and dev's tree.** The diff adds or changes **no** `.rpc(` / `.from(` call: the one-list paths use only calls the live prod client already makes.
- **Read back by object**, the CLI linked by ref `parpauldmbetptkmdwbd` (system id `7606130613603586966`), then relinked to dev:
  - **Functions = dev**, by body hash, definer and ACL: `adjust_list_item_quantity` `51141803…`, `insert_custom_catalog_item` `510818fc…`, `remove_list_item` `ad4c6c7b…`, `get_list_items_for_household` `a504014b…`, `land_ask_picks` `9d80b8ab…`. All secdef, `authenticated=X`.
  - **Tables:** `authenticated`'s grants on `shopping_sessions`, `list_item_events` (INSERT,SELECT), `user_hidden_items`, `household_staples`, `list_items`, `catalog_items` are identical to dev, and so are RLS on and the policy counts (3 / 2 / 3 / 1).
  - **088 and 089** are present.

## 3. dev → main (Dan's OK)
- `CI=true` build of dev's tree: **green**.
- **The promotion commit:** made as recent promotions were (tree identity, not a merge commit). `e93b265` = `commit-tree dev^{tree} -p origin/main`; parent `5098508`; tree = dev `01593b3`'s; then pushed.
- **Vercel:** Production `dpl_4w4EHbkyGryjpzcQF1T8JaW34V7j`, BUILDING → **READY**.
- **Build tag:** the prompt asked for "main · <sha>", but the tag is **dev-only by design** (as at the 11-25 promotion), so `op-build-tag` 0 on prod. The proof instead: the main sha `e93b2657…` is embedded once, and the old `50985086…` 0 times.

## 4. Prod smoke (read only, signed out; nothing written to prod)
- **Bundle markers** (`main.ab743abc.js`):
  - the doors: `label:"List"` 2, `label:"Shop"` 0;
  - the rename: "Add to Shop" 0, "Add to list" 6;
  - the header and picker: "Our list" 3, "Add to our list" 2, "Added · tap to undo" 1 (the dot ships as `\xb7`);
  - the guide and welcome: "What do we need?" 1, "Welcome aboard" 2, `op_list_welcome_seen` 1;
  - telemetry: `workflow.name` 7, `picker_opened` 1, `added_bucket` 1;
  - the allow-list: `.list-guide-row`, `.list-welcome-ok`, `.item-search-done` present;
  - retired: "Leaving early?" 0, the Add sheet's mic 0;
  - **Ask:** `op-ask:on` 1, still on and unchanged.
- **Signed out, in a fresh browser context** on `#/shop`: the Helm reads **Home · Plan · Browse · List**, the hash stays `#/shop`, and the page runs `main.ab743abc.js`.
- **Not run by me:**
  - **The signed-in checks** (the List header, the picker from + Add with the focus in the field, the guide on an empty list, and `picker_opened` arriving with `workflow.name` and no names) need a signed-in prod account. The harness signs in only as the dev test account, never on prod, and I have no Splunk access.
  - **These are your prod walk,** in your own household. Don't empty your list for the guide.
  - The span shapes were proven on dev off the wire (81/81, `3d47099`), and the prod bundle carries the same code.

## 5. Rollback and the first day
- **Rollback:**
  - Vercel **Instant Rollback to `dpl_3niRSygTFv6vT9RTQPhPz8Mrjpzc`** (main `5098508`). Never a redeploy of an old commit: a redeploy rebuilds with today's env.
  - No database rollback exists or is needed.
  - Rolling back also takes the offline trip-start fix away again.
- **Watch in the first day:**
  - **The welcome shows once to every member,** existing ones included, the first time each opens a non-empty List on each phone. Accepted as a "what's new" (R12).
  - **Installed apps** see "A new version is ready · Reload" on their next foreground.
  - **Helen's and Elly's first visits:** the List door, + Add → the picker, and the fresh-✓ undo. The guide only appears when the list is empty.
  - **`added_in_store` now fires only during the adder's own trip** (R5), so home adds stop polluting trips. The trip-qualification S1 signal changes accordingly; that's intended.
  - **No Wrap up at 0 checked** (R4). A trip opened by a check and then fully unchecked has no Wrap up until the 8 h expiry; accepted.
  - **Splunk (after you index the tags):** `picker_opened` in environment `production` with `workflow.name`. Until the tags are indexed, the charts show one undivided line.

## Unexpected
- The build tag is dev-only, so the sha embedded in the bundle stands in for "main · <sha>".
- Nothing else. The database read-backs all matched dev, and so did the bundle markers.

Not done here: the Splunk tag indexing, the dashboard and the "Picker silent" detector; docs; SESSION END.
