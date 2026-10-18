// Library view — grid or list (SPEC_meal_library_visual_v2 D8–D9).
//
// The default FOLLOWS TEXT SIZE: at Large and above (stored step index ≥ 2) the
// library is a list, below that a grid — Large text is where two columns fail.
// The toggle OVERRIDES it: once tapped, the choice is stored and wins over any
// later text-size change. Device-local, like text size itself (Text Size D8):
// localStorage.op_meal_library_view = 'grid' | 'list'; absent = derived.
// Pure resolver here (jest beside it); the React hook lives in App.js.
export const LIBRARY_VIEW_KEY = "op_meal_library_view";
export const LIST_FROM_STEP = 2;          // Large, XL, XXL → list by default
export const VIEWS = ["grid", "list"];

export function resolveLibraryView(stored, textStep) {
  if (stored === "grid" || stored === "list") return stored;
  return Number.isInteger(textStep) && textStep >= LIST_FROM_STEP ? "list" : "grid";
}

export function otherView(view) {
  return view === "list" ? "grid" : "list";
}

// The toggle shows the view you'd switch TO and names the action (D8).
export const TOGGLE_LABEL = { grid: "Show as list", list: "Show as grid" };

export function readStoredView() {
  try {
    const v = localStorage.getItem(LIBRARY_VIEW_KEY);
    return v === "grid" || v === "list" ? v : null;
  } catch { return null; }
}

export function writeStoredView(view) {
  try { localStorage.setItem(LIBRARY_VIEW_KEY, view); } catch { /* storage unavailable: the choice lives for this session only */ }
}
