# SPEC — Giving meals between households (copy, accept flow)

**Scope:** OurProvisions
**Status:** Design approved, not built
**Session decision date:** 2026-07-28
**Author:** Design-chat Claude → for Claude Code
**Depends on:** SPEC_meals_model.md (the copy operation is the engine; this spec is the doorbell)

---

## Language: "give," not "share"

User-facing language is GIVE, not share. "Dan gave you Grandma's Chili" — not "Dan shared."
This is not just warmer; it is more ACCURATE. "Share" implies a thing held in common (the
reference model we rejected). "Give" means it leaves your hands and becomes theirs — which is
exactly what copy does. The word matches the architecture and prevents the user forming the
wrong mental model about whether edits propagate (they don't; nothing is linked, nothing can be
taken back). Internal table/column names may retain "share" (e.g. `meal_shares`) for brevity,
but ALL UI copy uses give/gave/given.

---

## Why this exists

OurProvisions members want to give individual meals OR all their meals to other households —
as COPIES. This sits ON TOP of the household→household copy operation defined in
SPEC_meals_model.md. This spec adds the person-initiated giving flow and, critically, an
ACCEPT step so nothing lands in a household's space uninvited (shared list is sacred).

Reference-style sharing (live-synced, evolving recipes) is explicitly OUT — that's OurChef.
See SPEC_meals_model.md "Copy vs. reference" decision.

---

## Decisions locked this session

| Decision | Choice | Rationale |
|---|---|---|
| User-facing verb | "Give" / "gave" / "given" | Matches copy: it leaves your hands, becomes theirs, no link, no take-backs. More accurate than "share." |
| Give mode | Copy only (snapshot) | No living link; drift is fine because nothing promised sync. Reference = OurChef. |
| "Give all" meaning | One-time BULK COPY of current meals | NOT a standing arrangement. "Future meals sync too" is a subscription = reference = OurChef. Snapshot keeps copy honest. |
| Does a given meal land silently? | NO — receiving household ACCEPTS first (the "doorbell") | Shared list is sacred; "I knocked, would you like them?" not "I pushed meals into your house." Scales past family — Mom accepts all, a near-stranger reviews first. |
| Batch accept UX | Batch, pre-checked, uncheckable | One tap for the trusting case (Dan→family); granular cherry-pick when wanted. |
| Name collision on accept | Bring in as "{name} (from {giver})" | Blocking is paternalistic; silent duplicate is confusing. Nobody loses a meal. |
| Thank-you moment | Optional, offered ONCE at accept | "✓ Added to your meals. Send Dan a thank you?" Reinforces relationships-not-recipes. Must be frictionless and never nag — offered once, then gone. |
| created_by on the copy | PRESERVE original author | created_by answers "who first created this"; household_id answers "who owns this version." Different concepts, both stored. Feeds OurChef lineage. |

---

## New table

### `meal_shares` (pending offer — the doorbell)
```
id                    uuid primary key default gen_random_uuid()
meal_id               uuid references meals(id) not null   -- the SOURCE meal being offered
from_household_id     uuid references households(id) not null
to_household_id       uuid references households(id) not null
shared_by             uuid references users(id) not null    -- the person who initiated
status                text default 'pending' check (status in ('pending','accepted','declined'))
created_at            timestamptz default now()
resolved_at           timestamptz
```
- One row per (meal offered → household). "Share all 12" creates 12 pending rows in one action.
- The COPY does NOT happen at share time. It happens at ACCEPT time (see flow).
- A pending share holds a REFERENCE to the source meal only long enough to copy it on accept —
  it is not itself the meal. If the source meal is deleted before acceptance, the pending share
  should be treated as stale/void (OPEN: hard-delete the pending row, or mark void? — see below).

---

## Flow

### Give (giver side)
1. Dan picks a meal (or "give all") + a destination household he can give to.
2. For each meal, INSERT a `meal_shares` row: status='pending', from/to households, shared_by=Dan.
3. Nothing is copied yet. No change to the destination household's meals.

### Receive + accept (recipient side)
1. Receiving household sees a pending-gifts surface: "Dan gave you 2 meals — review?"
2. Batch view: all offered meals listed, PRE-CHECKED, each uncheckable.
3. On accept (of the checked subset), FOR EACH accepted meal:
   a. Run the copy engine (SPEC_meals_model.md): duplicate meal + meal_ingredients into
      to_household_id. Copy — independent, editable, no live link.
   b. PRESERVE created_by (original author) on the copy.
   c. WRITE lineage breadcrumb on the copy: copied_from_meal_id = source meal,
      copied_from_household_id = from_household, copied_at = now().
   d. NAME COLLISION: if to_household already has a live meal with the same name, the copy's
      name becomes "{name} (from {giver_display_name})".
   e. Set that `meal_shares` row status='accepted', resolved_at=now().
4. Unchecked / declined meals: set status='declined', resolved_at=now(). Nothing copied.
5. **Thank-you moment** (after accept): show once — "✓ Added to your meals. Send Dan a thank
   you?" Frictionless, skippable, offered ONCE then gone. Never nag. (Delivery channel for the
   thank-you: OPEN — see below.) Reinforces the point of the feature: relationships, not recipes.

### Copied meal ownership + lineage breadcrumb
- The copy is OWNED by the receiving household (household_id = to_household_id).
- `created_by` on the COPY: **PRESERVE the original author** (decision locked). The meal
  originated with them philosophically. created_by = "who first created this"; household_id =
  "who owns this version." Two different concepts, both true, no conflict. Feeds OurChef lineage.
- **Lineage metadata on the copy (NEW — from review feedback, upgrades the design):**
  ```
  copied_from_meal_id       uuid references meals(id)        -- the source meal this descends from
  copied_from_household_id  uuid references households(id)   -- where it came from
  copied_at                 timestamptz                      -- when the copy was made
  ```
  WHY this is on the MEAL, not just in `meal_shares`: the `meal_shares` row records a
  TRANSACTION (offered → accepted); these three fields record LINEAGE (this meal descends from
  that meal). Lineage survives things the transaction doesn't — if a share row is ever archived,
  or a meal is copied by some future non-share path, the breadcrumb still answers "where did this
  come from." Receipt vs. family tree.
  STRICTLY FOR PROVENANCE — NEVER for synchronization, NEVER read at edit time. Purely a
  backward pointer. Unlocks future OurChef-lineage stories at near-zero cost now:
  "meals I've given," "who first taught me this," "this recipe has spread to 37 kitchens."
  Same cheap-seam logic as preserving created_by.

### The accepted copy is a fully editable, independent meal
Once accepted, the copy is a NORMAL meal owned by the receiving household. Everything is
editable — name, ingredients, quantities, and the displayed attribution ("from Dan") — because
copy-not-reference means there is no live link back to the source to protect. Nothing is locked.

TWO KINDS OF "where it came from" — they behave differently, do not conflate:
- **Displayed attribution** (the "(from Dan)" label / "from Dan's kitchen" note on the card):
  EDITABLE. It's text on a meal the household owns. They can rename, relabel, or strip it.
- **Share history** (the `meal_shares` row: "Dan offered X to Sacandaga on {date}, accepted"):
  IMMUTABLE. It's a true record of a past event. Editing the copy must NOT rewrite it. This
  ledger is also the thread OurChef later uses to show where a person's recipes traveled.
The label serves the owning household; the ledger serves the truth of what happened.

The displayed name is FREE TEXT and makes NO promise of matching the ledger. It may credit
people who are NOT in the share history. Example: Dan accepts meatballs from Cassie (Cassie is
in the ledger), then refactors the recipe with Elly (Elly made an EDIT inside the owning
household — she never shared anything, so she is NOT in the ledger), and names the result
"Elly and Cassie's meatballs." This is correct and fully supported. Do NOT derive the name from
provenance, validate the name against the ledger, auto-suggest names from the sharer, or warn on
divergence — the household names its own food. "Don't force things on users."

FUTURE / OurChef concern (noted, NOT solved here): as an edited copy diverges, a kept "from Dan"
label can misattribute the household's own work to Dan. Fine between trusting family; a real
attribution-integrity problem once sharing crosses beyond trust and into marketplace stakes.
That's an OurChef problem — do not build attribution-truthfulness enforcement in OurProvisions.


---

## RLS

- `meal_shares`: sender (from_household member) can INSERT and see their sent shares;
  recipient (to_household member) can SELECT pending shares addressed to them and UPDATE
  status to accepted/declined. Identity claim `auth.jwt()->>'sub'` — NEVER auth.uid().
- The accept-time copy itself is governed by the copy engine's RLS (write requires membership
  in destination household — which the accepting user has by definition).
- Migration number assigned at point-of-build.
- LIVE RLS TEST required post-merge: prove a non-member of to_household cannot accept a share,
  and a non-member of from_household cannot offer one. SQL editor bypasses RLS — only the
  running app proves policies work.

---

## OPEN QUESTIONS (do not invent resolution)

1. **RESOLVED — created_by on the copy = preserve original author.** (Was open; closed by
   review feedback + this session. See ownership section.)
2. **Stale pending gift.** If the source meal is deleted while a gift is pending, hard-delete
   the pending row or mark it void with a reason? Affects what the recipient sees.
3. **Re-giving / duplicate offers.** Dan gives "meatballs" to Sacandaga twice (forgot he already
   did). Block a second pending row for the same (meal, to_household) while one is pending?
   Recommend yes — a partial unique index on (meal_id, to_household_id) WHERE status='pending'.
   Confirm before build.
4. **Who can give?** Any member of from_household, or only the meal's author? Recommend any
   member (household owns the meal). Confirm.
5. **Thank-you delivery channel.** The "Send Dan a thank you?" beat — where does the thank-you
   GO? Options: in-app notification to the giver, an email, or (simplest first pass) a pre-filled
   share-sheet message the recipient sends however they like. Recommend deferring the channel and
   shipping the accept flow first; the prompt can be stubbed. NEEDS DECISION before the thank-you
   is actually wired.

---

## UX notes (not blocking, but capture)

- **"Give to..." with household cards** (from review feedback). Instead of a plain destination
  picker, present the target households as cards — 🏠 Madbury, 🏠 Sacandaga, 🏠 Charlie — so the
  act feels like handing someone a recipe card. Very Velayo. UI polish, not a model change.
- **Ledger stays nearly hidden.** The immutable share history is architecturally load-bearing
  but should barely surface in UI. Show at most "Originally from Dan's kitchen"; the dated
  transaction detail (accepted July 28, 8:31 PM) is for developers and future OurChef, not the
  card. Normal people don't care; the UI shouldn't either.

---

## Explicitly OUT of scope (belongs elsewhere)

- **Live/reference sharing** (evolving recipe syncs to all households) → OurChef. See
  SPEC_meals_model.md.
- **Giving to a non-household context** (e.g. the Hamptons rental event) → Context model
  session. No event context exists yet to give into.
- **Standing "give everything forever" arrangement** → that's a subscription = reference = OurChef.
- **People-not-households ownership** ("show me everything grandma ever cooked") → the review
  rightly gestures at this; it is the Context model + OurChef lineage, already reserved for its
  own session. The `created_by` + lineage breadcrumb seams keep it POSSIBLE. Do not pull it into
  this build.
