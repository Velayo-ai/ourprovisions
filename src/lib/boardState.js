// A board card's state, lifted VERBATIM out of App.js (2026-10-19,
// SPEC_recipe_view Amendment B, R5) so the board, Home's on-deck card, the
// library's stages and the recipe view import ONE derivation and jest can
// prove them against each other. No logic change in the move.

export const isNoShop = (m) => !!m?.kind && m.kind !== "meal";

export const NO_SHOP_LABELS = { leftovers: "Leftovers", out: "Eating out", other: "Something else" };
export const noShopLabel = (m) => NO_SHOP_LABELS[m?.kind] || "Something else";
// A no-shop row's free text is meals.name; a blank name stored the label, so
// "given" means "differs from the label".
export const noShopName = (m) => (m?.name && m.name !== noShopLabel(m) ? m.name : "");

export function leftoversLine(m, mealById) {
  const names = (m?.from_meal_ids || []).map((id) => mealById?.[id]?.name).filter(Boolean);
  if (names.length === 0) return "";
  if (names.length <= 2) return `From ${names.join(", ")}`;
  return `From ${names[0]}, ${names[1]} + ${names.length - 2}`;
}

// A CARD'S STATE — one derivation, two renderers: the board and Home's on-deck
// card (SPEC_home_v1_essentials D3: Home and Plan must never describe the same
// meal differently, so any state change lands here and nowhere else). Pure:
// the meal plus the board's inputs → the flags, the chip, the title and the
// status line exactly as the board has always computed them inline.
//   cooked   in cookedIds — cooked THIS load, muted in place (no line)
//   noShop   kind ≠ meal — title by kind, one context line, never a state
//   ready    placement.readyAt — "Everything's in — go cook"
//   planned  no live rows — "Not on the list yet" (canAdd) / "Nothing to shop for"
//   toBuy    ≥ 1 live row — "N to buy" / "B of N in cart"
export function boardCardState(m, { placements, rows, mealById, cookedIds }) {
  const noShop = isNoShop(m);
  const cooked = !!cookedIds?.has(m.id);
  const ready = !noShop && !cooked && !!placements?.[m.id]?.readyAt;
  const rc = rows?.[m.id] || { total: 0, bought: 0 };
  const planned = !noShop && !cooked && !ready && rc.total === 0;
  const toBuy = !noShop && !cooked && !ready && rc.total > 0;
  // A planned meal with no ingredients has nothing to add — no Add to Shop;
  // on the board its exit is Cooked it (⋯) or Remove. Add all skips it the same way.
  const canAdd = planned && (m.meal_ingredients || []).length > 0;
  // A state chip shows only while the state is INCOMPLETE (Planned, To buy).
  // Ready is carried by the banner and the teal button; no READY chip.
  const chip = toBuy ? "To buy" : planned ? "Planned" : null;
  let title = m.name;
  let line;
  if (cooked) {
    line = "";
  } else if (noShop) {
    // Name + the one context line; no filler when there is none.
    title = m.kind === "other" ? (noShopName(m) || "Something else") : noShopLabel(m);
    line = m.kind === "leftovers" ? leftoversLine(m, mealById)
      : m.kind === "out" ? noShopName(m)
      : "";
  } else if (ready) {
    line = "Everything's in — go cook";
  } else if (planned) {
    line = canAdd ? "Not on the list yet" : "Nothing to shop for";
  } else {
    line = rc.bought > 0 ? `${rc.bought} of ${rc.total} in cart` : `${rc.total} to buy`;
  }
  return { noShop, cooked, ready, planned, toBuy, canAdd, rc, chip, title, line };
}
