/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   this test audits the RAW DOM the session recorder serialises (every attribute on
   every element) and the text nodes click-text collection reads; role queries would
   hide exactly what it must inspect. */
// Run: CI=true npx react-scripts test --watchAll=false src/components/LibraryCards
//
// Proves, in a real DOM, the three things the 2026-10-16 aria-labelledby change
// claims (closing the v1 .lib-plan replay gap):
//   (1) no ATTRIBUTE on any library element carries a meal name or an item count —
//       the session recorder copies every attribute except `title`, `alt` and the
//       on* handlers into replay snapshots and masks only text nodes;
//   (2) the allow-listed buttons' TEXT is fixed copy — click-text collection reads
//       text nodes (getTextFromNode), never attributes;
//   (3) the accessible names read exactly as before (dom-accessibility-api is the
//       algorithm testing-library and the browsers' accessibility trees use;
//       axe's button-name rule runs over the same DOM).
import { render } from "@testing-library/react";
import { computeAccessibleName } from "dom-accessibility-api";
import axe from "axe-core";
import { LibraryCard, LibraryRow } from "./LibraryCards";

const MEAL = {
  id: "8bcc2cb0-2a02-4677-be3d-aa935f9fb29e",
  name: "Lemon Garlic Shrimp And Spinach Pasta",
  occasion: ["dinner"],
  meal_ingredients: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }, { id: 8 }, { id: 9 }],
};
const UNTAGGED = { ...MEAL, id: "0f3a9d1e-5c2b-4a7e-9b1d-2e6f7a8b9c0d", name: "Tidewater Shrimp & Grits", occasion: [], meal_ingredients: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }] };
const NAME_TOKENS = ["Lemon", "Shrimp", "Spinach", "Pasta", "Tidewater", "Grits"];
const COUNT_TOKENS = ["9 items", "5 items", "9", "5"];
// The recorder's own skip-set (its serializer drops exactly these before copying attributes).
const RECORDER_SKIPS = (n) => n === "title" || n === "alt" || n.startsWith("on");

// What MealsLens renders once, outside every button: the fixed verb half of each name.
function Verbs() {
  return (
    <>
      <span id="lib-verb-plan" className="sr-only">Plan</span>
      <span id="lib-verb-unplan" className="sr-only">Remove from this week</span>
      <span id="lib-verb-settype" className="sr-only">Set meal type for</span>
      <span id="lib-verb-open" className="sr-only">Open</span>
    </>
  );
}
const noop = () => {};
const props = { busy: false, canPlan: true, onPlan: noop, onUnplan: noop, onOpen: noop, onSetType: noop };

function attributesOf(container) {
  const out = [];
  container.querySelectorAll("*").forEach((el) => {
    for (const a of el.attributes) if (!RECORDER_SKIPS(a.name)) out.push({ tag: el.tagName, name: a.name, value: a.value });
  });
  return out;
}

describe("replay-safe attributes (1)", () => {
  test.each([
    ["grid card, Plan", <LibraryCard meal={MEAL} stage="none" {...props} />],
    ["grid card, planned", <LibraryCard meal={MEAL} stage="planned" {...props} />],
    ["grid card, ready chip", <LibraryCard meal={MEAL} stage="ready" {...props} />],
    ["grid card, untagged + Set type", <LibraryCard meal={UNTAGGED} stage="none" {...props} />],
    ["list row, Plan", <LibraryRow meal={MEAL} stage="none" {...props} />],
    ["list row, untagged + Set meal type", <LibraryRow meal={UNTAGGED} stage="none" {...props} />],
  ])("%s: no attribute the recorder would copy carries a meal name or a count", (_, ui) => {
    const { container } = render(<><Verbs />{ui}</>);
    const attrs = attributesOf(container);
    expect(attrs.length).toBeGreaterThan(5);
    for (const { tag, name, value } of attrs) {
      const where = `${tag} ${name}="${value}"`;
      // a meal-name token in ANY attribute fails (the recorder copies them all)
      for (const t of NAME_TOKENS) expect(where).not.toMatch(new RegExp(`\\b${t}\\b`));
      // the count: never as "N items" anywhere, and never as a bare number in an attribute that
      // carries words or ids (aria-*, id, class, data-*). SVG geometry (stroke-width="1.5",
      // viewBox, path data) is not a count.
      expect(where).not.toMatch(/\b\d+\s+items?\b/);
      const wordy = /^(aria-|id$|class$|data-)/.test(name);
      const bareCounts = wordy ? COUNT_TOKENS.filter((t) => new RegExp(`(^|[^\\w-])${t.replace(" ", "\\s")}($|[^\\w-])`).test(where)) : [];
      expect(bareCounts).toEqual([]);
    }
    // and no aria-label at all on the three classes
    container.querySelectorAll(".lib-plan, .lib-settype, .lib-gbody, .lib-rbody").forEach((b) => expect(b.hasAttribute("aria-label")).toBe(false));
  });

  test("the only place the name lives is the title element's TEXT, under a uuid-based id", () => {
    const { container } = render(<><Verbs /><LibraryCard meal={MEAL} stage="none" {...props} /></>);
    const title = container.querySelector(`#meal-name-${MEAL.id}`);
    expect(title.textContent).toBe("Lemon Garlic Shrimp and Spinach Pasta");
    expect(title.id).toBe(`meal-name-${MEAL.id}`);
  });
});

describe("click text is fixed copy (2)", () => {
  test("grid: .lib-plan has no text (icon only); planned the same; .lib-settype reads '+ Set type'", () => {
    const a = render(<><Verbs /><LibraryCard meal={MEAL} stage="none" {...props} /></>).container;
    expect(a.querySelector(".lib-plan").textContent.trim()).toBe("");
    const b = render(<><Verbs /><LibraryCard meal={MEAL} stage="planned" {...props} /></>).container;
    expect(b.querySelector(".lib-plan").textContent.trim()).toBe("");
    const c = render(<><Verbs /><LibraryCard meal={UNTAGGED} stage="none" {...props} /></>).container;
    expect(c.querySelector(".lib-settype").textContent).toBe("+ Set type");
    // the strip's meta line is the invitation alone (grid)
    expect(c.querySelector(".lib-gmeta").textContent).toBe("+ Set type");
  });
  test("list: .lib-settype reads '+ Set meal type'; the verb spans are never inside a button", () => {
    const c = render(<><Verbs /><LibraryRow meal={UNTAGGED} stage="none" {...props} /></>).container;
    expect(c.querySelector(".lib-settype").textContent).toBe("+ Set meal type");
    expect(c.querySelector(".lib-rmeta").textContent).toBe("+ Set meal type · 5 items");
    c.querySelectorAll(".sr-only").forEach((s) => expect(s.closest("button")).toBeNull());
  });
});

describe("accessible names unchanged (3)", () => {
  const nameOf = (container, sel) => computeAccessibleName(container.querySelector(sel));
  test("grid card", () => {
    const c = render(<><Verbs /><LibraryCard meal={MEAL} stage="none" {...props} /></>).container;
    expect(nameOf(c, ".lib-plan")).toBe("Plan Lemon Garlic Shrimp and Spinach Pasta");
    expect(nameOf(c, ".lib-gbody")).toBe("Open Lemon Garlic Shrimp and Spinach Pasta");
    const p = render(<><Verbs /><LibraryCard meal={MEAL} stage="planned" {...props} /></>).container;
    expect(nameOf(p, ".lib-plan")).toBe("Remove from this week");
    const u = render(<><Verbs /><LibraryCard meal={UNTAGGED} stage="none" {...props} /></>).container;
    expect(nameOf(u, ".lib-settype")).toBe("Set meal type for Tidewater Shrimp & Grits");
  });
  test("list row", () => {
    const c = render(<><Verbs /><LibraryRow meal={MEAL} stage="none" {...props} /></>).container;
    expect(nameOf(c, ".lib-plan")).toBe("Plan Lemon Garlic Shrimp and Spinach Pasta");
    expect(nameOf(c, ".lib-rbody")).toBe("Open Lemon Garlic Shrimp and Spinach Pasta");
    const u = render(<><Verbs /><LibraryRow meal={UNTAGGED} stage="none" {...props} /></>).container;
    expect(nameOf(u, ".lib-settype")).toBe("Set meal type for Tidewater Shrimp & Grits");
  });
  test("axe: every button has a discernible name (button-name), no violations", async () => {
    const { container } = render(
      <><Verbs /><div className="lib-grid"><LibraryCard meal={MEAL} stage="none" {...props} /><LibraryCard meal={UNTAGGED} stage="ready" {...props} /></div>
        <div className="lib-list"><LibraryRow meal={{ ...UNTAGGED, id: "3c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f" }} stage="none" {...props} /></div></>,
    );
    const results = await axe.run(container, { runOnly: ["button-name", "aria-valid-attr-value", "duplicate-id-aria"] });
    expect(results.violations).toEqual([]);
  });
});
