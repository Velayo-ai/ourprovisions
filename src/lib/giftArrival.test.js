// Run: CI=true npx react-scripts test --watchAll=false src/lib/giftArrival
import { giftDraft, giftBanner, giftNoteQuote, placeLine, arrivalFailure, alreadyAddedLine, thankYouPayload, giftSourcePaths, acceptCopyPaths, normName } from "./giftArrival";

const SNAP = {
  name: "Famous Grilled Cheese & Pickle", base_servings: 1, instructions: "1. Butter.\n2. Grill.", occasion: ["lunch"], attribution: "Easton",
  ingredients: [{ name: "Sourdough bread", category: "Bakery", quantity_per_serving: 4 }, { name: "Dill pickles", category: null, quantity_per_serving: 1 }],
  giver_first_name: "Andrew",
};

describe("giftDraft (the 10-07 prefilled form, C6)", () => {
  test("name, steps, Good for, From and ingredients by NAME with quantity and 'each'; never a catalog id", () => {
    const d = giftDraft(SNAP, { giverFirst: "Andrew" });
    expect(d.name).toBe("Famous Grilled Cheese & Pickle");
    expect(d.instructions).toBe("1. Butter.\n2. Grill.");
    expect(d.occasion).toEqual(["lunch"]);
    expect(d.attribution).toBe("Easton");
    expect(d.ingredients).toEqual([
      { name: "Sourdough bread", category: "Bakery", quantity: 4, unit: "each" },
      { name: "Dill pickles", category: null, quantity: 1, unit: "each" },
    ]);
    expect(JSON.stringify(d)).not.toMatch(/catalog_item_id/);
    expect(d.servingsAssumed).toBe(false);
  });
  test("C6 / V35: empty attribution stays empty — never the giver", () => {
    expect(giftDraft({ ...SNAP, attribution: "" }, { giverFirst: "Andrew" }).attribution).toBe("");
    expect(giftDraft({ ...SNAP, attribution: null }).attribution).toBe("");
  });
  test("10-07 name collision: a live meal with the same normalised name → '{name} (from {Giver})'", () => {
    expect(giftDraft(SNAP, { existingNames: ["famous  grilled cheese & pickle"], giverFirst: "Andrew" }).name).toBe("Famous Grilled Cheese & Pickle (from Andrew)");
    expect(giftDraft(SNAP, { existingNames: ["Taco Night"], giverFirst: "Andrew" }).name).toBe("Famous Grilled Cheese & Pickle");
    // no giver name to suffix with → the name stands and the person edits it
    expect(giftDraft(SNAP, { existingNames: [SNAP.name], giverFirst: "" }).name).toBe("Famous Grilled Cheese & Pickle");
  });
  test("junk in the snapshot is tolerated: no name reads 'A meal', nameless ingredients are dropped", () => {
    const d = giftDraft({ ingredients: [{ name: "" }, { quantity_per_serving: 2 }, { name: "Salt" }] });
    expect(d.name).toBe("A meal");
    expect(d.ingredients).toEqual([{ name: "Salt", category: null, quantity: 1, unit: "each" }]);
    expect(giftDraft(null).ingredients).toEqual([]);
  });
});

describe("the banner, the note, the place line", () => {
  test("the SPEC's words, with the giver's first name or 'Someone'", () => {
    expect(giftBanner("Andrew")).toBe("Andrew gave you this. It’s your copy to change.");
    expect(giftBanner("")).toBe("Someone gave you this. It’s your copy to change.");
  });
  test("the note is a quote with an attribution dash; empty → none", () => {
    expect(giftNoteQuote("Easton's favourite. Don't skip the pickle.", "Andrew")).toEqual({ quote: "“Easton's favourite. Don't skip the pickle.”", by: "— Andrew" });
    expect(giftNoteQuote("  ", "Andrew")).toBeNull();
    expect(giftNoteQuote(null, "Andrew")).toBeNull();
    expect(giftNoteQuote("Hi", "").by).toBeNull();
  });
  test("Adding to {place} only with more than one place", () => {
    expect(placeLine("Madbury", 2)).toBe("Adding to Madbury");
    expect(placeLine("Madbury", 1)).toBeNull();
  });
});

describe("arrivalFailure (072 §5 codes → plain lines)", () => {
  test("P0002, 55000, 42501, else the RPC's message", () => {
    expect(arrivalFailure({ code: "P0002", message: "preview_meal_gift: not_found" }).line).toBe("That link doesn’t work. Ask for a new one.");
    expect(arrivalFailure({ code: "55000", message: "preview_meal_gift: revoked" }).line).toBe("This one’s no longer being given.");
    expect(arrivalFailure({ code: "42501", message: "preview_meal_gift: not a member of the target household" }).line).toBe("You’re not a member of this place.");
    expect(arrivalFailure({ code: "PGRST202", message: "Could not find the function" }).line).toBe("Couldn’t open this gift: Could not find the function");
    expect(arrivalFailure(null).line).toBe("Couldn’t open this gift. Try again.");
  });
  test("already added names the place", () => {
    expect(alreadyAddedLine("Madbury")).toBe("Already in Madbury’s meals");
  });
});

describe("thankYouPayload (S24)", () => {
  test("the ask names the giver; the text names the meal; no url", () => {
    const p = thankYouPayload("Famous Grilled Cheese & Pickle", "Andrew");
    expect(p.ask).toBe("Send Andrew a thank you?");
    expect(p.text).toBe("Thank you for Famous Grilled Cheese & Pickle! Adding it to our meals.");
    expect(p.url).toBeUndefined();
    expect(thankYouPayload("", "").ask).toBe("Send them a thank you?");
  });
});

describe("the accept copy paths (S36 / S40)", () => {
  test("sources are the gift's two renditions; the copy lands under the RECEIVER's household and meal, webp, one stem", () => {
    expect(giftSourcePaths("g1")).toEqual({ view: "g1/view.webp", thumb: "g1/thumb.webp" });
    const p = acceptCopyPaths("hh", "meal", "stem");
    expect(p).toEqual({ thumbPath: "hh/meal/stem-thumb.webp", viewPath: "hh/meal/stem-view.webp" });
    expect(normName("  Taco   Night ")).toBe("taco night");
  });
});
