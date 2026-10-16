# SPEC — Who's cooking + Home's "This week" record (cooks, shopping, shared recipes)

**Scope:** OurProvisions
**Status:** Designed in the design chat 2026-10-13 (Dan, on the phone, travelling). Not built.
Pre-build checks come first.
**Closes:** the "who's cooking" half of ROADMAP's *Recipe attribution, sharing and who's cooking*
row. The sharing half is `SPEC_meal_sharing_v2.md` and attribution is `meals.attribution` (062).
**Builds on:** `meal_placements`, `meal_cooks` + `cook_meal` (058), `SPEC_home_v1_essentials.md`
(the on-deck card), and `SPEC_meal_photos_v1.md` with its 2026-10-13 amendment (photos, 3-star rating).
**Target sentences:** *"Andrew is cooking Phyllis Hoffman's chili."* and afterwards
*"Andrew cooked Phyllis Hoffman's chili ★★★ 📷"*.

---

## Decisions (Dan, 2026-10-13)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Any member can name the cook**, for themselves or for someone else ("Andrew's cooking"), and anyone can change or clear it. | Healthy collaborative tension: any member acts, the household calibrates, and it's reversible and visible. |
| D2 | **The cook belongs to the board meal (placement), not the recipe.** It means "this week's chili", so a re-plan starts with no cook. | Who cooks is a fact about the plan. |
| D3 | **Never guess.** With no cook named, no name is shown anywhere. | The tapper of Cooked it is not necessarily the cook (058 D7). A wrong name is worse than none. |
| D4 | **One member, plus an optional free-text "with".** "Andrew, with Easton". | Kids cook too, without accounts. **Later:** a *child member* (no email) may replace the free text for kids. Not in this build, and the field must not block it. |
| D5 | **The past tense is stamped at Cooked it.** `cook_meal` copies the placement's cook and "with" onto the new `meal_cooks` row in the same transaction, separately from `cooked_by` (the tapper). | The record survives re-plans and cleared placements, and it credits the right person. |
| D6 | **Home gets a household-only "This week" record** under the on-deck card. **Hidden for solo households.** It covers **three kinds of event: cooks, shopping trips, and recipes shared** (given or received). (Dan, 2026-10-13.) | It's the household's own story of the week: who shopped, who cooked, what came and went. Cross-household *feeds* (other kitchens' posts, loves, reactions) stay in the crew-feed spec. A gift is still recorded here, because it's an event of this household's week. |

---

## Data (proposed — confirm against the checks)

Migration number: next free at build. Coordinate with `SPEC_recipe_quantities.md` and the photo
amendment, which also add migrations.

**`meal_placements`** add:
- `cook_user_id uuid null` → `users` **ON DELETE SET NULL**
- `cook_with text null`, trimmed. An empty string saves as NULL. Keep it short: a CHECK on length
  (e.g. ≤ 40) at build.

**`meal_cooks`** add the same pair: `cook_user_id`, `cook_with`. **058's write shape holds:** no new
policy. Only `cook_meal` writes them.

**`cook_meal`** — `CREATE OR REPLACE` to copy `cook_user_id` / `cook_with` from the placement it
closes into the cook row it inserts. Keep the single `v_now`, and keep the NULL-returns-nothing
rule (D3 of 058). **Read the live body (`pg_proc.prosrc`) before editing.**

**Setting the cook** — follow whatever write path `meal_placements` uses today (direct UPDATE under
member RLS, or an RPC). If it's an RPC, add `set_placement_cook(p_placement_id, p_cook_user_id,
p_cook_with)`, membership first, and check that `p_cook_user_id` is a member of the same
household (42501 otherwise). Either way, **the cook must be a current member of the placement's
household.**

**Child member (later):** when it exists, `cook_user_id` can point at it. Nothing here assumes
members have an email.

---

## Display

**Board card / meal sheet (Plan):** a quiet "Who's cooking?" control, showing a member list plus
an optional "with" field. Once set, the line reads **"Andrew is cooking"** or **"Andrew is
cooking, with Easton"**. With no cook set it shows only the control, never a placeholder name.

**Home on-deck card:** when the on-deck meal has a cook, its line becomes
*"Andrew is cooking {meal}"*. When it doesn't, the card is unchanged.

**Home "This week" record** (members > 1 only):
- Cooks from the **last 7 days**, newest first, at most about 5, with "See all" going to Plan.
  This is a lean; settle at build. Use a rolling window, since days aren't dated until Days v2.
- **Cook rows:** **"{cook} cooked {meal}"** (+ ", with {with}"), the rating as stars **only if
  rated**, and the photo thumbnail **only if one exists**. Tapping one opens the meal sheet.
  No cook named → **"Cooked {meal}"**, with no name (D3).
- **Shopping rows:** **"{shopper} shopped at {store}"** with the item count, e.g.
  "Helen shopped at Hannaford · 14 items". Read from the shopping session / wrap-up record, using the
  same facts-only set as the wrap-up bar (items, carried forward, minutes, store). **Never spend,
  prices or item names** on this row; the budget line on Home already owns money. No store known →
  "Helen shopped · 14 items". Demo or test trips flagged by trip qualification are **not** shown.
  Tapping one opens the trip summary if one exists, otherwise nothing.
- **Shared-recipe rows:** received → **"Andrew gave you {meal}"**; given → **"{member} gave {meal}
  to {place}"**. Read from `meal_gifts` / `meal_gift_receipts` (`SPEC_meal_sharing_v2.md`), so they
  **light up only once giving is built**. Reconcile with v2's Phase B Home notice: the notice is the
  actionable line (a gift waiting, 14 days); the record row is the past tense once it's handled.
  Never both for the same gift at once.
- When nothing was cooked this week the section is **hidden**, not empty. No "nothing yet" filler.

**Recipe author in the sentence.** `meals.attribution` is free text ("Grandma Phyllis",
"NYT Cooking", "@burger.world on Instagram"), so a possessive ("Phyllis Hoffman's chili") can't be
built safely from it. **Lean:** the meal name, then the credit as a quiet second line,
"from Grandma Phyllis". The household can always put the possessive in the meal's own name.
Confirm at build with a mockup.

---

## Pre-build checks (Cody, read-only, both environments)

- **P1.** `meal_placements` columns and its write path (direct UPDATE with RLS, or RPC). Report
  the shape.
- **P2.** `cook_meal`'s live body and grants, to be reproduced exactly with the two added columns.
- **P3.** How Home today decides "solo" (`householdMembers.length`, the same driver as the Earned-Our
  wordmark). Reuse it.
- **P4.** Where `SPEC_home_v1_essentials.md` stands (built, or spec only), so the record lands in
  the right place.
- **P5.** The shopping-trip source: the table holding a closed trip's shopper, store, item count and
  qualification flag (demo vs real). Report its name and fields.
- **P6.** Build state of `meal_gifts` / `meal_gift_receipts`. If unbuilt, ship the record with cook
  and shopping rows only.

---

## Verification (dev, two accounts, real auth)

1. DH names DT as cook on a board meal → both devices show "DT is cooking …" on Plan and on the
   Home on-deck card.
2. Add "with Easton" → the line reads ", with Easton". Clear the field → it's gone, saved as NULL,
   not ''.
3. DT taps Cooked it on a meal DH is cooking → the cook row has `cooked_by` = DT and
   `cook_user_id` = DH, and Home reads "DH cooked …".
4. A meal cooked with no cook named → Home reads "Cooked …", with no name.
5. A rated cook with a photo shows stars and a thumbnail. An unrated one with no photo shows neither.
6. A solo household never sees "This week". A household with no events this week doesn't see it either.
6a. A real trip shows "{shopper} shopped at {store} · N items", with no spend and no item names. A
    demo trip doesn't appear.
6b. (If giving is built) a handled gift shows once as a past-tense row and never alongside its pending notice.
7. Naming a non-member as cook fails (42501 or the RLS check). A non-member can't set any cook.
8. Re-plan the same meal → the new placement starts with no cook, and the old cook record keeps its name.
9. The deleted-member path: the user row goes → `cook_user_id` becomes NULL, and Home falls back to "Cooked …".
10. Harnessed at 320 / 375 / 390, Default and XXL. ESLint and `CI=true` clean. RUM allow-list
    delta reported by name (fixed copy only; meal names, cook names and "with" text are never allow-listed).

---

## Out of scope

Child members (later; D4 keeps the seam); the crew feed and anything crossing households; the
"loop of care" note to a recipe's giver (Harbour scale); notifications ("Andrew is cooking
tonight"); scheduling by date (Days v2); multiple member cooks per meal.
