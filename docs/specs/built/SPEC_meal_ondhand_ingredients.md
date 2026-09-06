# SPEC — Meal on-hand ingredients (three-state ingredients + re-offer on Add)

**Scope:** OurProvisions
**Status:** Design approved, not built
**Session decision date:** 2026-09-05
**Author:** Design-chat Claude → for Claude Code

---

## Why this exists

The meal sheet currently has one way to handle an unwanted ingredient: delete the row.
That collapses two genuinely different intents into one action. "AI put pepper in my
pancakes, I will never want pepper in pancakes" and "AI put maple syrup in my pancakes,
I have a full quart right now and don't need more this week" are not the same statement,
but today they're both forced through delete — which means the second case silently
throws away real recipe information (the meal now looks like it doesn't call for syrup
at all), and there's no way back to "actually, add it this time" short of re-editing
the meal from scratch every time you happen to run low.

This spec gives the meal sheet a real distinction between "not part of this meal" and
"part of this meal, skip by default," and makes the skip reversible on a per-Add basis
without ever mutating the meal's own settings.

Traced back to an existing seam: `SPEC_meals_model.md` deliberately deferred an
`override` column — "olive oil stays at 0" — until the servings dial existed. This
spec is that seam, built now, ahead of the dial, because a concrete beta-testing case
(Laddy: "World's Best Pancakes," maple syrup) surfaced the need directly. It also
answers the open "Meals staple ingredients" backlog item's two standing questions
(Plan card ingredient count, Edit Meal sheet treatment) rather than leaving them open.

---

## Decisions locked this session

| Decision | Choice | Rationale |
|---|---|---|
| How many ingredient states does the meal sheet need? | Three: **removed**, **on-hand**, **normal** | Collapsing "never want it" and "skip for now" into one delete action was the original bug. They need different storage (one destroys the row, one preserves it) and different recoverability (one is gone, one is one tap from coming back). |
| "Removed" | Row doesn't exist in `meal_ingredients` at all | Unchanged from today's delete-row behavior. Right tool for "will never want this in this recipe." |
| "On-hand" | `meal_ingredients.on_hand = true`, `quantity_per_serving` **preserved at its real recipe value**, never zeroed | Zeroing the quantity to mean "skip" would destroy the one piece of information (how much the recipe actually calls for) needed to add it back later without asking you to re-enter a number you already gave the AI once. |
| "Normal" | `on_hand = false` (default) | Existing behavior, unchanged. |
| New column | `meal_ingredients.on_hand boolean not null default false` | Minimal, additive migration. No existing row's meaning changes — every current ingredient is `on_hand = false` by default, i.e. behaves exactly as it does today. |
| Meal-sheet interaction | Stepper's "−" at quantity 1 moves the row to on-hand (shown distinctly, e.g. grayed with an "On hand" label) instead of deleting it. X / swipe-delete remains the separate, explicit "remove entirely" action. | Reusing the stepper floor as a proxy for delete was the original conflation. Splitting the gesture makes both intents reachable without adding a fourth control. |
| `add_meal_to_list` behavior | Skip the `list_items` upsert and `list_item_meals` join insert for any ingredient where `on_hand = true`, **unless** that ingredient's id is in a new optional include-anyway list passed to the call | Preserves the common case (nothing on-hand → no change in behavior, no new friction) while making the override a one-time parameter, not a persisted state change. |
| Client prompt on Add | If the meal being added has ≥1 `on_hand` ingredient, show a prompt naming them **before** calling `add_meal_to_list`, with three choices per session (see below) | Only fires when relevant — a meal with no on-hand ingredients adds exactly as it does today, zero added friction for the common case. |
| Prompt choices | **Include this time** (adds at real quantity, one-time only, `on_hand` stays `true` for next Add) / **Skip** (doesn't add, meal unchanged) / **Remove from this meal** (deletes the `meal_ingredients` row entirely, same effect as Edit Meal's delete) | Three-way, not two: someone who's declined the same ingredient repeatedly needs a way to act on that signal right there, not by separately reopening Edit Meal. "Remove" here is not new logic — it's the existing delete-row action, just reachable from the point where the decision becomes obvious. |
| Confirmation on "Remove" from the prompt | None | Confirmed this session — "it's just an ingredient." The prompt itself is already a deliberate choice among three options, not a stray tap; a second confirmation is friction without a corresponding safety benefit. Consistent with meal-sheet delete already being a lightweight action (unlike household/meal-level delete, which do carry deliberate friction elsewhere in the app). |
| Plan card ingredient count | **OPEN — not decided this session** | Does "6 ingredients" count on-hand items or only ones that will actually land on the list? These diverge for the first time once on-hand exists. Needs its own short decision before build; flagged here so it isn't silently assumed either way. |
| Edit Meal sheet display of on-hand rows | **OPEN — not decided this session** | Visual treatment only (label text, color, icon) — the underlying interaction (stepper-down → on-hand, X → removed) is decided above. Cosmetic decision, safe to make at build time or in a quick follow-up, not blocking. |

---

## Schema change

### `meal_ingredients` — add column

```sql
alter table meal_ingredients
  add column on_hand boolean not null default false;
```

Additive, non-breaking: every existing row reads as `on_hand = false`, meaning every
currently-live meal continues to add every one of its ingredients exactly as it does
today. No backfill needed, no behavior change for existing data.

---

## RPC change: `add_meal_to_list`

**Signature change:** add an optional parameter, e.g. `p_include_on_hand_ids uuid[]
default '{}'`.

**New logic per `meal_ingredient` row:**
1. If `on_hand = false` → behave exactly as today (unconditional upsert + join row).
2. If `on_hand = true` and the ingredient's `catalog_item_id` is **not** in
   `p_include_on_hand_ids` → skip entirely. No `list_items` upsert, no
   `list_item_meals` join row.
3. If `on_hand = true` and the ingredient's `catalog_item_id` **is** in
   `p_include_on_hand_ids` → behave exactly as today (upsert at the real
   `quantity_per_serving`, join row inserted). `on_hand` on the `meal_ingredients`
   row is **not** modified by this call — the override is one-time, scoped to this
   single Add, not a change to the meal's own settings.

---

## Client flow: Add Meal

1. Before calling `addMealToList`, check the meal's ingredients (already in memory
   from `fetchMeals`/`loadMeals`) for any with `on_hand = true`.
2. **None found** → call `addMealToList` exactly as today. No new UI, no added step.
3. **One or more found** → show a prompt naming them: *"This meal has ingredients you
   have on hand: [names]. Include any of these this time?"* Each named ingredient
   gets its own three-way choice (Include this time / Skip / Remove from this meal).
4. Resolve the choices:
   - Any "Remove from this meal" selections → delete those `meal_ingredients` rows
     first (existing delete-row path, reused).
   - Collect the "Include this time" ids into `p_include_on_hand_ids`.
   - Call `addMealToList` with that list. Anything left as "Skip" or already removed
     is excluded per the RPC logic above.

---

## Meal-sheet interaction (create/edit)

> ### ⚠️ BUILD-TIME CORRECTION 2026-09-06 — the stepper-floor trigger below was WRONG
>
> The bullet immediately following ("stepper at quantity 1, tap −") was built as
> written, then **found broken in live testing and replaced**. Do not reinstate it.
>
> **Why it fails:** it looks free, because at quantity 1 the "−" was already a dead
> end. But *reaching* quantity 1 is not free. An ingredient at quantity 2 — the AI
> suggests these constantly, e.g. "Bananas × 2" — can only reach the trigger by
> decrementing 2 → 1 first, and **that decrement is a real quantity edit**. The row
> then shelves at 1. The original 2 is gone.
>
> That silently destroys **this spec's central guarantee**: `quantity_per_serving`
> preserved at its real recipe value so coming back is one tap rather than
> re-entering a number the user already gave once. The `on_hand` column (044) and the
> RPC (045) were correct throughout — **the interaction path was the only thing
> losing the number**, which is exactly why it survived schema and RPC verification
> and only surfaced when someone shelved a real 2-quantity ingredient by hand.
>
> **What replaced it:** a distinct per-row **"I have this"** control, separate from
> the stepper. It shelves at whatever quantity is showing **at the moment it is
> tapped** — no decrements involved, reachable at any value. The stepper's "−"/"+"
> are plain arithmetic again at every value, 1 included. "Need it" is unchanged.
>
> **The general lesson, worth more than this instance:** an overloaded control is
> only free if reaching its trigger state is free. Here the cost of reaching the
> trigger *was* the data the feature existed to protect. Reusing a dead-end gesture
> will keep looking like the simpler option in future readings of this file — it is
> not, and the number it costs is the whole point of the feature.

- ~~Stepper at quantity 1, tap "−" → row becomes on-hand~~ **— SUPERSEDED, see the
  correction above. Built as "I have this", a control of its own.** Original text:
  Stepper at quantity 1, tap "−" → row becomes on-hand: `on_hand = true`,
  `quantity_per_serving` unchanged, row visually distinct (exact treatment: open,
  see above).
- On-hand row, tap "+" (or equivalent "make needed again" control) → `on_hand =
  false`, row returns to normal stepper display. Quantity was never touched, so
  this is a clean round-trip.
- X / swipe-delete on any row (normal or on-hand) → row removed from
  `meal_ingredients` entirely. Unchanged from today.

---

## Open questions (must resolve before or during build)

1. **Plan card ingredient count** — total recipe ingredients vs. "items this Add
   will actually put on your list." These are now genuinely different numbers for
   any meal with an on-hand ingredient.
2. **Edit Meal visual treatment for on-hand rows** — label text, color/greying,
   icon. Cosmetic; does not block the interaction logic above.
3. **Meal where every ingredient is on-hand** — does "Add" still make sense as a
   button, or does it need different framing (e.g. all-skip-by-default meals
   effectively never populate the list unless every item is overridden)? Not
   raised as a blocker, but worth a conscious answer rather than an accidental one.

---

## Out of scope (explicitly not this spec)

- The servings dial / scaling math. `on_hand` is orthogonal to `base_servings` and
  `quantity_per_serving` scaling — both features read the same column, neither
  blocks the other.
- Any change to the defer-catalog-write behavior (separate spec, same session,
  different problem: that one is about *when* a catalog row gets created, this one
  is about whether a meal ingredient contributes to the list at all).
