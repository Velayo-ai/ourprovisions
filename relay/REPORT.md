Reported: 2026-11-23 23:37 ET · dev bfff70e · main 54d453c · re: Offline calm — C9, the Velayo dots become the Harbor connection light (replace the cloud icon), dev only (2026-11-23 late) · prompt cb3dbb2

# C9 built on dev: the Velayo dots are the Harbor connection light. Harness 54/54, ready for the full iPhone walk

**Deployed:** dev `bfff70e` (`dpl_GSNWcSSidVRDfgpPB4YPnw7x8mDg`, `main.fdd7bdea.js`, build tag `dev · bfff70e`). App only, no migration. Prod untouched (`54d453c`).
**Pushed (with Dan's OK):** `b9803e8` (last round's harness fix, as ruled), `d8b1094` (C9; spec copy in `docs/specs/active/` updated to tonight's version), `bfff70e` (harness).
**Gates:** Jest 83 suites / 1239 tests green; `CI=true` build green, before the push.

## Step 0: what the dots did, and Dan's ruling
The three dots (`App.js` header row, `onClick={() => setShowVelayoMenu(true)}`, labelled "Velayo menu") opened the **Velayo app menu**, not the household menu. It's a centred card: Velayo logo, "Live Better. Live Smarter.", and one app row "OurProvisions · Active" whose tap closes the card. The household menu ("Manage place") opens from the household name. I stopped and asked. **Dan ruled: keep the Velayo app menu as the dots' tap;** offline, C2's lines go at its top.

## What's built
- **Connected:** the dots, steady, named "Connected to the Harbor".
- **Offline** (C5's rules, unchanged): the word **OFFLINE** replaces the dots. It uses the household name's gold small caps (Lato 13 px, uppercase, 0.6 px tracking, `#C9A97A`) and is named "Offline". A label, never a badge. One soft fade (320 ms) between dots and word.
- **The beacon:** each dot brightens in turn (left, middle, right), 1.5 s a pass, 2 passes, then rest. A request while it plays is ignored, so it never loops. It plays:
  - on app open (the household's first data on screen);
  - when the connection returns (OFFLINE gives way to the dots);
  - on a tap of the dots;
  - on a tab switch, **only when the next request result after the switch is a success**. A failure plays nothing.
- **No sweep:** offline, with Reduce Motion (checked at request time; CSS also turns the sweep and fade off), and in Low Power Mode where detectable. Before each sweep a ~100 ms requestAnimationFrame sample runs; iOS caps frames at 30 fps in Low Power Mode, so frames averaging slower than 24 ms, or none at all (a hidden page), mean no sweep.
- **Tap:** opens the Velayo menu (and asks for a beacon). Offline, the menu opens with C2's copy at its top, plus "N changes will share when you're back." and the known-gap line when they apply.
- **Removed:** the cloud-off icon and its sheet.
- **One supporting change:** the 2 s list read now reports its success. It didn't before, so C5's offline state cleared on other requests (catalog every 20 s, writes). It now clears on the household's own poll, and the tab beacon waits on it.
- **Not built:** partial service health (recorded in the spec only, as told).

## Harness: `offline-walk.js` on the dev preview (`main.fdd7bdea.js`): 54/54 PASS (first run)
- **Setup:** the dots steady, named "Connected to the Harbor".
- **V1:** going offline shows the calm note once, then **OFFLINE** (text "OFFLINE", label "Offline", no dots). Through flaky signal (six device drops plus API failures) the note never repeats, and OFFLINE never flicks back to the dots.
- **V2, V3, V5, V7, V8:** unchanged from the last round, all pass. That includes the real offline Wrap up: the trip closes after reconnect, and a partner's offline-time add stays on the list.
- **V4:** tapping OFFLINE opens the Velayo menu (logo and tagline under the lines) with "You're offline. …" and "3 changes will share when you're back." at its top.
- **V6:** on reconnect there's no message. The dots return with **exactly one beacon**, then rest. The item dots clear, and the second phone shows the checks.
- **V9:**
  - Home, Plan, Browse and Shop each played one beacon after the tab's first fetch.
  - Reduce Motion (emulated): no beacon on a tab switch.
  - A tab switch with the API blocked: no beacon, and OFFLINE shows.

**`shop-burst.js` revert mode** (`OP_BURST_REVERTS=5`): 5 bursts of 6 checks, 0 reverted. Online is unchanged.

## For Dan's iPhone walk (the whole offline build)
- The beacon's feel and brightness on a real screen.
- OFFLINE next to your real place name.
- No sweep with Reduce Motion on, and in **Low Power Mode**. The harness can't fake that; the 30 fps detection is the part to confirm.
- The Velayo menu's offline lines.
- Everything from the last round: the item dots, the note, airplane mode on the installed app, and Wrap up in airplane mode, then reconnect with the second phone.

## Open
- At SESSION END, add to ROADMAP NEXT (from the last prompt): `shop-burst.js` fold mode fails "Undo all puts all 6 back" (1 of 6); it predates offline check-off.
- Dev `bfff70e` is clean against `origin/dev`.

Stopped. Not merged to main.
