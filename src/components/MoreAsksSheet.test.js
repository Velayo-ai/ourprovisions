/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   .op-name around every label, and no label in any attribute, are the rules under test, read as
   raw DOM. */
import { render, screen, fireEvent } from "@testing-library/react";
import { MoreAsksSheet } from "./MoreAsksSheet";

// "+N more" (SPEC_ask_slice2 C4.2): the asks past the rail's two pills, as people pills (2026-11-13).
// A row opens its Ask's run; it is never a filter. No "+ New ask" row: that lives in View & organize.
const ASKS = [{ id: "a4", label: "Bo" }, { id: "a1", label: "Easton" }];

function setup({ activeAskId = null } = {}) {
  const onOpen = jest.fn();
  const view = render(<MoreAsksSheet asks={ASKS} activeAskId={activeAskId} onOpen={onOpen} />);
  return { onOpen, container: view.container };
}

test("lists the rest in the order given as people pills with the hand icon, labels in .op-name, nothing else", () => {
  const { container } = setup();
  const rows = screen.getAllByRole("button");
  expect(rows.map((b) => b.textContent)).toEqual(["Ask Bo", "Ask Easton"]);          // no emoji
  rows.forEach((b) => { expect(b).toHaveClass("cat-pill", "people-pill"); expect(b.querySelector("svg.ask-ico")).not.toBeNull(); });
  expect([...container.querySelectorAll(".op-name")].map((n) => n.textContent)).toEqual(["Bo", "Easton"]);
  const attrs = [...container.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.value));
  expect(attrs.filter((v) => /Bo\b|Easton/.test(v))).toEqual([]);
});

test("a row opens its Ask, like the pill does; no filter state, only the running / edited Ask is pressed", () => {
  const { onOpen } = setup({ activeAskId: "a1" });
  expect(screen.getByRole("button", { name: /Ask Easton/ })).toHaveClass("on");
  expect(screen.getByRole("button", { name: /Ask Bo/ })).not.toHaveClass("on");
  expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: /Ask Bo/ }));
  expect(onOpen).toHaveBeenCalledWith("a4");
});

test("no New ask row: making an Ask is View & organize's", () => {
  setup();
  expect(screen.queryByRole("button", { name: /New ask|New shelf/ })).toBeNull();
});
