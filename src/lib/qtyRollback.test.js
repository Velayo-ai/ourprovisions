import { rollbackQty } from "./qtyRollback";

const rows = [{ id: "r1", catalogItemId: "c1", quantity: 2 }];

test("a live row goes back to the server's last quantity, not to 0", () => {
  expect(rollbackQty({ r1: 5, r2: 1 }, "r1", rows)).toEqual({ r1: 2, r2: 1 });
});

test("a row that was never on the list loses its placeholder (reads 0 again)", () => {
  expect(rollbackQty({ "pre:c9": 1, r1: 2 }, "pre:c9", rows)).toEqual({ r1: 2 });
});

test("a failed remove (qty 0) brings the row's quantity back", () => {
  expect(rollbackQty({ r1: 0 }, "r1", rows)).toEqual({ r1: 2 });
});

test("no key, or nothing set under it: state unchanged", () => {
  const prev = { r1: 2 };
  expect(rollbackQty(prev, null, rows)).toBe(prev);
  expect(rollbackQty(prev, "pre:c4", rows)).toBe(prev);
});
