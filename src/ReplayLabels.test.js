/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   this test audits the RAW DOM the session recorder serialises (every attribute on
   every element); role queries would hide exactly what it must inspect. */
// Run: CI=true npx react-scripts test --watchAll=false src/ReplayLabels
//
// SPEC_replay_labels_promotion2 Step 1 (+ Amendment A), the library's 10-16 recipe
// applied to the rest of the app. Proves, in a real DOM:
//   (1) no ATTRIBUTE the session recorder copies carries a meal, item, household or
//       category name, or a count of household content — the recorder copies every
//       attribute except `title`, `alt` and on* (its own skip-set), masks input VALUES
//       itself (serializeInputValue), and copies <option> attributes verbatim;
//   (2) the accessible names read as before, built from the VISIBLE text (A1: the
//       board's names follow displayTitle, as the library's have since 10-16);
//   (3) every verb span sits outside every button;
//   (4) a category pick saves exactly the rawName the old inline <select> did (A3).
//
// PlanBoard, MealSheet and PlaceRow live in App.js; App.js imports rum.js, whose two
// Splunk packages cannot load under jsdom ("Automatic publicPath is not supported"),
// so those two are stubbed. Nothing else in App.js is.
import { render, fireEvent } from "@testing-library/react";
import { computeAccessibleName } from "dom-accessibility-api";
import axe from "axe-core";
import { displayTitle } from "./lib/displayTitle";
import { WrapUpBar } from "./components/WrapUpBar";
import { CategorySelect } from "./components/CategorySelect";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { PlanBoard, MealSheet, PlaceRow } = require("./App");

// The recorder's own skip-set, plus the value of an INPUT / TEXTAREA (masked by its input serializer).
const RECORDER_SKIPS = (el, n) => n === "title" || n === "alt" || n.startsWith("on")
  || (n === "value" && (el.tagName === "INPUT" || el.tagName === "TEXTAREA"));

function attributesOf(container) {
  const out = [];
  container.querySelectorAll("*").forEach((el) => {
    for (const a of el.attributes) if (!RECORDER_SKIPS(el, a.name)) out.push(`${el.tagName} ${a.name}="${a.value}"`);
  });
  return out;
}
function expectNoTokens(container, tokens, min = 5) {
  const attrs = attributesOf(container);
  expect(attrs.length).toBeGreaterThan(min);
  for (const where of attrs) for (const t of tokens) expect(where).not.toMatch(new RegExp(`\\b${t}\\b`, "i"));
}
const nameOf = (el) => computeAccessibleName(el);
const noop = () => {};

// ---------------------------------------------------------------- Plan board (#1–3)
const MEAL = { id: "6a1f0c2e-8d4b-4f3a-9e7c-1b2d3e4f5a6b", kind: "meal", name: "Lemon Garlic Shrimp And Spinach Pasta", meal_ingredients: [{ id: 1 }] };
const COOKED = { id: "7b2e1d3f-9e5c-4a4b-8f8d-2c3e4f5a6b7c", kind: "meal", name: "Tidewater Shrimp With Grits", meal_ingredients: [{ id: 1 }] };
const OTHER = { id: "8c3f2e4a-af6d-4b5c-9a9e-3d4f5a6b7c8d", kind: "other", name: "Soccer at Grandma's", meal_ingredients: [] };
const BOARD_TOKENS = ["Lemon", "Garlic", "Shrimp", "Spinach", "Pasta", "Tidewater", "Grits", "Soccer", "Grandma"];

function Board(over = {}) {
  return (
    <PlanBoard
      meals={[MEAL, COOKED, OTHER]}
      rows={{ [MEAL.id]: { total: 6, bought: 2 } }}
      placements={{}}
      mealById={{}}
      cookedIds={new Set([COOKED.id])}
      onOpen={noop} onSkip={noop} onCooked={noop} onLockIn={noop} onSeeList={noop} onReorder={noop}
      busyMealId={null}
      {...over}
    />
  );
}

describe("Plan board", () => {
  test("no copied attribute carries a meal or held-night name", () => {
    const { container } = render(Board());
    expectNoTokens(container, BOARD_TOKENS);
    container.querySelectorAll(".board-x, .board-more, .board-cook").forEach((b) => expect(b.hasAttribute("aria-label")).toBe(false));
  });
  test("accessible names: Remove / More for / cooked, from the visible title", () => {
    const { container } = render(Board());
    expect(nameOf(container.querySelector(".board-more"))).toBe(`More for ${displayTitle(MEAL.name)}`);
    expect(nameOf(container.querySelector(".board-cook.done"))).toBe(`${displayTitle(COOKED.name)} cooked`);
    expect(nameOf(container.querySelector(".board-x"))).toBe("Remove Soccer at Grandma's");
    // the exact strings, so a dropped or reordered word fails (A1)
    expect(nameOf(container.querySelector(".board-more"))).toBe("More for Lemon Garlic Shrimp and Spinach Pasta");
    expect(nameOf(container.querySelector(".board-cook.done"))).toBe("Tidewater Shrimp with Grits cooked");
  });
  test("verb spans sit outside every button; ids are uuid-based", () => {
    const { container } = render(Board());
    const verbs = container.querySelectorAll(".sr-only");
    expect(verbs.length).toBe(3);
    verbs.forEach((s) => expect(s.closest("button")).toBeNull());
    container.querySelectorAll(".board-card-title").forEach((t) => expect(t.id).toMatch(/^board-title-[0-9a-f-]{36}$/));
  });
  test("axe: button-name, valid idrefs, no duplicate ids", async () => {
    const { container } = render(Board());
    const r = await axe.run(container, { runOnly: ["button-name", "aria-valid-attr-value", "duplicate-id-aria"] });
    expect(r.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------- Edit Meal rows (#4–9)
const SPINACH = "1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a";
const PAPRIKA = "2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b";
const PENDING = "pending:fresh basil";   // an item this sheet just created: its id IS its name
const EDIT_MEAL = {
  id: MEAL.id, name: "Lemon Garlic Shrimp And Spinach Pasta", occasion: ["dinner"], instructions: "", attribution: "",
  meal_ingredients: [
    { catalog_item_id: SPINACH, quantity_per_serving: 2, on_hand: false, catalog_items: { name: "Baby Spinach" } },
    { catalog_item_id: PAPRIKA, quantity_per_serving: 1, on_hand: true, catalog_items: { name: "Smoked Paprika" } },
    { catalog_item_id: PENDING, quantity_per_serving: 1, on_hand: false, catalog_items: { name: "Fresh Basil" } },
  ],
};
const CATALOG = {
  [SPINACH]: { id: SPINACH, name: "Baby Spinach", category: "produce" },
  [PAPRIKA]: { id: PAPRIKA, name: "Smoked Paprika", category: "spices" },
};
const ITEM_TOKENS = ["Spinach", "Paprika", "Basil", "Smoked", "Fresh"];

function Sheet() {
  return (
    <MealSheet mode="edit" meal={EDIT_MEAL} catalogMap={CATALOG} categories={[]} saving={false} deleting={false}
      onCancel={noop} onCommit={noop} onDelete={noop} onCreateCatalogItem={noop} onRegisterCategory={noop}
      onRequestSuggestion={noop} onRequestImport={noop} isSignedIn />
  );
}
const byText = (container, text) => Array.from(container.querySelectorAll("button")).filter((b) => b.textContent === text);

describe("Edit Meal ingredient rows", () => {
  test("no copied attribute carries an item name — including a pending: id", () => {
    const { container } = render(Sheet());
    fireEvent.change(container.querySelector('input[placeholder="Search your catalog…"]'), { target: { value: "spin" } });
    const attrs = attributesOf(container);
    // the meal's own name lives in the Name input's value (masked by the recorder) and nowhere else
    for (const where of attrs) for (const t of [...ITEM_TOKENS, "Lemon", "Shrimp", "Pasta"]) expect(where).not.toMatch(new RegExp(`\\b${t}\\b`, "i"));
    expect(container.querySelectorAll("[aria-label]").length).toBeGreaterThan(0);   // fixed copy remains (Close, dialog)
    container.querySelectorAll("[aria-label]").forEach((el) => {
      for (const t of ITEM_TOKENS) expect(el.getAttribute("aria-label")).not.toMatch(new RegExp(t, "i"));
    });
  });
  test("accessible names unchanged", () => {
    const { container } = render(Sheet());
    expect(byText(container, "−").map(nameOf)).toEqual(["Decrease Baby Spinach", "Decrease Fresh Basil"]);
    expect(byText(container, "+").map(nameOf)).toEqual(["Increase Baby Spinach", "Increase Fresh Basil"]);
    expect(byText(container, "×").map(nameOf)).toEqual(["Remove Baby Spinach", "Remove Smoked Paprika", "Remove Fresh Basil"]);
    expect(byText(container, "Need it").map(nameOf)).toEqual(["Need Smoked Paprika again"]);
    expect(byText(container, "I have this").map(nameOf)).toEqual([
      "I already have Baby Spinach — keep it in the meal but do not add it",
      "I already have Fresh Basil — keep it in the meal but do not add it",
    ]);
    fireEvent.change(container.querySelector('input[placeholder="Search your catalog…"]'), { target: { value: "spin" } });
    const added = Array.from(container.querySelectorAll(".add-btn")).filter((b) => b.textContent.startsWith("Added"));
    expect(added.map(nameOf)).toEqual(["Baby Spinach already added — add another"]);
  });
  test("verb spans sit outside every button; name ids are indexes", () => {
    const { container } = render(Sheet());
    container.querySelectorAll(".sr-only").forEach((s) => expect(s.closest("button")).toBeNull());
    container.querySelectorAll('[id^="ing-name-"], [id^="ing-result-"]').forEach((el) => expect(el.id).toMatch(/^ing-(name|result)-\d+$/));
  });
  test("axe: button-name, valid idrefs, no duplicate ids", async () => {
    const { container } = render(Sheet());
    fireEvent.change(container.querySelector('input[placeholder="Search your catalog…"]'), { target: { value: "spin" } });
    const r = await axe.run(container, { runOnly: ["button-name", "aria-valid-attr-value", "duplicate-id-aria"] });
    expect(r.violations).toEqual([]);
  });
});

// ---------------------------------------------------------------- Places (#10)
const HH = { id: "3f4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c", name: "Maple Street Cottage" };
function Places() {
  return (
    <>
      <span id="hh-verb-edit" className="sr-only">Edit</span>
      <PlaceRow hh={HH} isActive onEdit={noop} onSwitch={noop} />
      <PlaceRow hh={{ id: "4a5b6c7d-8e9f-4a1b-9c2d-3e4f5a6b7c8d", name: "Lakeside Camp" }} isActive={false} onEdit={noop} onSwitch={noop} />
    </>
  );
}
describe("Places", () => {
  test("no copied attribute carries a household name", () => {
    const { container } = render(Places());
    expectNoTokens(container, ["Maple", "Street", "Cottage", "Lakeside", "Camp"]);
  });
  test("accessible names unchanged", () => {
    const { container } = render(Places());
    const [active, other] = container.querySelectorAll("button");
    expect(nameOf(active)).toBe("Edit Maple Street Cottage");
    expect(nameOf(other)).toBe("Lakeside Camp");
    container.querySelectorAll(".sr-only").forEach((s) => expect(s.closest("button")).toBeNull());
  });
});

// ---------------------------------------------------------------- Wrap Up bar (#11, A2)
describe("Wrap Up bar", () => {
  test("no count in any word-bearing attribute; name = the visible word + the visible count line", () => {
    const { container } = render(<WrapUpBar checked={4} total={11} onWrapUp={noop} />);
    const btn = container.querySelector("button.wrapbar");
    expect(btn.hasAttribute("aria-label")).toBe(false);
    container.querySelectorAll("*").forEach((el) => {
      for (const a of el.attributes) {
        if (!/^(aria-|id$|class$|data-)/.test(a.name)) continue;   // the fill's style width is geometry, not a label
        expect(a.value).not.toMatch(/\b(4|11|7)\b/);
      }
    });
    expect(nameOf(btn)).toBe("Wrap up 4 of 11 · 7 carry forward");
  });
  test("empty bar keeps its fixed-copy label", () => {
    const { container } = render(<WrapUpBar checked={0} total={11} onWrapUp={noop} />);
    expect(nameOf(container.querySelector("button.wrapbar"))).toBe("Wrap up the trip early");
  });
});

// ---------------------------------------------------------------- Category selects (#12, A3)
const CATS = [
  { rawName: "produce", name: "Produce" },
  { rawName: "Kids' snacks & treats", name: "Kids' snacks & treats" },
  { rawName: "costco run (bulk)", name: "Costco Run (Bulk)" },
];
describe("CategorySelect", () => {
  test("no option attribute carries a category name", () => {
    const { container } = render(<CategorySelect categories={CATS} value="" onChange={noop} placeholder="— select category —" />);
    expectNoTokens(container, ["Produce", "Kids", "snacks", "treats", "Costco", "bulk"], 4);
    expect(Array.from(container.querySelectorAll("option")).map((o) => o.getAttribute("value"))).toEqual(["", "0", "1", "2"]);
  });
  test.each([
    ["a seed category", "0", "produce"],
    ["a custom name with an apostrophe and an ampersand", "1", "Kids' snacks & treats"],
    ["a custom name with spaces and parentheses (rawName differs from its label)", "2", "costco run (bulk)"],
    ["the placeholder", "", ""],
  ])("picking %s hands back exactly the rawName the old select's e.target.value did", (_, idx, raw) => {
    const onChange = jest.fn();
    const { container } = render(<CategorySelect categories={CATS} value="" onChange={onChange} placeholder="—" />);
    fireEvent.change(container.querySelector("select"), { target: { value: idx } });
    expect(onChange).toHaveBeenCalledWith(raw);
  });
  test("a rawName value selects its option; an unknown one shows the placeholder", () => {
    const a = render(<CategorySelect categories={CATS} value="Kids' snacks & treats" onChange={noop} placeholder="—" />).container;
    expect(a.querySelector("select").value).toBe("1");
    expect(a.querySelector("select").selectedOptions[0].textContent).toBe("Kids' snacks & treats");
    const b = render(<CategorySelect categories={CATS} value="gone" onChange={noop} placeholder="—" />).container;
    expect(b.querySelector("select").value).toBe("");
  });
});

// ---------------------------------------------------------------- ids across surfaces open together
describe("ids are unique when the meal sheet is open over the board", () => {
  test("board + Edit Meal (search showing) + Places + Wrap Up + the library's verbs: no id twice, every idref resolves", () => {
    const { container } = render(
      <>
        {Board()}
        {Sheet()}
        {Places()}
        <WrapUpBar checked={4} total={11} onWrapUp={noop} />
        <span id="lib-verb-plan" className="sr-only">Plan</span>
        <span id="lib-verb-open" className="sr-only">Open</span>
      </>,
    );
    fireEvent.change(container.querySelector('input[placeholder="Search your catalog…"]'), { target: { value: "spin" } });
    const ids = Array.from(container.querySelectorAll("[id]")).map((el) => el.id);
    expect(ids.length).toBeGreaterThan(20);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
    container.querySelectorAll("[aria-labelledby]").forEach((el) => {
      for (const ref of el.getAttribute("aria-labelledby").split(/\s+/)) expect(container.querySelector(`[id="${ref}"]`)).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------- photo surfaces (A5, Step 1b)
describe("photo surfaces carry .op-replay-block", () => {
  test("library card photo (rendered)", () => {
    const { LibraryCard } = require("./components/LibraryCards");
    const meal = { id: "5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e", name: "Photo Meal", occasion: ["dinner"], meal_ingredients: [], cardPhotoUrl: "https://example.test/meal.jpg" };
    const { container } = render(<LibraryCard meal={meal} stage="none" busy={false} canPlan onPlan={noop} onUnplan={noop} onOpen={noop} onSetType={noop} />);
    const imgs = container.querySelectorAll("img");
    expect(imgs.length).toBe(1);
    expect(imgs[0].classList.contains("op-replay-block")).toBe(true);
  });

  // The other five sites live inside ProvisionsApp / ShoppingListApp, which cannot render alone
  // (Clerk, Supabase, the household context). The proof for those is this source guard plus the
  // bundle grep: every <img> with a computed src, and every CSS url(${…}) in JSX, sits on an
  // element whose opening tag carries the class — so a NEW photo surface without it fails here.
  const fs = require("fs");
  const SOURCES = ["App.js", "components/LibraryCards.js"].map((f) => [f, fs.readFileSync(`${__dirname}/${f}`, "utf8")]);
  const FIXED_ASSETS = [/^src=\{VELAYO_LOGO_TEAL\}/, /^src=\{`\$\{process\.env\.PUBLIC_URL\}/];

  test("every <img> with a computed src carries the class (fixed app assets excepted)", () => {
    let checked = 0;
    for (const [file, src] of SOURCES) {
      for (const m of src.matchAll(/<img\b[^>]*?\/>/gs)) {
        const tag = m[0];
        const srcAttr = (tag.match(/src=\{[^}]*\}?/) || [""])[0];
        if (!srcAttr || FIXED_ASSETS.some((re) => re.test(srcAttr))) continue;
        checked += 1;
        expect(`${file}: ${tag}`).toMatch(/op-replay-block/);
      }
    }
    expect(checked).toBe(3);   // the avatar, the Galley screenshot thumbnail, the library card photo
  });

  test("every interpolated CSS url() in JSX is on an element that carries the class; the desk backdrop's lives on .desk-bg", () => {
    const [, app] = SOURCES[0];
    let checked = 0;
    for (const m of app.matchAll(/url\("\$\{/g)) {
      const before = app.slice(0, m.index);
      if (/document\.querySelector\("\.desk-bg"\)[\s\S]{0,600}$/.test(before)) { checked += 1; continue; }
      const open = before.lastIndexOf("<div");
      expect(app.slice(open, m.index)).toMatch(/className="[^"]*op-replay-block/);
      checked += 1;
    }
    expect(checked).toBe(3);   // the desk backdrop, the Home banner layer, the photo editor preview
    expect(app).toContain('<div className="desk-bg op-replay-block" aria-hidden="true" />');
    expect(app).not.toMatch(/documentElement\.style\.setProperty\(\s*"--op-desk-bg"/);
  });
});

// ---------------------------------------------------------------- recipe view action block (Amendment B, B6 / R4)
describe("recipe view: no name or count in any copied attribute, in every state", () => {
  const { RecipeView } = require("./App");
  const { boardCardState } = require("./lib/boardState");
  const RV = {
    id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", kind: "meal", name: "Grilled Shrimp With Chimichurri", occasion: ["dinner"],
    instructions: "1. Grill the shrimp.\n2. Spoon over the chimichurri.", attribution: "Aunt Jo", created_by: null,
    meal_ingredients: [
      { catalog_item_id: "c1", quantity_per_serving: 2, on_hand: false, catalog_items: { name: "Shrimp" } },
      { catalog_item_id: "c2", quantity_per_serving: 1, on_hand: false, catalog_items: { name: "Parsley" } },
    ],
  };
  const st = (o = {}) => boardCardState(RV, { placements: { [RV.id]: { sortOrder: 0, readyAt: o.readyAt || null } },
    rows: o.total ? { [RV.id]: { total: o.total, bought: o.bought || 0 } } : {}, mealById: {}, cookedIds: new Set(o.cooked ? [RV.id] : []) });
  test.each([
    ["A", st()], ["B (7 left)", st({ total: 9, bought: 2 })], ["R1", st({ total: 9, bought: 9 })],
    ["C ready", st({ readyAt: "2026-10-19T12:00:00Z" })], ["D cooked", st({ cooked: true })], ["D not planned", null],
  ])("%s", (_, state) => {
    const { container } = render(<RecipeView meal={RV} state={state} members={[]} cookCount={3} lastCookedAt="2026-10-12T18:00:00Z" cookRows={null}
      links={null} tagsReady={false} addedThisPlan={false} viewerUserId={null} busy={false}
      onClose={noop} onEdit={noop} onPlan={noop} onAddToShop={noop} onCooked={noop} onRemove={noop} onSeeList={noop} />);
    expectNoTokens(container, ["Grilled", "Shrimp", "Chimichurri", "Parsley", "Aunt", "Jo"]);
    container.querySelectorAll("*").forEach((el) => {
      for (const a of el.attributes) {
        if (!/^(aria-|id$|class$|data-)/.test(a.name)) continue;
        expect(`${a.name}="${a.value}"`).not.toMatch(/\b(7|9|2|3) (left|items?|ingredients?|steps?)\b/);
        expect(a.value).not.toMatch(/left to buy/);
      }
    });
    // the count-bearing button is never the allow-listed class
    expect(container.querySelectorAll(".rv-see.rv-plan")).toHaveLength(0);
  });
});
