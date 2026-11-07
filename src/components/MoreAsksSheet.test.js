/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   .op-name around every label, and no label in any attribute, are the rules under test, read as
   raw DOM. */
import { render, screen, fireEvent } from "@testing-library/react";
import { MoreAsksSheet } from "./MoreAsksSheet";

// "+N more" (SPEC_ask_slice2 C4.2): the asks past the rail's two pills, then "+ New shelf".
const ASKS = [{ id: "a4", label: "Bo" }, { id: "a1", label: "Easton" }];

function setup({ selected = [], onNewShelf = jest.fn() } = {}) {
  const onToggle = jest.fn();
  const view = render(<MoreAsksSheet asks={ASKS} selectedAsks={new Set(selected)} onToggle={onToggle} onNewShelf={onNewShelf} />);
  return { onToggle, onNewShelf, container: view.container };
}

test("lists the rest in the order given, labels in .op-name, '+ New shelf' at the bottom", () => {
  const { container } = setup();
  const rows = screen.getAllByRole("button");
  expect(rows.map((b) => b.textContent)).toEqual(["🧺Ask Bo", "🧺Ask Easton", "+New shelf"]);
  expect([...container.querySelectorAll(".op-name")].map((n) => n.textContent)).toEqual(["Bo", "Easton"]);
  const attrs = [...container.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.value));
  expect(attrs.filter((v) => /Bo\b|Easton/.test(v))).toEqual([]);
});

test("a row toggles its ask like the pill does; aria-pressed shows which are on", () => {
  const { onToggle } = setup({ selected: ["a1"] });
  expect(screen.getByRole("button", { name: /Ask Easton/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Ask Bo/ })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: /Ask Bo/ }));
  expect(onToggle).toHaveBeenCalledWith("a4");
});

test("'+ New shelf' opens the new-shelf flow; without it there is no such row", () => {
  const { onNewShelf } = setup();
  fireEvent.click(screen.getByRole("button", { name: /New shelf/ }));
  expect(onNewShelf).toHaveBeenCalledTimes(1);
});

test("no New shelf row when this person can't make one", () => {
  render(<MoreAsksSheet asks={ASKS} selectedAsks={new Set()} onToggle={() => {}} onNewShelf={null} />);
  expect(screen.queryByRole("button", { name: /New shelf/ })).toBeNull();
});
