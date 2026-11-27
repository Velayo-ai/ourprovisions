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
  expect(app).toMatch(/const guideAdd = \(\) => \{ openPicker\("guide"\); listGuideCta\("add", null, household\?\.id\); \};/);   // the picker first: the focus stays in the tap
  expect(app).toMatch(/const guideBrowse = \(\) => \{ listGuideCta\("browse", hasStaples \? "staples" : "aisles", household\?\.id\); pendingStaplesRef\.current = hasStaples; goToDoor\("input"\); \};/);
  expect(app).toMatch(/setStapleFilter\(view === "input" && pendingStaplesRef\.current\);\s*pendingStaplesRef\.current = false;/);
  expect(app).toMatch(/const guidePlan = \(\) => \{ listGuideCta\("plan", null, household\?\.id\); setPlanScreen\("library"\); goToDoor\("plan"\); \};/);
  expect(app).toMatch(/<ListGuide hasStaples=\{hasStaples\} onAdd=\{guideAdd\} onBrowse=\{guideBrowse\} onPlan=\{guidePlan\} \/>/);
  expect(app).not.toMatch(/Your list is empty/);
});

// ── The new member welcome (SPEC_one_list R12–R13, mockup screen 5) ──
const { ListWelcome } = require("./App");
const { welcomeKey, welcomeSeen, markWelcomeSeen, shouldShowWelcome } = require("./lib/listWelcome");

describe("the welcome card", () => {
  test("the copy, three lines and Got it; the dialog is named by its heading, never by an attribute holding the name", () => {
    const onDone = jest.fn();
    render(<ListWelcome householdName="Madbury" onDone={onDone} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-labelledby", "list-welcome-title");
    expect(dialog).not.toHaveAttribute("aria-label");
    expect(document.getElementById("list-welcome-title").textContent).toBe("This is Madbury's list");
    expect(document.querySelector(".list-welcome-eyebrow").textContent).toBe("Welcome aboard");
    expect([...document.querySelectorAll(".list-welcome-head")].map((x) => x.textContent)).toEqual([
      "+ Add when you know what you need", "Browse when you want to choose", "Check off in the store",
    ]);
    // No attribute anywhere in the card carries the household's name (the recorder copies attributes).
    const attrs = [...document.querySelectorAll(".list-welcome-scrim, .list-welcome-scrim *")].flatMap((el) => [...el.attributes].map((a) => a.value));
    expect(attrs.some((v) => v.includes("Madbury"))).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Got it" }));
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  test("Escape dismisses too", () => {
    const onDone = jest.fn();
    render(<ListWelcome householdName="Madbury" onDone={onDone} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe("the welcome's memory (R13)", () => {
  const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  test("one key per person per household", () => {
    expect(welcomeKey("user_1", "hh_1")).toBe("op_list_welcome_seen:user_1:hh_1");
  });
  test("unseen until Got it, then seen for good on that phone — and only for that person in that household", () => {
    const s = store();
    expect(welcomeSeen("u", "h", s)).toBe(false);
    markWelcomeSeen("u", "h", s);
    expect(welcomeSeen("u", "h", s)).toBe(true);
    expect(welcomeSeen("u", "other", s)).toBe(false);
    expect(welcomeSeen("someone", "h", s)).toBe(false);
  });
  test("storage that throws, or no ids, counts as seen (it never shows on every open)", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(welcomeSeen("u", "h", bad)).toBe(true);
    expect(() => markWelcomeSeen("u", "h", bad)).not.toThrow();
    expect(welcomeSeen(null, "h", store())).toBe(true);
  });
  test("shown only on List, signed in, the list loaded and NOT empty, not seen", () => {
    const base = { view: "list", signedIn: true, listReady: true, totalItems: 3, seen: false };
    expect(shouldShowWelcome(base)).toBe(true);
    expect(shouldShowWelcome({ ...base, totalItems: 0 })).toBe(false);   // the guide instead
    expect(shouldShowWelcome({ ...base, seen: true })).toBe(false);
    expect(shouldShowWelcome({ ...base, view: "home" })).toBe(false);
    expect(shouldShowWelcome({ ...base, listReady: false })).toBe(false);
    expect(shouldShowWelcome({ ...base, signedIn: false })).toBe(false);
  });
});

// V13 for Slice 3: the guide's rows and the welcome's Got it are allow-listed; the welcome's heading (the
// household's name) is under no unmask rule.
describe("V13 privacy (prod config) — the guide and the welcome", () => {
  const unmask = (() => {
    const src = require("fs").readFileSync(require("path").join(__dirname, "rum.js"), "utf8");
    const block = src.slice(src.indexOf("const CHROME_ALLOW_LIST = ["), src.indexOf("];", src.indexOf("const CHROME_ALLOW_LIST = [")));
    return [...block.matchAll(/^\s*'([^']+)',/gm)].map((m) => m[1]);
  })();
  const under = (el) => unmask.filter((sel) => el.closest(sel));
  test("every guide row label and line sits under .list-guide-row (fixed copy)", () => {
    render(<ListGuide hasStaples onAdd={jest.fn()} onBrowse={jest.fn()} onPlan={jest.fn()} />);
    document.querySelectorAll(".list-guide-label, .list-guide-sub").forEach((el) => expect(under(el)).toEqual([".list-guide-row"]));
  });
  test("Got it is unmasked; the heading with the household's name, the lead and the lines are not", () => {
    render(<ListWelcome householdName="Madbury" onDone={jest.fn()} />);
    expect(under(screen.getByRole("button", { name: "Got it" }))).toEqual([".list-welcome-ok"]);
    [document.getElementById("list-welcome-title"), document.querySelector(".list-welcome-lead"), ...document.querySelectorAll(".list-welcome-head")]
      .forEach((el) => expect(under(el)).toEqual([]));
  });
});
