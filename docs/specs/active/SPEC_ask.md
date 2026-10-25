# SPEC — Ask: let someone's voice onto the list without an account

**Status:** Designed 2026-10-24 (design chat). Not built. Not scheduled before meal sharing Phase A ships.
**Scope:** OurProvisions. One migration (number assigned at build), a creation flow, a handover screen, one attribution line on list rows.
**Origin:** Dan's wish that Easton could pick his own snacks for preschool, generalized the same day so it serves anyone a household trusts: a child, an elderly parent, someone with a disability, someone whose language the app doesn't speak.

---

## The idea

A household member hands their phone to someone and asks them to choose. The chooser sees a shelf of items with family-taken photos, picks a set number, and the items land on the household's real list marked **"Picked by Easton."** The household owns the list; the ask influences it.

> **An asked person is a label, not an account.** The family sees "Picked by Easton." The database stores a name the family typed, nothing else. The AI never sees them as a person, and telemetry never sees them at all.

This is the inclusive core of the product made concrete: someone belongs to the household and is seen by it, without ever being asked to be a user.

---

## Decisions

| # | Decision | Rationale |
|---|---|---|
| A1 | **The feature is called "Ask."** Menu: *Ask someone…*. Each saved one is named for its person: *Ask Easton*, *Ask Dad*, *Ask Boys*. The collection, in household settings, is *Asks*. | "Ask" is both the verb and the artifact, and reads right for every case. "Ask me" and "Ask them" don't. |
| A2 | **The name is free text, up to 16 characters.** "Ask" is prefixed by the app. It appears on the chip, the handover screen ("Pick 3, Boys!") and the list row ("Picked by Boys", initial **B**). | Groups work with no special design. We store exactly what the family typed and never ask who "Boys" is. |
| A3 | **No account, no age, no reason.** An ask stores: name, initial (derived), screen style, pick target, shelf. It never stores a birthday, an age, a relationship, a condition, a language, or a device. | The creator's reason for making an ask is none of the app's business, so the design never needs to know it. More privacy by default, always. |
| A4 | **Specificity is a dial the creator sets.** Three settings: shelf size (how many tiles), pick target ("pick 3", fixed on the ask), and screen style, **Standard** or **Simple**. | Simple serves a two-year-old, an eighty-year-old and someone who can't read the labels equally well, and we never record which. |
| A5 | **The shelf is any catalog items, not just snacks.** Each tile carries a family-taken photo (stored like meal photos, household-scoped). Nothing in the data model says "snack." | Ask Easton is ten snacks; Ask Dad might be his breakfast things. |
| A6 | **Picks land on the real list as ordinary items, attributed in text.** `list_items.picked_by_label` holds the name. No user id, no foreign key. The tray shows the initial. | Same pattern as `cook_with` free text: visible to the family, meaningless to everything else. Items can be removed or swapped by any member like any other item. |
| A7 | **An ask is never an input to learning, suggestions or any model.** Pick events are written to `list_item_events` with **no actor** (or not at all; the build decides which keeps the smart-ordering query honest). `picked_by_label` is never a feature anywhere. | The label exists for the family, not for the AI. |
| A8 | **The handover screen is excluded from replay, and the label never appears in a span.** Same treatment as photo surfaces (`.op-replay-block`), plus the label is never placed in a URL, title or attribute Splunk reads. | Telemetry sees nothing about the asked person. |
| A9 | **Household-only.** Asks and "Picked by" never travel to crew or into a gift. | More privacy by default. Wait until someone asks. |
| A10 | **Any member can run any ask; the ask belongs to the household.** Andrew creates Ask Easton; Paige hands the phone over. Any member can edit or delete an ask. | The household is the unit of trust, as everywhere else. |
| A11 | **Graduation is just an invite.** When an asked person gets their own account (a teenager with a first phone), a member invites them the normal way. Their past picks stay as text history, with no link to the new account. | The absence of a link is the point: nothing was ever collected about them. |
| A12 | **The entry point is the Shop tab's Add sheet.** A horizontally scrolling row of ask chips sits above the search box, shown only when the household has at least one ask. | An ask is a way of adding items, so it lives where adding happens, at the moment it's useful. Homes without an ask never see the row. |

---

## The walk

**Running an ask (Paige, building the list):**
1. Shop → Add. The Asks row shows *Ask Easton · Ask Everett · Ask someone…*.
2. Tap **Ask Easton**. The app enters the handover screen: no nav bar, no search, nothing grown-up. Just the shelf, the target, and the counter. Paige hands the phone over.
3. Easton taps a tile. The tile marks, the counter steps (1 → 2 → 3) with a small celebration. On the third, a bigger one and **"All done, Easton!"**
4. Paige takes the phone back and taps **Back to the list**. The three items are on the list, "Picked by Easton," his initial on each.

**Simple screen (Everett):** four big tiles, one pick at a time, no counter to read. Tapping a tile picks it and the next one shows. Labels hidden by default on Simple; the photos do the talking.

**Guards:**
- While an ask is open, the only way out is a small **Done** control that needs a **press-and-hold** of about a second. A toddler mashing the screen can't leave; a parent can. Done before the target is reached discards the picks (nothing lands).
- If the phone locks or the app backgrounds mid-ask, the ask resumes where it was. Picks are held client-side and land on the list **only when the target is reached**, in one write.
- The handover screen never shows prices, budget, other list contents or any other person's name.

**Creating an ask (first time):** *Ask someone…* → name (16 chars) → screen style → build the shelf (pick catalog items; take or choose a photo for each; the guidance at photo time is "photograph the item, not a person") → pick target → save. The chip appears in the row.

**Editing:** household settings → Asks → tap one. Rename, change style or target, add or remove tiles, delete the ask. Deleting an ask leaves past "Picked by" text on the list untouched.

---

## Data model (draft; shaped at build)

- `asks` (`id`, `household_id`, `label text` ≤16, `screen_style` `standard|simple`, `pick_target smallint`, `created_by`, `created_at`, `deleted_at`). RLS: members of the household.
- `ask_shelf_items` (`ask_id`, `catalog_item_id`, `photo_path`, `thumb_path`, `position`). RLS via the ask's household.
- `list_items.picked_by_label text null`. Free text, never a FK.
- Shelf photos live in a household-scoped folder in the existing `meal-photos` bucket or a sibling bucket, under the same member-only policy pattern as 065. The build decides which.
- No `age`, `birthdate`, `relationship`, `reason`, or `language` column exists anywhere. A review of the migration checks for this by name.

---

## Verification (dev, then prod)

1. Create Ask Easton (10 tiles, Standard, pick 3) and Ask Everett (4 tiles, Simple, pick 1). Both chips show on the Add sheet; a household with no asks shows no row.
2. Run Ask Easton: three picks land in one write, "Picked by Easton," initial E in the tray. Removing one works like any item.
3. Run Ask Everett on Simple: one tap, one item, no counter visible.
4. Press-and-hold Done mid-ask discards; a short tap does nothing.
5. Background the app mid-ask; resume shows the same state.
6. The handover screen shows no price, budget, other items or other names.
7. Read back: `list_item_events` rows for the picks carry no actor (or none exist, per the build's A7 choice).
8. HAR: zero occurrences of the label text in spans and replay; the handover screen's nodes are excluded in replay.
9. A member who did not create the ask can run, edit and delete it.
10. Delete an ask; past "Picked by" text on the list is unchanged.
11. The migration contains no column named age, birthdate, relationship, reason or language.

---

## Out of scope for v1

- Asks visible to crew, or carried in a gift (A9).
- Voice or spoken labels for non-readers.
- Any suggestion of what to put on a shelf.
- Per-ask pick history or "favorites" (that would be learning about the person; see A7).

---

## Open questions (decide at build or on first use)

- The celebration design on the third pick: a small moment, in the brand's voice, not a game.
- Whether the Asks chip row crowds the Add sheet at three or four asks. Walk it on a phone.
- Where shelf photos live (bucket choice), decided alongside the meal-sharing gift-photo bucket so the two policies share a shape.
