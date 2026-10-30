// Run: CI=true npx react-scripts test --watchAll=false src/lib/giveMeal
import { myShowcase, noteForGive, NOTE_MAX, GIFT_RENDITIONS, giftObjectPath, giftShareText, giftUrl, giftSharePayload, whatTheySee, closeDisabled, giveFailure } from "./giveMeal";

describe("giveFailure (072 §5 codes → a line, never swallowed)", () => {
  test("42501 → members only; 22023 note → the note line; other 22023 → kind; else the RPC's message", () => {
    expect(giveFailure({ code: "42501", message: "give_meal: not a member of the meal's household" }).line).toBe("Only members of this place can give its meals.");
    expect(giveFailure({ code: "22023", message: "give_meal: note is longer than 280 characters" }).line).toBe("The note is too long (280 characters at most).");
    expect(giveFailure({ code: "22023", message: "give_meal: only meals can be given (kind = other)" }).line).toBe("Only meals can be given.");
    expect(giveFailure({ code: "PGRST202", message: "Could not find the function public.give_meal" }).line).toBe("Couldn’t give this meal: Could not find the function public.give_meal");
    expect(giveFailure(null).line).toBe("Couldn’t give this meal. Try again.");
  });
});

const ph = (id, by, kind, extra = {}) => ({ id, uploaded_by: by, kind, ...extra });

describe("myShowcase (C1)", () => {
  test("the viewer's own live showcase row, whatever its position", () => {
    const list = [ph("a", "u1", "cook"), ph("s2", "u2", "showcase"), ph("s1", "u1", "showcase")];
    expect(myShowcase(list, "u1").id).toBe("s1");
  });
  test("another member's showcase is not mine (S11); a cook photo never counts; no viewer → null", () => {
    expect(myShowcase([ph("s2", "u2", "showcase"), ph("a", "u1", "cook")], "u1")).toBeNull();
    expect(myShowcase([ph("s1", "u1", "showcase")], null)).toBeNull();
    expect(myShowcase([], "u1")).toBeNull();
    expect(myShowcase(null, "u1")).toBeNull();
  });
  test("a soft-deleted showcase row is not mine", () => {
    expect(myShowcase([ph("s1", "u1", "showcase", { deleted_at: "2026-10-30" })], "u1")).toBeNull();
  });
});

describe("noteForGive", () => {
  test("trimmed; empty → null; at the cap ok; over the cap → false", () => {
    expect(noteForGive("  Don’t skip the pickle.  ")).toBe("Don’t skip the pickle.");
    expect(noteForGive("")).toBeNull();
    expect(noteForGive("   ")).toBeNull();
    expect(noteForGive(undefined)).toBeNull();
    expect(noteForGive("x".repeat(NOTE_MAX))).toBe("x".repeat(NOTE_MAX));
    expect(noteForGive("x".repeat(NOTE_MAX + 1))).toBe(false);
    expect(NOTE_MAX).toBe(280);
  });
});

describe("the photo copy (C4)", () => {
  test("view first, then thumb; paths are {gift_id}/{rendition}.webp — the gift id only, never a household", () => {
    expect(GIFT_RENDITIONS).toEqual(["view", "thumb"]);
    expect(giftObjectPath("3f2a9c1e-7b6d-4e5f-8a9b-0c1d2e3f4a5b", "view")).toBe("3f2a9c1e-7b6d-4e5f-8a9b-0c1d2e3f4a5b/view.webp");
    expect(giftObjectPath("g", "thumb")).toBe("g/thumb.webp");
  });
});

describe("the share payload (10-07)", () => {
  test("text names the meal, the url carries the code and ref; the url is never in the text", () => {
    const p = giftSharePayload({ mealName: "Famous Grilled Cheese & Pickle", code: "K7M2P9ABCDEFGH23", origin: "https://dev.ourprovisions.velayo.ai", referralCode: "a1b2c3d4" });
    expect(p.text).toBe("I’m giving you Famous Grilled Cheese & Pickle on OurProvisions.");
    expect(p.url).toBe("https://dev.ourprovisions.velayo.ai/g/K7M2P9ABCDEFGH23?ref=a1b2c3d4");
    expect(p.text).not.toMatch(/K7M2P9/);
    expect(p.title).toBe("A meal, given to you");
  });
  test("no referral code → no ref param; a trailing slash on the origin is dropped", () => {
    expect(giftUrl("https://ourprovisions.velayo.ai/", "K7M2P9ABCDEFGH23", null)).toBe("https://ourprovisions.velayo.ai/g/K7M2P9ABCDEFGH23");
  });
  test("an empty meal name reads 'a meal'", () => {
    expect(giftShareText("")).toBe("I’m giving you a meal on OurProvisions.");
  });
});

describe("whatTheySee (B4 mirrors A1 / A2)", () => {
  test("From · count, or the count alone (C6: no From when attribution is empty)", () => {
    expect(whatTheySee({ attribution: "Easton", meal_ingredients: new Array(7) })).toBe("From Easton · 7 ingredients");
    expect(whatTheySee({ attribution: "", meal_ingredients: new Array(12) })).toBe("12 ingredients");
    expect(whatTheySee({ attribution: null, meal_ingredients: [{}] })).toBe("1 ingredient");
    expect(whatTheySee({})).toBe("0 ingredients");
  });
});

describe("closeDisabled (S34: the ✕ is inert while the link is being made)", () => {
  test("giving and copying only", () => {
    expect(closeDisabled("compose")).toBe(false);
    expect(closeDisabled("giving")).toBe(true);
    expect(closeDisabled("copying")).toBe(true);
    expect(closeDisabled("ready")).toBe(false);
  });
});

describe("giftBytesPlan (C4, 2026-10-30)", () => {
  const { giftBytesPlan } = require("./giveMeal");
  test("WebP bytes are copied; a JPEG (iPhone showcase) or anything else is re-encoded", () => {
    expect(giftBytesPlan("image/webp")).toBe("copy");
    expect(giftBytesPlan("image/jpeg")).toBe("reencode");
    expect(giftBytesPlan("")).toBe("reencode");
    expect(giftBytesPlan(undefined)).toBe("reencode");
  });
});
