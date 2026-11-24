Reported: 2026-11-24 00:18 ET · dev 0fda115 · main 54d453c · re: Offline calm — C10 "Off grid" + the beacon turns clockwise and slower, dev only (2026-11-23 late) · prompt 852f1fe

# C10 "Off grid" and the clockwise 3 s beacon: on dev, harness 58/58

**Deployed:** dev `0fda115` (`dpl_FjoFZiVCaxefeqE5Mvw8dQmy39vj`, `main.bd7c5580.js`, build tag `dev · 0fda115`). App only, no migration. Prod untouched (`54d453c`).
**Pushed (with Dan's OK):** `e4bb992` (C10 + the beacon; spec copy in `docs/specs/active/` updated to the 23:58 version), `0fda115` (harness).
**Gates:** Jest 83 suites / 1242 tests green; `CI=true` build green, before the push.
Prompt `41dc7a3` was never taken here, so Parts A and B were done as one round.

## Part A: C10, "Off grid"
- **Header:** OFF GRID replaces the dots, in the same gold small caps with the same fade. Accessible name "Off grid".
- **The Velayo menu, off grid,** is keyed on member count (`householdMembers.length` once members have loaded), never the plan:
  - **More than one member:** "You're off grid, shopping on your own for now. Everything's kept on this phone and shared with {Household} when you're back in signal." plus "N changes will share when you're back." when changes wait.
  - **One member:** "You're off grid. Everything's kept on this phone and syncs when you're back in signal." This has no changes line: C10 lists that line only for many members.
  - **Member count not known yet** (members not loaded, e.g. a cold start off grid): the one-member words, which claim no sharing.
  - **The OurProvisions row's status:** "Working off grid" off grid, "Active" online.
  - **The known-gap line** stays as built.
- **The note (C3):** "Off grid · everything's saved".
- **Grep for every other user-facing "offline"** (step 4):
  - **Changed:** the header word "Offline" → "Off grid", plus its accessible name. The note "Shopping offline · everything's saved" → "Off grid · everything's saved". The menu copy "You're offline. Everything you do is saved…" → the two C10 variants. No user-facing "offline" remains; a Jest test and the walk both assert it.
  - **Left:** the recipe import and Galley hints, "Couldn't reach the reader / the Galley. Check your connection and try again." They are connection words with no plan words, so there's no overlap. Also left: "Not connected. Try again." and "Not connected." These only show if the database client isn't ready yet (internal guards, not network copy). There are no upgrade or purchase prompts anywhere in the app to pause.

## Part B: the beacon
- **Clockwise:** top-left → top-right → bottom.
- **3 s a turn, 2 turns, then rest.**
- **A travelling beam:** each dot's light rises over ~0.66 s and falls over ~0.84 s, ease-in-out. The next dot starts rising 1 s later, while the one before is still fading. Same peak brightness. The rest state is the steady dots.
- **Unchanged:** the triggers, Reduce Motion and the Low Power rules.

## Harness: `offline-walk.js` on the dev preview (`main.bd7c5580.js`): 58/58 PASS (first run)
- **V1:** the note reads "Off grid · everything's saved". OFF GRID replaces the dots (text "OFF GRID", label "Off grid"). Through flaky signal there's no repeat note and no flicker.
- **V4:** tapping OFF GRID opens the Velayo menu with the one-member words at its top (Cody Test House has one member). The row reads "Working off grid". There's no changes line and no "offline" anywhere in the menu.
  - The many-member words are covered by Jest only. The test account can't join a second household (Dan's rule), so the walk can't drive that variant.
- **The beacon, measured** from the dots' computed fill every 20 ms on a tab switch:
  - peaks at top-left 881 ms → top-right 1880 → bottom 2881 (clockwise);
  - second turn at 3881 / 4882 / 5881, so a turn is 3000 ms (top-right 3002 ms);
  - the dots peak 999 / 1001 ms apart, with overlapping light;
  - two turns, then rest.
- **V9:** one beacon per tab (Home, Plan, Browse, Shop). None with Reduce Motion, none when the tab's fetch fails.
- **V2, V3, V5, V6, V7, V8:** all pass, including one beacon on reconnect and the real offline Wrap up.

**`shop-burst.js` revert mode** (`OP_BURST_REVERTS=5`): 5 bursts of 6 checks, 0 reverted.

## For Dan's iPhone walk (the whole offline build)
- The beam's speed and direction on the phone.
- OFF GRID beside the real place name.
- The many-member menu words, which only a shared household like Madbury shows.
- No sweep in Low Power Mode.
- Everything from the earlier rounds.

## Open
- At SESSION END, add to ROADMAP NEXT (from prompt `871a167`): `shop-burst.js` fold mode fails "Undo all puts all 6 back" (1 of 6); it predates offline check-off.
- Dev `0fda115` is clean against `origin/dev`.

Stopped. Not merged to main.
