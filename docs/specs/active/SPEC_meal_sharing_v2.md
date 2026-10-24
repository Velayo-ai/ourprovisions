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

---

# SPEC_meal_sharing_v2 — Amendment 2026-10-22 (design chat)

**Append to:** `docs/specs/active/SPEC_meal_sharing_v2.md`. Append-only; do not edit the original text. Where this amendment and the original disagree, this amendment wins.
**Status:** Design-final for Phase A. The crew return flow is decided in principle, but its design is not finished (see Open).
**Supersedes:** sharing v2 Phase B's "the first accepted gift connects the two places" and everything that hangs off it.
**Reconciles with:** the 10-21 crew sharing model (DECISIONS 2026-10-21) and the 10-13 meal-photos amendment A4 (photos travel with gifts).

---

## Why

Sharing v2 (10-07) had a gift create a standing connection between two places. The 10-21 model added a rule that a public link must never connect places. Those two can't both hold, because Phase A link gifts are exactly how a stranger arrives.

Dan's ruling resolves it: **a gift is a one-time handoff of a recipe. It never connects households, and it never adds a person to a household.** The crew is the only standing relationship in the app, so we don't build a second one.

A short detour this session considered "first cook and rating come back once, to the giver only" for gifts outside the crew. **It was rejected.** Someone who cooks a recipe they found on Instagram may reasonably find it invasive that the giver was told.

---

## Decisions

**S1 — A gift never connects.** Accepting a gift copies a snapshot into the receiver's Library, and that is the whole relationship. No row anywhere links the two households, and no person joins a household. The following are retired:
- the first-gift consent line
- "Places you give to"
- ending a connection
- connection-based visibility ("connected places see place name + creator's first name")

**S2 — Outside the crew, a gift is one-way.**
- Nothing comes back: no cooks, ratings, photos or notes.
- The giver is never told whether the gift was accepted, cooked or rated.
- The receiver sees no disclosure line, because nothing is collected.
- This applies to every gift link, wherever it was posted.

**S3 — Inside the crew, the gift stays alive.** When giver and receiver are in the same crew:
- each cook of the gifted meal comes back to the giver
- each person's own rating comes back (per person, per cook, as 066)
- each cook photo comes back
- **notes never come back**, not even inside the crew

The 10-21 model stands unchanged here.

**S4 — How people are named inside the crew:** first name · place, for example "Elly · Madbury". Outside the crew nothing comes back, so no naming rule is needed.

**S5 — Mute, per person and per meal.** A giver can mute crew activity for one gifted meal.
- **Silent:** nobody is told.
- **Reversible:** unmute any time.
- **It hides; it doesn't stop.** The receiver's cooks and ratings are still recorded and still flow; the muted person just doesn't see them. Unmuting shows the history.
- **It's per person:** the giver's household and the rest of the crew are unaffected.
- **Two doors:** ⋯ → "Mute this meal" on the activity line, and the same control (Mute / Unmute) on the meal's recipe view.
- **Not now:** muting a whole person or a whole crew. That waits until beta shows per-meal mute isn't enough.

**S6 — The giver's photo travels with every gift, inside or outside the crew.**
- The gift carries the giver's **latest** cook photo at give time, in both renditions.
- This confirms 10-13 A4. The photo is part of the snapshot, kept apart from the receiver's own photos and never aged out.
- After the gift, outside the crew, the receiver never sees the giver's later photos.
- The 10-13 child-safety rule for shared photos stands.
- A gift whose meal has no photo arrives with no photo.

**S7 — Standing crew-level sharing is deferred.** Examples would be auto-sharing every new meal with the crew, or a crew recipe shelf. We revisit this only if beta feedback says sharing one meal at a time is too much.

---

## What this changes in the build

**Phase A (link gifts) is now one-way and buildable after the span scrub.**
- It's a snapshot that lands as the prefilled New Meal form (as 10-07), plus the S6 photo.
- There is no feedback table, no receipt-to-giver read path, and no disclosure UI.
- `meal_gift_receipts`, if it is kept, records only what the **receiver's** household needs (which gift they accepted). It is never readable by the giver's household.
- **Builder: confirm that against the 10-07 RLS before writing 0xx.**

**Phase B shrinks to crew-only:**
- household cards and the Home gift notice are **parked** until the crew sharing design
- the crew return flow (S3–S5) builds after that design, and after the crew recursion fix below

---

## Prerequisites and constraints

- **Grants:** every new table states its grants for `anon`, `authenticated` and `service_role` explicitly (standing rule since 10-21; Supabase ends automatic grants 2026-10-30).
- **Crew recursion `42P17`:** `crew_members_in_same_crew` selects from its own table. It must move to a SECURITY DEFINER `is_crew_member(crew_id)` before **any** S3–S5 read path ships. Phase A does not touch crew tables.
- **Photos:** S6 depends on `meal_photos` (065) and the private `meal-photos` bucket, which are dev-only until the Meal Photos v1 promotion. Phase A builds on dev after that promotion, or holds with it.
- **Span scrub first:** gift photos add more signed storage URLs, so `SPEC_rum_span_url_scrub.md` must be on prod before any gift-photo surface is built.
- **Replay:** every gift photo `<img>` carries `.op-replay-block`. Gift titles and giver names stay masked, and no name goes into an `aria-label`.

---

## Step 0 (builder, read-only, before code)

1. Read `SPEC_meal_sharing_v2.md` against this amendment. Report every clause that S1/S2 retire, and every table, column or policy that existed only to serve a connection.
2. Report the planned shape of `meal_gift_receipts` and its RLS. Confirm the giver's household can read none of it outside the crew.
3. Report how the S6 photo is stored: an origin row in `meal_photos` versus a field on the gift (10-16 lean: a row with `origin`). Report the signed-URL path for a receiver.
4. Name the next free migration number from the live ledger on dev.

---

## Verification (Phase A)

- **V1:** giving a meal with a photo gives the receiver the meal and the giver's latest photo. The receiver's own photos are separate.
- **V2:** giving a meal with no photo gives the receiver the meal with no photo slot filled.
- **V3:** after the receiver accepts, cooks and rates, **nothing** changes for the giver. Check by direct query as the giver: zero rows visible about the receiver.
- **V4:** no row links the two households. A query for any relationship between the giver's and receiver's households returns nothing.
- **V5:** a later cook photo on the giver's side is never visible to the receiver.
- **V6:** the gift photo is replay-excluded, and in a HAR its storage path reads `…/meal-photos/[object]` with no token.
- **V7:** the new tables' grants match the migration's stated grants on dev.

---

## Open (for the crew sharing design session, not Phase A)

- Does crew feedback (S3) go to the giver only, or to the giver's whole household? The 10-21 example is a per-person feed ("Andrew's feed").
- An "Only us" option on a cook photo inside the crew. Lean: offer it, defaulting to share with the crew.
- The Home activity record across households.
- Where a muted meal's history lives for unmuting, if the meal has left the giver's Library.

---

# SPEC_meal_sharing_v2 — Amendment 2026-10-23 (design chat)

**Append to:** `docs/specs/active/SPEC_meal_sharing_v2.md`, after the 2026-10-22 amendment. Append-only. Where this and earlier text disagree, this wins.
**Status:** Design-final. It changes Phase A's photo rule (S6) before Phase A is built.
**Supersedes:** 10-22 **S6** ("the giver's latest cook photo travels with every gift, crew or not"), and the "Only us" photo toggle discussed in design chat on 10-23, which is dropped unless beta asks for it.

---

## Why

Under S6, a gift link posted on Instagram would have carried a family cook photo out of the house.

Dan's scenario makes the need concrete. Elly, a household member, wants an Instagram channel for meals she cooks, using styled photos. The household's cook photos (faces, funny dinners) must never reach it, **and nobody should have to mark photos private one at a time.**

The answer is **safety by kind of photo, not by tagging.** Every photo is private by default. Only a deliberately different kind of photo, added by its own author, can ever leave the crew.

---

## Decisions

**S8 — The return flow goes to the giving household.** Inside the crew, cooks, ratings and cook photos of a gifted meal are visible to **every member of the household that gave it**, not only the person who sent it.
- Recipes belong to households (Collaborative Intelligence), so the whole household celebrates when one is loved.
- The gift still records **who** gave it, for attribution only ("Dan shared it").
- Each member can mute for themselves (S5 is unchanged and remains per person).
- It reuses the household-membership RLS pattern; there's no new per-person visibility rule.

**S9 — Two kinds of meal photo.**

| Kind | Added by | Where | Audience, ever |
|---|---|---|---|
| **Cook photo** (exists: 065) | any member | Cooked it, or the recipe view | the household; plus the giving household's crew return flow when the meal is a crew gift |
| **Showcase photo** (new) | any member, as an explicit separate action, "Add a showcase photo", labelled *"Can be shared publicly"* | the recipe view only | the household, plus anyone a public or outside-crew gift reaches, but **only when its own author gives it** |

**S10 — A cook photo can never go public.** No setting, button, gift path or re-gift turns a cook photo into a public one. This is the guarantee that needs no per-photo work from anyone.

**S11 — Only the author can share a showcase photo publicly.** A showcase photo travels on a public or outside-crew gift only when the **giver is the member who added it**.
- If Dan gives a meal publicly and only Elly has added a showcase photo, the gift goes out with **no photo**.
- Nobody can publish another member's photo.

**S12 — Photo selection at give time (replaces S6):**
- **Crew gift:** the giving household's latest **cook** photo of that meal, or none.
- **Public or outside-crew gift:** the giver's own latest **showcase** photo of that meal, or **none**. Never fall back to a cook photo.
- In both cases the photo is part of the snapshot. Later photos never reach an outside receiver.

**S13 — A prompt when adding a showcase photo:** *"Showcase photos can be seen by anyone. Check everyone in it is happy with that."* It's shown once per upload. Responsibility for people pictured in a showcase photo rests with its author; the app doesn't police content.

**S14 — No easy exits for other people's photos.** The app never offers download, save or share on a photo the viewer didn't add. Honest limit: it can't stop a screenshot.

**S15 — Ratings never go public.** Stars stay within the household and, for crew gifts, the giving household. A public gift carries no rating, count or "loved by" line.

**S16 — "Only us" is dropped.** With S9–S12, cook photos are household- and crew-scoped by construction, and anything public is a deliberate separate kind. A per-photo private toggle adds a decision no one should have to make. Revisit only if beta testers ask to keep a particular crew-gift cook photo from the giving household.

---

## What this changes in the build

- **Schema (Phase A migration):** `meal_photos` gains a kind, `cook` or `showcase`, with **default `cook`**, so every existing row stays a cook photo. Confirm `meal_photos` already records its uploader. If not, add `added_by` (a users id) and backfill it from whatever 065 records; Step 0 reports which.
- **RLS / RPC:**
  - The gift-snapshot RPC selects the photo per S12, server-side. The client never chooses which photo travels.
  - A `showcase` row is selectable on a public gift only when `added_by` = the giver.
  - Cook photos are never selectable for a non-crew gift.
- **Client:**
  - The recipe view gains "Add a showcase photo" (the uploader's own action, with the S13 prompt).
  - Showcase photos are visibly marked inside the household so everyone knows which ones can travel.
  - No download or share on photos the viewer didn't add (S14).
- **Unchanged:** Meal Photos v1 (065/066) as promoted. Showcase is additive and lands with or after Phase A. It doesn't block tonight's promotion.

---

## Step 0 additions (builder, read-only)

1. Does `meal_photos` (065) record the uploader? Give the column name and type, and report how a `kind` column with default `cook` interacts with 065's policies and the RPCs `add_meal_photo` / `remove_meal_photo`.
2. Confirm no current code path offers download or share on a photo; list any `<a download>`, share sheet or long-press save surface.
3. Report where the card, hero and viewer choose "latest photo", and whether a showcase photo should be eligible there (see Open).

---

## Verification (adds to Phase A's V-list)

- **V8:** a public gift from a member with no showcase photo goes out with **no photo**, even when the meal has cook photos. Checked by direct query on the snapshot.
- **V9:** a public gift from Dan of a meal where only Elly has a showcase photo goes out with **no photo**.
- **V10:** a public gift from Elly carries her latest showcase photo only.
- **V11:** a crew gift carries the giving household's latest cook photo, and never a showcase photo selected by someone other than its author.
- **V12:** no RPC, policy or URL path lets a cook photo be read by anyone outside the household and the crew return flow.
- **V13:** the recipe view offers no download or share on photos the viewer didn't add.

---

## Decided 2026-10-23 (closes the open photo questions)

**S17 — The card and hero show the latest cook photo, always.** The library card and recipe hero keep the 10-03 rule. Inside the household they show the dinner you actually had, so the Library doesn't drift into a portfolio.
- Showcase photos appear in the recipe view's photo strip, visibly marked as showcase, and never on the card while a cook photo exists.
- **Edge case:** a meal with only a showcase photo and no cook photo shows the showcase photo on its card and hero. It drops back to the cook photo once one exists.

**S18 — The crew return flow shows cook photos only.** The feed is the real night ("Madbury cooked Andrew's tacos"), never a styled post. A showcase photo never enters the crew feed, so the only path a showcase photo has out of the household is its author's own public gift (S11).

**Verification:**
- **V14:** a meal with a cook photo and a newer showcase photo shows the cook photo on its card and hero.
- **V15:** a meal with only a showcase photo shows it on its card. After a cook photo is added, the card switches to the cook photo.
- **V16:** the crew return flow and Home activity never render a showcase photo.

No open photo questions remain for Phase A.

---

# SPEC_meal_sharing_v2 — Amendment 2026-10-24 (design chat)

**Append to:** `docs/specs/active/SPEC_meal_sharing_v2.md`, after the 2026-10-23 amendment. Append-only. Where this text and earlier text disagree, this wins.
**Status:** Design-final for Phase A's photo path. The read-only Step 0 below runs before any code.
**Context:** Phase A prep, after Meal Photos v1 went live on prod (2026-10-23). All Phase A prerequisites are now met: recipe import (prod since 10-13), span scrub (prod), Meal Photos v1 (prod, 10-23).

---

## Already answered

- **Uploader column.** `meal_photos` (065) already records its uploader as `uploaded_by uuid NOT NULL`, FK to `users(id)`, set server-side by `get_current_user_id()` in `add_meal_photo`. The 10-23 amendment's planned `added_by` column is **not needed**. Wherever that amendment says `added_by`, read `uploaded_by`. No backfill.

---

## Decisions (confirmed by Dan 2026-10-24)

**S19 — Phase A builds only the public branch of S12, and ships showcase photos with it.**
- Link gifts are public by definition. A Phase A gift therefore carries the giver's own latest showcase photo, or no photo. It never carries a cook photo (S12).
- The crew branch of S12 (the giving household's latest cook photo) waits for the crew return flow and the `42P17` recursion fix.
- Showcase upload ("Add a showcase photo", with the S13 prompt) lands **inside Phase A**. Without it, Phase A's photo path couldn't be built or tested.

**S20 — A gift photo travels as copies, never as a reference.**
- **At give time:** the server copies the giver's showcase image into a **gift-scoped storage location** owned by the gift, not by either household. A link preview, including one opened by a non-user, is served from that copy through a signed URL minted server-side.
- **At accept:** the server copies the gift's image into the **receiver's own household folder** and creates the receiver's `meal_photos` row. The receiver never holds a path into the giver's folder.
- **Why:** the storage policy grants a household access to its own folder only, and that stays unchanged. Copies also keep the snapshot rule (V3): if the giver later deletes or replaces the photo, the gift and the receiver's copy are unaffected.
- **Consequence:** copying storage objects needs service-role access, so the photo step runs in an **Edge Function** (Clerk JWKS identity, as `recipe-import` does), not a SQL RPC. `give_meal` and the accept path call it server-side. The client never chooses or copies which photo travels.

**S21 — Showcase photos count toward the existing 3-live-photo cap.** One rule per meal, whatever the photo kind.
- **Principle (Dan):** keep the limit at what serves people today, and let users ask for more before we spend storage, cost and complexity on it.
- Revisit only on real beta requests.

**S22 — A gift code is a bearer key and is scrubbed like `token=`.**
- Anyone holding a gift link can open the gift, so the code must never reach Splunk: not in span URLs, and not in replay's page location.
- If Step 0 #6 finds it unmasked, the fix **folds into the `SPEC_rum_clerk_id_scrub.md` build** (same file, same HAR verification).
- **Either way, it lands on prod before Phase A's link surfaces ship.**

**S23 — A received photo is a showcase row whose `uploaded_by` stays the giver.**
- The receiver's copy is `kind = showcase`, so it never enters the crew feed (S18).
- `uploaded_by` = the giver's user id, so S11 holds by construction: a public re-gift selects only showcase rows where `uploaded_by` = the person giving. The receiver can never re-gift it as their own.
- The receiver can remove it from their meal like any photo.
- **Accepted trade-off:** the receiving household can see the giver's internal user id. It's an opaque UUID with no name, and the giver's first name already travels in the gift snapshot.
- If an `origin` marker is wanted later (e.g. "Given by…" on the photo), that's the attribution session's call. It is not added in Phase A.

---

## Step 0 (builder, read-only, before code; replaces the earlier Step 0 lists)

1. Read `SPEC_meal_sharing_v2` against all three amendments (10-22, 10-23, 10-24). List every clause, table, column or policy that existed only to serve a connection (retired by S1/S2).
2. Report the planned shape of `meal_gift_receipts` and its RLS. Confirm the giver's household can read none of it.
3. Report how a `kind` column (`cook` | `showcase`, default `cook`) would interact with `add_meal_photo` / `remove_meal_photo`, their policies, and the 3-live-photo cap (S21).
4. Report where the card, hero and viewer choose "latest photo". Quote the code. Cross-check against S17 and its showcase-only edge case.
5. List any download, share or long-press-save surface on a photo. Expect none (S14).
6. Report whether the current RUM scrub masks a gift code in `?ref=` (span URLs and replay location) (S22).
7. Report the next free migration number from the dev ledger.
8. Propose the gift-scoped storage location for S20: a path inside the `meal-photos` bucket or a separate private bucket, with its policy (lean: no client policy at all, server-side access only). Name the Edge Function's inputs and outputs. **Report and stop.** The layout comes back to the design chat before code.

---

## Verification (adds to V1–V16)

- **V17:** a giver deleting their showcase photo after giving changes nothing for the gift's preview or for a receiver who already accepted.
- **V18:** the receiver's photo row lives under the receiver's household folder. No receiver row or URL references the giver's folder.
- **V19:** the receiver cannot select a received photo for their own public gift. Checked by direct query and by RPC call.
- **V20:** a gift link opened by a signed-out visitor shows the gift photo through a server-minted signed URL. A HAR shows no `?ref=` code and no token in spans or replay.
- **V21:** adding a showcase photo when the meal already has 3 live photos is refused with the same cap behaviour as a cook photo.

---

# SPEC_meal_sharing_v2 — Addendum 2026-10-24b (design chat, rulings on Phase A Step 0)

**Append to:** `docs/specs/active/SPEC_meal_sharing_v2.md`, after the 2026-10-24 amendment. Append-only. Where this text and earlier text disagree, this wins.
**Status:** Design-final for the items below. Step 0 #8 (gift storage layout + the Edge Function's shape) is still open and comes back to the design chat before 069 is drafted.
**Source:** Claude Code's Step 0 report of 2026-10-24 (#1–#7), ruled by Dan the same night.
**Supersedes:** S21 and V21 (2026-10-24); V4 (10-22) as worded; V20 (2026-10-24) as worded.

---

## Rulings

**S24 — The Phase A thank-you prompt stays.** After accepting, "Send Andrew a thank you?" opens the receiver's **own** share sheet. The app records nothing and tells the giver nothing.
- S2 governs what the *app* reports to the giver. A message the receiver chooses to send from their own device is outside S2.
- V10's Phase A half and verification #13 stand.

**S25 — Lineage is crew-only, and the receipt stays.**
- On a public (link) gift, the receiver's copy stores `copied_from_household_id = NULL` and `copied_from_meal_id = NULL`. `copied_at` and `meals.attribution` (From) stay as they are.
- Those two columns fill in only for crew gifts, when the crew return flow builds. Routing loves to the giving household is their only purpose.
- `meal_gift_receipts` stays, because the server needs the gift to stop double-adds. Its shape:
  - `(gift_id → meal_gifts CASCADE, to_household_id → households CASCADE, accepted_by → users SET NULL, meal_id → meals SET NULL, accepted_at)`
  - primary key `(gift_id, to_household_id)`
  - no `status` and no `thanked_at`
- The receipt's RLS is SELECT `is_member_of(to_household_id)` **only**. Delete the 10-07 "or the gift's `from_household_id`" clause and its verification #12 check.
- Writes go only through `record_meal_gift_receipt` (SECURITY DEFINER). The table gets no INSERT, UPDATE or DELETE policy, and explicit grants for all three roles.
- **Standing trap (Step 0):** no view, RPC or count may join receipts into anything the giver's household can read. That includes a "given 3×" count. `revoke_meal_gifts` keeps returning how many it revoked, never how many were accepted.

**V4 (reworded):** No row links the two households in a way **either household** can read. Check as the giver and as the receiver: both see zero rows about the other. The server's own record that a gift was accepted (the receipt) is expected.

**S26 — Showcase photos: one per person per meal, outside the cook cap.** This replaces S21.
- Each member holds at most **one live showcase photo per meal**. Adding a new one soft-deletes their previous showcase photo for that meal.
- Showcase photos **do not count** toward the 3-live-photo cap. The cap and its server-side trim apply to **cook photos only**, so a showcase upload can never age out a cook photo, and S17 always has a cook photo to show when one exists.
- **Why:** a public gift only ever uses the giver's *own latest* showcase photo (S12), so one per person is exactly what the feature needs. This follows Dan's principle: serve today's need, and let users ask for more before we spend resource or complexity.
- A showcase add must refuse a non-null `p_meal_cook_id` (raise `22023`). P1 (one live photo per cook) touches cook photos only.
- The client's `MEAL_PHOTO_CAP` / `atCap` count cook photos only.
- **`add_meal_photo` gains `p_kind`.** That creates a new overload, so 069 drops the 6-argument version, re-grants the new one, and the client moves to it in the same promotion.

**V21 (replaces 2026-10-24 V21):**
- Three live cook photos plus a new showcase upload leaves all three cook photos live.
- A second showcase upload by the same member leaves only the newer one live.
- A fourth cook photo still ages out the oldest cook photo, never a showcase photo.

**S27 — Any member can remove any photo, showcase included (P3 unchanged).** The household owns its meals, and removing a photo only ever reduces exposure.

**S28 — One pick function, and the strip's order.**
- A single function picks the S17 photo: **newest live cook photo; if none, newest live showcase photo; else none.** Both the library card and the hero's first slide use it.
- The strip shows the S17 pick first, then every other live photo newest-first. Showcase photos are visibly marked.
- The viewer receives the strip's list, unchanged.
- The afterglow thumbnail stays as it is (it matches on `meal_cook_id`, so it's cook-only).
- **Why:** today the card takes `[0]` of a kind-blind newest-first list (`src/App.js:5658`, `:5644`), and the hero strip uses the same list (`:2120`, `:2169`). One shared pick removes the risk of the card and the hero disagreeing.

**S29 — Code-bearing URLs are cleared before Splunk starts (detail for S22).**
- Step 0 found that replay records the page's full `location.href` (query and hash), with no hook to scrub it, and that spans keep the `/g/{CODE}` path. Today's `?ref=` and `?invite=` already reach replay, so this is a **live leak** as well as a Phase A prerequisite.
- **Fix:** a small module runs at the very top of `index.js`, before the RUM init. It reads any gift code (`/g/{CODE}`), `ref` and `invite`, holds them in memory for the app's gates to read, then `history.replaceState`s the URL to a clean one. Splunk's first event then sees a clean URL.
  - The app's existing gates (the pre-fill scrub at `src/App.js:4674` and the two `?ref=` readers) read the held values instead of `location`.
  - Use memory, not `sessionStorage`, unless a gate needs the value across a reload. Step 0 of that build reports which do.
- **Backup:** `scrubUrl` also masks `/g/<code>` to `/g/[code]` in spans.
- **Where it builds:** folded into the `SPEC_rum_clerk_id_scrub.md` build (same file area, same HAR verification). It ships **before** Phase A's link surfaces.

**V20 (replaces 2026-10-24 V20):** for a signed-out visitor opening a gift link:
- the gift photo shows through a server-minted signed URL;
- a HAR shows **0** occurrences of the gift code (path form), **0** of the `ref` code, and **0** of the `invite` code, checked **separately**, in spans **and** replay (`pageUrl` included);
- **0** `token=`.

**S30 — Long-press and drag protection ships with the scrub build (S14).**
- One CSS rule on every photo image: `-webkit-touch-callout: none; -webkit-user-drag: none`. Also `draggable="false"` on `.lib-slot-img`.
- Confirm `.board-photo-thumb` inherits `touch-callout: none` from `.board-card` on a real iPhone.
- It's client-only, so it rides the same promotion as S29 and the Clerk-id scrub.
- S14's honest limit (screenshots) still holds.

---

## Still open (back to the design chat before 069)

- **Step 0 #8:** the gift-scoped storage location (inside `meal-photos` or a separate private bucket; lean: no client policy, server-side access only), and the Edge Function's inputs and outputs for the S20 copies. Run read-only, then report and stop.

---

## Notes for the `SPEC_rum_clerk_id_scrub.md` build

That build's scope grows by S29 and S30. Its Step 0 adds:
- (a) every reader of `ref`, `invite` and the gift code, and whether any needs the value across a reload;
- (b) confirm the pre-init module runs before `SplunkOtelWeb.init` and `SplunkSessionRecorder.init`.

Its verification adds V20's separate code checks on dev, using a test gift link once Phase A exists. Until then, test with `?ref=` and `?invite=` only.

---

# SPEC_meal_sharing_v2 — Addendum 2026-10-24c (design chat, review pass)

**Append to:** `docs/specs/active/SPEC_meal_sharing_v2.md`, after Addendum 2026-10-24b. Append-only. Where this text and earlier text disagree, this wins.
**Status:** Design-final for S31–S33. S20's storage layout is reopened for Step 0 #8 (two candidates, both reported, design chat decides).
**Source:** a fresh-eyes review of all 10-24 work, confirmed by Dan 2026-10-24.
**Supersedes:** in S26, the `p_kind` argument and the overload drop; in S20, the fixed choice of an Edge Function; in S29, "memory, not `sessionStorage`".

---

## S31 — Showcase photos get their own RPC: `add_showcase_photo`. (Replaces part of S26.)

- `add_meal_photo` (065) stays exactly as promoted on prod: same signature, same overload, no drop, no re-grant. It stays cook-only.
- `add_showcase_photo(p_meal_id, p_path, p_thumb_path, p_width, p_height)` is new in 069. SECURITY DEFINER, pinned `search_path`, EXECUTE to `authenticated` only, explicit grants for all three roles.
  - It has **no `p_meal_cook_id`**: "a showcase photo never attaches to a cook" is encoded in the signature, not by a raise.
  - It sets `kind = 'showcase'`, `uploaded_by = get_current_user_id()`, and `household_id` from the meal.
  - It soft-deletes the caller's previous live showcase photo for that meal, then inserts the new one. One per person per meal (S26) is enforced by a **partial unique index** on `(meal_id, household_id, uploaded_by)` where `kind = 'showcase'` and the row is live.
  - It never touches the cook-photo cap or its trim.
- `meal_photos` gains `kind text not null default 'cook'` with a check constraint (`cook` | `showcase`). Every existing row is a cook photo by default; no backfill.
- **Why:** a `p_kind` argument would force 069 to drop the 6-argument overload, coupling the migration and the client into one promotion. A separate RPC leaves prod's function untouched and keeps each change small.

## S32 — Step 0 #8 evaluates two storage layouts for the gift photo. (Reopens S20's "Edge Function" choice; S20's copies-not-references rule stands.)

**Why reopen:** `preview_meal_gift` is a SQL RPC opened by signed-out visitors through the 042 bridge. SQL can't mint a signed URL, so the Edge Function approach would need a second function just to serve previews. There may be a simpler way.

**Candidate A — policy-guarded `gift-photos` bucket, client-side copies (lean).**
- A new private bucket `gift-photos`, path `{gift_id}/{rendition}.webp`. The path carries the **gift id only**, never a household id.
- SELECT policy for `anon` and `authenticated`: the first folder segment is a UUID that matches a `meal_gifts` row that is **not revoked**. The client signs its own URL, as it does today for `meal-photos`. Revocation makes the photo unreadable automatically.
- INSERT policy for `authenticated`: the gift's `from_household_id` is one the caller is a member of. DELETE: none for clients.
- **Give time:** `give_meal` selects the photo per S12 server-side and returns the source path (or null). The giver's client downloads that object (it already holds a signed URL) and uploads it to the gift path. The client copies what the server chose; it never selects.
- **Accept time:** the receiver's client downloads the gift copy and uploads into its own household folder through `add_showcase_photo` (S31, with `uploaded_by` = the giver per S23: **this needs a parameter or a second RPC, which Step 0 #8 reports**).
- **Revoke:** `revoke_meal_gifts` leaves the objects; a later cleanup can delete copies of revoked gifts. Receivers' copies are unaffected (V3).
- No service-role key in any function, no new runtime, no new egress path beyond the two copies.
- **Honest limit:** a hacked giver client could upload a different image to the gift path. The giver can already upload any image as a showcase photo, so this changes nothing about who can publish what.

**Candidate B — Edge Function copies (10-24 S20 as written).**
- A function with service-role access copies the object at give time and at accept time, and mints signed URLs for previews.
- Report what it needs: inputs, outputs, how previews for `anon` get a signed URL, and how revocation is checked.

**Step 0 #8 reports both, with the policies written out for A, and stops.** The design chat picks.

## S33 — S29 clarified: `sessionStorage`, a clean redirect, and the documentLoad span.

- **`sessionStorage`, not memory.** A non-user opens `/g/{CODE}`, signs up through Clerk, and comes back to the same tab. Memory doesn't survive that round trip; `sessionStorage` does. The pre-init module stores the gift code, `ref` and `invite` under one key, then `replaceState`s to a clean URL. Gates read from `sessionStorage` and clear it once consumed.
- **The `redirect_url` given to Clerk must be the clean URL.** If it carries `/g/{CODE}` or `?ref=`, the code comes straight back after sign-in and the first page event re-records it.
- **The documentLoad span is not fixed by `replaceState`.** It can read `PerformanceNavigationTiming.name`, which is the original URL and can't be changed. So the `/g/<code>` → `/g/[code]` mask in `scrubUrl` is **load-bearing, not a backup**, and the HAR check must look at that span specifically.
- **`?invite=` is the most serious of the three.** An invite code lets its holder join a household, and it reaches replay today. If the Clerk-id part of the scrub build drags, **S29 ships alone first**, in its own small promotion.

## Client grouping (detail for S26 / S28)

- `photosByMeal` (`src/lib/mealPhotos.js`) stops at `MEAL_PHOTO_CAP` across kinds, so it would drop showcase rows once three photos exist. It must count **cook photos only**, like `atCap`. Showcase rows are always kept.

---

## Session record

SESSION END ran before tonight's Phase A prep. The builder adds, under the 2026-10-23 SESSION_LOG entry, a dated addendum:

> 2026-10-24 (same night): Phase A prep in the design chat. Step 0 #1–#7 run read-only by Claude Code. Amendment 10-24 (S19–S23) and Addenda 10-24b (S24–S30) and 10-24c (S31–S33) appended. `SPEC_rum_clerk_id_scrub.md` scope grown by S29/S30; a live replay leak of `?ref=` / `?invite=` found. Step 0 #8 (gift storage, two candidates) still open.

And rewrites the Next session block:

> SESSION START
> Goal: Build `SPEC_rum_clerk_id_scrub.md` on dev, now including S29 (pre-Splunk clearing of gift / ref / invite codes, `sessionStorage`, clean Clerk redirect, `/g/<code>` mask) and S30 (photo long-press CSS). S29 ships first on its own if the rest drags.
> State: Meal Photos v1 live on prod (`5836534`). `src/` identical on prod and dev. Phase A design-final through S33; Step 0 #8 (gift-photo storage: policy bucket vs Edge Function) open. Jest green. Dev ahead of origin by the 10-24 docs commits until pushed.
> Done when: the scrub build's Step 0 is reported, the code is built with tests, and a dev HAR shows 0 Clerk ids, 0 gift/ref/invite codes (checked separately, documentLoad span included, spans and replay), while `sess_[id]` route shapes survive.
