// The search view's debug readout: dev / preview only, off until a 1 s hold on the count line.
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NewShelfSheet } from "./NewShelfSheet";
import { askSearchDebugAllowed, ASK_SEARCH_DEBUG, ASK_SEARCH_DEBUG_KEY } from "./AskSearchDebug";

const ITEMS = [{ id: "i-apples", name: "Apples" }, { id: "i-goldfish", name: "Goldfish" }];
const panel = () => document.querySelector(".ask-search-debug");
const countLine = () => document.querySelector(".ask-search-total");
const mount = () => render(<NewShelfSheet catalogItems={ITEMS} asks={[]} onCreate={jest.fn()} onClose={jest.fn()} closeButton={null} />);
const openView = () => fireEvent.click(screen.getByRole("button", { name: /Find or add an item/ }));

beforeEach(() => { window.localStorage.clear(); jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

test("the gate: never in production; on for preview, development and a local build", () => {
  expect(askSearchDebugAllowed("production")).toBe(false);
  expect(askSearchDebugAllowed("preview")).toBe(true);
  expect(askSearchDebugAllowed("development")).toBe(true);
  expect(askSearchDebugAllowed(undefined)).toBe(true);
  expect(ASK_SEARCH_DEBUG).toBe(true);   // the test build is not production
  const src = require("fs").readFileSync(require("path").join(__dirname, "NewShelfSheet.js"), "utf8");
  expect(src).toMatch(/\{ASK_SEARCH_DEBUG && <AskSearchDebug /);          // rendered only behind the build-time constant
  expect(src.match(/<AskSearchDebug /g)).toHaveLength(1);
});

test("off by default; a hold under 1 s does nothing; a 1 s hold on the count line turns it on and remembers it; another turns it off", () => {
  mount();
  openView();
  expect(panel()).toBeNull();
  fireEvent.pointerDown(countLine());
  act(() => { jest.advanceTimersByTime(900); });
  fireEvent.pointerUp(countLine());
  act(() => { jest.advanceTimersByTime(500); });
  expect(panel()).toBeNull();
  fireEvent.pointerDown(countLine());
  act(() => { jest.advanceTimersByTime(1000); });
  expect(panel()).not.toBeNull();
  expect(window.localStorage.getItem(ASK_SEARCH_DEBUG_KEY)).toBe("1");
  expect(panel().style.pointerEvents).toBe("none");
  expect(panel().parentElement).toBe(document.body);
  fireEvent.pointerUp(countLine());
  fireEvent.pointerDown(countLine());
  act(() => { jest.advanceTimersByTime(1000); });
  expect(panel()).toBeNull();
  expect(window.localStorage.getItem(ASK_SEARCH_DEBUG_KEY)).toBeNull();
});

test("remembered on: shown only while the search view is open; the readout names its numbers and the last drag", () => {
  window.localStorage.setItem(ASK_SEARCH_DEBUG_KEY, "1");
  const frames = [];
  const raf = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => { frames.push(cb); return frames.length; });
  window.visualViewport = { height: 464, offsetTop: 37, pageTop: 37, addEventListener() {}, removeEventListener() {} };
  try {
    mount();
    expect(panel()).toBeNull();                                        // the view is closed
    openView();
    act(() => { frames.splice(0).forEach((cb) => cb(0)); });
    const text = panel().textContent;
    expect(panel().style.top).toBe("37px");                            // at the top of the visible area
    expect(text).toMatch(/vv h 464 offTop 37 pageTop 37/);
    expect(text).toMatch(/innerH \d+ scrollY 0 se\.scrollTop/);
    expect(text).toMatch(/view top .* h /);
    expect(text).toMatch(/list sT 0 sH \d+ cH \d+/);
    expect(text).toMatch(/active input ask-item-search/);
    expect(text).toMatch(/body ov .* pos .* \| html ov .* pos /);
    expect(text).toMatch(/last drag: none yet/);
    // A drag that pans the viewport by 120 and scrolls nothing else.
    const row = screen.getByRole("button", { name: "Goldfish" });
    const touch = (type) => { const e = new Event(type, { bubbles: true, cancelable: true }); e.touches = [{ clientY: 0 }]; row.dispatchEvent(e); return e; };
    touch("touchstart");
    window.visualViewport.offsetTop = 157;
    const end = touch("touchend");
    expect(end.defaultPrevented).toBe(false);                          // reads only
    act(() => { frames.splice(0).forEach((cb) => cb(0)); });
    expect(panel().textContent).toMatch(/last drag: button inList=yes \| Δlist 0 Δwin\.scrollY 0 Δvv\.offsetTop \+120/);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(panel()).toBeNull();
  } finally { raf.mockRestore(); delete window.visualViewport; }
});
