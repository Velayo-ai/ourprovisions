/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the picker is audited as raw DOM: its rows, its toast, the privacy selectors above them. */
// Run: CI=true npx react-scripts test --watchAll=false src/ListPicker
// SPEC_one_list R7–R9, R14, V13: the quick picker (App.js ListPicker on ItemSearchView).
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useItemSearch } from "./components/ItemSearchView";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { ListPicker } = require("./App");

const ITEMS = [
  { id: "a", name: "Apples", category: "Produce", rawCategory: "Produce" },
  { id: "b", name: "Bagels", category: "Bakery", rawCategory: "Bakery" },
  { id: "c", name: "Bananas", category: "Produce", rawCategory: "Produce" },
];

function Harness({ status = {}, onAdd, onCreate = jest.fn(), onReveal = jest.fn(), onTapListed = jest.fn(), onClosed = jest.fn(), hidden = null }) {
  const search = useItemSearch();
  return (
    <>
      <button type="button" onClick={() => search.show()}>open picker</button>
      <ListPicker search={search} items={ITEMS} statusOf={(id) => status[id] || "off"} hiddenFor={() => hidden}
        onAdd={onAdd} onCreate={onCreate} onReveal={onReveal} onTapListed={onTapListed} onClosed={onClosed} />
    </>
  );
}
const view = () => document.querySelector(".ask-search.item-picker");
const input = () => view().querySelector("input[type=search]");
const rowOf = (name) => [...document.querySelectorAll(".pick-row")].find((b) => b.querySelector(".pick-name").textContent === name);
const open = () => fireEvent.click(screen.getByRole("button", { name: "open picker" }));

test("one tap opens it with the focus already in the field (same handler, no timers); the title and Done", () => {
  jest.useFakeTimers();
  try {
    render(<Harness onAdd={jest.fn()} />);
    expect(view()).not.toHaveClass("open");
    open();
    expect(view()).toHaveClass("open");
    expect(document.activeElement).toBe(input());
    expect(view().querySelector(".item-search-title").textContent).toBe("Add to our list");
    expect(input()).toHaveAttribute("placeholder", "Type, or scroll and tap");
    expect(view().parentElement).toBe(document.body);
  } finally { jest.useRealTimers(); }
});

test("A–Z with letter headers; ✓ 'On the list' rows are inert and fire onTapListed, not onAdd", () => {
  const onAdd = jest.fn();
  const onTapListed = jest.fn();
  render(<Harness status={{ a: "on" }} onAdd={onAdd} onTapListed={onTapListed} />);
  open();
  expect([...document.querySelectorAll(".pick-letter")].map((x) => x.textContent)).toEqual(["A", "B"]);
  const apples = rowOf("Apples");
  expect(apples).toHaveAttribute("aria-disabled", "true");
  expect(apples.textContent).toMatch(/On the list/);
  fireEvent.click(apples);
  expect(onAdd).not.toHaveBeenCalled();
  expect(onTapListed).toHaveBeenCalledTimes(1);
});

test("a tap adds one, keeps the picker open and toasts '{Item} is on the list · Undo'; Undo runs the undo", async () => {
  const undo = jest.fn();
  const onAdd = jest.fn(async () => ({ kind: "added", text: "Bagels is on the list", undo }));
  render(<Harness onAdd={onAdd} />);
  open();
  await act(async () => { fireEvent.click(rowOf("Bagels")); });
  expect(onAdd).toHaveBeenCalledWith(ITEMS[1], "off");
  expect(view()).toHaveClass("open");
  const toast = view().querySelector(".pick-toast");
  expect(toast.textContent).toMatch(/^Bagels is on the list/);
  await act(async () => { fireEvent.click(toast.querySelector(".pick-undo")); });
  expect(undo).toHaveBeenCalledTimes(1);
  expect(view().querySelector(".pick-toast")).toBeNull();
});

test("a renewal toasts 'added again · it was in your cart' with NO Undo", async () => {
  const onAdd = jest.fn(async () => ({ kind: "renewed", text: "Apples added again · it was in your cart" }));
  render(<Harness status={{ a: "cart" }} onAdd={onAdd} />);
  open();
  expect(rowOf("Apples")).not.toHaveAttribute("aria-disabled");
  await act(async () => { fireEvent.click(rowOf("Apples")); });
  expect(onAdd).toHaveBeenCalledWith(ITEMS[0], "cart");
  expect(view().querySelector(".pick-toast").textContent).toBe("Apples added again · it was in your cart");
  expect(view().querySelector(".pick-undo")).toBeNull();
});

test("off grid: the tap answers 'Adding items needs signal for now.' and the picker stays open (R14)", async () => {
  const onAdd = jest.fn(async () => ({ kind: "needsSignal", text: "Adding items needs signal for now." }));
  render(<Harness onAdd={onAdd} />);
  open();
  await act(async () => { fireEvent.click(rowOf("Bananas")); });
  expect(view()).toHaveClass("open");
  expect(view().querySelector(".pick-toast").textContent).toBe("Adding items needs signal for now.");
});

test("typing filters; no match offers '+ Add \"{text}\" as a new item', which calls onCreate with the text", async () => {
  const onCreate = jest.fn(async () => ({ kind: "added", text: "Durian is on the list", undo: jest.fn() }));
  render(<Harness onAdd={jest.fn()} onCreate={onCreate} />);
  open();
  fireEvent.change(input(), { target: { value: "ba" } });
  expect([...document.querySelectorAll(".pick-row:not(.pick-create) .pick-name")].map((x) => x.textContent)).toEqual(["Bagels", "Bananas"]);
  fireEvent.change(input(), { target: { value: "Durian" } });
  const create = document.querySelector(".pick-create");
  expect(create.textContent).toBe("+ Add “Durian” as a new item");
  await act(async () => { fireEvent.click(create); });
  expect(onCreate).toHaveBeenCalledWith("Durian");
  expect(input().value).toBe("");   // ready for the next item
});

test("a hidden exact match shows the reveal card (F1b), not the create row", async () => {
  const onReveal = jest.fn(async () => ({ kind: "revealed", text: "Oat milk is on the list" }));
  render(<Harness onAdd={jest.fn()} onReveal={onReveal} hidden={{ item: { id: "h", name: "Oat milk", category: "Dairy" }, qty: 0, live: false }} />);
  open();
  fireEvent.change(input(), { target: { value: "oat milk" } });
  expect(document.querySelector(".pick-create")).toBeNull();
  const card = [...document.querySelectorAll('[role="button"]')].find((x) => /Hidden from your view/.test(x.textContent));
  await act(async () => { fireEvent.click(card); });
  expect(onReveal).toHaveBeenCalledWith(expect.objectContaining({ live: false }), "oat milk");
});

test("Done closes, clears the query and reports picker_closed's counts", async () => {
  const onClosed = jest.fn();
  const onAdd = jest.fn(async () => ({ kind: "added", text: "Bagels is on the list", undo: jest.fn() }));
  render(<Harness onAdd={onAdd} onClosed={onClosed} />);
  open();
  await act(async () => { fireEvent.click(rowOf("Bagels")); });
  fireEvent.change(input(), { target: { value: "x" } });
  fireEvent.click(view().querySelector(".item-search-done"));
  expect(view()).not.toHaveClass("open");
  expect(input().value).toBe("");
  expect(onClosed).toHaveBeenCalledWith(expect.objectContaining({ added: 1 }));
});

// V13: with prod's click-text config, no allow-listed selector sits on or above an item name, the typed text
// or the toast in the picker; Done is the one allow-listed control in it.
describe("V13 privacy (prod config)", () => {
  // The prod click-text allow-list as rum.js declares it (prod unmasks exactly CHROME_ALLOW_LIST; rum.test.js
  // pins that). Read from the source: this file has already loaded App, and with it rum.js.
  function prodUnmasks() {
    const src = require("fs").readFileSync(require("path").join(__dirname, "rum.js"), "utf8");
    const block = src.slice(src.indexOf("const CHROME_ALLOW_LIST = ["), src.indexOf("];", src.indexOf("const CHROME_ALLOW_LIST = [")));
    const sels = [...block.matchAll(/^\s*'([^']+)',/gm)].map((m) => m[1]);
    expect(sels.length).toBe(84);
    return sels;
  }
  test("no unmask rule matches an item name, the create row or the toast; Done is unmasked", async () => {
    const unmask = prodUnmasks();
    const onAdd = jest.fn(async () => ({ kind: "added", text: "Bagels is on the list", undo: jest.fn() }));
    render(<Harness status={{ a: "on" }} onAdd={onAdd} />);
    open();
    await act(async () => { fireEvent.click(rowOf("Bagels")); });
    const under = (el) => unmask.filter((sel) => el.closest(sel));
    const names = [...document.querySelectorAll(".pick-name, .pick-sub")];
    expect(names.length).toBeGreaterThan(0);
    names.forEach((el) => expect(under(el)).toEqual([]));
    expect(under(view().querySelector(".pick-toast-text"))).toEqual([]);
    expect(under(input())).toEqual([]);
    fireEvent.change(input(), { target: { value: "Durian" } });
    expect(under(document.querySelector(".pick-create"))).toEqual([]);
    expect(under(view().querySelector(".item-search-done"))).toEqual([".item-search-done"]);
  });
});
