// Run: CI=true npx react-scripts test --watchAll=false src/lib/importBanner
import { countFlaggedRows, bannerCheckLine } from "./importBanner";

const row = (id, check = null) => ({ catalog_item_id: id, name: id, quantity_per_serving: 1, check });

test("0 flags → Check it over.", () => {
  expect(countFlaggedRows([row("a"), row("b")])).toBe(0);
  expect(bannerCheckLine(0)).toBe("Check it over.");
  expect(countFlaggedRows([])).toBe(0);
  expect(countFlaggedRows(null)).toBe(0);
});

test("1 flag → 1 thing to check.", () => {
  const rows = [row("a"), row("sumac", "Couldn't read the amount")];
  expect(countFlaggedRows(rows)).toBe(1);
  expect(bannerCheckLine(countFlaggedRows(rows))).toBe("1 thing to check.");
});

test("2 flags → 2 things to check.", () => {
  const rows = [row("sumac", "Couldn't read the amount"), row("lime", "Check this line"), row("salt")];
  expect(countFlaggedRows(rows)).toBe(2);
  expect(bannerCheckLine(countFlaggedRows(rows))).toBe("2 things to check.");
});

test("clearing one flag drops the count; clearing the last falls back to Check it over.", () => {
  let rows = [row("sumac", "Couldn't read the amount"), row("lime", "Check this line")];
  // the sheet's row edits set check: null — the same shape setQty / shelve / needAgain produce
  rows = rows.map((r) => (r.catalog_item_id === "sumac" ? { ...r, quantity_per_serving: 2, check: null } : r));
  expect(bannerCheckLine(countFlaggedRows(rows))).toBe("1 thing to check.");
  rows = rows.map((r) => (r.catalog_item_id === "lime" ? { ...r, on_hand: true, check: null } : r));
  expect(bannerCheckLine(countFlaggedRows(rows))).toBe("Check it over.");
});

test("never '0 things to check.', and odd inputs read as zero", () => {
  for (const v of [0, -1, null, undefined, NaN, ""]) expect(bannerCheckLine(v)).toBe("Check it over.");
  expect(countFlaggedRows([row("a", "")])).toBe(0);   // an empty reason is no chip
});
