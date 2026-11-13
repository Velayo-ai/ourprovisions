# SPEC — Ask Slice 2: create and run, Standard, in Browse

**Date:** 2026-11-06 · **Scope:** OurProvisions · **Status:** Ruled, build-ready on dev
**Builds on:** `SPEC_ask.md` + `SPEC_ask_amendment_2026-11-03.md` (amendment wins), the 11-04 ruling (Ask lives in Browse, amends A12), and Claude Code's Slice 2 Step 0 report (2026-11-06). Where an earlier spec says "chips" or "the Add-sheet chip row", read it as **the Browse pill rail**.

---

## Why this spec exists

Step 0 showed Slice 2 can't be done as client work alone:

1. **Creating an ask isn't atomic.** It takes three separate writes (`asks`, then `ask_shelf_items`, then photos). If the second write fails, a live ask is left with an empty shelf: its pill shows, but no pick can ever land. A retry then makes a second "Ask Easton".
2. **On dev, the label leaks.** Replay and click text unmask `body` on dev, so "Ask Easton" on the pill, the header, the summary line and the Picked-by line reaches dev replay and dev click-text spans. Prod stays masked only for as long as no new class joins the allow-list.
3. **The Browse code assumes every pill is a category.** If an ask id goes into `selectedCategories`, it gets dropped as stale, counted as an active filter, priced at $3.00, and "＋ New item" creates an item in a category named by a UUID.
4. **Shop never renders "Picked by".** `provenanceLines` only reads contributor rows, and pick rows have none.

---

## Rulings (Dan, 2026-11-06)

| # | Ruling |
|---|---|
| K1 | **Migration 078 adds `create_ask`, and it ships on dev before any Slice 2 client code.** The ask and its shelf are created in one transaction. The client supplies the ask id, so a retry returns the same ask instead of making a second one. |
| K2 | **No two live asks in a household can share a label** (case-insensitive). The database enforces it, so it holds for creates now and for edits in Slice 4. The UI says: "You already have Ask {Label}." |
| K3 | **`.op-name` is the privacy class for anywhere a person's name shows,** on dev and prod, in replay and in click-text spans. It is never allow-listed. |
| K4 | **Staples never narrows an ask's shelf.** A shelf is already hand-picked, so it shows whole. |
| K5 | **Asks get their own selection set, not `selectedCategories`** (Claude Code's recommendation, accepted). The category code stays as it is. |
| K6 | **"Picked by" in Shop joins Slice 2.** It was never in Slice 1. |

Design calls I made inside the rulings (they follow from K1 and K5; overrule here if wrong):
- **D-a:** 078 revokes direct `INSERT` on `asks` from `authenticated`, which makes `create_ask` the only way an ask gets created and keeps the target check from being skipped. Shelf `INSERT`/`DELETE` grants stay for Slice 4's shelf editing.
- **D-b:** An ask section is its own block, keyed by ask id, in both grouped and flat views. It never joins the flat A–Z list, so no item appears twice in that list. With only an ask selected, only its block shows.
- **D-c:** Each tile on an ask shelf is priced from its real aisle's average, never from the ask id.
- **D-d:** An ask section header has no "＋ New item". That spot holds "Hand it to {Label} →".
- **D-e:** "Showing only …" names a selected ask by its label, inside `.op-name`. The filter count includes asks, since they now really filter.

---

## 078 — `create_ask`

**Objects**
1. A unique partial index: `asks_household_label_live_uq` on `(household_id, lower(label)) where deleted_at is null`.
2. `public.create_ask(p_id uuid, p_household_id uuid, p_label text, p_shelf_noun text, p_screen_style text, p_pick_target smallint, p_catalog_item_ids uuid[]) returns uuid`. Same posture as `land_ask_picks`: `security definer`, `search_path ''`, execute granted to `authenticated` only, and revoked from `public`, `anon` and `service_role`.
3. `revoke insert on public.asks from authenticated` (D-a).

**Order of checks inside `create_ask`**
1. Membership first: `is_member_of(p_household_id)`, else `42501`. A null `get_current_user_id()` also returns `42501`.
2. **Retry check:** if `p_id` already exists, and it is in this household with the same label, return `p_id` and do nothing else. If it exists anywhere else, raise. This runs **before** the label check, so a retry never hits K2.
3. The label is trimmed and must be 1–16 characters (the 077 check). A duplicate live label returns a unique violation the client can recognise as `23505`.
4. `p_catalog_item_ids`: not empty, at most 48 entries, no duplicates. Each item must be live and either global or this household's own (the same rule as 077's shelf insert policy).
5. **`p_pick_target` must be no greater than the number of tiles,** else `22023`, so an ask can never be saved that can't be completed. The 1–6 range stays as 077 has it.
6. Insert the `asks` row (`created_by` = caller), then the shelf rows with `position` taken from the array's order, then return `p_id`.

Photos stay separate: they're optional, and if a photo upload fails the only result is a missing photo.

**Pre-check:** dev has 0 asks (Step 0), so the index builds cleanly. Prod has no Ask objects. 078 goes to prod with 077 when Ask is promoted, never before it.

**VERIFY (closing, inside the file)**
- The index, the function, its grants (read with `aclexplode`) and the `INSERT` revoke all read back exactly.
- In a rolled-back transaction:
  - A normal create returns the id, and the shelf has N rows in order.
  - The same call again returns the same id, still with 1 ask and N shelf rows.
  - The same label with a new id gives `23505`.
  - "easton" vs "Easton" gives `23505`.
  - Target 3 with 2 tiles gives `22023`.
  - Another household's custom item is rejected.
  - A non-member gets `42501`.
  - A direct `insert into asks` as `authenticated` is refused.
  - `land_ask_picks` on a created ask lands.
- Parse-check rule: it's the same file with `rollback;` swapped for `commit;`. The Postgres log says which copy ran.

---

## Client — four commits on dev, in this order

**C1 — `.op-name` (privacy, lands first on the client side)**
- Wire it in `rum.js` for both environments: replay **blocks** the element (it shows as a placeholder, with no text and no size-based reconstruction of the name), and click-text spans **drop** its text, the way the Clerk exclude does today.
- The Jest test is that `.op-name` is in neither allow-list and is in both exclude lists. The allow-list count stays at **83**.
- **Rule:** any element whose text contains an ask label carries `.op-name`. That means the pill label, the section header label, the "Showing only …" label, the Picked-by line, the tray initials, and the three run screens (which are already excluded whole, so `.op-name` on them is extra protection).

**C2 — Ask data and creation**
- `useProvisions`: `fetchAsks` reads by household only, never filtered by label, because the scrub keeps Supabase `/rest/v1/` queries in span URLs. `createAsk` generates the id on the client and calls the RPC. On `23505` it shows "You already have Ask {Label}."; on `22023` it shows the target-vs-tiles message.
- The new names go on dev's existing dev-only return-list line: `landAskPicks, fetchAsks, createAsk, …`.
- The **+ New shelf** flow: name, noun, Standard style, target, and shelf tiles. Photos are optional and upload after the create.

**C3 — Browse**
- A `selectedAsks` set holds the selected asks (K5). It clears on a tab or household switch, the same as `selectedCategories` (App.js:6803).
- Pills: after Staples come the ask pills, then **+ New shelf**.
- Sections: one block per selected ask (D-b), with a header reading "Hand it to {Label} →", no "＋ New item" (D-d), tiles priced by their real aisle (D-c), and Staples skipping it (K4).
- "Showing only …" and the filter count follow D-e.

**C4 — Shop "Picked by" + tray initials**
- `provenanceLines` reads `list_items.picked_by_labels` through `joinPickLabels` (`src/lib/askPicks.js`), and the line carries `.op-name`.
- Tray initials per A19, also in `.op-name`. The badge rule for two "E"s is still open: if it comes up during the walk, report it and don't invent a rule.

---

## Done when (walked on dev)

- A household makes **Ask Easton** from + New shelf with target 3, sees it as a Browse pill and section, taps "Hand it to Easton →", picks 3, taps **That's it!**, and Shop shows **"Picked by Easton"**.
- Trying to make a second "Ask easton" is refused with the message.
- Amendment Verification 1, 2, 6 and 7 pass (with "chips" read as pills).
- **Name check:** on a dev HAR covering the whole walk, decoded review-first, "Easton" appears 0 times in spans and in replay.
- The pill rail is ruled on a phone at 3–4 asks.
- Prod is untouched: no 078 on prod and no Ask markers in the prod bundle.

## Not in this slice

- Simple style, hold-to-Done, A26 resume and reduced motion (Slice 3).
- Editing and deleting asks, and the `item-photos` sweep (Slice 4). When Slice 4 lets a shelf shrink, it has to keep the target no larger than the tile count. A catalog-item cascade can shrink a shelf today: the run screen should treat "shelf now smaller than target" as a known state (→ WATCH).
- "Merge into…" and the Manage Categories redesign (after Ask).
