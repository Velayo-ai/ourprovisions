# SPEC — Ask · Amendment 2026-11-03

**Amends:** `docs/specs/active/SPEC_ask.md` (designed 2026-10-24). Read the base spec first. Where this amendment and the base spec disagree, **this amendment wins**.
**Status:** Design final. Ready to build once Step 0 has run and been reported. Nothing is built or applied yet.
**Ruled:** 2026-11-03, design chat (Dan). This amendment reads the 10-24 spec against what has shipped since then (Phase A sharing 072–076, S48, the Galley, the 070 photo sweep).
**References of record:**
- **The look:** `docs/mockups/reference/ask_reference_2026-11-03.png`. Dan's three-screen reference: "Your turn" → the shelf → "Great picks". It governs layout, type, the wagon and the photo tiles.
- **The behaviour:** `docs/mockups/mockup_ask_cart.html`. A runnable mock of the cart: undo, That's it!, the full-cart shake, hold-to-Done, and Simple equal to Standard. It governs interaction. Its drawn cart and line-art finale are superseded by the reference's wagon.

Where the two references disagree, the image governs the look and this spec governs the behaviour. Five such points are ruled below (A16, A17, A13).

---

## Rulings (2026-11-03)

| # | Ruling | Why |
|---|---|---|
| A13 | **No second-class experience.** Every screen style gets the same three screens, the same wagon, the same motion and the same celebration. The Simple dial may change only tile size, tile count, labels on/off, and words vs. icons on buttons. Nothing else. | Dan: "Everett's cart needs to be the same — no second class cart experiences." |
| A14 | **Three screens.** (1) **"Your turn, {Label}!"** with "Pick {n} {noun} for our list." (or "Pick one…" when n = 1), the wagon on a sunrise-over-water scene, and **Let's pick**. This is the handover moment: the parent hands the phone over on this screen. (2) **The shelf:** "Pick {n}, {Label}!", the photo tiles, and under them the small wagon + dots counter. (3) **"Great picks, {Label}!"**: the wagon holding his picks, then **"I've added these to our list."** with his picks only (photo + name), then **Back to the list**. | It answers a question the 10-24 spec never did: when does the phone change hands? The first-person, "our list" copy is the A-series idea: he belongs to the household without being a user. |
| A15 | **The wagon is the cart.** A cream beach wagon with a teal stripe, wooden wheels and a wooden handle, per the reference. It appears on all three screens. No supermarket cart. | The dock, not the store. |
| A16 | **Picks live in the wagon on the phone until he confirms.** Once the dots are full, **That's it!** appears (✓ on Simple). The picks land on the list only when it's tapped, in one write. Until then he can change his mind three ways: tap the tile again, tap the item in the wagon, or tap **↶** (takes out the last pick). If the wagon is full, a new tile shakes the wagon and nothing changes. After confirm, changing a pick is a grown-up job, done on the list like any item. **Supersedes** the base spec's "land when the target is reached" and its celebration on the third pick: the celebration plays on confirm. | Dan: "what if he wants to change his mind." Undo walked in the mock and Dan liked it. |
| A17 | **Done stays press-and-hold (~1 s)** even though the reference draws it as a plain button. Done before confirm discards everything. **No back chevron on the shelf screen.** The reference has one. If a way back is ever added, it may only return to "Your turn", never out of the ask. | A small hand must not be able to leave. |
| A18 | **A pick of an item already on the list adds one.** Quantity +1 and the label is appended. A tombstoned or absent item lands at quantity 1. | Dan's ruling: a pick is always one more. |
| A19 | **`list_items.picked_by_labels text[]`** (replaces the base spec's single `picked_by_label`). The same label is never appended twice. The row reads "Picked by Easton & Everett", with initials E, E in the tray. Each element is 1–16 characters; at most 8 elements. Still free text, never a foreign key. | Dan's ruling: both names. |
| A20 | **Provenance dies with the row.** `remove_list_item` and `list_items_resurrect_cleanup` set `picked_by_labels = null`, the same way the resurrect trigger already deletes meal links (026). **Amends A11:** there is no pick history. A label lives only as long as the need it describes. | `list_items` is one upsert-revived row per (household, item). Without this, Goldfish re-added by Dan next month would still say "Picked by Easton." |
| A21 | **Picks write no `list_item_events` row**, even from the Shop door during a live trip. **Amends A7:** a "no actor" event is impossible, because `user_id` is NOT NULL and the CHECK allows only `added_in_store / checked / unchecked`. | Smart ordering stays honest: Easton's picks never pose as an aisle add by Paige. |
| A22 | **Landing is one server RPC, `land_ask_picks`.** The client sends `p_household_id`, `p_ask_id` and `p_catalog_item_ids uuid[]`, **never the label**. The server reads the label from `asks`. `added_by` = the member running the ask (accountability stays with an account). **No `list_item_contributors` row**: the row's badge is the ask's initial. A later manual bump by a member adds that member's badge the normal way. | One write and one transaction. The label never travels in a request. |
| A23 | **Shelf photos belong to the household's item, not the tile.** `household_item_photos` holds one live photo per (household, catalog item), reused by every ask that shelves that item. They're stored in a **new private bucket, `item-photos`**, with 065's member-folder policy copied (`{household_id}/…`, `is_member_of`, webp, 1 MB). **Resolves open question 3. `meal-photos` is ruled out:** `meal_photo_sweep_orphans` (070) deletes any `meal-photos` object older than 7 days with no `meal_photos` row, so every shelf photo would vanish within a week. The gift-photos shape doesn't fit either, because these photos never leave the household (A9). | Photograph the Goldfish once. |
| A24 | **Telemetry.** Exactly one span, `ask_completed`, with one attribute: the pick count. No ask id (an id is a stable handle on one person), no label, no screen style (Simple says something about who is picking). Picks do **not** emit `item_added_to_list`. All three Ask screens are `.op-replay-block`. No Ask state reaches the URL, `document.title`, or any attribute Splunk reads. | A8, made concrete. |
| A25 | **An optional noun per ask: `asks.shelf_noun`**, 1–16 characters, null by default. "Pick 3 snacks for our list." with it; "Pick 3 for our list." without it. **Amends A3:** the stored fields are label, initial (derived), screen style, pick target, shelf noun, shelf. | Nothing in the data model knows "snack" (A5). The noun describes the shelf, never the person. |
| A26 | **The held wagon survives backgrounding.** Unconfirmed picks are kept in memory and mirrored to one `sessionStorage` key holding `{ask_id, catalog_item_ids[]}` only, never the label. The key is cleared on confirm, on Done, and on a household switch. On return, the ask resumes on the screen it left, with the same picks. | The base spec's resume guard, restated for A16. |

### Open questions from the base spec

| Question | Resolution |
|---|---|
| The celebration on the third pick | **Resolved, A14 / A15 / A16:** the celebration is "Great picks, {Label}!" with the wagon holding his picks, played on confirm. The motion follows `mockup_ask_cart.html`: picks fly into the wagon and it hops; on confirm, it rolls in. Off under reduced motion. |
| Where shelf photos live | **Resolved, A23:** `item-photos`. |
| Whether the Asks chip row crowds the Add sheet at 3–4 asks | **Still open.** Walk it on a phone in Slice 2 and rule it then. |

---

## Data model (build-ready)

Migration number is assigned at Step 0; **077** is expected.

```
asks
  id              uuid pk default gen_random_uuid()
  household_id    uuid not null → households(id)
  label           text not null  check (char_length(btrim(label)) between 1 and 16)
  shelf_noun      text null      check (shelf_noun is null or char_length(btrim(shelf_noun)) between 1 and 16)
  screen_style    text not null  check (screen_style in ('standard','simple'))
  pick_target     smallint not null check (pick_target between 1 and 6)
  created_by      uuid not null → users(id)
  created_at      timestamptz not null default now()
  updated_at      timestamptz not null default now()
  deleted_at      timestamptz null
  RLS: select / insert / update for is_member_of(household_id). No delete policy; deletion is soft.

ask_shelf_items
  ask_id          uuid not null → asks(id) on delete cascade
  catalog_item_id uuid not null → catalog_items(id) on delete cascade   -- a shelf releases, never blocks
  position        smallint not null
  primary key (ask_id, catalog_item_id)
  RLS: through the ask's household.

household_item_photos
  id              uuid pk
  household_id    uuid not null → households(id)
  catalog_item_id uuid not null → catalog_items(id) on delete cascade
  thumb_path      text not null, view_path text not null      -- in item-photos, under {household_id}/
  created_by      uuid not null → users(id)
  created_at      timestamptz not null default now()
  deleted_at      timestamptz null
  unique (household_id, catalog_item_id) where deleted_at is null
  RLS: is_member_of(household_id).

list_items.picked_by_labels  text[] null
  check (picked_by_labels is null
         or (cardinality(picked_by_labels) between 1 and 8
             and every element 1–16 chars))        -- written as a helper fn or array_position-free form at build

storage bucket item-photos: private, 1048576 bytes, image/webp; read + write policies = 065's shape.
```

**`land_ask_picks(p_household_id uuid, p_ask_id uuid, p_catalog_item_ids uuid[]) returns int`**
SECURITY DEFINER, `search_path = ''`, EXECUTE to `authenticated` only. Membership first. The ask must be live and in that household. `cardinality(p_catalog_item_ids)` must equal `pick_target`, with no duplicates, and every id on that ask's shelf. Then, per item, in one transaction:

| Row state for (household, item) | Result |
|---|---|
| None | Insert with quantity 1, status pending, `added_by` = caller, the current open cycle (as `insert_list_item`), `picked_by_labels = {label}` |
| Tombstoned (`deleted_at` set) | Revive with quantity 1 (the resurrect trigger runs and clears old labels / links), then `picked_by_labels = {label}` |
| Live, pending | Quantity +1; append the label if absent. **The 049 ledger: see Step 0 #1.** |
| Live, bought | Same as a member's manual add today (Step 0 #1 confirms the path) |

No `list_item_contributors` row. No `list_item_events` row. Returns the count landed.

**Edits:** `remove_list_item` → also `picked_by_labels = null`. `list_items_resurrect_cleanup` → also `NEW.picked_by_labels := null`.

**A review of the migration checks by name:** no column called age, birthdate, birthday, relationship, reason, condition, language or device anywhere in it.

---

## Step 0 — for Claude Code, on dev. Report and stop.

1. **The 049 ledger under a +1.** How does a member's manual quantity bump on a live row with `list_item_meals` links stay true to `quantity = Σ quantity_contributed` today? Read `updateQty` and any trigger. `land_ask_picks`'s live branch must do exactly what a manual +1 does. Report the path; don't invent one.
2. **Diff the live bodies** of `remove_list_item` and `list_items_resurrect_cleanup` on dev against their latest files before amending them (the 051 lesson). Report any drift.
3. **The badge renderers:** does anything assume a live row has ≥1 `list_item_contributors` row (tray initials, the contributor badge, wrap-up summaries)? Pick rows will have none.
4. **The AI boundary:** confirm `meal-suggestion` and `recipe-import` build no payload from `list_items`. Grep for `picked_by`; it should appear in no Edge Function.
5. **RUM:** confirm the allow-list and span scrub leave no Ask state in the URL, the title or attributes. Name where `ask_completed` would be emitted.
6. **The next migration number** on both ledgers (077 expected). Confirm the name `item-photos` is free on dev and prod.
7. **The sweep:** confirm `meal_photo_sweep_orphans` is hard-scoped to `bucket_id = 'meal-photos'` on both databases. It's the reason for A23.

---

## Slices

| # | Slice | Done when |
|---|---|---|
| 1 | **077 on dev:** the four objects above, the bucket and its policies, `land_ask_picks`, and the two label-clearing edits. | The closing VERIFY passes. In a rolled-back transaction, `land_ask_picks` is proven for all four row states, a second ask appending a second label, a duplicate id rejected, an off-shelf id rejected, and a non-member rejected. `remove_list_item` and a revive both clear labels. The by-name column review is clean. |
| 2 | **Create and run, Standard:** *Ask someone…* (name, noun, style, target, shelf with photos), the Add-sheet chip row, all three screens per A14–A17 with the wagon, landing, and "Picked by" + initials on list rows. | Walked on dev: Verification 1, 2, 6, 7 below. The chip row is ruled on a phone at 3–4 asks. |
| 3 | **Simple and the guards:** Simple per A13, hold-to-Done, A26 resume, reduced motion. | Walked on dev: Verification 3, 4, 5, 12. |
| 4 | **Settings → Asks** (edit and delete) and the **`item-photos` sweep pass** (its own migration, like S37). | Walked on dev: Verification 9, 10. The sweep runs dry and green on its schedule. |

Then promote the slices to prod together, with the HAR (Verification 8).

---

## Verification (replaces the base spec's list)

1. Create Ask Easton (6 tiles, Standard, pick 3, noun "snacks") and Ask Everett (4 tiles, Simple, pick 1, no noun). Both chips show; a household with no asks shows no row. "Your turn" reads "Pick 3 snacks for our list." / "Pick one for our list."
2. Run Ask Easton: 3 picks, change one (by tile, by wagon, by ↶), then That's it! → one write. The rows say "Picked by Easton" with initial E. "I've added these to our list." lists only his three.
3. Run Ask Everett on Simple: the same three screens and the same wagon, with ✓ in place of words and bigger tiles. One pick, then ✓, then one item lands.
4. Hold Done mid-ask → nothing lands. A short tap does nothing. There's no back chevron.
5. Background mid-ask with 2 picks held → resume shows the same screen and the same 2 picks. The `sessionStorage` value holds ids only.
6. The ask screens show no price, budget, other list items or other names.
7. Already-live Goldfish (qty 2) picked by Easton → qty 3 + label. Picked by Everett the same week → qty 4, "Picked by Easton & Everett." Remove it, re-add it as Dan → no label.
8. HAR, foreground: zero occurrences of the label text in spans and replay. All three screens excluded in replay. Exactly one `ask_completed` per confirm, carrying the count only.
9. A member who didn't create the ask can run, edit and delete it.
10. Delete an ask → live rows keep their labels until removed or revived (A20). The ask's photos stay as the household's item photos.
11. Read back: no `list_item_events` and no `list_item_contributors` rows for landed picks. `added_by` = the runner.
12. With reduced motion on: no flight, hop or roll; every state just appears.
13. The migration has no column named age, birthdate, birthday, relationship, reason, condition, language or device.
