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

const onPlanSpy = jest.fn();
beforeEach(() => onPlanSpy.mockClear());

function view(over = {}) {
  const h = { onAddPhoto: jest.fn(), onRemovePhoto: jest.fn() };
  const utils = render(
    <RecipeView meal={MEAL} state={null} members={[]} cookCount={0} lastCookedAt={null} cookRows={null} links={null}
      tagsReady={false} addedThisPlan={false} viewerUserId={null} busy={false}
      onPlan={onPlanSpy} onAddToShop={jest.fn()} onCooked={jest.fn()} onRemove={jest.fn()} onSeeList={jest.fn()} onClose={jest.fn()} onEdit={jest.fn()}
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
    expect(qa(container, ".rv-dots .rv-dot")).toHaveLength(2);
    expect(q(container, ".rv-dots .rv-dot.on")).toBe(qa(container, ".rv-dots .rv-dot")[0]);
    expect(q(container, ".rv-photo-cap").textContent).toBe("Added today · Dana");
  });

  test("R1: at 3 live photos 'Add a meal photo' is hidden; ⋯ stays", () => {
    const { container } = view({ photos: [photo("a"), photo("b"), photo("c")] });
    expect(q(container, ".rv-photo-add")).toBeNull();
    expect(q(container, ".rv-photo-more")).not.toBeNull();
  });

  test("⋯ → 'Remove photo' asks first; Remove removes the photo in view (the newest by default)", () => {
    const { container, h } = view({ photos: [photo("new"), photo("old")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    const rm = q(container, ".rv-photo-remove");
    expect(rm.textContent).toBe("Remove photo");
    fireEvent.click(rm);
    expect(h.onRemovePhoto).not.toHaveBeenCalled();
    expect(q(container, ".rv-photo-q").textContent).toBe("Remove this photo?");
    expect(q(container, ".rv-photo-keep").textContent).toBe("Keep");
    const yes = q(container, ".rv-photo-remove-yes");
    expect(yes.textContent).toBe("Remove");
    fireEvent.click(yes);
    expect(h.onRemovePhoto).toHaveBeenCalledWith("new");
    expect(q(container, ".rv-photo-pop")).toBeNull();
  });

  test("Keep closes the confirm and removes nothing", () => {
    const { container, h } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    fireEvent.click(q(container, ".rv-photo-keep"));
    expect(h.onRemovePhoto).not.toHaveBeenCalled();
    expect(q(container, ".rv-photo-pop")).toBeNull();
  });

  test("an outside tap closes the menu or the confirm, and that tap presses nothing else", () => {
    const { container, h } = view({ photos: [photo("a")] });
    const plan = q(container, ".rv-plan");
    for (const step of ["menu", "confirm"]) {
      fireEvent.click(q(container, ".rv-photo-more"));
      if (step === "confirm") fireEvent.click(q(container, ".rv-photo-remove"));
      expect(q(container, ".rv-photo-pop")).not.toBeNull();
      fireEvent.pointerDown(plan);
      fireEvent.click(plan);   // the same tap's click: swallowed
      expect(q(container, ".rv-photo-pop")).toBeNull();
    }
    expect(h.onRemovePhoto).not.toHaveBeenCalled();
    expect(onPlanSpy).not.toHaveBeenCalled();
    fireEvent.click(plan);     // a NEW tap acts as normal
    expect(onPlanSpy).toHaveBeenCalledTimes(1);
  });

  test("a tap inside the popover does not dismiss it: Keep and Remove still act", () => {
    const { container, h } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.pointerDown(q(container, ".rv-photo-remove"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    const yes = q(container, ".rv-photo-remove-yes");
    fireEvent.pointerDown(yes);
    fireEvent.click(yes);
    expect(h.onRemovePhoto).toHaveBeenCalledWith("a");
  });

  test("Escape closes the popover", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(q(container, ".rv-photo-pop")).toBeNull();
  });

  test("⋯ again closes the menu or the confirm", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    fireEvent.click(q(container, ".rv-photo-more"));
    expect(q(container, ".rv-photo-pop")).toBeNull();
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
    expect(q(container, ".rv-photo-remove")).not.toBeNull();
    fireEvent.click(q(container, ".rv-photo-remove"));
    [".rv-photo-add", ".rv-photo-more", ".rv-photo-pop", ".rv-photo-keep", ".rv-photo-remove-yes"].forEach((s) => {
      const el = q(container, s);
      Array.from(el.attributes).forEach((a) => expect(a.value).not.toMatch(/Chili/));
    });
    expect(q(container, ".rv-photo-more").getAttribute("aria-label")).toBe("Photo options");
  });
});

// ---------------------------------------------------------------- photo hero + full-size viewer (Dan, 2026-10-21)
describe("the photo hero and the full-size viewer", () => {
  const dialog = () => document.body.querySelector(".rv-viewer");

  test("0 photos: the tint hero is unchanged — no hero button, no expand mark, no 4:3 wrapper", () => {
    const { container } = view();
    expect(q(container, ".rv-hero:not(.rv-strip)")).not.toBeNull();
    expect(q(container, ".rv-hero-wrap")).toBeNull();
    expect(q(container, ".rv-photo-open")).toBeNull();
    expect(q(container, ".rv-hero-expand")).toBeNull();
  });

  test("1+ photos: each photo is a real <button> 'View photo full size', the expand mark is decorative", () => {
    const { container } = view({ photos: [photo("a"), photo("b")] });
    const opens = qa(container, ".rv-photo-open");
    expect(opens).toHaveLength(2);
    opens.forEach((b) => {
      expect(b.tagName).toBe("BUTTON");
      expect(b.getAttribute("aria-label")).toBe("View photo full size");
      expect(b.querySelector("img").classList.contains("op-replay-block")).toBe(true);
    });
    expect(q(container, ".rv-hero-expand").getAttribute("aria-hidden")).toBe("true");
    expect(q(container, ".rv-strip").getAttribute("aria-hidden")).toBeNull();   // the buttons must be reachable
  });

  test("tap → a modal dialog on <body>: × focused, 'N of M', the photo uncropped, dots and the strip's caption", () => {
    const { container } = view({ photos: [photo("a", "u2"), photo("b"), photo("c")], members: MEMBERS });
    fireEvent.click(qa(container, ".rv-photo-open")[1]);
    const d = dialog();
    expect(d).not.toBeNull();
    expect(container.contains(d)).toBe(false);   // portalled
    expect(d.getAttribute("role")).toBe("dialog");
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("aria-label")).toBe("Photo");
    const close = q(d, ".rv-viewer-close");
    expect(close.getAttribute("aria-label")).toBe("Close photo");
    expect(document.activeElement).toBe(close);
    expect(q(d, ".rv-viewer-count").textContent).toBe("2 of 3");
    expect(qa(d, ".rv-viewer-dots .rv-dot")).toHaveLength(3);
    expect(q(d, ".rv-viewer-dots .rv-dot.on")).toBe(qa(d, ".rv-viewer-dots .rv-dot")[1]);
    expect(q(d, ".rv-viewer-cap").textContent).toBe("Added today · Dan");   // photo "b" is u1's
    qa(d, "img").forEach((i) => expect(i.classList.contains("op-replay-block")).toBe(true));
    // Closing returns the strip to photo "b": its caption is the one the viewer showed.
    fireEvent.click(q(d, ".rv-viewer-close"));
    expect(q(container, ".rv-photo-cap").textContent).toBe("Added today · Dan");
    fireEvent.click(qa(container, ".rv-photo-open")[1]);
    const d2 = dialog();
    expect(q(d2, ".rv-viewer-count").textContent).toBe("2 of 3");
    expect(qa(d2, "img").map((i) => i.getAttribute("src"))).toEqual(["https://x/a", "https://x/b", "https://x/c"]);
  });

  test("1 photo: no dots in the viewer, '1 of 1'", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-open"));
    expect(q(dialog(), ".rv-viewer-count").textContent).toBe("1 of 1");
    expect(q(dialog(), ".rv-viewer-dots")).toBeNull();
  });

  test("× closes, the strip returns at the photo the viewer ended on, focus back on its hero button", () => {
    const { container } = view({ photos: [photo("a"), photo("b"), photo("c")] });
    fireEvent.click(qa(container, ".rv-photo-open")[0]);
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(q(dialog(), ".rv-viewer-count").textContent).toBe("3 of 3");
    fireEvent.click(q(dialog(), ".rv-viewer-close"));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(qa(container, ".rv-photo-open")[2]);
    expect(q(container, ".rv-dots .rv-dot.on")).toBe(qa(container, ".rv-dots .rv-dot")[2]);
  });

  test("Escape closes; Tab stays on ×", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-open"));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(q(dialog(), ".rv-viewer-close"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(q(container, ".rv-photo-open"));
  });

  test("closing the recipe view closes the viewer", () => {
    const { container, unmount } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-open"));
    expect(dialog()).not.toBeNull();
    unmount();
    expect(dialog()).toBeNull();
  });

  test("taps and pointer events inside the viewer never reach the sheet (no close, no swipe-down)", () => {
    const onClose = jest.fn();
    const { container } = view({ photos: [photo("a")], onClose });
    fireEvent.click(q(container, ".rv-photo-open"));
    fireEvent.pointerDown(q(dialog(), ".rv-viewer-img"));
    fireEvent.click(q(dialog(), ".rv-viewer-img"));
    expect(dialog()).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("no meal name and no count in any viewer attribute", () => {
    const { container } = view({ photos: [photo("a"), photo("b")] });
    fireEvent.click(q(container, ".rv-photo-open"));
    qa(dialog(), "*").forEach((el) => Array.from(el.attributes).forEach((a) => {
      expect(a.value).not.toMatch(/Chili/);
      expect(a.value).not.toMatch(/\bof 2\b/);
    }));
  });
});

// ---------------------------------------------------------------- desktop stepping: ‹ › and the dots (Dan, 2026-10-21)
// The arrows' and dots' pointer are CSS-gated to (hover: hover) and (pointer: fine) — proven in the
// harness at 800 / 1280 px (shown) and 390 px with a touch pointer (hidden). Here: what renders and what it does.
describe("‹ › and clickable dots", () => {
  const dialog = () => document.body.querySelector(".rv-viewer");
  const curDot = (root, sel = ".rv-dots .rv-dot") => qa(root, sel).findIndex((d) => d.classList.contains("on"));

  test("1 photo: no arrows anywhere", () => {
    const { container } = view({ photos: [photo("a")] });
    expect(q(container, ".rv-photo-prev")).toBeNull();
    expect(q(container, ".rv-photo-next")).toBeNull();
    fireEvent.click(q(container, ".rv-photo-open"));
    expect(q(dialog(), ".rv-photo-prev")).toBeNull();
    expect(q(dialog(), ".rv-photo-next")).toBeNull();
  });

  test("2+ photos: hidden at the ends — first shows only ›, last shows only ‹; fixed labels", () => {
    const { container } = view({ photos: [photo("a"), photo("b"), photo("c")] });
    expect(q(container, ".rv-photo-prev")).toBeNull();
    const next = q(container, ".rv-photo-next");
    expect(next.getAttribute("aria-label")).toBe("Next photo");
    fireEvent.click(next);
    expect(q(container, ".rv-photo-prev").getAttribute("aria-label")).toBe("Previous photo");
    expect(q(container, ".rv-photo-next")).not.toBeNull();
    fireEvent.click(q(container, ".rv-photo-next"));
    expect(q(container, ".rv-photo-next")).toBeNull();
    expect(curDot(container)).toBe(2);
  });

  test("a click on an arrow steps the strip and NEVER opens the viewer", () => {
    const { container } = view({ photos: [photo("a"), photo("b")] });
    fireEvent.click(q(container, ".rv-photo-next"));
    expect(dialog()).toBeNull();
    expect(curDot(container)).toBe(1);
    expect(q(container, ".rv-photo-cap")).not.toBeNull();
    fireEvent.click(q(container, ".rv-photo-prev"));
    expect(dialog()).toBeNull();
    expect(curDot(container)).toBe(0);
  });

  test("an arrow that steps to its end hands keyboard focus to the other arrow", () => {
    const { container } = view({ photos: [photo("a"), photo("b")] });
    const next = q(container, ".rv-photo-next");
    next.focus();
    fireEvent.click(next);
    expect(document.activeElement).toBe(q(container, ".rv-photo-prev"));
  });

  test("the strip's dots are buttons: 'Show photo N', aria-current on the one in view, a click steps", () => {
    const { container } = view({ photos: [photo("a"), photo("b"), photo("c")] });
    const dots = qa(container, ".rv-dots .rv-dot");
    expect(dots.map((d) => d.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON"]);
    expect(dots.map((d) => d.getAttribute("aria-label"))).toEqual(["Show photo 1", "Show photo 2", "Show photo 3"]);
    expect(dots[0].getAttribute("aria-current")).toBe("true");
    fireEvent.click(dots[2]);
    expect(dialog()).toBeNull();
    expect(curDot(container)).toBe(2);
    expect(qa(container, ".rv-dots .rv-dot")[2].getAttribute("aria-current")).toBe("true");
  });

  test("the viewer: ‹ › and its dots step it, the count follows; × returns the strip to that photo", () => {
    const { container } = view({ photos: [photo("a"), photo("b"), photo("c")] });
    fireEvent.click(qa(container, ".rv-photo-open")[0]);
    const d = dialog();
    expect(q(d, ".rv-photo-prev")).toBeNull();
    fireEvent.click(q(d, ".rv-photo-next"));
    expect(q(d, ".rv-viewer-count").textContent).toBe("2 of 3");
    fireEvent.click(qa(d, ".rv-viewer-dots .rv-dot")[2]);
    expect(q(d, ".rv-viewer-count").textContent).toBe("3 of 3");
    expect(q(d, ".rv-photo-next")).toBeNull();
    fireEvent.click(q(d, ".rv-photo-prev"));
    expect(q(d, ".rv-viewer-count").textContent).toBe("2 of 3");
    expect(dialog()).not.toBeNull();   // the arrows and dots never close it
    fireEvent.click(q(d, ".rv-viewer-close"));
    expect(curDot(container)).toBe(1);
  });

  test("the arrow keys still step the viewer", () => {
    const { container } = view({ photos: [photo("a"), photo("b")] });
    fireEvent.click(q(container, ".rv-photo-open"));
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(q(dialog(), ".rv-viewer-count").textContent).toBe("2 of 2");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(q(dialog(), ".rv-viewer-count").textContent).toBe("1 of 2");
  });

  test("no arrow or dot carries text, a meal name or the photo's content in an attribute", () => {
    const { container } = view({ photos: [photo("a"), photo("b")] });
    fireEvent.click(q(container, ".rv-photo-next"));
    qa(container, ".rv-photo-prev, .rv-photo-next, .rv-dot").forEach((el) => {
      expect(el.textContent).toBe("");
      Array.from(el.attributes).forEach((a) => { expect(a.value).not.toMatch(/Chili|https?:/); });
    });
  });
});
