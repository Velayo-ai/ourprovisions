/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the sheet is audited as raw DOM: which fields render, with what, under which banner. */
// Run: CI=true npx react-scripts test --watchAll=false src/GiftArrival
//
// SPEC_meal_sharing_phase_a_client Commit 3 — the prefilled New Meal form for a received gift
// (10-07 frame 6 with the SPEC's words; C6 / V35), rendered through MealSheet with a `gift`:
//   the banner "{Giver} gave you this. It’s your copy to change." (+ "Adding to {place}" with 2+ places),
//   the note as a quote with "— {Giver}", NOT a field; the name, steps, Good for, From (only when the
//   snapshot has an attribution — never the giver) and the ingredients landed by NAME through the
//   place's own resolver; the doors folded; "Not for us" / "Add to our meals".
import { render, fireEvent, waitFor } from "@testing-library/react";
import { giftDraft, giftBanner, giftNoteQuote, placeLine } from "./lib/giftArrival";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { MealSheet } = require("./App");

const SNAP = {
  name: "Famous Grilled Cheese & Pickle", base_servings: 1, instructions: "1. Butter the bread.\n2. Grill.", occasion: ["lunch"], attribution: "Easton",
  ingredients: [{ name: "Sourdough bread", category: "Bakery", quantity_per_serving: 4 }, { name: "Dill pickles", category: null, quantity_per_serving: 1 }],
  giver_first_name: "Andrew",
};
const noop = () => {};
function giftFor(snap, over = {}) {
  const giverFirst = snap.giver_first_name || "";
  return { code: "K7M2P9ABCDEFGH23", giftId: "g1", hasPhoto: false, giverFirst, mealName: snap.name, draft: giftDraft(snap, { giverFirst }),
    banner: giftBanner(giverFirst), note: giftNoteQuote("Easton’s favourite. Don’t skip the pickle.", giverFirst), placeLine: placeLine("Madbury", 2), ...over };
}
function sheet(gift, over = {}) {
  const h = { onCancel: jest.fn(), onCommit: jest.fn(), onCreateCatalogItem: jest.fn(async (name, category) => ({ id: `pending:${name}`, name, category: category || null })) };
  const utils = render(
    <MealSheet mode="create" meal={null} catalogMap={{}} categories={[]} saving={false} deleting={false}
      onDelete={noop} onRegisterCategory={noop} onRequestSuggestion={jest.fn()} onRequestImport={jest.fn()} isSignedIn gift={gift} {...h} {...over} />,
  );
  return { ...utils, h };
}
const q = (c, s) => c.querySelector(s);
const qa = (c, s) => Array.from(c.querySelectorAll(s));
const nameInput = (c) => q(c, 'input[placeholder="Taco Night"]');
const labels = (c) => qa(c, ".modal-label").map((l) => (l.firstElementChild && l.firstElementChild.tagName === "SPAN" ? l.firstElementChild : l).textContent.trim());

describe("the received meal's form", () => {
  test("banner with the giver's name and the place line; the note as a quote, not a field; the title stays New Meal", async () => {
    const { container } = sheet(giftFor(SNAP));
    await waitFor(() => expect(nameInput(container).value).toBe("Famous Grilled Cheese & Pickle"));
    expect(q(container, "h2").textContent).toBe("New Meal");
    const banner = q(container, ".op-gift-banner");
    expect(banner.getAttribute("role")).toBe("status");
    expect(banner.textContent).toBe("Andrew gave you this. It’s your copy to change. · Adding to Madbury");
    const note = q(container, ".op-gift-note");
    expect(note.tagName).toBe("BLOCKQUOTE");
    expect(note.textContent).toBe("“Easton’s favourite. Don’t skip the pickle.”— Andrew");
    expect(qa(note, "input, textarea")).toHaveLength(0);
  });

  test("the fields land: name, steps, From = the snapshot's attribution, the ingredients by name through the place's resolver", async () => {
    const { container, h } = sheet(giftFor(SNAP));
    await waitFor(() => expect(h.onCreateCatalogItem).toHaveBeenCalledTimes(2));
    expect(h.onCreateCatalogItem.mock.calls.map((c) => c[0])).toEqual(["Sourdough bread", "Dill pickles"]);
    await waitFor(() => expect(q(container, "#ing-name-1")).not.toBeNull());
    expect(q(container, "#ing-name-0").textContent).toContain("Sourdough bread");
    expect(q(container, "#ing-name-1").textContent).toContain("Dill pickles");
    expect(labels(container)).toContain("From");
    expect(q(container, 'input[aria-label="Where this recipe came from"]').value).toBe("Easton");
    expect(container.textContent).toContain("Butter the bread");   // steps land in read mode (landDraft), as text
  });

  test("C6 / V35: an empty attribution → no From field at all (never the giver)", async () => {
    const { container } = sheet(giftFor({ ...SNAP, attribution: "" }));
    await waitFor(() => expect(nameInput(container).value).toBe("Famous Grilled Cheese & Pickle"));
    expect(labels(container)).not.toContain("From");
    expect(container.textContent).not.toMatch(/From Andrew|from Andrew/);
  });

  test("the doors are folded: no Galley card, no 'Ask the Galley again' handle, no import banner", async () => {
    const { container } = sheet(giftFor(SNAP));
    await waitFor(() => expect(nameInput(container).value).toBe("Famous Grilled Cheese & Pickle"));
    expect(q(container, ".op-galley")).toBeNull();
    expect(q(container, ".op-ask-again")).toBeNull();
    expect(q(container, ".op-import-banner")).toBeNull();
  });

  test("'Not for us' cancels and writes nothing; 'Add to our meals' commits the landed fields with the attribution", async () => {
    const { container, h } = sheet(giftFor(SNAP));
    await waitFor(() => expect(q(container, "#ing-name-1")).not.toBeNull());
    expect(q(container, ".modal-cancel").textContent).toBe("Not for us");
    expect(q(container, ".modal-confirm").textContent).toBe("Add to our meals");
    fireEvent.click(q(container, ".modal-confirm"));
    expect(h.onCommit).toHaveBeenCalledTimes(1);
    const payload = h.onCommit.mock.calls[0][0];
    expect(payload.name).toBe("Famous Grilled Cheese & Pickle");
    expect(payload.attribution).toBe("Easton");
    expect(payload.ingredients.map((r) => r.name)).toEqual(["Sourdough bread", "Dill pickles"]);
    expect(payload.ingredients.map((r) => r.quantity_per_serving)).toEqual([4, 1]);
    fireEvent.click(q(container, ".modal-cancel"));
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });

  test("C10: the gift photo sits above the banner, read-only, .op-photo .op-replay-block, captioned 'Comes with the meal.'; no photo → no slot", async () => {
    const url = "https://x/gift-photos/sign/g1/view.jpg?token=t";
    const { container } = sheet(giftFor(SNAP, { hasPhoto: true, photoExt: "jpg", photoUrl: url }));
    await waitFor(() => expect(nameInput(container).value).toBe("Famous Grilled Cheese & Pickle"));
    const fig = q(container, ".op-gift-photo");
    expect(fig.tagName).toBe("FIGURE");
    const img = q(fig, "img");
    expect(img.getAttribute("src")).toBe(url);
    expect(img.getAttribute("alt")).toBe("");
    expect(img.className.split(" ")).toEqual(expect.arrayContaining(["op-photo", "op-replay-block"]));
    expect(q(fig, ".op-gift-photo-cap").textContent).toBe("Comes with the meal.");
    expect(qa(fig, "button, input, textarea")).toHaveLength(0);
    expect(fig.compareDocumentPosition(q(container, ".op-gift-banner")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const none = sheet(giftFor(SNAP));
    expect(q(none.container, ".op-gift-photo")).toBeNull();
  });

  test("no gift → the ordinary New Meal: Cancel / Save Meal, no banner", () => {
    const { container } = sheet(null);
    expect(q(container, ".op-gift-banner")).toBeNull();
    expect(q(container, ".modal-cancel").textContent).toBe("Cancel");
    expect(q(container, ".modal-confirm").textContent).toBe("Save Meal");
  });

  test("replay: no attribute carries the meal name, the giver or the code", async () => {
    const { container } = sheet(giftFor(SNAP));
    await waitFor(() => expect(q(container, "#ing-name-1")).not.toBeNull());
    qa(container, "*").forEach((el) => Array.from(el.attributes).forEach((a) => {
      if (a.name === "value" || a.name === "placeholder") return;   // input values are masked by the recorder; placeholders are fixed copy
      expect(a.value).not.toMatch(/Grilled|Pickle|Andrew|K7M2P9/);
    }));
  });
});
