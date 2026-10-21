/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the strip is audited as raw DOM (classes, attributes), the way the replay
   recorder and click-text collection see it. */
// Run: CI=true npx react-scripts test --watchAll=false src/RecipePhotos
//
// SPEC_meal_photos_v1, 2026-10-20 amendment (slice 1), rendered through RecipeView:
//   R2  1+ photos → the hero is the strip (newest first), dots at 2+, one caption;
//       0 photos → today's tint hero, unchanged; "Add a meal photo" under it;
//       hidden at the cap of 3 (R1); ⋯ → "Remove photo" acts on the photo in view
//   R5  .op-replay-block on every photo <img> and NOT on the strip / dots / caption;
//       no meal name in any attribute of the controls
//   gate  until the household's photo read resolves: tint, no controls (no flash)
import { render, fireEvent } from "@testing-library/react";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { RecipeView } = require("./App");

const MEAL = { id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", kind: "meal", name: "Grandma's Chili", occasion: ["dinner"], instructions: "", attribution: "", created_by: null, meal_ingredients: [] };
const today = new Date().toISOString();
const photo = (id, by = "u1") => ({ id, meal_id: MEAL.id, meal_cook_id: null, uploaded_by: by, uploaded_at: today, view_path: `${id}-view.webp`, url: `https://x/${id}` });
const MEMBERS = [{ user_id: "u1", users: { full_name: "Dan Holmes" } }, { user_id: "u2", users: { full_name: "Dana Teller" } }];

function view(over = {}) {
  const h = { onAddPhoto: jest.fn(), onRemovePhoto: jest.fn() };
  const utils = render(
    <RecipeView meal={MEAL} state={null} members={[]} cookCount={0} lastCookedAt={null} cookRows={null} links={null}
      tagsReady={false} addedThisPlan={false} viewerUserId={null} busy={false}
      onPlan={jest.fn()} onAddToShop={jest.fn()} onCooked={jest.fn()} onRemove={jest.fn()} onSeeList={jest.fn()} onClose={jest.fn()} onEdit={jest.fn()}
      photos={[]} photosReady canEditPhotos photoBusy={false} {...h} {...over} />,
  );
  return { ...utils, h };
}
const q = (c, s) => c.querySelector(s);
const qa = (c, s) => Array.from(c.querySelectorAll(s));

describe("the hero strip (R2)", () => {
  test("0 photos: today's tint hero, 'Add a meal photo' under it, no strip, no caption, no ⋯", () => {
    const { container } = view();
    expect(q(container, ".rv-hero:not(.rv-strip)")).not.toBeNull();
    expect(q(container, ".rv-strip")).toBeNull();
    expect(q(container, ".rv-photo-cap")).toBeNull();
    expect(q(container, ".rv-photo-add").textContent).toBe("Add a meal photo");
    expect(q(container, ".rv-photo-more")).toBeNull();
    expect(qa(container, "img")).toHaveLength(0);
  });

  test("1 photo: the strip, no dots, a caption, Add + ⋯", () => {
    const { container } = view({ photos: [photo("a")] });
    expect(qa(container, ".rv-strip img")).toHaveLength(1);
    expect(q(container, ".rv-dots")).toBeNull();
    expect(q(container, ".rv-photo-cap").textContent).toBe("Added today");
    expect(q(container, ".rv-photo-add")).not.toBeNull();
    expect(q(container, ".rv-photo-more")).not.toBeNull();
  });

  test("newest first; dots at 2+; the caption names the uploader only in a 2+ member household", () => {
    const { container } = view({ photos: [photo("new", "u2"), photo("old")], members: MEMBERS });
    expect(qa(container, ".rv-strip img").map((i) => i.getAttribute("src"))).toEqual(["https://x/new", "https://x/old"]);
    expect(qa(container, ".rv-dots span")).toHaveLength(2);
    expect(q(container, ".rv-dots span.on")).toBe(qa(container, ".rv-dots span")[0]);
    expect(q(container, ".rv-photo-cap").textContent).toBe("Added today · Dana");
  });

  test("R1: at 3 live photos 'Add a meal photo' is hidden; ⋯ stays", () => {
    const { container } = view({ photos: [photo("a"), photo("b"), photo("c")] });
    expect(q(container, ".rv-photo-add")).toBeNull();
    expect(q(container, ".rv-photo-more")).not.toBeNull();
  });

  test("⋯ → 'Remove photo' removes the photo in view (the newest by default)", () => {
    const { container, h } = view({ photos: [photo("new"), photo("old")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    const rm = q(container, ".rv-photo-remove");
    expect(rm.textContent).toBe("Remove photo");
    fireEvent.click(rm);
    expect(h.onRemovePhoto).toHaveBeenCalledWith("new");
    expect(q(container, ".rv-photo-remove")).toBeNull();
  });

  test("choosing a file calls onAddPhoto with the meal id and the file", () => {
    const { container, h } = view();
    const input = q(container, "input[type=file]");
    expect(input.getAttribute("accept")).toBe("image/*");
    const file = new File([new Uint8Array([1])], "p.jpg", { type: "image/jpeg" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(h.onAddPhoto).toHaveBeenCalledWith(MEAL.id, file);
  });

  test("busy: 'Adding…', disabled", () => {
    const { container } = view({ photoBusy: true });
    const add = q(container, ".rv-photo-add");
    expect(add.textContent).toBe("Adding…");
    expect(add.disabled).toBe(true);
  });

  test("no-flash gate: before the read resolves — tint, no strip, no controls", () => {
    const { container } = view({ photosReady: false, photos: [photo("a")] });
    expect(q(container, ".rv-strip")).toBeNull();
    expect(q(container, ".rv-photo-ctl")).toBeNull();
  });

  test("signed out: photos show, no controls", () => {
    const { container } = view({ canEditPhotos: false, photos: [photo("a")] });
    expect(qa(container, ".rv-strip img")).toHaveLength(1);
    expect(q(container, ".rv-photo-ctl")).toBeNull();
  });

  test("a photo whose URL is not minted yet is not rendered (never a broken image)", () => {
    const { container } = view({ photos: [{ ...photo("a"), url: null }] });
    expect(qa(container, "img")).toHaveLength(0);
    expect(q(container, ".rv-hero:not(.rv-strip)")).not.toBeNull();
  });
});

describe("replay (R5)", () => {
  test("every photo <img> carries .op-replay-block; the strip, dots and caption do not", () => {
    const { container } = view({ photos: [photo("a"), photo("b")] });
    const imgs = qa(container, "img");
    expect(imgs).toHaveLength(2);
    imgs.forEach((i) => expect(i.classList.contains("op-replay-block")).toBe(true));
    [".rv-strip", ".rv-dots", ".rv-photo-cap", ".rv-photo-ctl"].forEach((s) => expect(q(container, s).classList.contains("op-replay-block")).toBe(false));
  });

  test("controls carry fixed copy and no meal name in any attribute", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    [".rv-photo-add", ".rv-photo-more", ".rv-photo-remove"].forEach((s) => {
      const el = q(container, s);
      Array.from(el.attributes).forEach((a) => expect(a.value).not.toMatch(/Chili/));
    });
    expect(q(container, ".rv-photo-more").getAttribute("aria-label")).toBe("Photo options");
  });
});
