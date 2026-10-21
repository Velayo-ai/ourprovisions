/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the afterglow is audited as raw DOM: which control, which handler, what reaches the card. */
// Run: CI=true npx react-scripts test --watchAll=false src/Afterglow
//
// SPEC_meal_photos_v1, 2026-10-21 amendment (slice 2), the board afterglow (S3 / S4):
//   - controls only with this device's cook id; none without (S3: never a guess)
//   - "How was it?" + three stars ("Rate N of 3"); tapping the current star clears it
//   - the note appears only after a star tap; saves on blur / Enter; both empty → a clear
//   - "Add a meal photo" (.board-photo-add) uploads COOK-attached; hidden at the cap of 3
//   - "Photo added" + a thumbnail that carries .op-replay-block
//   - nothing reaches the card: no recipe view, no Enter/Space open, no drag
//   - the 55% dimming stays off the afterglow; Home's on-deck afterglow has none (P5)
import { render, fireEvent } from "@testing-library/react";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { PlanBoard, OnDeckCard } = require("./App");

const MEAL = { id: "4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b", kind: "meal", name: "Big Salad", occasion: ["lunch"], instructions: "", attribution: "", created_by: null,
  meal_ingredients: [{ catalog_item_id: "c1", quantity_per_serving: 1, on_hand: false, catalog_items: { name: "Romaine" } }] };
const COOK = "c00c0000-0000-4000-8000-000000000001";
const noop = () => {};

function board({ cookId = COOK, mine = null, photo = null, atCap = false, busy = false } = {}) {
  const h = { onOpen: jest.fn(), onRate: jest.fn(), onAddPhoto: jest.fn() };
  const afterglow = {
    cookIdFor: () => cookId,
    myRating: () => mine,
    onRate: h.onRate,
    photoFor: () => photo,
    atCap: () => atCap,
    onAddPhoto: h.onAddPhoto,
    photoBusyMealId: busy ? MEAL.id : null,
  };
  const utils = render(<PlanBoard meals={[MEAL]} rows={{}} placements={{ [MEAL.id]: { sortOrder: 0, readyAt: null, cookedAt: "2026-10-21T20:00:00Z" } }}
    mealById={{}} cookedIds={new Set([MEAL.id])} onOpen={h.onOpen} onSkip={noop} onCooked={noop} onLockIn={noop} onSeeList={noop}
    onReorder={noop} busyMealId={null} afterglow={afterglow} />);
  return { ...utils, h };
}
const q = (c, s) => c.querySelector(s);
const qa = (c, s) => Array.from(c.querySelectorAll(s));

describe("the board afterglow (S4)", () => {
  test("with a cook id: ✓ Cooked, then 'How was it?', three stars, 'Add a meal photo'; no note yet", () => {
    const { container } = board();
    expect(q(container, ".board-cook.done").textContent).toBe("✓ Cooked");
    const glow = q(container, ".board-glow");
    expect(q(glow, ".rate-label").textContent).toBe("How was it?");
    expect(qa(glow, ".rate-star").map((b) => b.getAttribute("aria-label"))).toEqual(["Rate 1 of 3", "Rate 2 of 3", "Rate 3 of 3"]);
    expect(qa(glow, ".rate-star").every((b) => b.textContent === "")).toBe(true);
    expect(q(glow, ".board-photo-add").textContent).toBe("Add a meal photo");
    expect(q(glow, ".rate-note")).toBeNull();
  });

  test("S3: no cook id → no afterglow controls at all (never a guess)", () => {
    const { container } = board({ cookId: null });
    expect(q(container, ".board-cook.done")).not.toBeNull();
    expect(q(container, ".board-glow")).toBeNull();
  });

  test("a star tap rates THIS cook; the note field then appears", () => {
    const { container, h } = board();
    fireEvent.click(qa(container, ".rate-star")[2]);
    expect(h.onRate).toHaveBeenCalledWith(COOK, 3, "");
    expect(q(container, ".rate-note").getAttribute("placeholder")).toBe("Note (optional)");
    expect(q(container, ".rate-note").getAttribute("maxlength")).toBe("200");
  });

  test("the current star again clears the rating; the note saves on blur (Enter blurs)", () => {
    const { container, h } = board({ mine: { rating: 2, note: "" } });
    expect(qa(container, ".rate-star.on")).toHaveLength(2);
    expect(qa(container, ".rate-star")[1].getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(qa(container, ".rate-star")[1]);
    expect(h.onRate).toHaveBeenLastCalledWith(COOK, null, "");
    const note = q(container, ".rate-note");
    fireEvent.change(note, { target: { value: "  double the garlic " } });
    fireEvent.blur(note);
    expect(h.onRate).toHaveBeenLastCalledWith(COOK, 2, "double the garlic");
  });

  test("Add a meal photo uploads cook-attached; 'Photo added' shows the cook's thumbnail (replay-blocked)", () => {
    const { container, h } = board({ photo: { id: "p1", url: "https://x/t.jpg" } });
    const done = q(container, ".board-photo-done");
    expect(done.textContent).toBe("Photo added");
    expect(q(done, "img").classList.contains("op-replay-block")).toBe(true);
    const file = new File([new Uint8Array([1])], "p.jpg", { type: "image/jpeg" });
    fireEvent.change(q(container, ".board-glow input[type=file]"), { target: { files: [file] } });
    expect(h.onAddPhoto).toHaveBeenCalledWith(MEAL.id, file, COOK);
  });

  test("R1: at the cap of 3 the photo button is hidden — no photo is ever aged out silently", () => {
    const { container } = board({ atCap: true });
    expect(q(container, ".board-photo-add")).toBeNull();
    expect(q(container, ".rate-star")).not.toBeNull();
  });

  test("busy: 'Adding…', disabled", () => {
    const { container } = board({ busy: true });
    expect(q(container, ".board-photo-add").textContent).toBe("Adding…");
    expect(q(container, ".board-photo-add").disabled).toBe(true);
  });

  test("nothing reaches the card: a star, the photo button, a note keystroke never open the recipe view", () => {
    const { container, h } = board({ mine: { rating: 1, note: "" } });
    fireEvent.pointerDown(qa(container, ".rate-star")[0]);
    fireEvent.click(qa(container, ".rate-star")[0]);
    fireEvent.click(q(container, ".board-photo-add"));
    const note = q(container, ".rate-note");
    fireEvent.keyDown(note, { key: " " });
    fireEvent.keyDown(note, { key: "Enter" });
    expect(h.onOpen).not.toHaveBeenCalled();
    fireEvent.click(q(container, ".board-card-title"));   // the card itself still opens it
    expect(h.onOpen).toHaveBeenCalledTimes(1);
  });

  test("the afterglow sits outside the 55% dimmed parts of the card", () => {
    const { container } = board();
    const glow = q(container, ".board-glow");
    const dimmed = [".board-tile", ".board-top", ".board-line"].map((s) => q(container, s)).filter(Boolean);
    expect(dimmed.length).toBeGreaterThan(0);
    expect(dimmed.some((el) => el.contains(glow))).toBe(false);
  });

  test("no rating attribute carries a name, a note or a count beyond the fixed 'Rate N of 3'", () => {
    const { container } = board({ mine: { rating: 3, note: "too salty" } });
    qa(container, ".board-glow *").forEach((el) => Array.from(el.attributes).forEach((a) => {
      if (a.name === "value") return;   // the note input's own value — masked on prod by maskAllInputs
      expect(a.value).not.toMatch(/too salty|Big Salad/);
    }));
  });
});

describe("P5: Home's on-deck afterglow carries no rating or photo controls", () => {
  test("OnDeckCard cooked → ✓ Cooked only", () => {
    const { container } = render(<OnDeckCard boardMeals={[]} boardCards={[MEAL]} placements={{ [MEAL.id]: { sortOrder: 0 } }} rows={{}} mealById={{}}
      cookedIds={new Set([MEAL.id])} busyMealId={null} switching={false} holdNight={false}
      onAdd={noop} onView={noop} onLockIn={noop} onCooked={noop} onSkip={noop} onSwitch={noop} onLeftovers={noop} onOut={noop} onOther={noop} />);
    expect(q(container, ".rate-star")).toBeNull();
    expect(q(container, ".board-photo-add")).toBeNull();
  });
});
