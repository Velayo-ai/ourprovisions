import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewShelfSheet } from "./NewShelfSheet";

// + New shelf (SPEC_ask_slice2 C2): one id per draft (K1), the failure copy is ours and wears
// .op-name when it repeats the name (K3), and Save waits for a draft create_ask would accept.
const ITEMS = [
  { id: "i-goldfish", name: "Goldfish" },
  { id: "i-apples", name: "Apples" },
  { id: "i-yogurt", name: "Yogurt" },
  { id: "i-crackers", name: "Crackers" },
];

beforeEach(() => {
  let n = 0;
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: { randomUUID: () => `ask-${++n}` },
  });
});

function setup(onCreate = jest.fn(async () => ({ ok: true, id: "x" }))) {
  const onClose = jest.fn();
  render(<NewShelfSheet catalogItems={ITEMS} onCreate={onCreate} onClose={onClose} closeButton={null} />);
  return { onCreate, onClose };
}
const nameInput = () => screen.getByLabelText("Who's picking?");
const nounInput = () => screen.getByLabelText("What are they picking? (optional)");
const save = () => screen.getByRole("button", { name: "Save shelf" });
// A catalog row's "+" / "✓" is aria-hidden, so its accessible name is the item's name alone.
const pick = (name) => fireEvent.click(screen.getByRole("button", { name }));
const pickTarget = (n) => fireEvent.click(screen.getByRole("radio", { name: String(n) }));
// A failed save puts its copy in the alert; a good one calls onClose (the mock keeps the sheet
// mounted, still reading "Saving…").
async function saveAndFail() { fireEvent.click(save()); return screen.findByRole("alert"); }
async function saveAndClose(onClose) { fireEvent.click(save()); await waitFor(() => expect(onClose).toHaveBeenCalled()); }

test("the name input wears .op-name; the noun input does not", () => {
  setup();
  expect(nameInput()).toHaveClass("op-name");
  expect(nounInput()).not.toHaveClass("op-name");
});

test("Save waits for a name and as many items as the target (3 by default)", async () => {
  const { onCreate, onClose } = setup();
  expect(save()).toBeDisabled();
  fireEvent.change(nameInput(), { target: { value: "Easton" } });
  pick("Goldfish"); pick("Apples");
  expect(save()).toBeDisabled();
  expect(screen.getByText("To pick 3, the shelf needs at least 3 items.")).toBeInTheDocument();
  pick("Yogurt");
  expect(save()).toBeEnabled();
  await saveAndClose(onClose);
  expect(onCreate).toHaveBeenCalledWith("ask-1", { label: "Easton", noun: "", target: 3, itemIds: ["i-goldfish", "i-apples", "i-yogurt"] });
});

test("a failed save keeps its id for the retry; an edit starts a new one (K1)", async () => {
  const onCreate = jest.fn()
    .mockResolvedValueOnce({ ok: false, code: null })      // dropped connection
    .mockResolvedValueOnce({ ok: false, code: "23505" })   // the retry: another Easton exists
    .mockResolvedValueOnce({ ok: true, id: "ask-2" });
  const { onClose } = setup(onCreate);
  fireEvent.change(nameInput(), { target: { value: "Easton" } });
  pickTarget(1);
  pick("Goldfish");
  expect(await saveAndFail()).toHaveTextContent("Couldn't save the shelf.");

  fireEvent.click(save());
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("You already have Ask Easton."));
  expect(onCreate.mock.calls.map((c) => c[0])).toEqual(["ask-1", "ask-1"]);
  expect(onClose).not.toHaveBeenCalled();
  // 23505: our copy, carrying the name, so it wears .op-name. Never the server's message.
  expect(screen.getByRole("alert")).toHaveClass("op-name");

  fireEvent.change(nameInput(), { target: { value: "Everett" } });
  expect(screen.queryByRole("alert")).toBeNull();
  await saveAndClose(onClose);
  expect(onCreate.mock.calls.map((c) => c[0])).toEqual(["ask-1", "ask-1", "ask-2"]);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("a failure that names nobody does not wear .op-name", async () => {
  setup(jest.fn(async () => ({ ok: false, code: "42501" })));
  fireEvent.change(nameInput(), { target: { value: "Easton" } });
  pickTarget(1);
  pick("Goldfish");
  const alert = await saveAndFail();
  expect(alert).not.toHaveClass("op-name");
  expect(alert).not.toHaveTextContent("Easton");
});

test("the shelf keeps tap order; a tapped chip comes off; search narrows the list", () => {
  setup();
  pick("Yogurt"); pick("Apples");
  expect(screen.getByText("The shelf · 2 items")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Take Yogurt off the shelf" }));
  expect(screen.getByText("The shelf · 1 item")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Find an item for the shelf"), { target: { value: "gold" } });
  expect(screen.getByRole("button", { name: "Goldfish" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Crackers" })).toBeNull();
});

test("the pick line follows the target and the noun, and never names the picker", () => {
  setup();
  fireEvent.change(nameInput(), { target: { value: "Easton" } });
  fireEvent.change(nounInput(), { target: { value: "snacks" } });
  expect(screen.getByText("Pick 3 snacks for our list.")).toBeInTheDocument();
  pickTarget(1);
  expect(screen.getByText("Pick one for our list.")).toBeInTheDocument();
  expect(screen.queryByText(/Easton/)).toBeNull();
});
