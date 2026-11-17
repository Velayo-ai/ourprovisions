# SPEC — Ask wagon polish + the hand-back (launch blockers 2 and 3)

*Design chat 2026-11-14. Look: `docs/mockups/mockup_ask_wagon_polish.html` (final round). Client-only, no migration. Build on dev, walk on Dan's phone, don't promote (Ask goes to prod only in its launch session).*

## Why

Ask is one story told in three screens: **Invitation → Participation → Contribution.** The wagon carries that story. It's empty when Easton is invited, it fills as he picks, and it's full when he's done. The build had the wagon floating on cream below the scene, drawn so it read as a supermarket cart, and the run ended with the child sent "Back to the list", into the adult app. This spec settles the look (A14 / A15) and closes the run with the phone going back to the parent.

**Design direction (DECISIONS LOG):** in Ask, the welcome screen establishes belonging and the participant's choices create the delight. One illustrated object, the wagon, sits on a quiet setting and carries the experience from invitation to contribution. Completion acknowledges what the person did, not what the software did.

## Rulings

| # | Ruling | Why |
|---|---|---|
| W1 | **One wagon drawing everywhere:** turn (large), shelf (small, ~150px), Great picks (large). Identical geometry at every size; no line-drawn cart on the shelf. | The wagon is the visual thread through all three screens. Keeping it the same matters more than any extra animation. |
| W2 | **The wagon:** seen from a three-quarter angle (the back rim visible), deep cream tub with a rolled lip, teal stripe on the body, four wooden wheels (the far pair dimmed). Wood grain stays but is quiet: no inner ring, faint spokes. Soft ground shadow. | A beach wagon, not a cart. A designed object, not a character. |
| W3 | **The handle is a separate part**, drawn in front of the tub. It pivots on a round wooden joint (about hub size) at the front lower-left corner. A short tongue links the pivot to a **fixed bracket on the front undercarriage, drawn behind the front wheel** (the wheel hides most of it). A slim wooden shaft angles up-left to a short dark rounded grip. The handle never touches the tub wall or rim, and the tongue never touches a wheel hub. | It has to look like it really works: the wheels turn free and the handle steers the front of the wagon. |
| W4 | **Picks are cards:** the tile's photo (else its glyph, else its name) on a cream card with a ~3px border, slightly taller than wide, rounded. They ride above the rim with a gentle tilt (left / straight / right, spread evenly for 1–4 picks), with the bottoms behind the tub's front panel. The same cards are used on the shelf's small wagon (still drop in + hop, still tappable to take out) and on Great picks. | His real picks, in the family's own photos, visibly in the wagon. |
| W5 | **Turn screen scene runs the full height:** sky → water → sand. The horizon sits high, just under the top bar, so the title, its rule and the pick line sit on calm water. The sun has one faint glow and **no glints**; the far hills are quiet (~0.3). The wagon sits on the sand, about 9% of the screen height above where the first mock had it, with comfortable space above the button. No towel. | The setting is calm and isn't the attraction. The headline and the wagon read as one scene. |
| W6 | **Top-right control is quiet text:** no pill, no border, ink at ~62%, same press-and-hold as today. Turn screen: **"Close"**. Shelf: **"Done"**. **Great picks: none.** | Before he starts, nothing is "done". On Great picks the picks have already landed and the bottom button is the one exit. |
| W7 | **Great picks copy (amends A14):** "Great picks, {Label}!" stays. "I've added these to our list." → **"Your picks are on our list!"**; when exactly one pick landed → **"Your pick is on our list!"** (title "Great pick, {Label}!" as today). | A14's "I" was meant to be the child speaking, but readers took it as the software. The new line puts the credit on him and keeps "our". |
| W8 | **The hand-back:** Great picks' button becomes **"Give it back to {Parent}"**, where {Parent} is the signed-in member's first name (the phone's owner). With no name, it reads **"Give it back"**. Tapping it closes the run and lands on **Browse**, which shows the toast **"{Label} added {N} · See"** (N = picks that landed). | The turn screen is the parent handing the phone over, so the last screen is the child handing it back. He never navigates the adult app. |
| W9 | **The toast:** uses the existing app toast with an action (`toastMessage.action`), standard duration. **See** opens the list with the landed rows briefly highlighted (their "Picked by" initials are already on them). It appears only after a successful land (a failed land never reaches Great picks), and once per run. | Paige sees what he picked without an approval step (already ruled: no approval). |
| W10 | **Fonts unchanged:** Playfair for the three titles, Lato for everything else, including the buttons. | The serif button in the mock was a font fallback, not a choice. |

## Motion (off under reduced motion)

- **Turn:** the sun rises (as today), then the wagon rolls in from the left with its wheels turning, rocks gently once on the stop, and the handle swings ~4° on its pivot and settles. About 0.9s, after the sun.
- **Shelf:** a pick drops in and the wagon hops (as today), and the wheels turn a quarter.
- **Great picks:** roll-in (as today), wheels turning.
- Only the wheels rotate; the bracket and tongue stay still.

## Verification (on dev)

1. Turn, shelf and Great picks match the mock on a 375px phone. The wagon clears the button, and Explorer (Simple) still fits without scrolling.
2. 1, 2, 3 and 4 picks: the cards spread and tilt evenly, a photo / glyph / name card each render, and tap-to-take-out still works on the shelf.
3. The single-pick copy reads "Great pick, … / Your pick is on our list!".
4. "Give it back to Paige" → Browse with "Easton added 3 · See" → See opens the list with the 3 rows highlighted. A member with no first name sees "Give it back".
5. "Close" and "Done" still need the hold; there's no top-right control on Great picks.
6. Reduced motion: no roll-in, rock, swing, hop or sunrise.
7. Flag off: none of this reachable (re-run `ask-off.js`).
8. Dan walks it on his phone, handing it to Easton or Everett if they're around.

Update the AskRun tests for the new copy, labels, the hand-back and the toast. Jest, a `CI=true` build and lint must all pass.
