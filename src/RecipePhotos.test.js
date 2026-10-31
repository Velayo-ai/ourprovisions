/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the strip is audited as raw DOM (classes, attributes), the way the replay
   recorder and click-text collection see it. */
// Run: CI=true npx react-scripts test --watchAll=false src/RecipePhotos
//
// SPEC_meal_photos_v1, 2026-10-20 amendment (slice 1), rendered through RecipeView:
//   R2  1+ photos → the hero is the strip (newest first), dots at 2+, one caption;
//       0 photos → today's tint hero, unchanged; "Add a meal photo" under it;
//       hidden at the cap of 3 (R1)
//   SPEC_photo_menu (+ amendment 2026-10-25): ⋯ on the photo → Replace / Photo details / Save /
//       Remove (confirm sheet, Keep the default); the placeholder after the last removal (P7);
//       no credit line under the hero (DAN-2)
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

function viewEl(over = {}, h = {}) {
  return (
    <RecipeView meal={MEAL} state={null} members={[]} cookCount={0} lastCookedAt={null} cookRows={null} links={null}
      tagsReady={false} addedThisPlan={false} viewerUserId="u1" busy={false}
      onPlan={onPlanSpy} onAddToShop={jest.fn()} onCooked={jest.fn()} onRemove={jest.fn()} onSeeList={jest.fn()} onClose={jest.fn()} onEdit={jest.fn()}
      photos={[]} photosReady canEditPhotos photoBusy={false} {...h} {...over} />
  );
}
function view(over = {}) {
  const h = { onAddPhoto: jest.fn(), onRemovePhoto: jest.fn() };
  const utils = render(viewEl(over, h));
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

  test("1 photo: the strip, no dots, NO credit line under it (it lives in Photo details), Add + ⋯ on the photo", () => {
    const { container } = view({ photos: [photo("a")] });
    expect(qa(container, ".rv-strip img")).toHaveLength(1);
    expect(q(container, ".rv-dots")).toBeNull();
    expect(q(container, ".rv-photo-cap")).toBeNull();
    expect(q(container, ".rv-photo-add")).not.toBeNull();
    expect(q(container, ".rv-hero-wrap .rv-photo-menu.hero .rv-photo-more")).not.toBeNull();
  });

  test("newest first; dots at 2+; no caption", () => {
    const { container } = view({ photos: [photo("new", "u2"), photo("old")], members: MEMBERS });
    expect(qa(container, ".rv-strip img").map((i) => i.getAttribute("src"))).toEqual(["https://x/new", "https://x/old"]);
    expect(qa(container, ".rv-dots .rv-dot")).toHaveLength(2);
    expect(q(container, ".rv-dots .rv-dot.on")).toBe(qa(container, ".rv-dots .rv-dot")[0]);
    expect(q(container, ".rv-photo-cap")).toBeNull();
  });

  test("R1: at 3 live photos 'Add a meal photo' is hidden; ⋯ stays", () => {
    const { container } = view({ photos: [photo("a"), photo("b"), photo("c")] });
    expect(q(container, ".rv-photo-add")).toBeNull();
    expect(q(container, ".rv-photo-more")).not.toBeNull();
  });

  test("P1: the row under the hero has no ⋯ — only 'Add a meal photo'", () => {
    const { container } = view({ photos: [photo("a")], onSetPhotoKind: jest.fn() });
    const row = q(container, ".rv-photo-ctl");
    expect(qa(row, "button").map((b) => b.className)).toEqual(["rv-photo-add"]);
    expect(q(row, ".rv-photo-more")).toBeNull();
    expect(q(container, ".rv-photo-showcase")).toBeNull();   // S46: no second button, ever
  });
});

// ---------------------------------------------------------------- showcase photos — THE FLIP MODEL
// (SPEC_meal_sharing_v2 S46, Dan 2026-10-30; 072 kind; 073 set_photo_kind). A photo is born a meal
// photo; its AUTHOR flips it from the photo's ⋯. The default viewer here is "u1", the photos' author.
describe("showcase photos — the flip (S46)", () => {
  const showcase = (id, by = "u1") => ({ ...photo(id, by), kind: "showcase" });
  const cook = (id, by = "u1") => ({ ...photo(id, by), kind: "cook" });
  const S13 = "Showcase photos can be shared outside the household. Once a meal is given, its photo goes with it.";   // S48's copy of record, Dan 2026-10-30
  const flipView = (over = {}) => { const onSetPhotoKind = jest.fn(); const r = view({ onSetPhotoKind, ...over }); return { ...r, onSetPhotoKind }; };
  const openMenu = (c) => fireEvent.click(q(c, ".rv-photo-more"));
  const items = (root) => Array.from(q(root, ".rv-photo-pop").children).map((el) => (el.getAttribute("role") === "separator" ? "—" : el.textContent));

  test("one button: the row under the hero is 'Add a meal photo' alone; no 'Add a showcase photo', one file input", () => {
    const { container } = flipView({ photos: [cook("a")] });
    expect(qa(q(container, ".rv-photo-ctl"), "button").map((b) => b.className)).toEqual(["rv-photo-add"]);
    expect(q(container, ".rv-photo-showcase")).toBeNull();
    expect(qa(container, "input[type=file]")).toHaveLength(1);
  });

  test("S13: 'Make showcase' on my cook photo opens the prompt first — nothing flipped yet; the prompt's 'Make showcase' flips; menu order", () => {
    const { container, onSetPhotoKind } = flipView({ photos: [cook("a")], onReplacePhoto: jest.fn() });
    openMenu(container);
    expect(items(container)).toEqual(["Replace photo", "Make showcase", "Photo details", "Download photo", "—", "Remove photo"]);
    fireEvent.click(q(container, ".rv-photo-make-showcase"));
    expect(onSetPhotoKind).not.toHaveBeenCalled();
    const sheet = q(document.body, ".rv-psheet-scrim");
    expect(sheet.textContent).toContain(S13);
    expect(q(sheet, ".rv-psheet-h").textContent).toBe("Make this the meal’s showcase photo?");
    expect(q(sheet, ".rv-psheet-thumb").className.split(" ")).toEqual(expect.arrayContaining(["op-replay-block", "op-photo"]));
    expect(q(sheet, ".rv-showcase-go").textContent).toBe("Make showcase");
    expect(q(sheet, ".rv-showcase-cancel").textContent).toBe("Not now");
    fireEvent.click(q(sheet, ".rv-showcase-go"));
    expect(onSetPhotoKind).toHaveBeenCalledWith(MEAL.id, "a", "showcase");
    expect(q(document.body, ".rv-psheet-scrim")).toBeNull();
  });

  test("S13: Not now closes the prompt and flips nothing; the prompt comes back on the next attempt (once per flip)", () => {
    const { container, onSetPhotoKind } = flipView({ photos: [cook("a")] });
    openMenu(container);
    fireEvent.click(q(container, ".rv-photo-make-showcase"));
    fireEvent.click(q(document.body, ".rv-showcase-cancel"));
    expect(q(document.body, ".rv-psheet-scrim")).toBeNull();
    expect(onSetPhotoKind).not.toHaveBeenCalled();
    openMenu(container);
    fireEvent.click(q(container, ".rv-photo-make-showcase"));
    expect(q(document.body, ".rv-psheet-scrim").textContent).toContain(S13);
  });

  test("my showcase photo: 'Make it a meal photo' flips straight back with no prompt; its ⋯ has no Replace and no 'Make showcase'", () => {
    const { container, onSetPhotoKind } = flipView({ photos: [showcase("s"), cook("a")], onReplacePhoto: jest.fn() });
    openMenu(container);
    expect(items(container)).toEqual(["Make it a meal photo", "Photo details", "Download photo", "—", "Remove photo"]);
    fireEvent.click(q(container, ".rv-photo-make-cook"));
    expect(q(document.body, ".rv-psheet-scrim")).toBeNull();
    expect(onSetPhotoKind).toHaveBeenCalledWith(MEAL.id, "s", "cook");
    // the cook photo next door keeps Replace and offers Make showcase
    fireEvent.click(q(container, ".rv-photo-next"));
    openMenu(container);
    expect(q(container, ".rv-photo-replace")).not.toBeNull();
    expect(q(container, ".rv-photo-make-showcase")).not.toBeNull();
  });

  test("S48 + S14: another member's photo has BOTH flip items (the showcase is the household's) but no Save, and opens with 'Added by {First}' — inert, not an item; mine has Save and no owner line", () => {
    const { container } = flipView({ photos: [cook("x", "u2"), showcase("y", "u2"), cook("a")], members: MEMBERS, onReplacePhoto: jest.fn() });
    openMenu(container);
    expect(items(container)).toEqual(["Added by Dana", "Replace photo", "Make showcase", "Photo details", "—", "Remove photo"]);
    const owner = q(container, ".rv-photo-owner");
    expect(owner.tagName).toBe("SPAN");
    expect(owner.getAttribute("role")).toBe("presentation");
    expect(qa(container, ".rv-photo-pop [role=menuitem]").map((b) => b.textContent)).toEqual(["Replace photo", "Make showcase", "Photo details", "Remove photo"]);
    expect(q(container, ".rv-photo-save")).toBeNull();
    openMenu(container);   // close
    fireEvent.click(q(container, ".rv-photo-next"));
    openMenu(container);
    expect(items(container)).toEqual(["Added by Dana", "Make it a meal photo", "Photo details", "—", "Remove photo"]);
    expect(q(container, ".rv-photo-save")).toBeNull();
    openMenu(container);   // close
    fireEvent.click(q(container, ".rv-photo-next"));
    openMenu(container);
    expect(items(container)).toEqual(["Replace photo", "Make showcase", "Photo details", "Download photo", "—", "Remove photo"]);
    expect(q(container, ".rv-photo-owner")).toBeNull();
    // solo household (one member): no name, no line — the "Added by" rule
    const solo = flipView({ photos: [cook("x", "u2")], members: [MEMBERS[1]] });
    openMenu(solo.container);
    expect(q(solo.container, ".rv-photo-owner")).toBeNull();
  });

  test("no viewer id (nothing is 'mine'): the flip items stay (S48 — membership, not authorship), no Save on any photo", () => {
    const { container } = flipView({ photos: [cook("a")], viewerUserId: null, onReplacePhoto: jest.fn() });
    openMenu(container);
    expect(items(container)).toEqual(["Replace photo", "Make showcase", "Photo details", "—", "Remove photo"]);
  });

  test("S48 / V39: a RECEIVED row (it came with a gift) never offers 'Make showcase' — as a showcase it can still go back to a meal photo; as a cook photo it has no flip item", () => {
    const rec = "2026-10-30T21:46:10Z";
    const { container } = flipView({ photos: [{ ...showcase("r", "u2"), received_at: rec }, { ...cook("rc", "u2"), received_at: rec }], members: MEMBERS, onReplacePhoto: jest.fn() });
    openMenu(container);
    expect(items(container)).toEqual(["Added by Dana", "Make it a meal photo", "Photo details", "—", "Remove photo"]);
    openMenu(container);   // close
    fireEvent.click(q(container, ".rv-photo-next"));
    openMenu(container);
    expect(items(container)).toEqual(["Added by Dana", "Replace photo", "Photo details", "—", "Remove photo"]);
    expect(q(container, ".rv-photo-make-showcase")).toBeNull();
  });

  test("S26: at 3 live cook photos 'Make it a meal photo' shows the plain line and calls nothing; 'Add a meal photo' hides at the cap; a showcase never counts", () => {
    const { container, onSetPhotoKind } = flipView({ photos: [showcase("s"), cook("a"), cook("b"), cook("c")] });
    expect(q(container, ".rv-photo-add")).toBeNull();
    openMenu(container);
    fireEvent.click(q(container, ".rv-photo-make-cook"));
    const sheet = q(document.body, ".rv-psheet-scrim");
    expect(q(sheet, ".rv-psheet-h").textContent).toBe("Meal photos are full");
    expect(sheet.textContent).toContain("This meal already has 3 meal photos. Remove one to make room for this one.");
    expect(q(sheet, ".rv-photo-full-ok").textContent).toBe("OK");
    expect(onSetPhotoKind).not.toHaveBeenCalled();
    fireEvent.click(q(sheet, ".rv-photo-full-ok"));
    expect(q(document.body, ".rv-psheet-scrim")).toBeNull();
    const two = flipView({ photos: [cook("a"), cook("b"), showcase("s")] });
    expect(q(two.container, ".rv-photo-add")).not.toBeNull();
  });

  test("the full-size viewer's ⋯ carries the same flip item and acts on the photo in view", () => {
    const viewerDialog = () => document.body.querySelector(".rv-viewer");
    const { container, onSetPhotoKind } = flipView({ photos: [cook("a"), cook("b")] });
    fireEvent.click(qa(container, ".rv-photo-open")[1]);
    fireEvent.click(q(viewerDialog(), ".rv-photo-more"));
    fireEvent.click(q(viewerDialog(), ".rv-photo-make-showcase"));
    expect(q(document.body, ".rv-psheet-scrim").textContent).toContain(S13);
    fireEvent.click(q(document.body, ".rv-showcase-go"));
    expect(onSetPhotoKind).toHaveBeenCalledWith(MEAL.id, "b", "showcase");
  });

  test("S28: a showcase slide is marked 'Showcase' — a sibling of the photo button, never inside it; cook slides are not; a RECEIVED row reads 'Gift' (Dan 2026-10-31)", () => {
    const { container } = view({ photos: [cook("a"), showcase("s"), { ...showcase("r", "u2"), received_at: "2026-10-30T21:46:10Z" }] });
    const slides = qa(container, ".rv-slide");
    expect(q(slides[0], ".rv-showcase-tag")).toBeNull();
    const tag = q(slides[1], ".rv-showcase-tag");
    expect(tag.textContent).toBe("Showcase");
    expect(tag.closest("button")).toBeNull();
    expect(q(slides[2], ".rv-showcase-tag").textContent).toBe("Gift");
    expect(qa(container, ".rv-strip img")).toHaveLength(3);
  });

  test("same first name (Dan 2026-10-31): 'Added by' reads first name + last initial when two members share a first name", () => {
    const SAME = [{ user_id: "u1", users: { full_name: "Dan Holmes" } }, { user_id: "u2", users: { full_name: "Dan Teller" } }];
    const { container } = flipView({ photos: [cook("x", "u2")], members: SAME });
    openMenu(container);
    expect(q(container, ".rv-photo-owner").textContent).toBe("Added by Dan T");
    fireEvent.click(q(container, ".rv-photo-details"));
    expect(q(document.body, ".rv-psheet-scrim").textContent).toContain("Added by Dan T ·");
  });

  test("busy: ⋯ is disabled, so no flip can start", () => {
    const { container } = flipView({ photoBusy: true, photos: [cook("a")] });
    expect(q(container, ".rv-photo-more").disabled).toBe(true);
  });

  test("replay: the menu items, the prompt and the tag carry fixed copy and no meal name in any attribute", () => {
    const { container } = flipView({ photos: [showcase("s"), cook("a")] });
    Array.from(q(container, ".rv-showcase-tag").attributes).forEach((a) => expect(a.value).not.toMatch(/Chili/));
    openMenu(container);
    Array.from(q(container, ".rv-photo-make-cook").attributes).forEach((a) => expect(a.value).not.toMatch(/Chili/));
    openMenu(container);   // close
    fireEvent.click(q(container, ".rv-photo-next"));
    openMenu(container);
    fireEvent.click(q(container, ".rv-photo-make-showcase"));
    qa(q(document.body, ".rv-psheet-scrim"), "*").forEach((el) => Array.from(el.attributes).forEach((a) => expect(a.value).not.toMatch(/Chili/)));
  });

  test("P3: the menu order — Replace, Photo details, Save, a divider, Remove photo (red class)", () => {
    const { container } = view({ photos: [photo("a")], onReplacePhoto: jest.fn() });
    fireEvent.click(q(container, ".rv-photo-more"));
    const pop = q(container, ".rv-photo-pop");
    expect(pop.getAttribute("role")).toBe("menu");
    expect(Array.from(pop.children).map((el) => (el.getAttribute("role") === "separator" ? "—" : el.textContent)))
      .toEqual(["Replace photo", "Photo details", "Download photo", "—", "Remove photo"]);
    expect(q(container, ".rv-photo-more").getAttribute("aria-expanded")).toBe("true");
  });

  test("DAN-1: Replace photo opens the picker; the chosen file goes to onReplacePhoto with the photo in view", () => {
    const onReplacePhoto = jest.fn();
    const { container, h } = view({ photos: [photo("a"), photo("b")], onReplacePhoto });
    fireEvent.click(q(container, ".rv-photo-next"));
    fireEvent.click(q(container, ".rv-photo-more"));
    const inputs = qa(container, "input[type=file]");
    expect(inputs).toHaveLength(2);
    const click = jest.spyOn(inputs[1], "click").mockImplementation(() => {});
    fireEvent.click(q(container, ".rv-photo-replace"));
    expect(click).toHaveBeenCalledTimes(1);
    const file = new File([new Uint8Array([1])], "p.jpg", { type: "image/jpeg" });
    fireEvent.change(inputs[1], { target: { files: [file] } });
    expect(onReplacePhoto).toHaveBeenCalledTimes(1);
    expect(onReplacePhoto.mock.calls[0][0]).toBe(MEAL.id);
    expect(onReplacePhoto.mock.calls[0][1].id).toBe("b");
    expect(onReplacePhoto.mock.calls[0][2]).toBe(file);
    expect(h.onAddPhoto).not.toHaveBeenCalled();
  });

  test("with no Replace handler wired, the menu has no Replace", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    expect(q(container, ".rv-photo-replace")).toBeNull();
    expect(q(container, ".rv-photo-details")).not.toBeNull();
  });

  test("a click on ⋯ never opens the viewer", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    expect(document.body.querySelector(".rv-viewer")).toBeNull();
  });

  test("P5: Remove photo opens the confirm sheet — thumbnail, title, body, Keep focused; nothing removed yet", () => {
    const { container, h } = view({ photos: [photo("new"), photo("old")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    expect(h.onRemovePhoto).not.toHaveBeenCalled();
    expect(q(container, ".rv-photo-pop")).toBeNull();
    const sheet = q(container, ".rv-psheet");
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-labelledby")).toBe("rv-photo-q");
    expect(q(sheet, "#rv-photo-q").textContent).toBe("Remove this photo?");
    expect(q(sheet, ".rv-psheet-body").textContent).toBe("It’ll be removed for everyone in your household.");
    const thumb = q(sheet, ".rv-psheet-thumb");
    expect(thumb.getAttribute("src")).toBe("https://x/new");
    expect(thumb.classList.contains("op-replay-block")).toBe(true);
    expect(q(sheet, ".rv-photo-confirm-remove").textContent).toBe("Remove photo");
    expect(q(sheet, ".rv-photo-confirm-keep").textContent).toBe("Keep photo");
    expect(document.activeElement).toBe(q(sheet, ".rv-photo-confirm-keep"));
  });

  test("P6: Remove photo removes the photo in view (the newest by default), closes the sheet", () => {
    const { container, h } = view({ photos: [photo("new"), photo("old")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    fireEvent.click(q(container, ".rv-photo-confirm-remove"));
    expect(h.onRemovePhoto).toHaveBeenCalledWith("new");
    expect(q(container, ".rv-psheet")).toBeNull();
  });

  test("the photo in view: after › the menu acts on the second photo", () => {
    const { container, h } = view({ photos: [photo("a"), photo("b")] });
    fireEvent.click(q(container, ".rv-photo-next"));
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    expect(q(container, ".rv-psheet-thumb").getAttribute("src")).toBe("https://x/b");
    fireEvent.click(q(container, ".rv-photo-confirm-remove"));
    expect(h.onRemovePhoto).toHaveBeenCalledWith("b");
  });

  test("Keep, ✕, the backdrop and Escape all keep the photo; focus returns to ⋯", () => {
    const { container, h } = view({ photos: [photo("a")] });
    const ways = [
      () => fireEvent.click(q(container, ".rv-photo-confirm-keep")),
      () => fireEvent.click(q(container, ".rv-psheet .sheet-close")),
      () => fireEvent.click(q(container, ".rv-psheet-scrim")),
      () => fireEvent.keyDown(document, { key: "Escape" }),
    ];
    ways.forEach((go) => {
      fireEvent.click(q(container, ".rv-photo-more"));
      fireEvent.click(q(container, ".rv-photo-remove"));
      expect(q(container, ".rv-psheet")).not.toBeNull();
      go();
      expect(q(container, ".rv-psheet")).toBeNull();
      expect(document.activeElement).toBe(q(container, ".rv-photo-more"));
    });
    expect(h.onRemovePhoto).not.toHaveBeenCalled();
  });

  test("pointer events inside the confirm sheet never reach the recipe view (no swipe-down, no close)", () => {
    const onClose = jest.fn();
    const { container } = view({ photos: [photo("a")], onClose });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    fireEvent.pointerDown(q(container, ".rv-psheet-body"));
    fireEvent.click(q(container, ".rv-psheet-body"));
    expect(q(container, ".rv-psheet")).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("P7: removing the LAST photo leaves the dashed placeholder at the hero's height; tapping it adds a photo", () => {
    const { container, h, rerender } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    fireEvent.click(q(container, ".rv-photo-confirm-remove"));
    expect(h.onRemovePhoto).toHaveBeenCalledWith("a");
    rerender(viewEl({ photos: [] }, h));
    const ph = q(container, ".rv-hero-wrap .rv-photo-placeholder");
    expect(ph).not.toBeNull();
    expect(qa(ph, "span").map((s) => s.textContent)).toEqual(["Add a meal photo", "Show the household how it turned out."]);
    expect(q(container, ".rv-hero:not(.rv-strip)")).toBeNull();   // not the tint
    expect(q(container, ".rv-photo-add")).toBeNull();               // one "Add a meal photo", not two
    const input = q(container, "input[type=file]");
    const click = jest.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.click(ph);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(ph);
  });

  test("P7 / Verification 7: reopening after the last removal shows the tint hero", () => {
    const first = view({ photos: [photo("a")] });
    fireEvent.click(q(first.container, ".rv-photo-more"));
    fireEvent.click(q(first.container, ".rv-photo-remove"));
    fireEvent.click(q(first.container, ".rv-photo-confirm-remove"));
    first.unmount();
    const { container } = view({ photos: [] });
    expect(q(container, ".rv-photo-placeholder")).toBeNull();
    expect(q(container, ".rv-hero:not(.rv-strip)")).not.toBeNull();
  });

  test("removing one of two keeps the strip — no placeholder", () => {
    const { container, h, rerender } = view({ photos: [photo("a"), photo("b")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    fireEvent.click(q(container, ".rv-photo-confirm-remove"));
    rerender(viewEl({ photos: [photo("b")] }, h));
    expect(q(container, ".rv-photo-placeholder")).toBeNull();
    expect(qa(container, ".rv-strip img").map((i) => i.getAttribute("src"))).toEqual(["https://x/b"]);
  });

  test("DAN-2: Photo details — 'Added by {First} · {date}' in a sheet named by its masked title", () => {
    const { container } = view({ photos: [photo("a", "u2")], members: MEMBERS });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-details"));
    const sheet = q(container, ".rv-psheet");
    expect(sheet.getAttribute("aria-labelledby")).toBe("rv-photo-dh");
    expect(q(sheet, "#rv-photo-dh").textContent).toBe("Photo details");
    const date = new Date(today).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    expect(qa(sheet, ".rv-psheet-line").map((l) => l.textContent)).toEqual([`Added by Dana · ${date}`]);
    expect(document.activeElement).toBe(q(sheet, ".sheet-close"));
    fireEvent.click(q(sheet, ".sheet-close"));
    expect(q(container, ".rv-psheet")).toBeNull();
    expect(document.activeElement).toBe(q(container, ".rv-photo-more"));
  });

  test("DAN-3: Save reads 'Download photo' where files cannot be shared from a touch device (jsdom)", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    expect(q(container, ".rv-photo-save").textContent).toBe("Download photo");
  });

  test("P10: an outside tap closes the menu, and that tap presses nothing else; focus back on ⋯", () => {
    const { container, h } = view({ photos: [photo("a")] });
    const plan = q(container, ".rv-plan");
    fireEvent.click(q(container, ".rv-photo-more"));
    expect(q(container, ".rv-photo-pop")).not.toBeNull();
    fireEvent.pointerDown(plan);
    fireEvent.click(plan);   // the same tap's click: swallowed
    expect(q(container, ".rv-photo-pop")).toBeNull();
    expect(document.activeElement).toBe(q(container, ".rv-photo-more"));
    expect(h.onRemovePhoto).not.toHaveBeenCalled();
    expect(onPlanSpy).not.toHaveBeenCalled();
    fireEvent.click(plan);     // a NEW tap acts as normal
    expect(onPlanSpy).toHaveBeenCalledTimes(1);
  });

  test("a tap inside the menu does not dismiss it before the item acts", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.pointerDown(q(container, ".rv-photo-remove"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    expect(q(container, ".rv-psheet")).not.toBeNull();
  });

  test("Escape closes the menu, focus back on ⋯", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(q(container, ".rv-photo-pop")).toBeNull();
    expect(document.activeElement).toBe(q(container, ".rv-photo-more"));
  });

  test("⋯ again closes the menu; stepping to another photo closes it too", () => {
    const { container } = view({ photos: [photo("a"), photo("b")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-more"));
    expect(q(container, ".rv-photo-pop")).toBeNull();
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-next"));
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

  test("busy: 'Adding…', disabled; ⋯ disabled", () => {
    const { container } = view({ photoBusy: true, photos: [photo("a")] });
    const add = q(container, ".rv-photo-add");
    expect(add.textContent).toBe("Adding…");
    expect(add.disabled).toBe(true);
    expect(q(container, ".rv-photo-more").disabled).toBe(true);
  });

  test("no-flash gate: before the read resolves — tint, no strip, no controls", () => {
    const { container } = view({ photosReady: false, photos: [photo("a")] });
    expect(q(container, ".rv-strip")).toBeNull();
    expect(q(container, ".rv-photo-ctl")).toBeNull();
    expect(q(container, ".rv-photo-more")).toBeNull();
  });

  test("signed out: photos show, no controls, no ⋯", () => {
    const { container } = view({ canEditPhotos: false, photos: [photo("a")] });
    expect(qa(container, ".rv-strip img")).toHaveLength(1);
    expect(q(container, ".rv-photo-ctl")).toBeNull();
    expect(q(container, ".rv-photo-more")).toBeNull();
  });

  test("a photo whose URL is not minted yet is not rendered (never a broken image)", () => {
    const { container } = view({ photos: [{ ...photo("a"), url: null }] });
    expect(qa(container, "img")).toHaveLength(0);
    expect(q(container, ".rv-hero:not(.rv-strip)")).not.toBeNull();
  });
});

describe("replay (R5 + SPEC_photo_menu P9)", () => {
  test("every photo <img> carries .op-replay-block — the confirm thumbnail too; the strip, dots, menu and sheet do not", () => {
    const { container } = view({ photos: [photo("a"), photo("b")] });
    fireEvent.click(q(container, ".rv-photo-more"));
    fireEvent.click(q(container, ".rv-photo-remove"));
    const imgs = qa(container, "img");
    expect(imgs).toHaveLength(3);
    imgs.forEach((i) => expect(i.classList.contains("op-replay-block")).toBe(true));
    [".rv-strip", ".rv-dots", ".rv-photo-ctl", ".rv-photo-menu", ".rv-psheet"].forEach((s) => expect(q(container, s).classList.contains("op-replay-block")).toBe(false));
  });

  test("controls carry fixed copy and no meal name in any attribute; ⋯ is named 'Photo options'", () => {
    const { container } = view({ photos: [photo("a")], onReplacePhoto: jest.fn() });
    fireEvent.click(q(container, ".rv-photo-more"));
    [".rv-photo-more", ".rv-photo-pop", ".rv-photo-replace", ".rv-photo-details", ".rv-photo-save", ".rv-photo-remove"].forEach((s) => {
      Array.from(q(container, s).attributes).forEach((a) => expect(a.value).not.toMatch(/Chili/));
    });
    expect(q(container, ".rv-photo-more").getAttribute("aria-label")).toBe("Photo options");
    expect(q(container, ".rv-photo-more").textContent).toBe("");
    fireEvent.click(q(container, ".rv-photo-remove"));
    qa(q(container, ".rv-psheet-scrim"), "*").forEach((el) => Array.from(el.attributes).forEach((a) => expect(a.value).not.toMatch(/Chili/)));
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
    // viewerUserId null here: the caption names the uploader ("· Dan"), not "· You" — the You rule has its own tests.
    const { container } = view({ photos: [photo("a", "u2"), photo("b"), photo("c")], members: MEMBERS, viewerUserId: null });
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
    // Closing returns the strip to photo "b" (the credit line under the hero is gone — SPEC_photo_menu DAN-2).
    fireEvent.click(q(d, ".rv-viewer-close"));
    expect(q(container, ".rv-dots .rv-dot.on")).toBe(qa(container, ".rv-dots .rv-dot")[1]);
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

  test("Escape closes; Tab stays on × when there is no ⋯ (signed out)", () => {
    const { container } = view({ photos: [photo("a")], canEditPhotos: false });
    fireEvent.click(q(container, ".rv-photo-open"));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(q(dialog(), ".rv-viewer-close"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(q(container, ".rv-photo-open"));
  });

  test("P8: the viewer has the same ⋯ top-right, after the count — the same menu, acting on the photo in view", () => {
    const { container } = view({ photos: [photo("a"), photo("b")], onReplacePhoto: jest.fn() });
    fireEvent.click(qa(container, ".rv-photo-open")[0]);
    const top = q(dialog(), ".rv-viewer-top");
    expect(Array.from(top.children).map((el) => el.className)).toEqual(["rv-viewer-close", "rv-viewer-count", "rv-photo-menu viewer"]);
    const more = q(top, ".rv-photo-more");
    expect(more.getAttribute("aria-label")).toBe("Photo options");
    fireEvent.click(more);
    expect(qa(dialog(), ".rv-photo-pop .rv-photo-item").map((b) => b.textContent)).toEqual(["Replace photo", "Photo details", "Download photo", "Remove photo"]);
    expect(q(dialog(), ".rv-photo-div")).not.toBeNull();
    // stepping closes the menu
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(q(dialog(), ".rv-photo-pop")).toBeNull();
  });

  test("P8: Remove from the viewer closes the viewer first, then confirms the photo it was showing", () => {
    const { container, h } = view({ photos: [photo("a"), photo("b")] });
    fireEvent.click(qa(container, ".rv-photo-open")[1]);
    fireEvent.click(q(dialog(), ".rv-photo-more"));
    fireEvent.click(q(dialog(), ".rv-photo-remove"));
    expect(dialog()).toBeNull();
    expect(q(container, ".rv-psheet-thumb").getAttribute("src")).toBe("https://x/b");
    fireEvent.click(q(container, ".rv-photo-confirm-remove"));
    expect(h.onRemovePhoto).toHaveBeenCalledWith("b");
  });

  test("P8: Escape with the viewer's menu open closes only the menu; a second Escape closes the viewer", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-open"));
    fireEvent.click(q(dialog(), ".rv-photo-more"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(q(dialog(), ".rv-photo-pop")).toBeNull();
    expect(document.activeElement).toBe(q(dialog(), ".rv-photo-more"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog()).toBeNull();
  });

  test("P8: Tab inside the viewer cycles × and ⋯", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-open"));
    // The trap keeps laid-out buttons (offsetParent set) — jsdom lays nothing out, so ⋯ is marked as a browser would.
    Object.defineProperty(q(dialog(), ".rv-photo-more"), "offsetParent", { get: () => dialog() });
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(q(dialog(), ".rv-photo-more"));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(q(dialog(), ".rv-viewer-close"));
  });

  test("signed out: the viewer has no ⋯ (a spacer keeps the count centred)", () => {
    const { container } = view({ canEditPhotos: false, photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-open"));
    expect(q(dialog(), ".rv-photo-more")).toBeNull();
    expect(q(dialog(), ".rv-viewer-spacer")).not.toBeNull();
  });

  test("no trash icon in any toolbar", () => {
    const { container } = view({ photos: [photo("a")] });
    fireEvent.click(q(container, ".rv-photo-open"));
    [container, dialog()].forEach((root) => {
      expect(root.textContent).not.toMatch(/🗑/);
      qa(root, "[aria-label]").forEach((el) => expect(el.getAttribute("aria-label")).not.toMatch(/trash|delete/i));
    });
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
