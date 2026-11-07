/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the privacy classes and the absence of the name from every attribute are the rules under test,
   read as raw DOM. */
// Run: CI=true npx react-scripts test --watchAll=false src/ShopPickedBy
//
// SPEC_ask_slice2 C4: Shop's "Picked by" on the provenance line, and the pickers' initials in the
// In cart tray (A19), every copy of a name inside .op-name (K3; Dan 2026-11-07: the WHOLE line).
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { InCartTray } = require("./App");

const base = { listItemId: "li-1", catalogItemId: "c-1", name: "Apples", qty: 1 };
function tray(items, initialFor = () => null) {
  return render(<InCartTray items={items} count={items.length} open onToggle={() => {}} onUncheck={() => {}} initialFor={initialFor} />);
}

test("a picked row in the tray shows one outlined initial per picker, inside .op-name, spoken as 'Picked by …'", () => {
  const { container } = tray([{ ...base, pickedByLabels: ["Easton", "Everett"] }]);
  const group = container.querySelector(".tray-picked");
  expect(group).toHaveClass("op-name");
  expect([...group.querySelectorAll(".tray-initial-picked")].map((n) => n.textContent)).toEqual(["E", "E"]);
  group.querySelectorAll(".tray-initial-picked").forEach((n) => expect(n).toHaveAttribute("aria-hidden", "true"));
  expect(screen.getByText("Picked by Easton & Everett")).toHaveClass("sr-only");
});

test("no picker name in any attribute anywhere in the tray (the recorder copies attributes)", () => {
  const { container } = tray([{ ...base, pickedByLabels: ["Easton"] }], () => "P");
  const attrs = [...container.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.value));
  expect(attrs.filter((v) => /Easton/.test(v))).toEqual([]);
  // The partner's check initial stays as it was, beside the picker's.
  expect(container.querySelector(".tray-initial:not(.tray-initial-picked)")).toHaveTextContent("P");
});

test("a row nobody picked has no picker initials", () => {
  const { container } = tray([{ ...base, pickedByLabels: null }]);
  expect(container.querySelector(".tray-picked")).toBeNull();
});

test("the provenance line's clay div wears .op-name and renders provenanceClayLine (source check)", () => {
  const app = fs.readFileSync(path.join(__dirname, "App.js"), "utf8");
  expect(app).toMatch(/const catalogLine = provenanceClayLine\(contributorNames, item\.pickedByLabels\);/);
  expect(app).toMatch(/\{catalogLine && <div className="op-name" style=\{\{ \.\.\.base, color: "#8A5F3A" \}\}>\{catalogLine\}<\/div>\}/);
});
