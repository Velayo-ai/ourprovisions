import { liveTiles } from "./askRun";

// Asks in Browse (SPEC_ask_slice2 C3; rulings K4, K5, D-b, D-c, D-e). Pure rules for the rail's
// ask pills, the ask sections and the filter line, kept out of App.js so each has a test beside it.
//
// An ask is NOT a category (K5): its selection is its own set of ask ids, never mixed into
// selectedCategories, so the category code keeps its meaning. An ask's section is its own block,
// keyed by ask id, in the shelf's order (D-b); it never joins the flat A–Z list.

// The selected asks' sections, in rail order (oldest ask first). Each tile is one of the shelf's
// LIVE tiles (S4-9, liveTiles: from the shelf rows, never from Browse's list — a tile this person
// hid still shows here, because the shelf is the household's), priced later from its REAL aisle
// (D-c): rawCategory is the category the item is filed under in Browse, else the item's own.
export function askBlocks(asks, selectedAskIds, rawCategoryByName) {
  return (asks || [])
    .filter((a) => selectedAskIds.has(a.id))
    .map((a) => ({
      id: a.id,
      label: a.label,
      items: liveTiles(a).map((t) => ({ id: t.id, name: t.name, rawCategory: rawCategoryByName.get(t.name) ?? t.category ?? null })),
    }));
}

// Whether the category sections show beside the ask sections. Pills of different kinds add up:
// with ONLY asks selected, only their blocks show (D-b); Staples or a category pill brings the
// category part back, narrowed as it always was. Staples never narrows an ask's shelf (K4).
export function categoryPartShown({ stapleFilter, categoriesActive, asksActive }) {
  return !asksActive || stapleFilter || categoriesActive;
}

// The live filters, for "N filters active · filters hidden" (D-e: asks really filter now).
export function browseFilterCount({ stapleFilter, selectedCategoryCount, askBlockCount }) {
  return (stapleFilter ? 1 : 0) + selectedCategoryCount + askBlockCount;
}

// "Showing only …" — names the active filter set in rail order (Staples, the asks, then the
// categories) and counts the DISTINCT items on screen (Dan, 2026-11-07): an item shown in its ask's
// block and in its own aisle is one item, not two rows. An ask's name is { ask: label }: the
// caller renders it inside .op-name (K3). null when nothing filters.
//   shownCats         categories that survive the selection (displayCategories ∩ selected)
//   displayCategories the category part after Staples and the category pills
export function browseFilterDescriptor({ stapleFilter, shownCats, displayCategories, blocks, categoryRailLabel }) {
  const categoriesActive = shownCats.length > 0;
  const asksActive = blocks.length > 0;
  if (!stapleFilter && !categoriesActive && !asksActive) return null;
  const catPart = categoryPartShown({ stapleFilter, categoriesActive, asksActive })
    ? (categoriesActive ? shownCats : displayCategories)
    : [];
  return {
    names: [
      ...(stapleFilter ? ["Staples"] : []),
      ...blocks.map((b) => ({ ask: b.label })),
      ...catPart.map((cat) => categoryRailLabel(cat.rawName)),
    ],
    count: new Set([
      ...catPart.flatMap((cat) => cat.items.map((i) => i.name)),
      ...blocks.flatMap((b) => b.items.map((i) => i.name)),
    ]).size,
  };
}
