/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   where the name sits (.op-name, never an attribute) is the rule under test, read as raw DOM. */
import { render, screen, fireEvent } from "@testing-library/react";
import { AskScreen } from "./AskScreen";
import { ASK_LOOKS, askLook, ASK_TARGET_MAX } from "../lib/askCreate";

// The full-screen New ask / Edit ask (2026-11-13): a turquoise header with the title, the close button and
// a live preview pill once a name is typed; the Ask form below it, unchanged.
const ITEMS = [{ id: "i-goldfish", name: "Goldfish" }, { id: "i-apples", name: "Apples" }];
const EDIT = { id: "a-1", label: "Easton", shelfNoun: "snacks", pickTarget: 2, screenStyle: "simple", tiles: [{ id: "i-apples", name: "Apples" }] };

function setup(props = {}) {
  const onClose = jest.fn();
  const view = render(<AskScreen catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onUpdate={jest.fn()} onClose={onClose}
    closeButton={<button type="button" aria-label="Close" onClick={onClose}>x</button>} {...props} />);
  return { onClose, container: view.container };
}
const preview = () => document.querySelector(".ask-editor-preview");

test("New ask: a dialog with the title in the cream header; the preview is a ghost ('Ask …') until a name is typed, then 'Ask {name}' with the name in .op-name", () => {
  const { container } = setup();
  expect(screen.getByRole("dialog", { name: "New ask" })).toHaveClass("ask-editor");
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("New ask");
  expect(container.querySelector(".ask-editor-head")).not.toBeNull();
  expect(preview()).toHaveClass("cat-pill", "people-pill", "ask-editor-ghost");
  expect(preview().textContent).toBe("Ask …");
  expect(preview().querySelector(".op-name")).toBeNull();
  expect(container.textContent).not.toMatch(/\bpill\b/i);                           // our word, never on screen
  fireEvent.change(screen.getByLabelText("Who's picking?"), { target: { value: "  Nina " } });
  expect(preview()).toHaveClass("cat-pill", "people-pill");
  expect(preview()).not.toHaveClass("ask-editor-ghost");
  expect(preview().textContent).toBe("Ask Nina");                                  // trimmed, no theme yet
  expect(preview().querySelector(".op-name").textContent).toBe("Nina");
  expect(preview().querySelector("svg.ask-ico")).not.toBeNull();
  fireEvent.change(screen.getByLabelText("What are they picking? (optional)"), { target: { value: "snacks" } });
  expect(preview().textContent).toBe("Ask Nina · snacks");
  fireEvent.change(screen.getByLabelText("Who's picking?"), { target: { value: "" } });
  expect(preview()).toHaveClass("ask-editor-ghost");                                 // back to the ghost when the name goes
  expect(preview().textContent).toBe("Ask …");
  // No name in any attribute (K3) — the form's own name input (which wears .op-name) aside.
  const attrs = [...container.querySelectorAll("*:not(input)")].flatMap((el) => [...el.attributes].map((a) => a.value));
  expect(attrs.filter((v) => /Nina/.test(v))).toEqual([]);
});

test("Edit ask: the same screen, titled with the name, the preview filled from the ask; the form's own heading is not drawn twice", () => {
  setup({ edit: EDIT });
  expect(screen.getByRole("dialog", { name: "Edit ask" })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Edit Ask Easton");
  expect(preview().textContent).toBe("Ask Easton · snacks");
  expect(preview()).not.toHaveClass("ask-editor-ghost");
  expect(screen.getByLabelText("Who's picking?")).toHaveValue("Easton");
});

test("the close button closes; there is no Cancel and no helper line; the footer is the one Save", () => {
  const { onClose } = setup();
  expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  expect(screen.queryByText(/Pick-lists for family and guests/)).toBeNull();
  expect(screen.getByRole("button", { name: "Save ask" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

// The count is constrained by the chosen look's capacity, read from the look's config.
describe("How many to pick follows the look's pickCap (config, not a literal)", () => {
  const chip = (n) => screen.getByRole("radio", { name: String(n) });
  const look = (name) => screen.getByRole("radio", { name: new RegExp(`^${name}`) });
  test("Explorer disables the chips above its pickCap; Shopper allows up to the target ceiling", () => {
    setup();
    const explorer = askLook("simple"), shopper = askLook("standard");
    expect(explorer.pickCap).toBeLessThan(shopper.pickCap);
    expect(shopper.pickCap).toBe(ASK_TARGET_MAX);
    for (let n = 1; n <= ASK_TARGET_MAX; n++) expect(chip(n)).toBeEnabled();         // Shopper is the default
    fireEvent.click(look("Explorer"));
    for (let n = 1; n <= ASK_TARGET_MAX; n++) expect(chip(n).disabled).toBe(n > explorer.pickCap);
  });
  test("switching to a look with a lower cap clamps the count and updates the 'Pick N for our list.' line", () => {
    setup();
    fireEvent.click(chip(ASK_TARGET_MAX));
    expect(screen.getByText(`Pick ${ASK_TARGET_MAX} for our list.`)).toBeInTheDocument();
    fireEvent.click(look("Explorer"));
    const cap = askLook("simple").pickCap;
    expect(chip(cap)).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(`Pick ${cap} for our list.`)).toBeInTheDocument();
    // Back to Shopper: the count stays where it was clamped; nothing is raised for you.
    fireEvent.click(look("Shopper"));
    expect(chip(cap)).toHaveAttribute("aria-checked", "true");
    expect(chip(ASK_TARGET_MAX)).toBeEnabled();
  });
  test("every look in the config is offered, with its own line", () => {
    setup();
    for (const l of ASK_LOOKS) expect(look(l.name)).toHaveTextContent(l.sub);
  });
});
