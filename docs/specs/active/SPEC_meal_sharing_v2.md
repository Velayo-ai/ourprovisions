# SPEC_meal_sharing_v2.md — Giving a meal to another place (link first, Home second)

**Status:** ACTIVE — design chat 2026-10-07. **Phase A ready for Claude Code after `SPEC_recipe_import.md` ships** (it reuses import's prefilled-form path). Phase B is spec'd here; confirm its open items before building it.
**Scope:** OurProvisions · dev first, prod by its own fresh-eyes promotion per phase
**Mockups of record:** `mockup_recipe_arrival.html` frames 4 (the link in a text) and 5 (Home notice); `mockup_new_meal_import.html` frame 6 (the gift arriving in the form). **Copy in those frames that says "share" / "Shared by" / "sent you" is superseded by the verb rule below.**
**Reconciles and supersedes:** `SPEC_meal_sharing.md` (2026-07-28, never built) and the 2026-09-27 recipe-giving design (crew + link). Where this spec is silent, July's principles stand.

---

## Decisions

Confirmed by Dan 2026-10-07 unless marked *carried*.

| # | Decision | Why |
|---|---|---|
| V1 | **The verb is give.** "Give this meal", "Andrew gave you…", "Given by Andrew". Internal names may say share. | *Carried from July, reconfirmed tonight.* A copy leaves your hands and becomes theirs; "share" implies a thing held in common and invites the wrong model (that edits flow back). |
| V2 | **Copy, never reference.** The recipient owns an independent meal. Andrew's later edits or deletes never touch it. | *Carried.* Reference is OurChef. |
| V3 | **A gift is a snapshot taken at give time.** The recipe Andrew gives is the recipe Dan gets, even if Andrew edits or deletes his meal afterwards. | Supersedes July's copy-at-accept. With a link anyone can open, any day, copy-at-accept means the recipient gets whatever the source looks like that day, and a deleted source silently voids the gift (July's open Q2). A snapshot also means no cross-household read of `meals` is ever needed — which routes around the crew RLS bug entirely. |
| V4 | **Arrival = the New Meal form, prefilled** (import's path), with a "gave you" banner and the giver's note. Footer: **Not for us** / **Add to our meals**. | Confirmed tonight. One editor, one save path, matching against *the recipient's* catalog. Replaces July's batch review list (v2 gives one meal at a time). |
| V5 | **Any member of a place can give any of its meals.** | Confirmed tonight (July Q4). The household owns the meal. |
| V6 | **Two phases, one spec.** **A:** give by link (works for anyone, doubles as an invite). **B:** accepting a link *connects* the two places; after that you can give to a connected place in-app (household cards) and it arrives as one line on their Home. | Confirmed tonight. A proves the flow with the smallest surface; B is the 09-27 "crew path" rebuilt on connections instead of `velayo_crews`. |
| V7 | **`created_by` on the copy = the person who pressed Add to our meals.** The giver lives in the receipt and lineage; "whose recipe" lives in `meals.attribution` (From). | **Supersedes July's "preserve original author".** 2026-09-22 clarified `created_by` means *added by*, with Recipe by / Shared by / Added by as three roles. July predates that. |
| V8 | **Lineage breadcrumb on the copy** — `copied_from_meal_id`, `copied_from_household_id`, `copied_at`. Provenance only, never sync, never read at edit time. | *Carried from July.* Also what 09-27's "loves route to the direct giver" reads. |
| V9 | **Displayed attribution is free text; the ledger is immutable.** The recipient may edit From, rename the meal, strip everything. Never validated against gifts. | *Carried from July* ("Elly and Cassie's meatballs"). |
| V10 | **Thank-you is offered once, at accept.** Phase A: a prefilled message through the phone's share sheet. Phase B: delivered in-app to the giver's Home. "Loved it" after cooking is **not** in v2 (crew feed spec). | July Q5 + 09-27. |
| V11 | **One link can go to many people; Andrew can stop it; no expiry.** Each place can accept a given link once. | Set earlier tonight. |

## Phase A — give by link

### Giver (Andrew)
- Meal ⋯ menu (library card and the meal sheet's overflow, wherever the meal's ⋯ lives today) → **Give this meal**.
- A small sheet: the meal name, **Add a note (optional)** — 280 chars, placeholder *"Easton's favourite. Don't skip the pickle."* — and **Give**.
- **Give** calls `give_meal` → gets a code → `navigator.share({ title, text, url })`:
  - text: *"I'm giving you {meal name} on OurProvisions."*
  - url: `https://ourprovisions.velayo.ai/g/{CODE}?ref={giver referral_code}` — **every in-app share carries `ref`** (08-25 hard rule).
  - No `navigator.share` → copy link + toast "Link copied".
- **Stop giving this link:** the meal's ⋯ shows **Stop giving** while the meal has any unrevoked gift; it revokes all of them (one confirm: *"Anyone who hasn't added it yet won't be able to."*). Places that already added it keep their copy (V2).

### Recipient (Dan)
- `/g/{CODE}`:
  - **Signed out** → normal sign-up through the 042 referral bridge (`ref` attributes, never enrolls; welcome sheet as usual). The code is held in `localStorage` (`pendingGift:{CODE}`, 24h) and resumed after bootstrap.
  - **Signed in** → call `preview_meal_gift(code, activePlaceId)`; open New Meal prefilled.
- Prefilled form (frame 6):
  - Banner: **"Andrew gave you this. It's your copy to change."** + under it, when he has more than one place, *"Adding to Madbury · Change"* (switches the target place before saving).
  - The note as a quote (Playfair italic, "— Andrew"). **Not editable** — it's his words; not saved on the meal (it lives on the gift).
  - Name, Good for, Steps, From (snapshot `attribution`, only if present — **never prefilled with the giver**, who is Shared by, not Recipe by), ingredients.
  - Ingredients run through `createCatalogItem` against **Dan's** catalog: matches plain, the rest NEW (pending, written only at save). Andrew's catalog ids never cross.
  - **Name collision:** if the target place already has a live meal with the same normalised name, prefill as **"{name} (from Andrew)"** — editable. (*Carried from July.*)
  - Doors (Ask AI / Bring a recipe) hidden — a draft is present.
- **Add to our meals** → the normal save (materialize pending → create meal, `created_by` = Dan, `attribution` from From) → then `record_meal_gift_receipt(code, place, meal_id)` writes the receipt and the lineage columns. Toast: *"Added to your meals."* Then, once: **"Send Andrew a thank you?"** → share sheet with *"Thank you for {meal}! Adding it to our meals."* Skip = gone for good.
- **Not for us** → closes; nothing written anywhere.
- Errors (in the form's place, plain language): revoked → *"Andrew stopped giving this one."*; not found → *"That link doesn't work. Ask for a new one."*; already added to this place → *"Already in Madbury's meals"* with **Open it**.

### Known residual (accepted)
The save and the receipt are two calls. If the receipt fails after the meal saves, the meal exists without lineage/receipt: no data loss, the recipe is Dan's. `record_meal_gift_receipt` is idempotent; the client retries once silently. Same posture as 09-08's accepted save residual. In Phase B a missing receipt means no connection was made — the giver can simply give again.

### Data — Phase A migration (`06x_meal_gifts.sql`, next free number after import's)

```sql
-- lineage on meals (V8)
alter table public.meals
  add column if not exists copied_from_meal_id uuid references public.meals(id) on delete set null,
  add column if not exists copied_from_household_id uuid references public.households(id) on delete set null,
  add column if not exists copied_at timestamptz;

create table if not exists public.meal_gifts (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,               -- 8 chars, alphabet without 0/O/1/I/L
  from_household_id uuid not null references public.households(id) on delete cascade,
  given_by          uuid references public.users(id) on delete set null,
  source_meal_id    uuid references public.meals(id) on delete set null,  -- provenance only
  snapshot          jsonb not null,                     -- V3; shape below
  note              text check (char_length(note) <= 280),
  created_at        timestamptz not null default now(),
  revoked_at        timestamptz
);

create table if not exists public.meal_gift_receipts (
  gift_id         uuid not null references public.meal_gifts(id) on delete cascade,
  to_household_id uuid not null references public.households(id) on delete cascade,
  accepted_by     uuid references public.users(id) on delete set null,
  meal_id         uuid references public.meals(id) on delete set null,
  accepted_at     timestamptz not null default now(),
  primary key (gift_id, to_household_id)                -- V11: once per place
);
```

**Snapshot shape** (built server-side by `give_meal`, never by the client):
```json
{ "name": "...", "base_servings": 2, "instructions": "...", "occasion": ["lunch"],
  "attribution": "Easton",
  "ingredients": [{ "name": "Sourdough bread", "category": "Bakery", "quantity_per_serving": 2 }],
  "giver_first_name": "Andrew" }
```
`attribution` depends on `SPEC_recipe_import`'s column; ship import first.

**RLS / grants** (`auth.jwt()->>'sub'` identity, never `auth.uid()`; membership via `is_member_of`):
- `meal_gifts`: SELECT for members of `from_household_id`. **No client INSERT/UPDATE/DELETE** — RPCs only. Grants revoked from `anon` and `authenticated` by name, SELECT back to `authenticated`.
- `meal_gift_receipts`: SELECT for members of `to_household_id` **or** of the gift's `from_household_id` (the giver can see who added it — Phase B's thank-you reads this). No client writes.
- Recipients **never** read `meal_gifts` directly — only through `preview_meal_gift`.

**RPCs** — all `security definer`, `search_path` pinned, `anon` EXECUTE revoked, 051 authorization pattern, membership checked first:
| RPC | Does | Refuses |
|---|---|---|
| `give_meal(p_meal_id uuid, p_note text) returns text` | Caller is a member of the meal's place; `kind = 'meal'`; builds the snapshot from `meals` + `meal_ingredients` + catalog names; mints a unique code (retry on collision); returns the code. | non-member; no-shop kinds (leftovers/out/other); note > 280. |
| `preview_meal_gift(p_code text, p_household_id uuid) returns jsonb` | Caller is a member of `p_household_id`. Returns snapshot + note + `already_added` (receipt exists for that place → its `meal_id`). | unknown code → `not_found`; revoked → `revoked`; non-member of the target place. |
| `record_meal_gift_receipt(p_code text, p_household_id uuid, p_meal_id uuid) returns void` | Caller is a member of `p_household_id`; `p_meal_id` belongs to that place; inserts the receipt (`on conflict do nothing`) and stamps the meal's three lineage columns. Idempotent. | revoked gift; meal from another place; non-member. |
| `revoke_meal_gifts(p_meal_id uuid) returns int` | Caller is a member of the meal's place; sets `revoked_at` on all its unrevoked gifts; returns the count. | non-member. |

`July's meal_shares` table is **not created** — superseded by `meal_gifts` + `meal_gift_receipts`. ARCHITECTURE's `meal_shares` entry should be marked superseded at merge.

### Phase A verification (two real accounts in two different places; dev)
1. Andrew gives a meal with a note → share sheet opens with text + `/g/{CODE}?ref=…`. Code avoids 0/O/1/I/L.
2. **Snapshot holds:** Andrew edits the meal's name and deletes an ingredient after giving → Dan opens the link → sees the original.
3. Andrew **deletes** the meal → the link still works (V3). `source_meal_id` is now null (SQL).
4. Dan signed in → form prefilled; banner, note, From (or none), ingredients matched against **Dan's** catalog; Andrew-only items show NEW.
5. **Not for us** → 0 rows in `meals`, `catalog_items`, `meal_gift_receipts` (SQL).
6. **Add to our meals** → one meal in Dan's place, `created_by` = Dan, lineage columns = Andrew's meal/place/now, one receipt; NEW items minted in **Dan's** catalog only.
7. Open the same link again in the same place → "Already in Madbury's meals · Open it".
8. Dan switches to a second place → can add it there too (one receipt per place).
9. Name collision → prefilled "{name} (from Andrew)".
10. Signed-out tester opens the link → signs up → welcome sheet → lands in the prefilled form; `referred_by` = Andrew (SQL); no auto-join to Andrew's place.
11. Andrew → **Stop giving** → a fresh device opening the link sees the revoked message; Dan's copy is untouched.
12. **RLS, live in the app** (SQL editor bypasses RLS): a third account cannot SELECT `meal_gifts` rows from Andrew's place; cannot call `record_meal_gift_receipt` into a place it isn't in; cannot `give_meal` a meal from another place; `anon` gets 401 on every RPC.
13. Thank-you prompt appears once after accept and never again for that gift.

## Phase B — connections, household cards, Home

Build only after Phase A is walked. All design items settled 10-07.

- **Connection:** the first receipt between two places connects them (either direction). Table `place_connections (household_a, household_b, created_at, ended_at, ended_by)` with `household_a < household_b`; written inside `record_meal_gift_receipt`. **Consent at the door:** on a gift from a place you're not yet connected to, the form shows one line under the banner — *"Adding this connects you with Andrew's place, so you can give each other meals."* — so the connection is never a surprise. (Dan 10-07: *"here is a meal, and let's link so I can send you more."*)
- **Ending a connection** (settled 10-07): a **"Places you give to"** list in the household sheet, near Invite aboard, each row with ×. **Either place can end it, and any member of that place can** (same rule as V5 — the place owns its connections, not the person who happened to accept the link; that person may later leave). Ending stops in-app giving both ways and removes the card for both sides; meals already given stay (the 08-23 unlink principle); either side can reconnect by accepting a new link. **The other side is not notified** — their card simply goes away. **Not** offered on the Home notice (a block option beside a gift from family reads cold). Ships in Phase B with the connection itself: the off switch ships with the on switch.
- **Give sheet gains household cards** (July's 🏠 Madbury / 🏠 Sacandaga idea): connected places as cards above **Send a link** — each card shows the **place name and its creator's first name** (*"My Household · Andrew"*), which also tells apart two places with the same name. Cards are **multi-select**: one directed gift per chosen place. Choosing a card creates a *directed* gift: `meal_gifts.to_household_id` (nullable column; null = link gift). No link is sent.
- **Home notice** (frame 5): one line below the essentials, where crew news goes — *"Andrew gave you Easton's Famous Grilled Cheese & Pickle · Take a look →"*. One line, always: one pending gift → *"Andrew gave you {meal} · Take a look →"*; several → *"Andrew gave you 3 meals · Take a look →"* (or *"You have 3 meals waiting"* across givers), opening a short list where each meal opens the prefilled form. No badge, no teal. **Every member of the place sees it; whoever handles a gift first (Add or Not for us) clears it for everyone** — the collaborative-tension principle. Opens the same prefilled form. **Not for us** on a directed gift writes a receipt with `status = 'declined'` (new column, default `'accepted'`) so it stops showing. **Lifetime if ignored: 14 days** (settled 10-07), then the line goes away; the gift can be accepted later only if re-given.
- **Thank-you, in-app:** at accept, *"Send Andrew a thank you?"* → **Send** stamps `thanked_at` on the receipt → Andrew's Home shows *"Dan said thanks for Easton's Grilled Cheese"* for 7 days. Replaces Phase A's share-sheet thank-you entirely: accepting any gift connects the two places, so every giver can now be thanked in-app.
- **Precedence on Home:** an incoming gift beats a thank-you; one line total.
- **RPCs added:** `list_connected_places(p_household_id)` (place name + creator's first name only), `give_meal_to_place(p_meal_id, p_to_household_id, p_note)` (requires a live connection), `pending_gifts_for_place(p_household_id)`, `decline_meal_gift(p_gift_id, p_household_id)`, `thank_giver(p_gift_id, p_household_id)`, `end_place_connection(…)`.
- **Privacy line** (settled 10-07): a connected place sees **your place name and its creator's first name — not the member list**, and nothing else (never meals, lists, spend, members). The giver's first name still travels inside each gift snapshot.

Phase B gets its own migration and full verification list at build; draft cases: directed gift appears on the right Home only; declined gift never reappears; ended connection removes the card both ways and keeps given meals; RLS — an unconnected place can't `give_meal_to_place`; a connected place sees only place name + creator first name; one member clears a gift for all members; multi-select creates one gift per place.

## Out of scope
- "Give all my meals" (July's bulk give) — later, on top of this.
- "Loved it" after cooking, the crew feed, reactions → crew feed spec.
- Meal photos travelling with the gift → after Meal photos v1 (the dashed slot in frame 6 stays a placeholder).
- Any read of `velayo_crews` — v2 does not need the crew RLS fix.
- Showing "Given by Andrew" on the library card or meal sheet afterwards (lineage is stored; display is the attribution session's call — July: "the ledger stays nearly hidden").

## Open (don't invent)
1. Phase B's design items are all settled (10-07). *Note for the crew feed spec:* Phase B's Home line is the **first occupant of the 09-27 crew-news slot** — the crew feed should absorb it, not sit beside it.
2. Typed code entry (for someone who can't tap the link): **lean no** in v2 — the code in the URL is enough; add a field only if a real person needs it.
3. Whether `give_meal` should reuse an existing unrevoked gift for the same meal + giver + note instead of minting a new code each tap. Lean: mint new — codes are cheap and notes differ.
