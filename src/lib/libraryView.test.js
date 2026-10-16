// Run: CI=true npx react-scripts test --watchAll=false src/lib/libraryView
import { resolveLibraryView, otherView, TOGGLE_LABEL, LIBRARY_VIEW_KEY, LIST_FROM_STEP, readStoredView, writeStoredView } from "./libraryView";

test("the default follows text size: Compact / Default → grid, Large / XL / XXL → list (D9)", () => {
  expect(resolveLibraryView(null, 0)).toBe("grid");
  expect(resolveLibraryView(null, 1)).toBe("grid");
  expect(resolveLibraryView(null, 2)).toBe("list");
  expect(resolveLibraryView(null, 3)).toBe("list");
  expect(resolveLibraryView(null, 4)).toBe("list");
  expect(LIST_FROM_STEP).toBe(2);
});

test("a stored choice wins over the text step, both ways", () => {
  expect(resolveLibraryView("grid", 4)).toBe("grid");
  expect(resolveLibraryView("list", 0)).toBe("list");
});

test("an unknown stored value is treated as absent", () => {
  expect(resolveLibraryView("masonry", 1)).toBe("grid");
  expect(resolveLibraryView("", 3)).toBe("list");
  expect(resolveLibraryView(undefined, undefined)).toBe("grid");
});

test("the toggle flips and names the view you'd switch TO (D8)", () => {
  expect(otherView("grid")).toBe("list");
  expect(otherView("list")).toBe("grid");
  expect(TOGGLE_LABEL.grid).toBe("Show as list");
  expect(TOGGLE_LABEL.list).toBe("Show as grid");
});

test("the storage key is the spec's and round-trips", () => {
  expect(LIBRARY_VIEW_KEY).toBe("op_meal_library_view");
  localStorage.removeItem(LIBRARY_VIEW_KEY);
  expect(readStoredView()).toBe(null);
  writeStoredView("list");
  expect(localStorage.getItem(LIBRARY_VIEW_KEY)).toBe("list");
  expect(readStoredView()).toBe("list");
  localStorage.setItem(LIBRARY_VIEW_KEY, "nonsense");
  expect(readStoredView()).toBe(null);
  localStorage.removeItem(LIBRARY_VIEW_KEY);
});
