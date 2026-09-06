-- 044_meal_ingredients_on_hand.sql
-- SPEC_meal_ondhand_ingredients.md — three-state meal ingredients.
--
-- The meal sheet had ONE way to handle an unwanted ingredient: delete the row.
-- That collapsed two different intents — "pepper never belongs in pancakes" and
-- "I already have a quart of maple syrup this week" — into one destructive action,
-- throwing away the recipe information needed to add it back later.
--
-- This column is the third state. `on_hand = true` means "part of this meal, skip
-- by default". quantity_per_serving is DELIBERATELY preserved at its real recipe
-- value rather than zeroed: zeroing would destroy the one number needed to add the
-- ingredient back without re-entering it.
--
-- Additive and non-breaking. Every existing row reads false, i.e. behaves exactly
-- as it does today. No backfill needed — NOT NULL DEFAULT false backfills itself.
--
-- This is the seam SPEC_meals_model.md deferred as an `override` column ("olive oil
-- stays at 0") pending the servings dial. Built ahead of the dial because a beta
-- case (Laddy, "World's Best Pancakes", maple syrup) needed it directly. It is
-- orthogonal to base_servings/quantity_per_serving scaling — both read this column,
-- neither blocks the other.

alter table meal_ingredients
  add column on_hand boolean not null default false;

comment on column meal_ingredients.on_hand is
  'true = household already has this; skip it when adding the meal to the list, unless overridden one-time via add_meal_to_list(p_include_on_hand_ids). quantity_per_serving stays at its real recipe value so the ingredient can be added back without re-entry.';
