/* eslint-disable testing-library/no-node-access --
   where a message sits (under the name field, inside the sticky .modal-actions footer) and the
   catalog list's own style are the rules under test, read as raw DOM. */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NewShelfSheet } from "./NewShelfSheet";

// + New shelf (SPEC_ask_slice2 C2 + C2.1): one id per draft (K1); a name already in use is caught
// as it is typed, under the name field, in the existing spelling; every other message sits in the
// sticky footer and a server failure brings its field into view; the sheet is the only scroller;
// the name wears .op-name (K3).
const ITEMS = [
  { id: "i-goldfish", name: "Goldfish" },
  { id: "i-apples", name: "Apples" },
  { id: "i-yogurt", name: "Yogurt" },
  { id: "i-crackers", name: "Crackers" },
];
const EASTON = { id: "a-1", label: "Easton", pickTarget: 3, itemIds: [] };

let scrolled;
beforeEach(() => {
  let n = 0;
  Object.defineProperty(global, "crypto", {
    configurable: true,
    value: { randomUUID: () => `ask-${++n}` },
  });
  scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView() { scrolled.push(this); };
});

function setup({ onCreate = jest.fn(async () => ({ ok: true, id: "x" })), asks = [] } = {}) {
  const onClose = jest.fn();
  const view = render(<NewShelfSheet catalogItems={ITEMS} asks={asks} onCreate={onCreate} onClose={onClose} closeButton={null} />);
  return { onCreate, onClose, rerender: (next) => view.rerender(
    <NewShelfSheet catalogItems={ITEMS} asks={next} onCreate={onCreate} onClose={onClose} closeButton={null} />) };
}
const nameInput = () => screen.getByLabelText("Who's picking?");
const nounInput = () => screen.getByLabelText("What are they picking? (optional)");
const save = () => screen.getByRole("button", { name: "Save shelf" });
// A catalog row's "+" / "✓" is aria-hidden, so its accessible name is the item's name alone.
const pick = (name) => fireEvent.click(screen.getByRole("button", { name }));
const pickTarget = (n) => fireEvent.click(screen.getByRole("radio", { name: String(n) }));
const footerOf = (el) => el.closest(".modal-actions");
const fieldOf = (el) => el.closest(".modal-field");
async function saveAndClose(onClose) { fireEvent.click(save()); await waitFor(() => expect(onClose).toHaveBeenCalled()); }
function readyDraft(name = "Nina") {
  fireEvent.change(nameInput(), { target: { value: name } });
  pickTarget(1);
  pick("Goldfish");
}

test("the name input wears .op-name; the noun input does not", () => {
  setup();
  expect(nameInput()).toHaveClass("op-name");
  expect(nounInput()).not.toHaveClass("op-name");
});

describe("a name this place already uses (C2.1 item 1)", () => {
  test("is caught as it is typed, under the name field, in the EXISTING spelling; Save waits", () => {
    setup({ asks: [EASTON] });
    readyDraft("  easton ");
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("You already have Ask Easton.");
    expect(fieldOf(alert)).toBe(fieldOf(nameInput()));
    expect(footerOf(alert)).toBeNull();
    expect(save()).toBeDisabled();
  });
  test("only the name wears .op-name, so the rest of the line stays readable in replay", () => {
    setup({ asks: [EASTON] });
    fireEvent.change(nameInput(), { target: { value: "EASTON" } });
    const alert = screen.getByRole("alert");
    expect(alert).not.toHaveClass("op-name");
    expect(alert.querySelector(".op-name")).toHaveTextContent(/^Easton$/);
  });
  test("goes as soon as the name is a new one", () => {
    setup({ asks: [EASTON] });
    readyDraft("Easton");
    fireEvent.change(nameInput(), { target: { value: "Everett" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save()).toBeEnabled();
  });
  test("create_ask's 23505 is the backstop: the same line under the name, the field brought into view", async () => {
    const onCreate = jest.fn(async () => ({ ok: false, code: "23505" }));
    const { rerender } = setup({ onCreate });
    readyDraft("Easton");
    fireEvent.click(save());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You already have Ask Easton.");
    expect(fieldOf(alert)).toBe(fieldOf(nameInput()));
    expect(save()).toBeDisabled();
    expect(scrolled).toContain(fieldOf(nameInput()));
    // The hook re-reads the asks on 23505; the line then shows the existing spelling.
    rerender([{ ...EASTON, label: "EASTON" }]);
    expect(screen.getByRole("alert")).toHaveTextContent("You already have Ask EASTON.");
  });
});

describe("every other message sits in the sticky footer (C2.1 item 2)", () => {
  test("what the draft still needs: above Cancel / Save shelf", () => {
    setup();
    fireEvent.change(nameInput(), { target: { value: "Easton" } });
    pick("Goldfish"); pick("Apples");
    const line = screen.getByText("To pick 3, the shelf needs at least 3 items.");
    expect(footerOf(line)).not.toBeNull();
    expect(save()).toBeDisabled();
  });
  test("a dropped connection: in the footer, no name, nothing to scroll to", async () => {
    setup({ onCreate: jest.fn(async () => ({ ok: false, code: null })) });
    readyDraft("Easton");
    fireEvent.click(save());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save the shelf.");
    expect(footerOf(alert)).not.toBeNull();
    expect(alert).not.toHaveClass("op-name");
    expect(alert).not.toHaveTextContent("Easton");
    expect(scrolled).toEqual([]);
  });
  test("22023: in the footer, and the shelf brought into view", async () => {
    setup({ onCreate: jest.fn(async () => ({ ok: false, code: "22023" })) });
    readyDraft("Easton");
    fireEvent.click(save());
    const alert = await screen.findByRole("alert");
    expect(footerOf(alert)).not.toBeNull();
    expect(scrolled).toEqual([screen.getByText(/^The shelf/).closest(".modal-field")]);
  });
});

test("a failed save keeps its id for the retry; an edit starts a new one (K1)", async () => {
  const onCreate = jest.fn()
    .mockResolvedValueOnce({ ok: false, code: null })      // dropped connection
    .mockResolvedValueOnce({ ok: false, code: null })      // the retry: still down
    .mockResolvedValueOnce({ ok: true, id: "ask-2" });
  const { onClose } = setup({ onCreate });
  readyDraft("Easton");
  fireEvent.click(save());
  await screen.findByRole("alert");
  fireEvent.click(save());
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(save()).toBeEnabled());
  expect(onCreate.mock.calls.map((c) => c[0])).toEqual(["ask-1", "ask-1"]);
  pick("Apples");
  await saveAndClose(onClose);
  expect(onCreate.mock.calls.map((c) => c[0])).toEqual(["ask-1", "ask-1", "ask-2"]);
});

test("Save sends the draft once a name and as many items as the target (3) are in", async () => {
  const { onCreate, onClose } = setup();
  expect(save()).toBeDisabled();
  fireEvent.change(nameInput(), { target: { value: "Easton" } });
  pick("Goldfish"); pick("Apples"); pick("Yogurt");
  await saveAndClose(onClose);
  expect(onCreate).toHaveBeenCalledWith("ask-1", { label: "Easton", noun: "", target: 3, itemIds: ["i-goldfish", "i-apples", "i-yogurt"], style: "standard" });
});

test("one scroller (C2.1 item 3): the catalog list is not a scroll box; search narrows it", () => {
  setup();
  const list = screen.getByTestId("new-shelf-catalog");
  expect(list.style.overflowY).toBe("");
  expect(list.style.overflow).toBe("");
  expect(list.style.maxHeight).toBe("");
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

// On screen the styles are Shopper and Explorer (Dan, 2026-11-09); the stored values stay
// standard / simple.
describe("the style (SPEC_ask_slice3 S3-1, S3-5)", () => {
  const style = (name) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });
  const targetPill = (n) => screen.getByRole("radio", { name: String(n) });
  test("Shopper is the default; the copy names no age, ability or reading, and never the stored names", () => {
    setup();
    expect(style("Shopper")).toHaveAttribute("aria-checked", "true");
    expect(style("Shopper")).toHaveTextContent("Names and pictures, up to 48");
    expect(style("Explorer")).toHaveAttribute("aria-checked", "false");
    expect(style("Explorer")).toHaveTextContent("Big pictures, up to 4");
    // Explorer on the left, Shopper on the right (Dan, 2026-11-09); Shopper is still the default.
    const cards = [...style("Explorer").closest("[role=radiogroup]").querySelectorAll("[role=radio]")];
    expect(cards.map((c) => c.firstChild.textContent)).toEqual(["Explorer", "Shopper"]);
    const copy = fieldOf(style("Explorer")).textContent;
    expect(copy).not.toMatch(/age|year|old|read|young|kid|child/i);
    expect(copy).not.toMatch(/standard|simple/i);
  });
  test("Explorer greys out and disables targets above 4; Shopper brings them back", () => {
    setup();
    fireEvent.click(style("Explorer"));
    for (const n of [1, 2, 3, 4]) expect(targetPill(n)).toBeEnabled();
    for (const n of [5, 6]) {
      expect(targetPill(n)).toBeDisabled();
      expect(targetPill(n).style.opacity).toBe("0.4");
    }
    fireEvent.click(targetPill(6));
    expect(targetPill(3)).toHaveAttribute("aria-checked", "true");   // the default stays
    fireEvent.click(style("Shopper"));
    for (const n of [5, 6]) {
      expect(targetPill(n)).toBeEnabled();
      expect(targetPill(n).style.opacity).toBe("");
    }
  });
  test("choosing Explorer with a target above 4 drops it to 4; a target of 4 or less stays", () => {
    setup();
    pickTarget(6);
    fireEvent.click(style("Explorer"));
    expect(targetPill(4)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Pick 4 for our list.")).toBeInTheDocument();
    fireEvent.click(style("Shopper"));
    expect(targetPill(4)).toHaveAttribute("aria-checked", "true");   // no bounce back to 6
    pickTarget(2);
    fireEvent.click(style("Explorer"));
    expect(targetPill(2)).toHaveAttribute("aria-checked", "true");
  });
  test("Explorer with 4 tiles saves as simple", async () => {
    const { onCreate, onClose } = setup();
    fireEvent.change(nameInput(), { target: { value: "Everett" } });
    pickTarget(5);
    fireEvent.click(style("Explorer"));
    ITEMS.forEach((i) => pick(i.name));
    expect(screen.queryByText("Explorer shows 4 at most.")).toBeNull();
    await saveAndClose(onClose);
    expect(onCreate.mock.calls[0][1]).toMatchObject({ style: "simple", target: 4, itemIds: ITEMS.map((i) => i.id) });
  });

  // Over 4 on Explorer: the header reads "6 of 4" and, under the chips, one error-coloured line
  // counts down how many to remove. No copy in the footer; nothing is removed for you.
  const SIX = [...ITEMS, { id: "i-pears", name: "Pears" }, { id: "i-plums", name: "Plums" }];
  const capLine = () => screen.queryByText(/^Explorer shows 4 at most\./);
  const shelfHeader = () => screen.getByText(/^The shelf ·/);
  function sixSheet() {
    const onCreate = jest.fn(async () => ({ ok: true, id: "x" }));
    const onClose = jest.fn();
    render(<NewShelfSheet catalogItems={SIX} asks={[]} onCreate={onCreate} onClose={onClose} closeButton={null} />);
    fireEvent.change(nameInput(), { target: { value: "Everett" } });
    pickTarget(1);
    return { onCreate, onClose };
  }
  const takeOff = (name) => fireEvent.click(screen.getByRole("button", { name: `Take ${name} off the shelf` }));

  test("six on Explorer: \"6 of 4\" in the error colour; \"Remove 2.\" under the chips counts down and goes at 4", async () => {
    const { onCreate, onClose } = sixSheet();
    fireEvent.click(style("Explorer"));
    SIX.forEach((i) => pick(i.name));
    expect(shelfHeader()).toHaveTextContent("The shelf · 6 of 4");
    expect(screen.getByText("6 of 4").style.color).toBe("rgb(224, 92, 92)");   // #e05c5c, .modal-error's
    const line = capLine();
    expect(line).toHaveTextContent("Explorer shows 4 at most. Remove 2.");
    expect(line).toHaveClass("modal-error");
    expect(line).not.toHaveClass("picker-sub");
    // Directly under the chips, above the search; never in the footer.
    expect(line.previousElementSibling.querySelector("[aria-label='Take Goldfish off the shelf']")).not.toBeNull();
    expect(line.nextElementSibling).toBe(screen.getByLabelText("Find an item for the shelf"));
    expect(footerOf(line)).toBeNull();
    expect(footerOf(save()).textContent).not.toMatch(/Explorer shows/);
    expect(save()).toBeDisabled();
    takeOff("Plums");
    expect(capLine()).toHaveTextContent("Explorer shows 4 at most. Remove 1.");
    expect(shelfHeader()).toHaveTextContent("The shelf · 5 of 4");
    takeOff("Pears");
    expect(capLine()).toBeNull();
    expect(shelfHeader()).toHaveTextContent("The shelf · 4 items");
    expect(save()).toBeEnabled();
    await saveAndClose(onClose);
    expect(onCreate.mock.calls[0][1]).toMatchObject({ style: "simple", itemIds: ITEMS.map((i) => i.id) });
  });
  test("choosing Explorer with six already on the shelf shows the line at once and removes nothing; Shopper saves all six", async () => {
    const { onCreate, onClose } = sixSheet();
    SIX.forEach((i) => pick(i.name));
    expect(capLine()).toBeNull();
    expect(shelfHeader()).toHaveTextContent("The shelf · 6 items");
    fireEvent.click(style("Explorer"));
    expect(capLine()).toHaveTextContent("Explorer shows 4 at most. Remove 2.");
    expect(shelfHeader()).toHaveTextContent("The shelf · 6 of 4");
    expect(screen.getAllByRole("button", { name: /off the shelf$/ })).toHaveLength(6);
    fireEvent.click(style("Shopper"));
    expect(capLine()).toBeNull();
    expect(shelfHeader()).toHaveTextContent("The shelf · 6 items");
    await saveAndClose(onClose);
    expect(onCreate.mock.calls[0][1]).toMatchObject({ style: "standard", itemIds: SIX.map((i) => i.id) });
  });
});

// Edit (SPEC_ask_slice4 S4-2): the same sheet, prefilled from the ask's live shelf rows; Save →
// onUpdate; Delete behind a confirmation → onDelete. The ask's own name is no duplicate.
describe("edit mode (SPEC_ask_slice4 S4-2)", () => {
  const EVERETT = { id: "a-2", label: "Everett", pickTarget: 1, itemIds: [] };
  const EDIT = { id: "a-1", label: "Easton", shelfNoun: "snacks", pickTarget: 2, screenStyle: "simple",
    tiles: [{ id: "i-yogurt", name: "Yogurt" }, { id: "i-hidden", name: "Hidden thing" }, { id: "i-apples", name: "Apples" }] };
  function setupEdit({ onUpdate = jest.fn(async () => ({ ok: true })), onDelete = jest.fn(async () => ({ ok: true })), asks = [EASTON, EVERETT], edit = EDIT } = {}) {
    const onClose = jest.fn();
    const onCreate = jest.fn();
    render(<NewShelfSheet catalogItems={ITEMS} asks={asks} edit={edit} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} onClose={onClose} closeButton={null} />);
    return { onUpdate, onDelete, onClose, onCreate };
  }
  const chips = () => screen.getAllByRole("button", { name: /off the shelf$/ }).map((b) => b.textContent.replace("×", "").trim());

  test("prefilled from the ask: title with the name in .op-name, name, noun, target, style, the shelf in order (a hidden tile named from its row)", () => {
    setupEdit();
    const h = screen.getByRole("heading", { level: 2 });
    expect(h).toHaveTextContent("Edit Ask Easton");
    expect(h.querySelector(".op-name")).toHaveTextContent(/^Easton$/);
    expect(screen.queryByText("New shelf")).toBeNull();
    expect(nameInput()).toHaveValue("Easton");
    expect(nounInput()).toHaveValue("snacks");
    expect(screen.getByRole("radio", { name: "2" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^Explorer/ })).toHaveAttribute("aria-checked", "true");
    expect(chips()).toEqual(["Yogurt", "Hidden thing", "Apples"]);
    expect(screen.getByText("The shelf · 3 items")).toBeInTheDocument();
    // Its own name is no duplicate; another ask's is.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save()).toBeEnabled();
    fireEvent.change(nameInput(), { target: { value: "everett" } });
    expect(screen.getByRole("alert")).toHaveTextContent("You already have Ask Everett.");
    expect(save()).toBeDisabled();
  });

  test("Save sends the whole form to onUpdate, never onCreate, and closes", async () => {
    const { onUpdate, onCreate, onClose } = setupEdit();
    fireEvent.click(screen.getByRole("button", { name: "Take Hidden thing off the shelf" }));
    pick("Goldfish");
    fireEvent.change(nounInput(), { target: { value: "" } });
    await saveAndClose(onClose);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({ label: "Easton", noun: "", target: 2, itemIds: ["i-yogurt", "i-apples", "i-goldfish"], style: "simple" });
    expect(onCreate).not.toHaveBeenCalled();
  });

  test("update_ask's 23505 and 22023 read as create's", async () => {
    const onUpdate = jest.fn().mockResolvedValueOnce({ ok: false, code: "23505" }).mockResolvedValueOnce({ ok: false, code: "22023" });
    setupEdit({ onUpdate });
    fireEvent.click(save());
    let alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You already have Ask Easton.");
    expect(fieldOf(alert)).toBe(fieldOf(nameInput()));
    fireEvent.change(nameInput(), { target: { value: "Easton " } });
    fireEvent.click(save());
    alert = await screen.findByRole("alert");
    expect(footerOf(alert)).not.toBeNull();
    expect(alert).toHaveTextContent("Something on the shelf isn't available any more.");
  });

  test("Explorer over 4 in edit behaves as in create: the countdown, nothing removed, Save waits", () => {
    setupEdit({ edit: { ...EDIT, screenStyle: "standard", pickTarget: 1, tiles: ITEMS.concat([{ id: "i-pears", name: "Pears" }]).map((i) => ({ id: i.id, name: i.name })) } });
    expect(screen.getByText("The shelf · 5 items")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^Explorer/ }));
    expect(screen.getByText(/^Explorer shows 4 at most\./)).toHaveTextContent("Remove 1.");
    expect(chips()).toHaveLength(5);
    expect(save()).toBeDisabled();
  });

  test("Delete: at the bottom, behind a confirmation naming what stays (the name in .op-name); Keep it backs out; Delete calls onDelete and closes", async () => {
    const { onDelete, onUpdate, onClose } = setupEdit();
    expect(screen.queryByRole("group", { name: "Delete this ask" })).toBeNull();
    const del = screen.getByRole("button", { name: "Delete" });
    expect(del).toHaveClass("modal-remove");
    expect(del.compareDocumentPosition(save()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // above the footer only
    fireEvent.click(del);
    const confirm = screen.getByRole("group", { name: "Delete this ask" });
    expect(confirm).toHaveTextContent("Delete Ask Easton? Anything Easton already picked stays on the list.");
    expect([...confirm.querySelectorAll(".op-name")].map((n) => n.textContent)).toEqual(["Easton", "Easton"]);
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
    expect(screen.queryByRole("group", { name: "Delete this ask" })).toBeNull();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("a failed delete says so in the footer and leaves the sheet open", async () => {
    const { onClose } = setupEdit({ onDelete: jest.fn(async () => ({ ok: false, code: null })) });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't delete the shelf.");
    expect(footerOf(alert)).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeEnabled();
  });

  test("create mode is unchanged: no Delete, the New shelf title", () => {
    setup();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("New shelf");
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });
});

// The Explorer photo nudge (SPEC_ask_slice4 S4-7): a camera on a photo-less chip, Explorer only;
// a muted hint naming them; the tap runs the same photo flow as Browse; never a block.
describe("the Explorer photo nudge (S4-7)", () => {
  const style = (name) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });
  const cameras = () => screen.queryAllByRole("button", { name: /^Add a photo of / });
  const hint = () => screen.queryByText(/^Explorers pick by picture\./);
  function setupPhoto({ photoIds = new Set(["i-apples"]), onPhoto = jest.fn(async () => ({ ok: true })) } = {}) {
    const view = render(<NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={jest.fn()} closeButton={null}
      photoIds={photoIds} onPhoto={onPhoto} />);
    const rerender = (ids) => view.rerender(<NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={jest.fn()} closeButton={null}
      photoIds={ids} onPhoto={onPhoto} />);
    // eslint-disable-next-line testing-library/no-node-access
    return { onPhoto, rerender, input: () => view.container.querySelector("input[type=file]") };
  }
  test("Shopper: no camera, no hint; Explorer: a camera on each photo-less chip and the hint names them in shelf order", () => {
    setupPhoto();
    pick("Goldfish"); pick("Apples"); pick("Yogurt");
    expect(cameras()).toHaveLength(0);
    expect(hint()).toBeNull();
    fireEvent.click(style("Explorer"));
    expect(cameras().map((b) => b.getAttribute("aria-label"))).toEqual(["Add a photo of Goldfish", "Add a photo of Yogurt"]);
    const h = hint();
    expect(h).toHaveTextContent("Explorers pick by picture. Add a photo for Goldfish and Yogurt.");
    expect(h).toHaveClass("picker-sub");
    expect(h).not.toHaveClass("modal-error");
    expect(save()).toBeDisabled();   // the name is missing, not the photos
    fireEvent.change(nameInput(), { target: { value: "Ev" } });
    expect(save()).toBeEnabled();    // a hint, never a block
    pick("Crackers");
    expect(hint()).toHaveTextContent("Add a photo for Goldfish, Yogurt and 1 more.");
    fireEvent.click(style("Shopper"));
    expect(cameras()).toHaveLength(0);
    expect(hint()).toBeNull();
  });
  test("the camera runs the photo flow for that item; with the photo in, the badge goes and the hint moves on", async () => {
    const { onPhoto, rerender, input } = setupPhoto();
    fireEvent.click(style("Explorer"));
    pick("Goldfish"); pick("Yogurt");
    fireEvent.click(screen.getByRole("button", { name: "Add a photo of Goldfish" }));
    const file = new File(["x"], "goldfish.jpg", { type: "image/jpeg" });
    fireEvent.change(input(), { target: { files: [file] } });
    await waitFor(() => expect(onPhoto).toHaveBeenCalledWith("i-goldfish", file));
    rerender(new Set(["i-apples", "i-goldfish"]));
    expect(cameras().map((b) => b.getAttribute("aria-label"))).toEqual(["Add a photo of Yogurt"]);
    expect(hint()).toHaveTextContent("Add a photo for Yogurt.");
  });
  test("a photo that fails says so in the same muted line", async () => {
    const { input } = setupPhoto({ onPhoto: jest.fn(async () => ({ ok: false, reason: "decode" })) });
    fireEvent.click(style("Explorer"));
    pick("Goldfish");
    fireEvent.click(screen.getByRole("button", { name: "Add a photo of Goldfish" }));
    fireEvent.change(input(), { target: { files: [new File(["x"], "g.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByText("Couldn't read that photo. Try another.")).toHaveClass("picker-sub");
  });
  test("without a photo flow (no onPhoto) the sheet shows no camera and no hint", () => {
    setup();
    fireEvent.click(style("Explorer"));
    pick("Goldfish");
    expect(cameras()).toHaveLength(0);
    expect(hint()).toBeNull();
  });
});
