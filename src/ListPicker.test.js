/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the picker is audited as raw DOM: its rows, its toast, the privacy selectors above them. */
// Run: CI=true npx react-scripts test --watchAll=false src/ListPicker
// SPEC_one_list R7–R9 (R8 revised 2026-11-27: the row is the confirmation and the undo), R14, V13: the quick
// picker (App.js ListPicker on ItemSearchView).
import { useState } from "react";
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

// A list that answers like the app's: an add puts the row on (status "on"), an undo takes it off, a renewal
// makes a "cart" row "on". `initial` is the list before the visit.
function Harness({ initial = {}, addAnswer = null, undoAnswer = null, onCreate = null, onReveal = jest.fn(), onTapListed = jest.fn(), onClosed = jest.fn(), hidden = null, calls }) {
  const search = useItemSearch();
  const [status, setStatus] = useState(initial);
  const set = (id, s) => setStatus((p) => ({ ...p, [id]: s }));
  const onAdd = async (item, st) => {
    calls.add.push([item.name, st]);
    if (addAnswer) return addAnswer;
    set(item.id, "on");
    return st === "cart" ? { kind: "renewed", text: `${item.name} added again · it was in your cart` } : { kind: "added", id: item.id };
  };
  const onUndo = async (item) => {
    calls.undo.push(item.name);
    if (undoAnswer) return undoAnswer;
    set(item.id, "off");
    return { kind: "undone" };
  };
  return (
    <>
      <button type="button" onClick={() => search.show()}>open picker</button>
      <ListPicker search={search} items={ITEMS} statusOf={(id) => status[id] || "off"} hiddenFor={() => hidden}
        onAdd={onAdd} onUndo={onUndo} onCreate={onCreate || (async () => ({ kind: "added", id: "new" }))} onReveal={onReveal}
        onTapListed={onTapListed} onClosed={onClosed} />
    </>
  );
}
const newCalls = () => ({ add: [], undo: [] });
const view = () => document.querySelector(".ask-search.item-picker");
const input = () => view().querySelector("input[type=search]");
const rowOf = (name) => [...document.querySelectorAll(".pick-row")].find((b) => b.querySelector(".pick-name").textContent === name);
const sub = (name) => rowOf(name).querySelector(".pick-sub")?.textContent || null;
const open = () => fireEvent.click(screen.getByRole("button", { name: "open picker" }));
const tap = async (name) => { await act(async () => { fireEvent.click(rowOf(name)); }); };
const toastText = () => view().querySelector(".pick-toast-text")?.textContent || null;

test("one tap opens it with the focus already in the field (same handler, no timers); the title and Done", () => {
  jest.useFakeTimers();
  try {
    render(<Harness calls={newCalls()} />);
    expect(view()).not.toHaveClass("open");
    open();
    expect(view()).toHaveClass("open");
    expect(document.activeElement).toBe(input());
    expect(view().querySelector(".item-search-title").textContent).toBe("Add to our list");
    expect(input()).toHaveAttribute("placeholder", "Type, or scroll and tap");
    expect(view().parentElement).toBe(document.body);
  } finally { jest.useRealTimers(); }
});

test("A–Z with letter headers; a row on the list before the visit reads 'On the list' and is inert", async () => {
  const calls = newCalls();
  const onTapListed = jest.fn();
  render(<Harness initial={{ a: "on" }} onTapListed={onTapListed} calls={calls} />);
  open();
  expect([...document.querySelectorAll(".pick-letter")].map((x) => x.textContent)).toEqual(["A", "B"]);
  expect(sub("Apples")).toBe("On the list");
  expect(rowOf("Apples")).toHaveAttribute("aria-disabled", "true");
  await tap("Apples");
  expect(calls.add).toEqual([]);
  expect(calls.undo).toEqual([]);
  expect(onTapListed).toHaveBeenCalledTimes(1);
});

test("a tap adds one: the row reads ✓ 'Added · tap to undo', no toast, the picker stays open", async () => {
  const calls = newCalls();
  render(<Harness calls={calls} />);
  open();
  await tap("Bagels");
  expect(calls.add).toEqual([["Bagels", "off"]]);
  expect(view()).toHaveClass("open");
  expect(sub("Bagels")).toBe("Added · tap to undo");
  expect(rowOf("Bagels")).toHaveClass("fresh");
  expect(rowOf("Bagels")).not.toHaveAttribute("aria-disabled");
  expect(view().querySelector(".pick-toast")).toBeNull();
});

test("the fresh ✓ is the undo — also two items back; back to +, no toast", async () => {
  const calls = newCalls();
  render(<Harness calls={calls} />);
  open();
  await tap("Bagels");
  await tap("Apples");
  await tap("Bananas");
  await tap("Bagels");   // two items back
  expect(calls.undo).toEqual(["Bagels"]);
  expect(sub("Bagels")).toBeNull();
  expect(rowOf("Bagels").querySelector(".pick-mark").textContent).toBe("+");
  expect(sub("Apples")).toBe("Added · tap to undo");
  expect(view().querySelector(".pick-toast")).toBeNull();
});

test("Done ends the visit: next time, what was added reads 'On the list' (inert); picker_closed's added", async () => {
  const calls = newCalls();
  const onClosed = jest.fn();
  render(<Harness calls={calls} onClosed={onClosed} />);
  open();
  await tap("Bagels");
  await tap("Apples");
  await tap("Apples");   // undone
  fireEvent.change(input(), { target: { value: "x" } });
  fireEvent.click(view().querySelector(".item-search-done"));
  expect(view()).not.toHaveClass("open");
  expect(input().value).toBe("");
  expect(onClosed).toHaveBeenCalledWith(expect.objectContaining({ added: 1 }));
  open();
  expect(sub("Bagels")).toBe("On the list");
  await tap("Bagels");
  expect(calls.undo).toEqual(["Apples"]);   // no undo of Bagels on the second visit
});

test("a renewal (checked this trip) toasts 'added again · it was in your cart' and its row reads 'On the list'", async () => {
  const calls = newCalls();
  render(<Harness initial={{ a: "cart" }} calls={calls} />);
  open();
  expect(sub("Apples")).toBeNull();   // + : not on the list
  await tap("Apples");
  expect(calls.add).toEqual([["Apples", "cart"]]);
  expect(toastText()).toBe("Apples added again · it was in your cart");
  expect(sub("Apples")).toBe("On the list");
  await tap("Apples");
  expect(calls.undo).toEqual([]);   // never undoable
});

test("off grid: the tap answers 'Adding items needs signal for now.', the picker stays open, the row stays +", async () => {
  const calls = newCalls();
  render(<Harness calls={calls} addAnswer={{ kind: "needsSignal", text: "Adding items needs signal for now." }} />);
  open();
  await tap("Bananas");
  expect(view()).toHaveClass("open");
  expect(toastText()).toBe("Adding items needs signal for now.");
  expect(sub("Bananas")).toBeNull();
});

test("an undo off grid answers the same and the row stays ✓ fresh", async () => {
  const calls = newCalls();
  render(<Harness calls={calls} undoAnswer={{ kind: "needsSignal", text: "Adding items needs signal for now." }} />);
  open();
  await tap("Bagels");
  await tap("Bagels");
  expect(toastText()).toBe("Adding items needs signal for now.");
  expect(sub("Bagels")).toBe("Added · tap to undo");
});

test("typing filters and the query stays after a tap; no match offers '+ Add \"{text}\" as a new item'", async () => {
  const calls = newCalls();
  const onCreate = jest.fn(async () => ({ kind: "added", id: "new" }));
  render(<Harness calls={calls} onCreate={onCreate} />);
  open();
  fireEvent.change(input(), { target: { value: "ba" } });
  expect([...document.querySelectorAll(".pick-row:not(.pick-create) .pick-name")].map((x) => x.textContent)).toEqual(["Bagels", "Bananas"]);
  await tap("Bananas");
  expect(input().value).toBe("ba");                    // the row that confirms it stays in sight
  expect(sub("Bananas")).toBe("Added · tap to undo");
  fireEvent.change(input(), { target: { value: "Durian" } });
  const create = document.querySelector(".pick-create");
  expect(create.textContent).toBe("+ Add “Durian” as a new item");
  await act(async () => { fireEvent.click(create); });
  expect(onCreate).toHaveBeenCalledWith("Durian");
  expect(view().querySelector(".pick-toast")).toBeNull();
});

test("a hidden exact match shows the reveal card (F1b), not the create row", async () => {
  const onReveal = jest.fn(async () => ({ kind: "revealed" }));
  render(<Harness calls={newCalls()} onReveal={onReveal} hidden={{ item: { id: "h", name: "Oat milk", category: "Dairy" }, qty: 0, live: false }} />);
  open();
  fireEvent.change(input(), { target: { value: "oat milk" } });
  expect(document.querySelector(".pick-create")).toBeNull();
  const card = [...document.querySelectorAll('[role="button"]')].find((x) => /Hidden from your view/.test(x.textContent));
  await act(async () => { fireEvent.click(card); });
  expect(onReveal).toHaveBeenCalledWith(expect.objectContaining({ live: false }), "oat milk");
});

test("an error says so in the picker", async () => {
  render(<Harness calls={newCalls()} addAnswer={{ kind: "error", text: "That didn't save. Try again." }} />);
  open();
  await tap("Apples");
  expect(toastText()).toBe("That didn't save. Try again.");
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
    expect(sels.length).toBeGreaterThan(80);
    return sels;
  }
  test("no unmask rule matches an item name, its line, the create row or the toast; Done is unmasked", async () => {
    const unmask = prodUnmasks();
    render(<Harness initial={{ a: "on", c: "cart" }} calls={newCalls()} />);
    open();
    await tap("Bagels");
    await tap("Bananas");   // a renewal: the toast
    const under = (el) => unmask.filter((sel) => el.closest(sel));
    const names = [...document.querySelectorAll(".pick-name, .pick-sub")];
    expect(names.length).toBeGreaterThan(3);
    names.forEach((el) => expect(under(el)).toEqual([]));
    expect(under(view().querySelector(".pick-toast-text"))).toEqual([]);
    expect(under(input())).toEqual([]);
    fireEvent.change(input(), { target: { value: "Durian" } });
    expect(under(document.querySelector(".pick-create"))).toEqual([]);
    expect(under(view().querySelector(".item-search-done"))).toEqual([".item-search-done"]);
  });
});
