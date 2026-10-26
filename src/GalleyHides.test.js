/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the sheet is audited as raw DOM: which fields render, in what order. */
// Run: CI=true npx react-scripts test --watchAll=false src/GalleyHides
//
// SPEC_galley_hides_manual + its Step 0 amendment (2026-10-25): once the Galley has input — typed,
// dictated or a staged photo — New Meal's name / From / Good for / Ingredients / Steps and the "or"
// hide; they return when the Galley empties. Trigger: !isEdit && draftSource === null && galleyHasInput.
import { render, fireEvent, act, waitFor } from "@testing-library/react";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
// Staging needs a canvas (downscale); jsdom has none. The stub stages one photo per file — a plain
// function, not jest.fn: CRA's resetMocks wipes a jest.fn implementation before every test.
jest.mock("./lib/stagePhotos", () => {
  const real = jest.requireActual("./lib/stagePhotos");
  return {
    ...real,
    stagePhotos: async (files, { nextId }) => ({
      made: Array.from(files).map(() => ({ id: nextId(), url: "blob:x", blob: new Blob(["x"]), bytes: 1, originalBytes: 1, type: "image/jpeg" })),
      hints: [],
    }),
  };
});
const { MealSheet } = require("./App");

const noop = () => {};
const MEAL = { id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", name: "Taco Night", occasion: [], instructions: "", attribution: "", meal_ingredients: [] };
function sheet(over = {}) {
  return render(
    <MealSheet mode="create" meal={null} catalogMap={{}} categories={[]} saving={false} deleting={false}
      onCancel={noop} onCommit={noop} onDelete={noop} onCreateCatalogItem={jest.fn(async () => null)} onRegisterCategory={noop}
      onRequestSuggestion={jest.fn()} onRequestImport={jest.fn()} isSignedIn {...over} />,
  );
}
const q = (c, s) => c.querySelector(s);
const nameInput = (c) => q(c, 'input[placeholder="Taco Night"]');
// A label's own words: "Steps" holds an "Edit steps" button, so read its first <span> when it has one.
const labels = (c) => Array.from(c.querySelectorAll(".modal-label")).map((l) => {
  const own = l.firstElementChild && l.firstElementChild.tagName === "SPAN" ? l.firstElementChild : l;
  return own.textContent.trim();
});
const fieldsShown = (c) => !!nameInput(c) && labels(c).includes("Ingredients") && labels(c).includes("Steps") && !!q(c, ".op-or");
const fieldsGone = (c) => !nameInput(c) && !labels(c).includes("Ingredients") && !labels(c).includes("Steps") && !q(c, ".op-or")
  && !Array.from(c.querySelectorAll("*")).some((el) => el.textContent === "Good for");
const type = (c, v) => fireEvent.change(q(c, ".op-galley-ta"), { target: { value: v } });

describe("asking the Galley hides the hand-build fields (New Meal)", () => {
  test("1: empty — every field, the or, and the Galley show", () => {
    const { container } = sheet();
    expect(fieldsShown(container)).toBe(true);
    expect(q(container, ".op-galley")).not.toBeNull();
  });

  test("2: one letter hides name, Good for, Ingredients, Steps and the or; title, ✕, Galley and footer stay", () => {
    const { container } = sheet();
    type(container, "t");
    expect(fieldsGone(container)).toBe(true);
    expect(q(container, "h2").textContent).toBe("New Meal");
    expect(q(container, ".sheet-close")).not.toBeNull();
    expect(q(container, ".op-galley")).not.toBeNull();
    expect(q(container, ".op-galley-go")).not.toBeNull();
    expect(q(container, ".modal-cancel")).not.toBeNull();
    expect(q(container, ".modal-confirm").disabled).toBe(true);
  });

  test("whitespace alone is not input (trimmed, like galleyHasInput)", () => {
    const { container } = sheet();
    type(container, "   ");
    expect(fieldsShown(container)).toBe(true);
  });

  test("3: deleting back to empty brings the fields back, empty", () => {
    const { container } = sheet();
    type(container, "tacos");
    type(container, "");
    expect(fieldsShown(container)).toBe(true);
    expect(nameInput(container).value).toBe("");
  });

  test("4: the box's ✕ brings them back", () => {
    const { container } = sheet();
    type(container, "tacos");
    fireEvent.click(q(container, '[aria-label="Clear request"]'));
    expect(fieldsShown(container)).toBe(true);
  });

  test("5: a staged photo (no text) hides them; removing it brings them back", async () => {
    const { container } = sheet();
    const input = q(container, 'input[type="file"]');
    fireEvent.change(input, { target: { files: [new File(["x"], "a.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(q(container, ".op-galley-th")).not.toBeNull());
    expect(fieldsGone(container)).toBe(true);
    fireEvent.click(q(container, ".op-galley-x"));
    expect(fieldsShown(container)).toBe(true);
  });

  test("(b) a name typed first hides with the rest, stays in state, and returns when the Galley empties", () => {
    const { container } = sheet();
    fireEvent.change(nameInput(container), { target: { value: "Fish Tacos" } });
    expect(q(container, ".op-galley")).not.toBeNull();   // a name does not hide the Galley (d: unchanged)
    type(container, "something spicy");
    expect(fieldsGone(container)).toBe(true);
    type(container, "");
    expect(nameInput(container).value).toBe("Fish Tacos");
  });

  test("7 + (e): Create a meal — the fields stay hidden through thinking; the draft lands, they return filled", async () => {
    let resolve;
    const onRequestSuggestion = jest.fn(() => new Promise((r) => { resolve = r; }));
    const { container } = sheet({ onRequestSuggestion });
    type(container, "a quick weeknight curry");
    fireEvent.click(q(container, ".op-galley-go"));
    await waitFor(() => expect(q(container, ".op-never-mind")).not.toBeNull());
    expect(onRequestSuggestion).toHaveBeenCalled();
    expect(q(container, ".op-never-mind")).not.toBeNull();   // thinking
    expect(fieldsGone(container)).toBe(true);                // no skeletons under the title
    await act(async () => { resolve({ draft: { name: "Chickpea Curry", instructions: "1. Simmer.", ingredients: [] } }); });
    expect(nameInput(container).value).toBe("Chickpea Curry");
    expect(labels(container)).toEqual(expect.arrayContaining(["Ingredients", "Steps"]));
    expect(q(container, ".op-galley")).toBeNull();             // 10-03 / collapsed after landing
  });

  test("8: Never mind during thinking — back to the typed request, the fields still hidden", async () => {
    const onRequestSuggestion = jest.fn(() => new Promise(() => {}));
    const { container } = sheet({ onRequestSuggestion });
    type(container, "a quick weeknight curry");
    fireEvent.click(q(container, ".op-galley-go"));
    await waitFor(() => expect(q(container, ".op-never-mind")).not.toBeNull());
    fireEvent.click(q(container, ".op-never-mind"));
    expect(q(container, ".op-galley-ta").value).toBe("a quick weeknight curry");
    expect(fieldsGone(container)).toBe(true);
  });

  test("after a landed draft, 'Ask the Galley again' never hides the filled fields (draftSource guard)", async () => {
    let resolve;
    const { container } = sheet({ onRequestSuggestion: jest.fn(() => new Promise((r) => { resolve = r; })) });
    type(container, "a quick weeknight curry");
    fireEvent.click(q(container, ".op-galley-go"));
    await waitFor(() => expect(q(container, ".op-never-mind")).not.toBeNull());
    await act(async () => { resolve({ draft: { name: "Chickpea Curry", instructions: "1. Simmer.", ingredients: [] } }); });
    fireEvent.click(q(container, ".op-ask-again"));
    expect(q(container, ".op-galley-ta").value).toBe("a quick weeknight curry");
    expect(nameInput(container).value).toBe("Chickpea Curry");
    expect(labels(container)).toEqual(expect.arrayContaining(["Ingredients", "Steps"]));
  });
});

describe("Edit Meal is unchanged (G6)", () => {
  test("10: a meal with no ingredients or steps shows the words-only Galley; typing in it hides nothing", () => {
    const { container } = sheet({ mode: "edit", meal: MEAL });
    expect(q(container, "h2").textContent).toBe("Edit Meal");
    type(container, "make it vegetarian");
    expect(nameInput(container).value).toBe("Taco Night");
    expect(labels(container)).toEqual(expect.arrayContaining(["Ingredients", "Steps"]));
    expect(q(container, ".op-or")).not.toBeNull();
  });
});

describe("the hide never moves the box (iPhone walk 2026-10-25, the spec's fallback)", () => {
  let calls;
  beforeEach(() => {
    calls = [];
    Element.prototype.scrollIntoView = function (opts) { calls.push({ el: this, opts }); };
  });
  afterEach(() => { delete Element.prototype.scrollIntoView; });

  test("while the fields are hidden the dialog is anchored at the top (op-anchor-top); it re-centres when they return", () => {
    const { container } = sheet();
    const dialog = () => q(container, ".modal");
    expect(dialog().classList.contains("op-anchor-top")).toBe(false);
    type(container, "t");
    expect(dialog().classList.contains("op-anchor-top")).toBe(true);
    type(container, "");
    expect(dialog().classList.contains("op-anchor-top")).toBe(false);
  });

  test("the first character scrolls the Galley card's top into view — instant, once; later characters do not", () => {
    const { container } = sheet();
    type(container, "t");
    expect(calls).toHaveLength(1);
    expect(calls[0].el).toBe(q(container, ".op-galley"));
    expect(calls[0].opts).toEqual({ block: "start", behavior: "auto" });
    type(container, "ta");
    type(container, "tac");
    expect(calls).toHaveLength(1);
  });

  test("instant under reduced motion too (never smooth)", () => {
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    const { container } = sheet();
    type(container, "t");
    expect(calls[0].opts.behavior).toBe("auto");
  });

  test("Edit Meal: no anchor, no scroll", () => {
    const { container } = sheet({ mode: "edit", meal: MEAL });
    type(container, "make it vegetarian");
    expect(q(container, ".modal").classList.contains("op-anchor-top")).toBe(false);
    expect(calls.filter((c) => c.el === q(container, ".op-galley"))).toHaveLength(0);
  });
});
