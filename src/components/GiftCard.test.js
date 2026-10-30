/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   the card is audited as raw DOM (classes, attributes), the way the session recorder
   and click-text collection see it. */
// Run: CI=true npx react-scripts test --watchAll=false src/components/GiftCard
//
// SPEC_meal_sharing_phase_a_client Commit 1 — the signed-out card at /g/{CODE}:
//   A1  live gift with a photo: eyebrow, the signed view.webp (.op-photo .op-replay-block, alt ""),
//       the title as written, "From {attribution}", "{n} ingredients", Add to our meals, Sign in
//   A2  live gift without a photo: the sand band + plate, never an <img>; no From line when the
//       attribution is empty (C6) — and no placeholder
//   A3  no row (unknown OR revoked, C7): one screen — "That link doesn't work." + the landing link
//   C5  nothing but the five fields: no giver name, no note
//   replay: no attribute on any element carries the title, the attribution or the code
import { render, fireEvent, screen, waitFor } from "@testing-library/react";

jest.mock("../lib/supabaseAnon", () => ({
  previewMealGiftPublic: jest.fn(),
  giftPhotoUrl: jest.fn(),
}));
const anon = require("../lib/supabaseAnon");
const { GiftCard, LANDING_URL } = require("./GiftCard");

const CODE = "K7M2P9ABCDEFGH23";
const GIFT_ID = "3f2a9c1e-7b6d-4e5f-8a9b-0c1d2e3f4a5b";
const LIVE = { gift_id: GIFT_ID, title: "Famous Grilled Cheese & Pickle", attribution: "Easton", ingredient_count: 7, has_photo: true };
const NOPHOTO = { gift_id: GIFT_ID, title: "Grandma Phyllis's Molasses Cookies", attribution: "", ingredient_count: 12, has_photo: false };
const SIGNED = "https://zxwtxjjmssykhqrghouf.supabase.co/storage/v1/object/sign/gift-photos/x/view.webp?token=t";

const q = (c, s) => c.querySelector(s);
const qa = (c, s) => Array.from(c.querySelectorAll(s));
const attrs = (c) => qa(c, "*").flatMap((el) => Array.from(el.attributes).map((a) => `${el.tagName} ${a.name}="${a.value}"`));

function card(over = {}) {
  const h = { onAddToMeals: jest.fn(), onSignIn: jest.fn() };
  const utils = render(<GiftCard code={CODE} ready {...h} {...over} />);
  return { ...utils, h };
}

beforeEach(() => {
  anon.previewMealGiftPublic.mockReset();
  anon.giftPhotoUrl.mockReset();
  anon.giftPhotoUrl.mockResolvedValue(SIGNED);
});

describe("A1 — a live gift with a photo", () => {
  test("the five fields, the signed photo as .op-photo .op-replay-block, Add to our meals → onAddToMeals", async () => {
    anon.previewMealGiftPublic.mockResolvedValue({ row: LIVE });
    const { container, h } = card();
    expect(anon.previewMealGiftPublic).toHaveBeenCalledWith(CODE);
    await screen.findByText("Famous Grilled Cheese & Pickle");
    expect(q(container, ".gift-eyebrow").textContent).toBe("A meal, given to you");
    expect(q(container, ".gift-title").tagName).toBe("H2");
    expect(q(container, ".gift-from").textContent).toBe("From Easton");
    expect(q(container, ".gift-meta").textContent).toBe("7 ingredients");
    await waitFor(() => expect(q(container, "img")).not.toBeNull());
    expect(anon.giftPhotoUrl).toHaveBeenCalledWith(GIFT_ID);
    const img = q(container, "img");
    expect(img.className.split(" ")).toEqual(expect.arrayContaining(["op-photo", "op-replay-block"]));
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("src")).toBe(SIGNED);
    expect(q(container, ".gift-noph")).toBeNull();
    const add = q(container, ".gift-add");
    expect(add.textContent).toBe("Add to our meals");
    fireEvent.click(add);
    expect(h.onAddToMeals).toHaveBeenCalledTimes(1);
    expect(q(container, ".gift-after").textContent).toBe("You’ll make a free account, then it’s your copy to change.");
    fireEvent.click(q(container, ".gift-signin"));
    expect(h.onSignIn).toHaveBeenCalledTimes(1);
    expect(q(container, ".gift-foot").textContent).toBe("OurProvisions keeps a household’s meals and shopping list in one place.");
  });

  test("before the read resolves: eyebrow and a quiet card, Add disabled, no fields; nothing picked up from the code", async () => {
    let resolve;
    anon.previewMealGiftPublic.mockReturnValue(new Promise((r) => { resolve = r; }));
    const { container } = card();
    expect(q(container, ".gift-card-loading")).not.toBeNull();
    expect(q(container, ".gift-title")).toBeNull();
    expect(q(container, ".gift-add").disabled).toBe(true);
    resolve({ row: LIVE });
    await screen.findByText("Famous Grilled Cheese & Pickle");
    expect(q(container, ".gift-add").disabled).toBe(false);
  });

  test("not ready (Clerk still loading): Add and Sign in are inert", async () => {
    anon.previewMealGiftPublic.mockResolvedValue({ row: LIVE });
    const { container } = card({ ready: false });
    await screen.findByText("Famous Grilled Cheese & Pickle");
    expect(q(container, ".gift-add").disabled).toBe(true);
    expect(q(container, ".gift-signin").disabled).toBe(true);
  });
});

describe("A2 — a live gift without a photo (C6, C8)", () => {
  test("the sand band with the plate, no <img>, no From line and no placeholder; the title as written", async () => {
    anon.previewMealGiftPublic.mockResolvedValue({ row: NOPHOTO });
    const { container } = card();
    await screen.findByText("Grandma Phyllis's Molasses Cookies");
    expect(q(container, ".gift-noph")).not.toBeNull();
    expect(q(container, ".gift-noph .gift-plate")).not.toBeNull();
    expect(qa(container, "img")).toHaveLength(0);
    expect(q(container, ".gift-photo")).toBeNull();
    expect(q(container, ".gift-from")).toBeNull();
    expect(container.textContent).not.toMatch(/From/);
    expect(q(container, ".gift-meta").textContent).toBe("12 ingredients");
    expect(anon.giftPhotoUrl).not.toHaveBeenCalled();
  });
  test("has_photo true but no URL yet (or refused): the photo box stays, no broken <img>", async () => {
    anon.previewMealGiftPublic.mockResolvedValue({ row: LIVE });
    anon.giftPhotoUrl.mockResolvedValue(null);
    const { container } = card();
    await screen.findByText("Famous Grilled Cheese & Pickle");
    expect(q(container, ".gift-photo")).not.toBeNull();
    await waitFor(() => expect(anon.giftPhotoUrl).toHaveBeenCalled());
    expect(qa(container, "img")).toHaveLength(0);
  });
});

describe("A3 — unknown or revoked (C7)", () => {
  test("no row → one screen: the dead title, the ask line, the landing link; no card, no Add", async () => {
    anon.previewMealGiftPublic.mockResolvedValue({ row: null });
    const { container } = card();
    await screen.findByText("That link doesn’t work.");
    expect(q(container, ".gift-dead-p").textContent).toBe("Ask whoever sent it for a new one.");
    const what = q(container, ".gift-what");
    expect(what.textContent).toBe("What is OurProvisions?");
    expect(what.getAttribute("href")).toBe(LANDING_URL);
    expect(q(container, ".gift-card")).toBeNull();
    expect(q(container, ".gift-add")).toBeNull();
    expect(q(container, ".gift-foot")).not.toBeNull();
    expect(anon.giftPhotoUrl).not.toHaveBeenCalled();
  });
  test("a request that failed outright is NOT a dead link: its own line and Try again re-asks", async () => {
    anon.previewMealGiftPublic.mockResolvedValueOnce({ error: new Error("Load failed") }).mockResolvedValueOnce({ row: LIVE });
    const { container } = card();
    await screen.findByText("Couldn’t open this link.");
    expect(q(container, ".gift-what")).toBeNull();
    fireEvent.click(q(container, ".gift-retry"));
    await screen.findByText("Famous Grilled Cheese & Pickle");
    expect(anon.previewMealGiftPublic).toHaveBeenCalledTimes(2);
  });
});

describe("C5 + replay", () => {
  test("no attribute on any element carries the title, the attribution or the code; the buttons are fixed copy", async () => {
    anon.previewMealGiftPublic.mockResolvedValue({ row: LIVE });
    const { container } = card();
    await screen.findByText("Famous Grilled Cheese & Pickle");
    await waitFor(() => expect(q(container, "img")).not.toBeNull());
    const all = attrs(container);
    expect(all.length).toBeGreaterThan(5);
    all.forEach((a) => {
      expect(a).not.toMatch(/Grilled|Pickle|Easton/);
      expect(a).not.toMatch(CODE);
    });
    expect(container.textContent).not.toMatch(CODE);
    expect(q(container, ".gift-add").textContent).toBe("Add to our meals");
    expect(q(container, ".gift-signin").textContent).toBe("Sign in");
    // No name of the giver anywhere (the RPC never returns one; the card never invents one).
    expect(container.textContent).not.toMatch(/gave you|Andrew/);
  });
});
