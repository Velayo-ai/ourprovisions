// Asks in Browse (SPEC_ask_slice2 C3; rulings K4, K5, D-b, D-c, D-e). Pure rules for the rail's
// ask pills, the ask sections and the filter line, kept out of App.js so each has a test beside it.
//
// An ask is NOT a category (K5): its selection is its own set of ask ids, never mixed into
// selectedCategories, so the category code keeps its meaning. An ask's section is its own block,
// keyed by ask id, in the shelf's order (D-b); it never joins the flat A–Z list.

// The selected asks' sections, in rail order (oldest ask first). Each tile is the catalog item the
// shelf names, priced later from its REAL aisle (D-c): rawCategory comes from the category the
// item is filed under in Browse, never from the ask. A tile whose item is not in this person's
// Browse (deleted, or hidden by them — Hide is a browse-layer preference) is left out here; the
// shelf itself is untouched.
export function askBlocks(asks, selectedAskIds, catalogById, rawCategoryByName) {
  return (asks || [])
    .filter((a) => selectedAskIds.has(a.id))
    .map((a) => ({
      id: a.id,
      label: a.label,
      items: (a.itemIds || [])
        .map((id) => catalogById.get(id))
        .filter((item) => item && rawCategoryByName.has(item.name))
        .map((item) => ({ name: item.name, rawCategory: rawCategoryByName.get(item.name) })),
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
// categories) and counts the rows actually rendered, so the number and the names can never
// disagree. An ask's name is { ask: label }: the caller renders it inside .op-name (K3). null when
// nothing filters.
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
    count: catPart.reduce((total, cat) => total + cat.items.length, 0)
      + blocks.reduce((total, b) => total + b.items.length, 0),
  };
}
