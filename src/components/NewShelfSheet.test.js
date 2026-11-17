/* eslint-disable testing-library/no-node-access --
   where a message sits (under the name field, inside the sticky .modal-actions footer) and the
   catalog list's own style are the rules under test, read as raw DOM. */
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
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
const save = () => screen.getByRole("button", { name: "Save ask" });
// A catalog row's "+" / "✓" is aria-hidden, so its accessible name is the item's name alone.
// The catalog lives in the search view (F2 revised): open it from the form's "Find or add an item" first.
const openSearch = () => {
  if (document.querySelector(".ask-search.open")) return;
  fireEvent.click(screen.getByRole("button", { name: /Find or add an item/ }));
};
const pick = (name) => { openSearch(); fireEvent.click(screen.getByRole("button", { name })); };
// The form's own "The ask · …" header (the search view's count line repeats it, by design).
const formText = (m) => within(document.querySelector(".ask-form-shelf")).getByText(m);
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
    const line = screen.getByText("To pick 3, the ask needs at least 3 items.");
    expect(footerOf(line)).not.toBeNull();
    expect(save()).toBeDisabled();
  });
  test("a dropped connection: in the footer, no name, nothing to scroll to", async () => {
    setup({ onCreate: jest.fn(async () => ({ ok: false, code: null })) });
    readyDraft("Easton");
    fireEvent.click(save());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save the ask.");
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
    expect(scrolled).toEqual([formText(/^The ask/).closest(".modal-field")]);
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

test("one scroller per screen (F2 revised): the catalog is the search view's list, not on the form; search narrows it", () => {
  setup();
  const list = screen.getByTestId("new-shelf-catalog");
  expect(document.querySelector(".ask-form-shelf").contains(list)).toBe(false);   // not on the form
  expect(list).toHaveClass("ask-search-list");
  expect(list.closest(".ask-search")).not.toBeNull();
  pick("Yogurt"); pick("Apples");
  expect(formText("The ask · 2 items")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Take Yogurt off the ask" }));
  expect(formText("The ask · 1 item")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Find an item for the ask"), { target: { value: "gold" } });
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
  const shelfHeader = () => formText(/^The ask ·/);
  function sixSheet() {
    const onCreate = jest.fn(async () => ({ ok: true, id: "x" }));
    const onClose = jest.fn();
    render(<NewShelfSheet catalogItems={SIX} asks={[]} onCreate={onCreate} onClose={onClose} closeButton={null} />);
    fireEvent.change(nameInput(), { target: { value: "Everett" } });
    pickTarget(1);
    return { onCreate, onClose };
  }
  const takeOff = (name) => fireEvent.click(screen.getByRole("button", { name: `Take ${name} off the ask` }));

  test("six on Explorer: \"6 of 4\" in the error colour; \"Remove 2.\" under the chips counts down and goes at 4", async () => {
    const { onCreate, onClose } = sixSheet();
    fireEvent.click(style("Explorer"));
    SIX.forEach((i) => pick(i.name));
    expect(shelfHeader()).toHaveTextContent("The ask · 6 of 4");
    expect(formText("6 of 4").style.color).toBe("rgb(224, 92, 92)");   // #e05c5c, .modal-error's
    const line = capLine();
    expect(line).toHaveTextContent("Explorer shows 4 at most. Remove 2.");
    expect(line).toHaveClass("modal-error");
    expect(line).not.toHaveClass("picker-sub");
    // Directly under the chips, above the search; never in the footer.
    expect(line.previousElementSibling.querySelector("[aria-label='Take Goldfish off the ask']")).not.toBeNull();
    expect(line.nextElementSibling).toBe(document.querySelector("button.ask-find"));
    expect(footerOf(line)).toBeNull();
    expect(footerOf(save()).textContent).not.toMatch(/Explorer shows/);
    expect(save()).toBeDisabled();
    takeOff("Plums");
    expect(capLine()).toHaveTextContent("Explorer shows 4 at most. Remove 1.");
    expect(shelfHeader()).toHaveTextContent("The ask · 5 of 4");
    takeOff("Pears");
    expect(capLine()).toBeNull();
    expect(shelfHeader()).toHaveTextContent("The ask · 4 items");
    expect(save()).toBeEnabled();
    await saveAndClose(onClose);
    expect(onCreate.mock.calls[0][1]).toMatchObject({ style: "simple", itemIds: ITEMS.map((i) => i.id) });
  });
  test("choosing Explorer with six already on the shelf shows the line at once and removes nothing; Shopper saves all six", async () => {
    const { onCreate, onClose } = sixSheet();
    SIX.forEach((i) => pick(i.name));
    expect(capLine()).toBeNull();
    expect(shelfHeader()).toHaveTextContent("The ask · 6 items");
    fireEvent.click(style("Explorer"));
    expect(capLine()).toHaveTextContent("Explorer shows 4 at most. Remove 2.");
    expect(shelfHeader()).toHaveTextContent("The ask · 6 of 4");
    expect(screen.getAllByRole("button", { name: /off the ask$/ })).toHaveLength(6);
    fireEvent.click(style("Shopper"));
    expect(capLine()).toBeNull();
    expect(shelfHeader()).toHaveTextContent("The ask · 6 items");
    await saveAndClose(onClose);
    expect(onCreate.mock.calls[0][1]).toMatchObject({ style: "standard", itemIds: SIX.map((i) => i.id) });
  });
});

// Edit (SPEC_ask_slice4 S4-2): the same sheet, prefilled from the ask's live shelf rows; Save →
// onUpdate. The ask's own name is no duplicate. Delete is not here (it is the Manage row's).
describe("edit mode (SPEC_ask_slice4 S4-2)", () => {
  const EVERETT = { id: "a-2", label: "Everett", pickTarget: 1, itemIds: [] };
  const EDIT = { id: "a-1", label: "Easton", shelfNoun: "snacks", pickTarget: 2, screenStyle: "simple",
    tiles: [{ id: "i-yogurt", name: "Yogurt" }, { id: "i-hidden", name: "Hidden thing" }, { id: "i-apples", name: "Apples" }] };
  function setupEdit({ onUpdate = jest.fn(async () => ({ ok: true })), asks = [EASTON, EVERETT], edit = EDIT } = {}) {
    const onClose = jest.fn();
    const onCreate = jest.fn();
    render(<NewShelfSheet catalogItems={ITEMS} asks={asks} edit={edit} onCreate={onCreate} onUpdate={onUpdate} onClose={onClose} closeButton={null} />);
    return { onUpdate, onClose, onCreate };
  }
  // The shelf's tiles, in order, by the name under each.
  const chips = () => screen.getAllByRole("listitem").map((li) => li.querySelector(".shelf-tile-name").textContent);

  test("prefilled from the ask: title with the name in .op-name, name, noun, target, style, the shelf in order (a hidden tile named from its row)", () => {
    setupEdit();
    const h = screen.getByRole("heading", { level: 2 });
    expect(h).toHaveTextContent("Edit Ask Easton");
    expect(h.querySelector(".op-name")).toHaveTextContent(/^Easton$/);
    expect(screen.queryByText("New ask")).toBeNull();
    expect(nameInput()).toHaveValue("Easton");
    expect(nounInput()).toHaveValue("snacks");
    expect(screen.getByRole("radio", { name: "2" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /^Explorer/ })).toHaveAttribute("aria-checked", "true");
    expect(chips()).toEqual(["Yogurt", "Hidden thing", "Apples"]);
    expect(screen.getByRole("list", { name: "On the ask" })).toBeInTheDocument();
    expect(formText("The ask · 3 items")).toBeInTheDocument();
    // Its own name is no duplicate; another ask's is.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(save()).toBeEnabled();
    fireEvent.change(nameInput(), { target: { value: "everett" } });
    expect(screen.getByRole("alert")).toHaveTextContent("You already have Ask Everett.");
    expect(save()).toBeDisabled();
  });

  test("Save sends the whole form to onUpdate, never onCreate, and closes", async () => {
    const { onUpdate, onCreate, onClose } = setupEdit();
    fireEvent.click(screen.getByRole("button", { name: "Take Hidden thing off the ask" }));
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
    expect(alert).toHaveTextContent("Something on the ask isn't available any more.");
  });

  test("Explorer over 4 in edit behaves as in create: the countdown, nothing removed, Save waits", () => {
    setupEdit({ edit: { ...EDIT, screenStyle: "standard", pickTarget: 1, tiles: ITEMS.concat([{ id: "i-pears", name: "Pears" }]).map((i) => ({ id: i.id, name: i.name })) } });
    expect(formText("The ask · 5 items")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /^Explorer/ }));
    expect(screen.getByText(/^Explorer shows 4 at most\./)).toHaveTextContent("Remove 1.");
    expect(chips()).toHaveLength(5);
    expect(save()).toBeDisabled();
  });

  test("no Delete in the sheet, in either mode (it is the Manage row's)", () => {
    setupEdit();
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
    expect(screen.queryByText(/already picked stays on the list/)).toBeNull();
  });

  test("create mode is unchanged: the New shelf title, no Delete", () => {
    setup();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("New ask");
    expect(screen.queryByRole("button", { name: /Delete/ })).toBeNull();
  });
});

// Inside the full-screen Ask screen (2026-11-13): the same form, with the host's heading, preview pill
// and close button above it — so none of its own; the intro line and every field stay.
describe("embedded in the Ask screen", () => {
  test("no heading, helper line, close or Cancel of its own; the fields and the one full-width Save are there", () => {
    const onClose = jest.fn();
    render(<NewShelfSheet embedded catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={onClose}
      closeButton={<button type="button" aria-label="Close">x</button>} />);
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    expect(screen.queryByText(/Pick-lists for family and guests/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    expect(nameInput()).toBeInTheDocument();
    expect(save()).toBeDisabled();
    expect(footerOf(save()).querySelectorAll("button")).toHaveLength(1);
    expect(document.querySelector(".ask-form")).toHaveClass("ask-form-screen");
    expect(screen.getByTestId("new-shelf-catalog")).toHaveClass("ask-search-list");   // the search view's own scroller (F2 revised)
  });
  test("a save still closes through onClose, so the host's sheet closes with it", async () => {
    const onClose = jest.fn();
    render(<NewShelfSheet embedded catalogItems={ITEMS} asks={[]} onCreate={jest.fn(async () => ({ ok: true, id: "x" }))} onClose={onClose} closeButton={null} />);
    readyDraft("Nina");
    await saveAndClose(onClose);
  });
});

// The Explorer photo nudge (SPEC_ask_slice4 S4-7): a camera on a photo-less chip, Explorer only;
// a muted hint naming them; the tap runs the same photo flow as Browse; never a block.
describe("the Explorer photo nudge (S4-7)", () => {
  const style = (name) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });
  const cameras = () => screen.queryAllByRole("button", { name: /^Add a photo of / });
  const hint = () => screen.queryByText(/^Explorers pick by picture\./);
  const chips = () => screen.getAllByRole("listitem").map((li) => li.querySelector(".shelf-tile-name").textContent);
  function setupPhoto({ photoIds = new Set(["i-apples"]), photoUrl = () => null, onPhoto = jest.fn(async () => ({ ok: true })) } = {}) {
    const view = render(<NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={jest.fn()} closeButton={null}
      photoIds={photoIds} photoUrl={photoUrl} onPhoto={onPhoto} />);
    const rerender = (ids) => view.rerender(<NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={jest.fn()} closeButton={null}
      photoIds={ids} photoUrl={photoUrl} onPhoto={onPhoto} />);
    // eslint-disable-next-line testing-library/no-node-access
    return { onPhoto, rerender, container: view.container, input: () => view.container.querySelector("input[type=file]") };
  }
  test("the grid: a photo tile shows the thumb and is a Change button; a photo-less tile is a dashed camera box that opens the photo flow, on Shopper too; × removes; Explorer adds the hint", () => {
    setupPhoto({ photoUrl: (id) => (id === "i-apples" ? "https://x/apples.webp" : null) });
    pick("Goldfish"); pick("Apples"); pick("Yogurt");
    // Shelf order, three tiles; the name under each.
    expect(chips()).toEqual(["Goldfish", "Apples", "Yogurt"]);
    // Apples has a photo: its thumb, inside a button that replaces it (SPEC_ask_setup_polish F1).
    const apples = screen.getAllByRole("listitem")[1];
    expect(apples.querySelector("img")).toHaveAttribute("src", "https://x/apples.webp");
    expect(apples.querySelector("img")).toHaveClass("op-replay-block");
    expect(apples.querySelector("button.shelf-tile-art.shelf-tile-photo")).toHaveAttribute("aria-label", "Change the photo of Apples");
    // The other two are dashed camera boxes that open the photo flow — on Shopper as well.
    expect(cameras().map((b) => b.getAttribute("aria-label"))).toEqual(["Add a photo of Goldfish", "Add a photo of Yogurt"]);
    expect(cameras()[0]).toHaveClass("shelf-tile-empty");
    expect(screen.getByRole("list", { name: "On the ask" }).querySelectorAll(".cat-pill")).toHaveLength(0);   // no chips any more
    expect(hint()).toBeNull();                                            // the hint is Explorer's
    // × in the corner removes.
    fireEvent.click(screen.getByRole("button", { name: "Take Apples off the ask" }));
    expect(chips()).toEqual(["Goldfish", "Yogurt"]);
    expect(formText("The ask · 2 items")).toBeInTheDocument();
    pick("Apples");
    fireEvent.click(style("Explorer"));
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
    expect(cameras()).toHaveLength(3);   // the grid is the same on Shopper
    expect(hint()).toBeNull();           // only the hint is Explorer's
  });
  test("a photo-less tile runs the photo flow for that item; with the photo in, the tile is a photo tile and the hint moves on", async () => {
    const { onPhoto, rerender, input } = setupPhoto();
    fireEvent.click(style("Explorer"));
    pick("Goldfish"); pick("Yogurt");
    fireEvent.click(screen.getByRole("button", { name: "Add a photo of Goldfish" }));
    const file = new File(["x"], "goldfish.jpg", { type: "image/jpeg" });
    fireEvent.change(input(), { target: { files: [file] } });
    await waitFor(() => expect(onPhoto).toHaveBeenCalledWith("i-goldfish", file));
    rerender(new Set(["i-apples", "i-goldfish"]));
    expect(cameras().map((b) => b.getAttribute("aria-label"))).toEqual(["Add a photo of Yogurt"]);
    expect(screen.getAllByRole("listitem")[0].querySelector(".shelf-tile-photo")).not.toBeNull();   // Goldfish, now a photo tile
    expect(hint()).toHaveTextContent("Add a photo for Yogurt.");
  });
  test("F1: a tap on a photo tile replaces that item's photo through the same flow, with the old thumb under a dimmed …", async () => {
    let finish;
    const onPhoto = jest.fn(() => new Promise((r) => { finish = r; }));
    const { input } = setupPhoto({ onPhoto, photoUrl: (id) => (id === "i-apples" ? "https://x/apples.webp" : null) });
    pick("Apples");
    const tile = screen.getByRole("button", { name: "Change the photo of Apples" });
    fireEvent.click(tile);
    const file = new File(["x"], "apples2.jpg", { type: "image/jpeg" });
    fireEvent.change(input(), { target: { files: [file] } });
    await waitFor(() => expect(onPhoto).toHaveBeenCalledWith("i-apples", file));
    expect(tile).toBeDisabled();
    expect(tile.querySelector("img")).toHaveAttribute("src", "https://x/apples.webp");   // the old photo stays visible
    expect(tile.querySelector(".shelf-tile-busy")).toHaveTextContent("…");
    finish({ ok: true });
    await waitFor(() => expect(tile).toBeEnabled());
    expect(tile.querySelector(".shelf-tile-busy")).toBeNull();
  });
  test("F1: a tap on a photo tile, then Cancel in the chooser, changes nothing", () => {
    const { onPhoto, input } = setupPhoto();
    pick("Apples");
    fireEvent.click(screen.getByRole("button", { name: "Change the photo of Apples" }));
    fireEvent.change(input(), { target: { files: [] } });
    expect(onPhoto).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Change the photo of Apples" })).toBeEnabled();
  });
  test("a photo that fails says so in the same muted line", async () => {
    const { input } = setupPhoto({ onPhoto: jest.fn(async () => ({ ok: false, reason: "decode" })) });
    fireEvent.click(style("Explorer"));
    pick("Goldfish");
    fireEvent.click(screen.getByRole("button", { name: "Add a photo of Goldfish" }));
    fireEvent.change(input(), { target: { files: [new File(["x"], "g.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByText("Couldn't read that photo. Try another.")).toHaveClass("picker-sub");
  });
  test("without a photo flow (no onPhoto) the tiles are plain dashed boxes: nothing to tap, no hint", () => {
    const { container } = (() => { const r = setup(); return { ...r, container: document.body }; })();
    fireEvent.click(style("Explorer"));
    pick("Goldfish");
    expect(cameras()).toHaveLength(0);
    expect(container.querySelectorAll(".shelf-tile-empty")).toHaveLength(1);
    expect(hint()).toBeNull();
  });
});

// The label guard (Dan, 2026-11-11): the screen already says "Ask {Label}", so a typed "Ask " prefix
// is taken off on save (any case, repeated); a bare "Ask" stays; the duplicate check reads the clean label.
describe("the label guard", () => {
  test.each([["Ask Test", "Test"], ["ask ask Test", "Test"], ["ASK  Easton", "Easton"], ["Ask", "Ask"]])("%p saves as %p", async (typed, saved) => {
    const { onCreate, onClose } = setup();
    readyDraft(typed);
    await saveAndClose(onClose);
    expect(onCreate.mock.calls[0][1].label).toBe(saved);
  });
  test("'Ask Easton' beside an existing Easton is the usual duplicate; the field keeps what was typed", () => {
    setup({ asks: [EASTON] });
    readyDraft("Ask Easton");
    expect(screen.getByRole("alert")).toHaveTextContent("You already have Ask Easton.");
    expect(nameInput()).toHaveValue("Ask Easton");
    expect(save()).toBeDisabled();
  });
});

// What stays of F2's first round (SPEC_ask_setup_polish, F2 revised): the search input's attributes and
// result rows that keep the focus in it.
describe("the search input (F2 keepers)", () => {
  const search = () => { openSearch(); return screen.getByRole("searchbox", { name: "Find an item for the ask" }); };
  test("asks iOS not to autofill a contact", () => {
    setup();
    expect(search()).toHaveAttribute("name", "ask-item-search");
    expect(search()).toHaveAttribute("enterkeyhint", "search");
    expect(search()).toHaveAttribute("autocomplete", "off");
    expect(search()).toHaveAttribute("autocorrect", "off");
  });
  test("a result tap keeps the focus in the field: its mousedown is prevented, the click still adds", () => {
    setup();
    openSearch();
    for (const name of ["Goldfish", "Apples"]) {
      const row = screen.getByRole("button", { name });
      expect(fireEvent.mouseDown(row)).toBe(false);
      fireEvent.click(row);
    }
    expect(formText("The ask · 2 items")).toBeInTheDocument();
  });
});

// SPEC_ask_setup_polish F3: a search with no match creates the item without leaving the ask.
describe("create an item from the ask (F3)", () => {
  const CATS = [{ rawName: "Snacks", label: "Snacks", glyph: "🍿" }, { rawName: "Pantry", label: "Pantry", glyph: "🥫" }];
  const search = () => { openSearch(); return screen.getByRole("searchbox", { name: "Find an item for the ask" }); };
  const tileNames = () => screen.queryAllByRole("listitem").map((li) => li.querySelector(".shelf-tile-name").textContent);
  const aisle = (name) => screen.getByRole("button", { name: new RegExp(`${name}$`) });
  function setupCreate(onCreateItem) {
    render(<NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={jest.fn()} closeButton={null}
      onCreateItem={onCreateItem} createCategories={CATS} />);
  }
  test("no match: the card shows the typed name and the aisles; a tap creates it, puts it on the shelf and clears the search", async () => {
    const onCreateItem = jest.fn(async (name) => ({ id: "i-new", name }));
    setupCreate(onCreateItem);
    fireEvent.change(search(), { target: { value: "  Fia's crackers " } });
    expect(screen.queryByText("Nothing in your catalog matches that.")).toBeNull();
    expect(screen.getByText(/^Add/).closest(".ask-create-card")).toHaveTextContent(`Add "Fia's crackers"`);
    expect(screen.getByRole("group", { name: "Category for the new item" }).querySelectorAll(".cat-pill")).toHaveLength(2);
    fireEvent.click(aisle("Snacks"));
    await waitFor(() => expect(tileNames()).toEqual(["Fia's crackers"]));
    expect(onCreateItem).toHaveBeenCalledWith("Fia's crackers", "Snacks");
    expect(search()).toHaveValue("");
    expect(formText("The ask · 1 item")).toBeInTheDocument();
  });
  test("the aisles are disabled while it saves; a failure keeps the name and says so under the card", async () => {
    let finish;
    const onCreateItem = jest.fn(() => new Promise((r) => { finish = r; }));
    setupCreate(onCreateItem);
    fireEvent.change(search(), { target: { value: "Fia's crackers" } });
    fireEvent.click(aisle("Snacks"));
    expect(aisle("Snacks")).toBeDisabled();
    expect(aisle("Pantry")).toBeDisabled();
    fireEvent.click(aisle("Pantry"));
    expect(onCreateItem).toHaveBeenCalledTimes(1);
    await act(async () => finish(null));
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't add that item. Try again.");
    expect(search()).toHaveValue("Fia's crackers");
    expect(tileNames()).toEqual([]);
    expect(aisle("Snacks")).toBeEnabled();
    fireEvent.change(search(), { target: { value: "Fia's crackers!" } });   // typing again clears the message
    expect(screen.queryByRole("alert")).toBeNull();
  });
  test("a returned existing row (a hidden match) joins the shelf once, never twice", async () => {
    const onCreateItem = jest.fn(async () => ({ id: "i-goldfish", name: "Goldfish" }));
    setupCreate(onCreateItem);
    pick("Goldfish");
    fireEvent.change(search(), { target: { value: "gold fish" } });
    fireEvent.click(aisle("Snacks"));
    await waitFor(() => expect(search()).toHaveValue(""));
    expect(tileNames()).toEqual(["Goldfish"]);
  });
  test("without onCreateItem the old line stays", () => {
    setup();
    fireEvent.change(search(), { target: { value: "Fia's crackers" } });
    expect(screen.getByText("Nothing in your catalog matches that.")).toBeInTheDocument();
    expect(document.querySelector(".ask-create-card")).toBeNull();
  });
});

// New tiles fade in (kept from 52a205d).
describe("tile fade-in", () => {
  test("only a tile added after the form opened fades in", () => {
    render(<NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={jest.fn()} closeButton={null}
      edit={{ id: "a1", label: "Easton", shelfNoun: "", pickTarget: 3, screenStyle: "standard", tiles: [{ id: "i-apples", name: "Apples" }] }} onUpdate={jest.fn()} />);
    pick("Goldfish");
    const tiles = screen.getAllByRole("listitem");
    expect(tiles[0]).not.toHaveClass("shelf-tile-new");   // Apples, prefilled
    expect(tiles[1]).toHaveClass("shelf-tile-new");       // Goldfish, just added
  });
});

// SPEC_ask_setup_polish F2 (revised 2026-11-16 22:52): search gets its own view; nothing moves the form.
describe("the search view (F2 revised)", () => {
  const findButton = () => screen.getByRole("button", { name: /Find or add an item/ });
  const view = () => document.querySelector(".ask-search");
  const input = () => document.querySelector(".ask-search input[type=search]");
  test("on the form, 'Find or add an item' is a button styled like the field, not an input", () => {
    setup();
    expect(findButton().tagName).toBe("BUTTON");
    expect(findButton()).toHaveClass("modal-input");
    expect(document.querySelector(".ask-form-shelf input[type=search]")).toBeNull();
  });
  test("closed, the view is hidden from assistive tech and its controls are out of the tab order", () => {
    setup();
    expect(view()).not.toHaveClass("open");
    expect(view()).toHaveAttribute("aria-hidden", "true");
    expect(input()).toHaveAttribute("tabindex", "-1");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
  test("ONE tap opens it with the focus already in the input — synchronously, in the same handler (no timers)", () => {
    jest.useFakeTimers();
    try {
      setup();
      fireEvent.click(findButton());
      expect(view()).toHaveClass("open");
      expect(document.activeElement).toBe(input());   // before any timer or effect could run
      expect(view()).not.toHaveAttribute("aria-hidden");
    } finally { jest.useRealTimers(); }
  });
  test("the count line: 'The ask · N', then 'Added:' with the names in shelf order; a second tap takes one off", () => {
    setup();
    pick("Goldfish"); pick("Apples");
    const count = document.querySelector(".ask-search-count");
    expect(count).toHaveTextContent("The ask · 2 items");
    expect(count).toHaveTextContent("Added: Goldfish, Apples");
    pick("Apples");                                                   // a second tap takes it off
    expect(count).toHaveTextContent("The ask · 1 item");
    expect(count).toHaveTextContent("Added: Goldfish");
  });
  test("return only drops the keyboard (blur); the view stays open", () => {
    setup();
    fireEvent.click(findButton());
    expect(document.activeElement).toBe(input());
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(document.activeElement).not.toBe(input());
    expect(view()).toHaveClass("open");
  });
  test("Done blurs, closes and clears the query; the form's scroll is untouched; Escape closes too", () => {
    const { container } = render(<div className="ask-editor-body"><NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={jest.fn()} closeButton={null} embedded /></div>);
    const body = container.querySelector(".ask-editor-body");
    let scrollTop = 420;
    const writes = [];
    Object.defineProperty(body, "scrollTop", { configurable: true, get: () => scrollTop, set: (v) => { writes.push(v); scrollTop = v; } });
    fireEvent.click(findButton());
    fireEvent.change(input(), { target: { value: "gold" } });
    fireEvent.click(screen.getByRole("button", { name: "Goldfish" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(view()).not.toHaveClass("open");
    expect(document.activeElement).not.toBe(input());
    expect(input()).toHaveValue("");
    expect(writes).toEqual([]);                                      // nothing ever moved the form
    expect(scrollTop).toBe(420);
    expect(within(document.querySelector(".ask-form-shelf")).getByText("The ask · 1 item")).toBeInTheDocument();
    fireEvent.click(findButton());
    fireEvent.keyDown(input(), { key: "Escape" });
    expect(view()).not.toHaveClass("open");
  });
  test("a create keeps the focus: the aisle's mousedown is prevented; the query clears for the next name", async () => {
    render(<NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={jest.fn()} closeButton={null}
      onCreateItem={jest.fn(async (name) => ({ id: "i-new", name }))} createCategories={[{ rawName: "Snacks", label: "Snacks", glyph: "🍿" }]} />);
    fireEvent.click(findButton());
    fireEvent.change(input(), { target: { value: "Fia's crackers" } });
    const aisle = screen.getByRole("button", { name: /Snacks$/ });
    expect(fireEvent.mouseDown(aisle)).toBe(false);
    fireEvent.click(aisle);
    await waitFor(() => expect(input()).toHaveValue(""));
    expect(document.activeElement).toBe(input());
    expect(document.querySelector(".ask-search-count")).toHaveTextContent("Added: Fia's crackers");
  });
  test("Edit Ask uses the same view; 'Added:' names a tile hidden from this Browse from its row", () => {
    render(<NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onUpdate={jest.fn()} onClose={jest.fn()} closeButton={null}
      edit={{ id: "a1", label: "Easton", shelfNoun: "", pickTarget: 3, screenStyle: "standard", tiles: [{ id: "i-hidden", name: "Licorice" }, { id: "i-apples", name: "Apples" }] }} />);
    fireEvent.click(findButton());
    expect(document.querySelector(".ask-search-count")).toHaveTextContent("Added: Licorice, Apples");
  });
  test("held on the source: the open handler shows the view with flushSync and focuses in the same call; no focus from an effect or a timeout", () => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "NewShelfSheet.js"), "utf8");
    const open = src.slice(src.indexOf("const openSearch = () => {"), src.indexOf("const closeSearch = () => {"));
    expect(open).toMatch(/flushSync\(\(\) => setSearchOpen\(true\)\);\s*(\/\/[^\n]*\n\s*)?searchField\.current\?\.focus\(/);
    expect(open).not.toMatch(/setTimeout|requestAnimationFrame|useEffect/);
    expect(src).not.toMatch(/useEffect\([^)]*\{[^}]*\.focus\(/);
  });
});
