# SPEC — List counts: one word per number

**Status:** Design-final, 2026-10-07. Not built.
**Scope:** OurProvisions, client only. No migration, no RPC, no schema.
**Origin:** Phone walk on dev, 2026-10-06, household "No Meals" (Dan Test User). Three surfaces gave three answers to "what's on the list", and Claude Code's count trace (every list count in `App.js`, read-only) explained why.
**Ships with:** the next prod promotion (the Galley + Text size pass 2 batch). The Home defect below is live on prod today (`2e2915e`), so it should leave with that batch.

---

## The problem

One state: a trip open, Apples on the list and checked, nothing else.

| Surface | Said | Number it used |
|---|---|---|
| Shop | "1 of 1 in cart", All done | `checkedCount` of `totalItems`. **Correct.** |
| Home list line | "Nothing on your list · Start a list →" | `open` = 0, treated as "the list is empty". **False.** |
| Browse | Apples with a qty-1 stepper | row presence. True but incomplete (out of scope, see below) |

Then, after adding Ground Beef Tacos (13 ingredients):

| Surface | Said | Number it used |
|---|---|---|
| Add-a-meal toast | "Ground Beef Tacos added. **14** items on the list." | `listRows.length`: every row the RPC returned, including the bought Apples and any quantity-zero rows |
| Helm Shop badge | **13** | `open` |

Every surface agrees with itself; they disagree with each other because "on the list" has no single definition. **Never show a number the data doesn't support** applies to counts as much as to state.

---

## Decisions

### D1 — Three numbers, three words

The client holds exactly three user-facing list numbers (all from `shoppingList`, which drops quantity-zero rows):

| Number | Definition | The only words for it |
|---|---|---|
| `totalItems` | rows with quantity > 0, bought or not, until wrap-up | **on your list** |
| `open` (= `totalItems − checkedCount`) | not yet bought | **to get** (no trip open) · **left to find** (trip open, as today) |
| `checkedCount` | bought, not yet wrapped up | **in the cart** |

"Items" stays as a noun where the copy already uses it ("N items · M minutes"); D1 governs which **number** a phrase uses, not every noun.

### D2 — `listRows.length` is never shown to a person

It includes quantity-zero and bought rows. It is a data-layer count. The add-a-meal toast is its only user-facing use today (App.js:4151, 4527, 4559); D4 removes it.

### D3 — Home's list line: one more state

Truth table, first matching row wins. Rows 1–3 are unchanged; row 4 is new and replaces the false "Nothing on your list".

| # | Condition | Line | Link → |
|---|---|---|---|
| 1 | `totalItems` = 0 | Nothing on your list · **Start a list →** | Browse (unchanged) |
| 2 | `open` > 0, this user's trip open | N left to find · **Let's shop →** | Shop (unchanged) |
| 3 | `open` > 0, no trip of this user's open | N things to get · {first item} · **Let's shop →** | Shop (unchanged) |
| 4 | `open` = 0, `checkedCount` > 0 | N in the cart · **Finish the trip →** | Shop |

- Row 4 is the same for every case it covers (this user's trip, another member's trip, bought rows with no open session). Any member can wrap up the household's cycle, so the copy holds in all three.
- **Home never wraps up.** One Wrap Up per state (2026-10-05): at 100% it is the All done card's teal button on Shop. Row 4's link only opens Shop. It is not teal and not a button.
- Plural forms as today ("1 thing to get", "1 left to find"); row 4 reads "1 in the cart" / "3 in the cart" (no noun needed).
- **Builder check, then stop if it fails:** confirm that Shop at `open` = 0 with `checkedCount` > 0 and **no open session** still shows the All done card and its Wrap up button. If it doesn't, row 4's link would land somewhere with no way to finish. Report it, don't patch it.

### D4 — The add-a-meal toast says what you now need to get

- Single meal: **"{Meal} added · N to get"**
- Batch: **"N meals added · M to get"**
- N / M = `open` **after** the add is reflected in client state.
- If `open` is 0 after the add (everything was already on the list): **"{Meal} added to your list."**, with no count.
- **If the correct number cannot be known at the moment the toast fires** (the client list hasn't caught up with the RPC), drop the count and use **"{Meal} added to your list."** A missing number beats a wrong one. The builder reports which path the code takes.
- The toast stays the classless `div` it is today, masked on prod. Meal names never go near the allow-list.

### D5 — What this spec does not change

- **Browse marking items as in the cart.** That's the NEXT item from 2026-09-12. It uses D1's word ("in the cart"), but it's a Browse-pass design, not this spec.
- Shop header, badge, Wrap Up bar, In-cart tray, All done card, Wrap-up sheet, Trip summary, Plan board lines, Budget sheet. All already use a D1 number correctly.
- The Plan banner copy, and "N to buy" on board cards (it means `open` for that meal's rows; consistent with D1).
- **A partner's trip on Home (open question, not decided).** Home reads only this user's session (`activeSession`); a partner's open session lands in `partnerSession`, which Home never reads (useProvisions.js:1491-1503). So while Helen shops, Dan's Home says "N things to get", the no-trip wording. Row 4 already covers the partner's trip at 100%. Whether rows 2/3 should name a partner's trip in progress ("Helen is shopping · N left to find") is a separate design call; this spec keeps rows 2/3 exactly as built.

## Trace of record (Claude Code, read-only, 2026-10-07)

`HomeListLine` (App.js:1042) renders from three facts (App.js:7904-7906): `openCount`, `firstItem`, and `shopping` (this user's session only). Its three branches today: `openCount` 0 → "Nothing on your list"; ≥ 1 with `shopping` → "N left to find"; ≥ 1 without → "N things to get · {first item}". Cases checked: (a) empty, (b) pending no trip, (c) my trip some left: correct. **(d) my trip all checked: "Nothing on your list" — the defect.** (e) partner's trip: no-trip wording, and "Nothing" at 100%. (f) bought rows, no session: "Nothing" when all bought. **Prod `2e2915e` has identical logic** (hook diff empty; the only component difference is `d0eecd1`'s dot-in-link fix).

---

## RUM / privacy

- `.home-line-link` is on `CHROME_ALLOW_LIST` and carries fixed copy only. "Finish the trip →" is fixed copy, so it qualifies. The count and first item stay in `.home-line-text`, which is not allow-listed, beside the link and never inside it.
- **`CHROME_ALLOW_LIST` stays exactly 29**, proven by name in the deployed dev bundle.

## Text size

Row 4 uses the existing list-line rule (body 15, k 1) and the existing wrap rule: the "·" travels with the link (`d0eecd1`). No new sizes.

---

## Verification (dev, signed in)

Harness first: Home row 4 at 320 / 375 / 390, Default and XXL, the link and its "·" together on wrap.

Then on the phone:

1. **Row 1:** a place with nothing on the list → "Nothing on your list · Start a list →".
2. **Row 3:** add two items from Browse, no trip → "2 things to get · {first} · Let's shop →".
3. **Row 2:** start a trip, check one → Home reads "1 left to find · …".
4. **Row 4, the defect:** check the last one → Home reads **"2 in the cart · Finish the trip →"**, never "Nothing on your list". Tap the link → Shop, All done card with its teal Wrap up.
5. **Row 4, another member:** second account in the same place, Home reads the same line while the first account's trip is at 100%.
6. **Row 4, no session:** if reachable on dev, bought rows with no open session → same line, and Shop still offers Wrap up (D3 builder check).
7. **Wrap up** from Shop → Home returns to row 1 (or row 3 if items carried forward).
8. **Toast, the defect:** with one bought item still on the list, add a 13-ingredient meal → toast reads **"… added · 13 to get"**, and the Shop badge reads 13. The numbers match.
9. **Toast, nothing new:** add a meal whose ingredients are all already on the list → "{Meal} added to your list.", no count.
10. **Toast, batch:** add two meals at once from the board → "2 meals added · M to get", M = the badge.
11. **XXL:** steps 4 and 8 at XXL; nothing clipped, the link not orphaned.

**Done when:** steps 1–11 pass on dev, the bundle shows the new strings present and "items on the list" gone, `CHROME_ALLOW_LIST` reads 29 by name, ESLint `--max-warnings=0` and `CI=true` are clean, and this spec ships to prod inside the batch promotion. Then it moves to `built/`.

---

## Why not the alternatives

- **"Nothing left to find" on Home at 100%.** It's true, but it drops the one thing the person needs to do next (finish the trip), and it reads like an empty state at a glance.
- **A Wrap up button on Home.** Two Wrap Ups at 100% breaks the one-Wrap-Up rule, and wrapping up blind (without seeing the cart) loses the carry-forward choice.
- **Make the toast use `totalItems`.** It would still disagree with the badge mid-trip (bought rows count). The toast's job is "what changed for my shop", which is `open`.
