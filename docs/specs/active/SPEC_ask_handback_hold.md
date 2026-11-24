# SPEC — Ask: the hand-back needs a hold (amends W8) + Explorer swipes the wagon to send

*Design chat 2026-11-24. Found by Dan testing Ask Everett with Everett (age 2). Client-only, no migration, no prod. Build on dev, walk on Dan's phone with a toddler, don't promote on its own. It goes to prod with Ask.*

## What happened

Explorer style. Everett filled the wagon, the fireworks went off, and he tapped the ✓ (That's it!) over and over. The first tap landed the picks and switched to Great picks. **"Give it back to Dan" sits in the same footer spot the ✓ just left** (both live in the bottom bar, centred), so the next tap of the same mash hit it. Today that button closes the run on a single tap (W8). He lost the Great picks screen within a second of reaching it.

The data was fine: the picks had already landed (confirm → onLand runs before the screen changes), so the list was correct and the toast showed. What he lost was the payoff, which is the moment the whole Invitation → Participation → **Contribution** story builds up to.

## The rule this sets

**In Ask, anything that ends the child's turn needs a press-and-hold. Child actions are taps, adult actions are holds.** Close and Done already work this way (A17, W6). The hand-back was the one exit a tap could set off. One duration and one fill for all of them: `useHold`, `HOLD_MS` (1 s).

## Rulings

| # | Ruling | Why |
|---|---|---|
| H1 | **"Give it back to {Parent}" becomes a press-and-hold** using `hooks/useHold`, same `HOLD_MS` and the same fill as HoldDone (`holdFillCss`, the fill running left to right inside the teal pill). A short tap does nothing to the run. It only swaps the label to **"Hold to give back"** for ~1.6 s, the same way HoldDone shows its hint. aria-label: "Hold to give it back to {Parent}" / "Hold to give it back". The label, `.op-name`, toast and Browse landing from W8/W9 are unchanged. Amends W8's "Tapping it closes the run". | A toddler mashing at a screen taps. He doesn't rest his finger on one spot for a second. The adult does it without thinking. We already have this hold for Close and Done, so this is reuse, not a new pattern. |
| H2 | **Arm delay:** for **1500 ms** after Great picks appears, the button ignores presses: a hold can't start, and no hint shows. It looks normal, with no disabled grey. Reduced motion: same delay. | This catches a finger that's already moving, and it lets the wagon roll-in finish before anything can end the screen. A hold of 1 s on its own is very likely enough. This is the cheap belt-and-braces. |
| H3 | **His taps get an answer:** on Great picks, a tap on the wagon makes it hop (the same `kick` hop the shelf wagon uses). Not under reduced motion. Taps elsewhere on the screen do nothing. | He's going to keep tapping. If tapping does something nice, the screen rewards him and he keeps looking at it. Optional: drop it if it complicates the finale wagon. H1–H2 fix the bug. |
| H4 | **Unchanged:** Shopper's "That's it!" stays a tap (it's the child's action), and so does Let's pick ▶. Hand-back still fires once (`handedBack` guard). The picks still land before Great picks appears. | Only adult actions move to holds. |

## Explorer: swipe the wagon to send (added the same session)

Look: `docs/mockups/mockup_ask_swipe_wagon.html` (walked on Dan's phone and approved 2026-11-24).

| # | Ruling | Why |
|---|---|---|
| H5 | **Explorer has no ✓.** The ✓ only ever appeared at exactly the target count (`canConfirm`), so a full wagon already means "done". **The shelf wagon grows into the space the ✓ took** (mock: ~88vw, max 360px, against ~185px today). Make sure the fly-in cards still land cleanly. Shopper keeps "That's it!". | For a 2-year-old the ✓ was an extra step that meant nothing, and it crowded the wagon. It was also what put a target under his finger right where Give it back appears. |
| H6 | **Send = drag the full wagon to the right.** It follows his finger. At **≥ 60px** of rightward travel on release, the picks land (`confirm`), the wheels spin, and the wagon rolls off the right edge (~600 ms). Then Great picks rolls the same wagon in. Short of 60px it springs back. Only a full wagon moves. A not-full wagon ignores drags. | A deliberate act that's his, not a timer. Taps can't trigger it. The wagon carries the story from one screen to the next. |
| H7 | **Taps keep working after it's full.** He can tap a tile to unpick or pick, and tap a card in the wagon to take it out (no movement above ~8px = a tap). Unpicking empties the tide a bit, so the wagon is no longer full and the hint stops. Refilling fires the fireworks again (the existing not-full → full trigger). | Dan saw Everett enjoy swapping after the wagon was full. That play stays. |
| H8 | **The hint is the wagon itself. No adult text.** After the fireworks, while the wagon is full: the handle tugs right and the wagon edges ~14px right and back, with a teal → fading in beside it, looping every ~1.6s until a drag starts. Reduced motion: no tug, no arrow. The drag still works. | Toddlers copy motion better than they read symbols. Dan's call: with these hints, **no "Grown-up" coaching line** is needed. |
| H9 | **Done with a full wagon sends it.** In Explorer, holding Done on the shelf when the wagon is full does the same thing as the swipe: it lands the picks and goes to Great picks. With a wagon that isn't full, Done abandons as today. Hint text when full: "Hold to send". | A way for the adult to finish if he never swipes. His picks are never thrown away once the wagon is full. |
| H10 | **Land failure without a ✓:** if `onLand` throws after a swipe, the wagon rolls back in still full, and the error line reads "That didn't reach the list. Swipe the wagon again." (Explorer). Done-to-send also retries. B9.3 (nothing landed) is unchanged: the dead picks leave, the wagon is no longer full, and he picks again. | Today's copy says "Tap ✓ again", which has no meaning once the ✓ is gone. |
| H11 | **Accessibility:** the full wagon also works as a button, "Send the wagon" (Enter/Space), for keyboards and screen readers. | A drag isn't the only way in. |

## Tests (AskRun.test.js)

- The existing W8 tests that `fireEvent.click` Give it back must change to a hold: pointerDown, advance fake timers by HOLD_MS, pointerUp. They should still assert onHandBack fires **once** with count and ids.
- New: a plain click on Give it back → onHandBack/onExit **not** called, and the label reads "Hold to give back".
- New: a hold started within 1500 ms of Great picks appearing → nothing happens. A hold after 1500 ms → hands back.
- New (the real bug): confirm, then the screen changes, then immediately click the footer button several times → still on Great picks.

- Explorer: no ✓ is rendered. A drag of ≥ 60px on a full wagon calls onLand once and reaches Great picks. A drag under 60px, or any drag on a not-full wagon, doesn't. A tap on a wagon card still takes it out when the wagon is full. Done held with a full wagon lands (not `ask_abandoned`). Done with a wagon that isn't full abandons. onLand throwing → still on the shelf, wagon full, the new error copy.
- Shopper: "That's it!" unchanged.

## Walk (Dan's phone, dev)

1. Explorer run with Everett: fill the wagon, swap a snack or two, watch the tug, swipe. Mash the screen as Great picks arrives: it stays up, and the wagon hops when he taps it (H3).
2. Dan holds Give it back → fill runs → Browse with "Everett added N · See".
3. Shopper style: same hold works, same label.
