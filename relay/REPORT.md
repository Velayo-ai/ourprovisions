Reported: 2026-11-24 00:48 ET · dev 2cee835 · main 54d453c · re: Beacon blinks before it turns — make the beam additive, dev only (2026-11-24) · prompt 17d511c

# The beacon no longer blinks: the beam only adds light. On dev, harness 60/60

**Deployed:** dev `2cee835` (`dpl_DJ3BesFjuyCNKLQtFgTTKkHCiGtF`, `main.74c8a29b.js`, build tag `dev · 2cee835`). App only, no migration. Prod untouched (`54d453c`).
**Pushed (with Dan's OK):** `1b8a802` (the fix; spec copy in `docs/specs/active/` updated with "the beam only adds light"), `2cee835` (harness).
**Gates:** Jest 83 suites / 1242 tests green; `CI=true` build green, before the push.

## The cause
**A remount, not a dim base.** The dots' SVG had `key={`dots-${sweep}`}`, keyed on the beacon counter. When a beacon started (sweep 0 → n) and again when it ended (n → 0), React threw the SVG away and mounted a new one. Every new SVG plays C9's word↔dots fade-in (`harbor-fade`, opacity 0 → 1 over 320 ms). So the whole mark vanished and faded back just before the turn began, and again just after it ended.
- The sweep keyframes themselves never dimmed: 0% and 100% were the resting gold `#C9A97A`.
- **Measured on the old build `0fda115`:** one tap on the dots gave **3 SVG elements** (rest → beacon → rest), and the mark's **opacity hit 0 at 131 ms**.

## The fix
- **One SVG for the dots' whole life.** A beacon only toggles a class (`key="dots"`). The fade still plays once when OFF GRID gives way to the dots, as C9 says.
- **No sweep inside that fade-in:** a beacon asked for as the dots reappear (on reconnect) waits until their 320 ms fade has finished.
- **Every keyframe is at rest or brighter.** It starts at rest (and holds there before each dot's delay), lifts, and returns to rest, so removing the class at the end changes nothing.
- **Beam colour: a brighter gold, `#F2D49B`** (r+g+b 609 against rest `#C9A97A` = 492). The old peak was the paler `#FFF1CF`.
- **Unchanged:** same size, clockwise, 3 s a turn, 2 turns, the travelling overlap, the triggers, Reduce Motion and Low Power.
- **Same tap measured on the new build `2cee835`:** 1 beacon, **1 SVG element, lowest opacity 1**.

## Harness: `offline-walk.js` on the dev preview (`main.74c8a29b.js`): 60/60 PASS (first run)
- **The beam only adds light** (new). Every 20 ms across a full beacon, from rest before it to rest after it, 476 samples:
  - **0** samples with any dot below rest fill (`#C9A97A`) or below opacity 1;
  - **1** SVG element throughout;
  - rest before and after the beacon.
- **It does lift:** peak r+g+b 609 (`#F2D49B`).
- **Clockwise:** peaks top-left 822 ms → top-right 1822 → bottom 2821, then 3822 / 4821 / 5821. A turn is 3000 ms (top-right 2999 ms); the dots peak 1000 / 999 ms apart.
- **Unchanged checks:** one beacon per tab (Plan, Browse, Shop, Home), none with Reduce Motion, none on a failed fetch. One beacon on reconnect. Everything else passes, including OFF GRID, the menu words and the offline Wrap up.

**`shop-burst.js` revert mode** (`OP_BURST_REVERTS=5`): 0 reverted.

## Note
- In an ad-hoc measurement on the old build, one tab switch played no beacon. In the walk, every tab switch played exactly one, on `0fda115` and again on `2cee835`. Worth a glance on the phone: switch tabs and watch for one sweep each time.
- The dev domain took ~10 min to serve the new build after Vercel reported READY (third round running). I waited on the build tag.

## Open
- At SESSION END, add to ROADMAP NEXT (from prompt `871a167`): `shop-burst.js` fold mode fails "Undo all puts all 6 back" (1 of 6); it predates offline check-off.
- Dev `2cee835` is clean against `origin/dev`.

Stopped. Not merged to main.
