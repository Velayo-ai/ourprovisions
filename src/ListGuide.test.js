/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the guide is audited as raw DOM: its rows and their copy. */
// Run: CI=true npx react-scripts test --watchAll=false src/ListGuide
// SPEC_one_list R10 (the guide, mockup screen 1).
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { ListGuide } = require("./App");

const rows = () => [...document.querySelectorAll(".list-guide-row")].map((b) => [b.querySelector(".list-guide-label").textContent, b.querySelector(".list-guide-sub").textContent]);

test("the ask, three rows named by intention (Add items first, in teal), and the footer", () => {
  render(<ListGuide hasStaples={false} onAdd={jest.fn()} onBrowse={jest.fn()} onPlan={jest.fn()} />);
  expect(screen.getByText("What do we need?")).toBeInTheDocument();
  expect(rows()).toEqual([
    ["Add items", "I know what we need."],
    ["Browse the aisles", "Remind me what we might need."],
    ["Plan a meal", "I know what I want to cook."],
  ]);
  expect(document.querySelector(".list-guide-row")).toHaveClass("teal");
  expect(document.querySelectorAll(".list-guide-row.teal")).toHaveLength(1);
  expect(document.querySelectorAll(".list-guide-chev")).toHaveLength(3);
  expect(document.querySelector(".list-guide-foot").textContent).toBe("One list for everyone in your household.At the store, check things off here.");
});

test("the Browse row adapts: a household with staples reads 'Browse our staples'", () => {
  render(<ListGuide hasStaples onAdd={jest.fn()} onBrowse={jest.fn()} onPlan={jest.fn()} />);
  expect(rows()[1][0]).toBe("Browse our staples");
});

test("each row runs its own handler", () => {
  const onAdd = jest.fn(); const onBrowse = jest.fn(); const onPlan = jest.fn();
  render(<ListGuide hasStaples={false} onAdd={onAdd} onBrowse={onBrowse} onPlan={onPlan} />);
  const [a, b, c] = document.querySelectorAll(".list-guide-row");
  fireEvent.click(a); fireEvent.click(b); fireEvent.click(c);
  expect([onAdd.mock.calls.length, onBrowse.mock.calls.length, onPlan.mock.calls.length]).toEqual([1, 1, 1]);
});

test("on the source: Add items opens the picker in the tap; Browse carries Staples through the door switch; Plan opens the library", () => {
  const app = require("fs").readFileSync(require("path").join(__dirname, "App.js"), "utf8");
  expect(app).toMatch(/const guideAdd = \(\) => openPicker\("guide"\);/);
  expect(app).toMatch(/const guideBrowse = \(\) => \{ pendingStaplesRef\.current = hasStaples; goToDoor\("input"\); \};/);
  expect(app).toMatch(/setStapleFilter\(view === "input" && pendingStaplesRef\.current\);\s*pendingStaplesRef\.current = false;/);
  expect(app).toMatch(/const guidePlan = \(\) => \{ setPlanScreen\("library"\); goToDoor\("plan"\); \};/);
  expect(app).toMatch(/<ListGuide hasStaples=\{hasStaples\} onAdd=\{guideAdd\} onBrowse=\{guideBrowse\} onPlan=\{guidePlan\} \/>/);
  expect(app).not.toMatch(/Your list is empty/);
});
