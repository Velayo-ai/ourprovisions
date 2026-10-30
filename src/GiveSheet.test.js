/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the menu and the sheet are audited as raw DOM (classes, roles, attributes), the way the
   replay recorder and click-text collection see them. */
// Run: CI=true npx react-scripts test --watchAll=false src/GiveSheet
//
// SPEC_meal_sharing_phase_a_client Commit 2 — the header share button and the give sheet (B1–B5), rendered
// through RecipeView with an injected `give` object:
//   ⇧   .rv-give beside Edit, aria-label "Give this meal", icon only (Dan 2026-10-30, replaces the ⋯); one tap
//       opens the sheet. "Stop giving" is the sheet's top line, only while the meal has an unrevoked gift
//   C1  B1 when the viewer's own live showcase row exists (another member's does not count, S11); B2 otherwise,
//       with the nudge "Make one of your photos a showcase →"
//   C3  Give = give_meal (+ the copy); Send it = share from its own tap; Copy link always present
//   C4  copy failure → B5's one line, no retry; no photo → straight to B4; give_meal failure → its line, sheet stays
//   S34 the ✕ is inert while giving / copying
//   replay: the gift code is never in the DOM; thumbnails carry .op-replay-block .op-photo
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { RecipeView } = require("./App");

const MEAL = {
  id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", kind: "meal", name: "Famous Grilled Cheese & Pickle", occasion: ["lunch"], instructions: "", attribution: "Easton", created_by: null,
  meal_ingredients: [{ catalog_item_id: "c1", quantity_per_serving: 1 }, { catalog_item_id: "c2", quantity_per_serving: 2 }],
};
const CODE = "K7M2P9ABCDEFGH23";
const GIFT_ID = "3f2a9c1e-7b6d-4e5f-8a9b-0c1d2e3f4a5b";
const today = new Date().toISOString();
const photo = (id, by, kind) => ({ id, meal_id: MEAL.id, meal_cook_id: null, uploaded_by: by, uploaded_at: today, kind, view_path: `${id}-view.webp`, thumb_path: `${id}-thumb.webp`, url: `https://x/${id}` });
const MEMBERS = [{ user_id: "u1", users: { full_name: "Dan Holmes" } }, { user_id: "u2", users: { full_name: "Dana Teller" } }];

const q = (c, s) => c.querySelector(s);
const qa = (c, s) => Array.from(c.querySelectorAll(s));
const sheet = () => document.body.querySelector(".rv-psheet-scrim");
// Every attribute the recorder copies, except the note field's placeholder — fixed mockup copy
// ("Easton’s favourite. Don’t skip the pickle."), not household data.
const attrs = (root) => qa(root, "*").flatMap((el) => Array.from(el.attributes).filter((a) => a.name !== "placeholder").map((a) => a.value));

function giveStub(over = {}) {
  return {
    openGifts: 0,
    give: jest.fn().mockResolvedValue({ ok: true, code: CODE, giftId: GIFT_ID, photoPath: "hh/meal/s-view.webp", thumbPath: "hh/meal/s-thumb.webp" }),
    copyPhoto: jest.fn().mockResolvedValue({ ok: true }),
    stopGiving: jest.fn(), share: jest.fn(), copyLink: jest.fn(), onGiven: jest.fn(),
    referralCode: "a1b2c3d4",
    ...over,
  };
}
function view(over = {}) {
  const give = over.give === undefined ? giveStub() : over.give;
  const utils = render(
    <RecipeView meal={MEAL} state={null} members={MEMBERS} cookCount={0} lastCookedAt={null} cookRows={null} links={null}
      tagsReady={false} addedThisPlan={false} viewerUserId="u1" busy={false}
      onPlan={jest.fn()} onAddToShop={jest.fn()} onCooked={jest.fn()} onRemove={jest.fn()} onSeeList={jest.fn()} onClose={jest.fn()} onEdit={jest.fn()}
      photos={[]} photosReady canEditPhotos photoBusy={false} onAddPhoto={jest.fn()} onRemovePhoto={jest.fn()} {...over} give={give} />
  );
  return { ...utils, give };
}
const openGive = (c) => { fireEvent.click(q(c, ".rv-give")); return sheet(); };
beforeEach(() => { window.location.hash = ""; });

describe("the share button", () => {
  test("beside Edit: .rv-give, aria-label 'Give this meal', an icon and no text, before Edit in the DOM; none without `give`", () => {
    const { container } = view();
    const btn = q(container, ".rv-give");
    expect(btn.getAttribute("aria-label")).toBe("Give this meal");
    expect(btn.textContent).toBe("");
    expect(q(btn, "svg[aria-hidden=true]")).not.toBeNull();
    expect(btn.hasAttribute("aria-haspopup")).toBe(false);
    expect(btn.compareDocumentPosition(q(container, ".rv-edit")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(q(container, ".rv-more")).toBeNull();
    const none = view({ give: null });
    expect(q(none.container, ".rv-give")).toBeNull();
  });
  test("one tap opens the sheet directly; a tap never closes the recipe view; busy disables it", () => {
    const onClose = jest.fn();
    const { container } = view({ onClose });
    expect(sheet()).toBeNull();
    const s = openGive(container);
    expect(q(s, ".give-kicker").textContent).toBe("Give this meal");
    expect(onClose).not.toHaveBeenCalled();
    const busy = view({ busy: true });
    expect(q(busy.container, ".rv-give").disabled).toBe(true);
  });
  test("the top line: absent with no live gift; 'You’re giving this meal · Stop giving' with one", () => {
    const { container } = view();
    expect(q(openGive(container), ".give-giving")).toBeNull();
    fireEvent.click(q(sheet(), ".sheet-close"));
    expect(sheet()).toBeNull();
    const withGift = view({ give: giveStub({ openGifts: 2 }) });
    const s = openGive(withGift.container);
    const line = q(s, ".give-giving");
    expect(line.textContent).toBe("You’re giving this meal · Stop giving");
    expect(line.compareDocumentPosition(q(s, ".give-kicker")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(q(line, ".rv-stop-giving").textContent).toBe("Stop giving");
  });
  test("Stop giving → the sheet closes and the confirm opens; 'Stop giving' revokes, 'Keep giving' does nothing", () => {
    const { container, give } = view({ give: giveStub({ openGifts: 1 }) });
    fireEvent.click(q(openGive(container), ".rv-stop-giving"));
    expect(q(sheet(), ".give-kicker")).toBeNull();
    expect(sheet().textContent).toContain("Stop giving this meal?");
    expect(sheet().textContent).toContain("Anyone who hasn’t added it yet won’t be able to.");
    fireEvent.click(q(sheet(), ".stop-giving-no"));
    expect(sheet()).toBeNull();
    expect(give.stopGiving).not.toHaveBeenCalled();
    fireEvent.click(q(openGive(container), ".rv-stop-giving"));
    fireEvent.click(q(sheet(), ".stop-giving-yes"));
    expect(give.stopGiving).toHaveBeenCalledWith(MEAL.id);
    expect(sheet()).toBeNull();
  });
});

describe("the give sheet — B1 / B2 (C1)", () => {
  test("B2: no showcase of mine → 'No photo goes with it' and the nudge; another member's showcase does not count (S11)", () => {
    const { container } = view({ photos: [photo("a", "u1", "cook"), photo("s2", "u2", "showcase")] });
    const s = openGive(container);
    expect(q(s, ".give-kicker").textContent).toBe("Give this meal");
    expect(s.textContent).toContain("No photo goes with it");
    expect(q(s, ".give-nudge").textContent).toBe("Make one of your photos a showcase →");
    expect(q(s, ".give-thumb-empty")).not.toBeNull();
    expect(qa(s, "img")).toHaveLength(0);
    expect(q(s, ".give-count").textContent).toBe("0 / 280");
    expect(q(s, ".give-go").textContent).toBe("Give");
    expect(s.textContent).toContain("They get their own copy. Yours doesn’t change.");
  });
  test("B1: my live showcase → 'Your showcase photo goes with it', its thumbnail as .op-replay-block .op-photo, no nudge", () => {
    const { container } = view({ photos: [photo("a", "u1", "cook"), photo("s1", "u1", "showcase")] });
    const s = openGive(container);
    expect(s.textContent).toContain("Your showcase photo goes with it");
    expect(q(s, ".give-nudge")).toBeNull();
    const img = q(s, "img");
    expect(img.getAttribute("src")).toBe("https://x/s1");
    expect(img.className.split(" ")).toEqual(expect.arrayContaining(["op-replay-block", "op-photo"]));
    expect(img.getAttribute("alt")).toBe("");
  });
  test("the nudge closes the sheet (back to the strip)", () => {
    const { container } = view({ photos: [photo("a", "u1", "cook")] });
    const s = openGive(container);
    fireEvent.click(q(s, ".give-nudge"));
    expect(sheet()).toBeNull();
  });
  test("the note: counter, 280 cap disables Give, trimmed and null-when-empty on the way out", async () => {
    const { container, give } = view();
    const s = openGive(container);
    const ta = q(s, ".give-ta");
    fireEvent.change(ta, { target: { value: "x".repeat(281) } });
    expect(q(s, ".give-count").textContent).toBe("281 / 280");
    expect(q(s, ".give-count").className).toContain("over");
    expect(q(s, ".give-go").disabled).toBe(true);
    fireEvent.change(ta, { target: { value: "  Don’t skip the pickle.  " } });
    expect(q(s, ".give-go").disabled).toBe(false);
    fireEvent.click(q(s, ".give-go"));
    await waitFor(() => expect(give.give).toHaveBeenCalledWith(MEAL.id, "Don’t skip the pickle."));
  });
});

describe("the give sheet — Give, B3, B4, B5 (C3, C4)", () => {
  test("with a photo: give_meal, then the copy (gift id + both source paths), then B4 — Ready to give, What they'll see, Send it, Copy link; onGiven fires; the code is nowhere in the DOM", async () => {
    const { container, give } = view({ photos: [photo("s1", "u1", "showcase")] });
    const s = openGive(container);
    fireEvent.click(q(s, ".give-go"));
    await waitFor(() => expect(give.copyPhoto).toHaveBeenCalledWith(GIFT_ID, "hh/meal/s-view.webp", "hh/meal/s-thumb.webp"));
    await screen.findByText("Ready to give");
    expect(give.give).toHaveBeenCalledWith(MEAL.id, null);
    expect(give.onGiven).toHaveBeenCalledWith(MEAL.id);
    const r = sheet();
    expect(q(r, ".give-mini-cap").textContent).toBe("What they’ll see");
    expect(q(r, ".give-mini-t").textContent).toBe("Famous Grilled Cheese & Pickle");
    expect(q(r, ".give-mini-m").textContent).toBe("From Easton · 2 ingredients");
    expect(q(r, ".give-mini img")).not.toBeNull();
    expect(q(r, ".give-warn")).toBeNull();
    expect(r.textContent).not.toMatch(CODE);
    attrs(r).forEach((v) => expect(v).not.toMatch(CODE));
    fireEvent.click(q(r, ".give-send"));
    expect(give.share).toHaveBeenCalledTimes(1);
    const payload = give.share.mock.calls[0][0];
    expect(payload.url).toBe(`${window.location.origin}/g/${CODE}?ref=a1b2c3d4`);
    expect(payload.text).toBe("I’m giving you Famous Grilled Cheese & Pickle on OurProvisions.");
    fireEvent.click(q(r, ".give-copy"));
    expect(give.copyLink).toHaveBeenCalledWith(`${window.location.origin}/g/${CODE}?ref=a1b2c3d4`);
    expect(r.textContent).toContain("You can stop giving it any time from this sheet.");
    // the ✕ works again once ready
    expect(q(r, ".sheet-close").disabled).toBe(false);
  });
  test("S34: while giving, the ✕ is disabled and Give reads 'Getting it ready…'; B3 names the steps", async () => {
    let resolveGive;
    const give = giveStub({ give: jest.fn(() => new Promise((res) => { resolveGive = res; })) });
    const { container } = view({ give, photos: [photo("s1", "u1", "showcase")] });
    const s = openGive(container);
    fireEvent.click(q(s, ".give-go"));
    await screen.findByText("Getting it ready…");
    expect(q(sheet(), ".sheet-close").disabled).toBe(true);
    expect(sheet().textContent).toContain("Making the gift…");
    expect(q(sheet(), ".give-ta")).toBeNull();   // the note field is gone; nothing to edit mid-flight
    resolveGive({ ok: true, code: CODE, giftId: GIFT_ID, photoPath: "v", thumbPath: "t" });
    await screen.findByText("Ready to give");
  });
  test("no photo: the copy is skipped and B4 follows straight away with the empty thumb", async () => {
    const give = giveStub({ give: jest.fn().mockResolvedValue({ ok: true, code: CODE, giftId: GIFT_ID, photoPath: null, thumbPath: null }) });
    const { container } = view({ give });
    fireEvent.click(q(openGive(container), ".give-go"));
    await screen.findByText("Ready to give");
    expect(give.copyPhoto).not.toHaveBeenCalled();
    expect(q(sheet(), ".give-mini .give-thumb-empty")).not.toBeNull();
    expect(q(sheet(), ".give-warn")).toBeNull();
  });
  test("C4 / B5: a failed copy → 'The photo didn’t attach.', the empty thumb, Send it and Copy link still there, copy called once (no retry)", async () => {
    const give = giveStub({ copyPhoto: jest.fn().mockResolvedValue({ ok: false }) });
    const { container } = view({ give, photos: [photo("s1", "u1", "showcase")] });
    fireEvent.click(q(openGive(container), ".give-go"));
    await screen.findByText("The photo didn’t attach.");
    const r = sheet();
    expect(q(r, ".give-kicker").textContent).toBe("Ready to give");
    expect(q(r, ".give-mini .give-thumb-empty")).not.toBeNull();
    expect(q(r, ".give-mini img")).toBeNull();
    expect(q(r, ".give-send")).not.toBeNull();
    expect(q(r, ".give-copy")).not.toBeNull();
    expect(give.copyPhoto).toHaveBeenCalledTimes(1);
    expect(give.onGiven).toHaveBeenCalled();
  });
  test("give_meal fails → its line shows in the sheet, which stays on B1/B2; no copy, no share", async () => {
    const give = giveStub({ give: jest.fn().mockResolvedValue({ ok: false, reason: "forbidden", line: "Only members of this place can give its meals." }) });
    const { container } = view({ give });
    fireEvent.click(q(openGive(container), ".give-go"));
    await screen.findByText("Only members of this place can give its meals.");
    expect(q(sheet(), ".give-kicker").textContent).toBe("Give this meal");
    expect(q(sheet(), ".give-go").textContent).toBe("Give");
    expect(give.copyPhoto).not.toHaveBeenCalled();
    expect(give.onGiven).not.toHaveBeenCalled();
  });
});

describe("replay", () => {
  test("no attribute on the share button or the sheet carries the meal name or the code", () => {
    const { container } = view({ photos: [photo("s1", "u1", "showcase")], give: giveStub({ openGifts: 1 }) });
    attrs(q(container, ".rv-give")).forEach((v) => expect(v).not.toMatch(/Grilled|Pickle/));
    fireEvent.click(q(container, ".rv-give"));
    attrs(sheet()).forEach((v) => { expect(v).not.toMatch(/Grilled|Pickle|Easton/); expect(v).not.toMatch(CODE); });
  });
});
