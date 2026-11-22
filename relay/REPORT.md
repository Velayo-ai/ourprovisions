Reported: 2026-11-21 22:48 ET · dev fb97941 · main dac0fc3 · re: push dev (330ec4d + fb97941) and read the marker back

## Ask shelf sync Part B is on dev: 087 and the client, marker read back

- **Push:** `origin/dev..dev` was `330ec4d` (087 migration files) + `fb97941` (Part B client), and nothing else. Pushed as `95f7013..fb97941`. Main is unchanged at `dac0fc3` (prod).
- **Deployment:** `dpl_DF9UnGxbSX9scdJVwD87j8N5X11d`, built from `fb97941`, is ready. Its own manifest and `dev.ourprovisions.velayo.ai`'s manifest both name `main.e95e695d.js`, so the dev domain serves the new build.
- **Markers in the live dev bundle** (one fetch from the dev domain), each found once:
  - `Someone else just changed this shelf. Check it and save again.` (B5)
  - `available any more.` (B7 / B9.3)
  - `rpc("edit_ask"` (B3)
  - `removed this ask.` (B8's named line)
  - `setTimeout(e,1200))]).then` (Part A, still there)
- **Database:** 087 has been on dev since 03:05:59 UTC (ledger `20261122030559`). It is NOT on prod. Prod's client still calls `update_ask`, and prod's `land_ask_picks` is still the old one.

### Next
- **Walk on two devices on the dev URL:** V3–V10. Dan walks V3–V5, V9 and V10. V1–V2 passed under Part A.
- **Then prod, in order:**
  1. 087 on prod through the CLI: the same file, read back by object (prod has no ledger).
  2. Promote the client, main = dev tree.
  3. Prod walk, required because this change carries a migration.
  4. Rollback: client by Instant Rollback to `dpl_EpGMKkE64woPHjyHr43PmExqCD21` (`dac0fc3`); 087 by `087_rollback.sql`, after the client.
